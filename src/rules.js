const SEVERITY = {
  error: "error",
  review: "review",
  tip: "tip"
};

function text(value) {
  return String(value ?? "").trim();
}

function sameText(left, right) {
  return text(left).replaceAll(/\s+/g, "") === text(right).replaceAll(/\s+/g, "");
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function isoWeekKey(date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function makeIssue(code, severity, message, details = {}) {
  return { code, severity, message, ...details };
}

function addMetadataIssues(sheet, profile, issues) {
  const fields = [
    ["planName", "PLAN_NAME_MISMATCH", "計畫名稱與目前選用的計畫規則不一致。"],
    ["planNumber", "PLAN_NUMBER_MISMATCH", "計畫編號與目前選用的計畫規則不一致。"],
    ["unit", "UNIT_MISMATCH", "執行單位與目前選用的計畫規則不一致。"]
  ];

  for (const [field, code, message] of fields) {
    if (!sameText(sheet[field], profile[field])) {
      issues.push(makeIssue(code, SEVERITY.error, message, { field }));
    }
  }
}

function addLocationIssues(item, profile, issues) {
  const location = text(item.location);
  const config = profile.location ?? {};
  if (!location) {
    issues.push(makeIssue("LOCATION_REQUIRED", SEVERITY.error, "工作地點未填寫，請填入實際工作地點。", {
      entryIds: [item.id], field: "location"
    }));
    return;
  }

  if (config.schoolOnly) {
    const forbidden = (config.forbiddenKeywords ?? []).find((keyword) => location.includes(keyword));
    if (forbidden) {
      issues.push(makeIssue("LOCATION_NOT_ALLOWED", SEVERITY.error, `工作地點包含「${forbidden}」，本計畫要求在校內工作。`, {
        entryIds: [item.id], field: "location"
      }));
    }
    const required = config.requiredKeywords ?? [];
    if (required.length && !required.some((keyword) => location.includes(keyword))) {
      issues.push(makeIssue("LOCATION_CONTEXT_REQUIRED", SEVERITY.error, `工作地點應包含：${required.join("、")}。`, {
        entryIds: [item.id], field: "location"
      }));
    }
    if (config.requireRoom && !/\d{2,4}[A-Za-z]?/.test(location)) {
      issues.push(makeIssue("ROOM_REQUIRED", SEVERITY.error, "請寫出實際研究室名稱與房號，不要只寫學校或研究室。", {
        entryIds: [item.id], field: "location"
      }));
    }
  }

  if ((config.sampleValues ?? []).some((sample) => sameText(sample, location))) {
    issues.push(makeIssue("SAMPLE_LOCATION_COPIED", SEVERITY.review, "工作地點與填寫範例相同，請確認不是直接照抄。", {
      entryIds: [item.id], field: "location"
    }));
  }

  issues.push(makeIssue("LOCATION_CONFIRM", SEVERITY.review, "請確認這是本次實際工作地點。", {
    entryIds: [item.id], field: "location"
  }));
}

function addWorkContentIssues(item, profile, issues) {
  const content = text(item.workContent);
  if (!content) {
    issues.push(makeIssue("WORK_CONTENT_REQUIRED", SEVERITY.error, "工作內容未填寫，請填入實際完成的工作。", {
      entryIds: [item.id], field: "workContent"
    }));
    return;
  }

  const allowed = profile.allowedWorkContents ?? [];
  if (allowed.length && !allowed.some((value) => sameText(value, content))) {
    issues.push(makeIssue("WORK_CONTENT_NOT_ALLOWED", SEVERITY.error, "工作內容不在本計畫允許的內容中，請確認後修改。", {
      entryIds: [item.id], field: "workContent"
    }));
  } else if (!allowed.length) {
    issues.push(makeIssue("WORK_CONTENT_CONFIRM", SEVERITY.review, "本計畫未設定固定工作內容，請確認這是實際完成的工作。", {
      entryIds: [item.id], field: "workContent"
    }));
  }
}

function validateEntry(item, profile, issues) {
  const date = dateValue(item.date);
  const start = timeToMinutes(item.start);
  const end = timeToMinutes(item.end);

  if (!date) {
    issues.push(makeIssue("DATE_INVALID", SEVERITY.error, "工作日期格式無效，請重新確認。", {
      entryIds: [item.id], field: "date"
    }));
  }
  if (start === null || end === null || end <= start) {
    issues.push(makeIssue("TIME_INVALID", SEVERITY.error, "工作起訖時間無效，結束時間必須晚於開始時間。", {
      entryIds: [item.id], field: "time"
    }));
  }

  if (date && (profile.blockedDates ?? []).includes(item.date)) {
    issues.push(makeIssue("BLOCKED_DATE", SEVERITY.error, "這一天是本計畫設定的休假或停班日，不應填列出勤。", {
      entryIds: [item.id], field: "date"
    }));
  }
  if (date && profile.allowedWeekdays?.length && !profile.allowedWeekdays.includes(date.getDay())) {
    issues.push(makeIssue("WEEKDAY_NOT_ALLOWED", SEVERITY.error, "這個星期日期不在本計畫允許的工作日內。", {
      entryIds: [item.id], field: "date"
    }));
  }

  const earliest = timeToMinutes(profile.earliestStart);
  const latest = timeToMinutes(profile.latestEnd);
  if (start !== null && end !== null && ((earliest !== null && start < earliest) || (latest !== null && end > latest))) {
    issues.push(makeIssue("OUTSIDE_ALLOWED_HOURS", SEVERITY.error, "工作時間超出本計畫允許的時段。", {
      entryIds: [item.id], field: "time"
    }));
  }

  let calculatedMinutes = 0;
  if (start !== null && end !== null && end > start) {
    calculatedMinutes = end - start;
    const calculatedHours = roundHours(calculatedMinutes);
    if (Math.abs(Number(item.hours) - calculatedHours) > 0.001) {
      issues.push(makeIssue("ROW_HOURS_MISMATCH", SEVERITY.error, `依起訖時間應為 ${calculatedHours} 小時，與填寫時數不一致。`, {
        entryIds: [item.id], field: "hours"
      }));
    }
    const expectedPay = roundMoney(calculatedHours * Number(profile.hourlyRate));
    if (Math.abs(Number(item.pay) - expectedPay) > 0.001) {
      issues.push(makeIssue("ROW_PAY_MISMATCH", SEVERITY.error, `本筆工作酬金應為 ${expectedPay} 元。`, {
        entryIds: [item.id], field: "pay"
      }));
    }
  }

  addLocationIssues(item, profile, issues);
  addWorkContentIssues(item, profile, issues);

  return { ...item, dateObject: date, startMinutes: start, endMinutes: end, calculatedMinutes };
}

function addDailyIssues(validated, issues) {
  const byDate = groupBy(validated.filter((item) => item.dateObject && item.calculatedMinutes), (item) => item.date);
  for (const [date, items] of byDate) {
    const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes);
    const totalMinutes = sorted.reduce((sum, item) => sum + item.calculatedMinutes, 0);
    if (totalMinutes > 8 * 60) {
      issues.push(makeIssue("DAILY_HOURS_EXCEEDED", SEVERITY.error, `${date} 合計 ${roundHours(totalMinutes)} 小時，超過每日 8 小時。`, {
        entryIds: sorted.map((item) => item.id), field: "hours"
      }));
    }

    let chainStart = sorted[0].startMinutes;
    let chainEnd = sorted[0].endMinutes;
    let chainIds = [sorted[0].id];
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.startMinutes < previous.endMinutes) {
        issues.push(makeIssue("TIME_OVERLAP", SEVERITY.error, `${date} 有重疊的工作時段。`, {
          entryIds: [previous.id, current.id], field: "time"
        }));
      }

      const gap = current.startMinutes - chainEnd;
      if (gap >= 30) {
        if (chainEnd - chainStart > 240) {
          issues.push(makeIssue("BREAK_REQUIRED", SEVERITY.error, `${date} 連續工作超過 4 小時，期間沒有至少 30 分鐘休息。`, {
            entryIds: chainIds, field: "time"
          }));
        }
        chainStart = current.startMinutes;
        chainEnd = current.endMinutes;
        chainIds = [current.id];
      } else {
        chainEnd = Math.max(chainEnd, current.endMinutes);
        chainIds.push(current.id);
      }
    }
    if (chainEnd - chainStart > 240) {
      issues.push(makeIssue("BREAK_REQUIRED", SEVERITY.error, `${date} 連續工作超過 4 小時，期間沒有至少 30 分鐘休息。`, {
        entryIds: chainIds, field: "time"
      }));
    }
  }
}

function addWeeklyIssues(validated, issues) {
  const dated = validated.filter((item) => item.dateObject && item.calculatedMinutes);
  const weeks = groupBy(dated, (item) => isoWeekKey(item.dateObject));
  for (const [week, items] of weeks) {
    const totalMinutes = items.reduce((sum, item) => sum + item.calculatedMinutes, 0);
    if (totalMinutes > 40 * 60) {
      issues.push(makeIssue("WEEKLY_HOURS_EXCEEDED", SEVERITY.error, `${week} 在這份文件中合計 ${roundHours(totalMinutes)} 小時，超過每週 40 小時。`, {
        entryIds: items.map((item) => item.id), field: "hours"
      }));
    }
  }
}

export function checkTimesheet(sheet, profile) {
  const issues = [];
  addMetadataIssues(sheet, profile, issues);
  const validated = (sheet.entries ?? []).map((item) => validateEntry(item, profile, issues));
  addDailyIssues(validated, issues);
  addWeeklyIssues(validated, issues);

  const totalMinutes = validated.reduce((sum, item) => sum + item.calculatedMinutes, 0);
  const totalHours = roundHours(totalMinutes);
  const totalPay = roundMoney(totalHours * Number(profile.hourlyRate));
  if (Math.abs(Number(sheet.claimedTotalHours) - totalHours) > 0.001) {
    issues.push(makeIssue("TOTAL_HOURS_MISMATCH", SEVERITY.error, `合計時數應為 ${totalHours} 小時。`, { field: "totalHours" }));
  }
  if (Math.abs(Number(sheet.claimedTotalPay) - totalPay) > 0.001) {
    issues.push(makeIssue("TOTAL_PAY_MISMATCH", SEVERITY.error, `合計金額應為 ${totalPay} 元。`, { field: "totalPay" }));
  }

  return {
    issues,
    calculated: { totalHours, totalPay },
    declarations: [
      { code: "ACTUAL_LOCATION_CONFIRMED", label: "工作地點是本次實際地點，並非照抄範例。" },
      { code: "ACTUAL_WORK_CONFIRMED", label: "工作內容是本次實際完成的事項。" },
      { code: "NO_DUPLICATE_CLAIM", label: "沒有與其他計畫在同一時段重複請領。" },
      { code: "SIGNATURES_COMPLETE", label: "紙本簽名及所有塗改處均已完成簽章。" }
    ]
  };
}
