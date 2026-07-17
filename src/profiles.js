export const DEFAULT_PROFILES = [
  {
    id: "a82-cloud-knowledge-2026",
    active: true,
    version: 1,
    updatedAt: "2026-07-17T00:00:00+08:00",
    planName: "A82 發展雲端知識體系計畫",
    planNumber: "115609782",
    unit: "數位教育發展處數位課程發展組",
    hourlyRate: 196,
    allowedWeekdays: [1, 2, 3, 4, 5],
    earliestStart: "08:00",
    latestEnd: "18:00",
    blockedDates: [
      "2026-07-03", "2026-07-10", "2026-07-17", "2026-07-24", "2026-07-30", "2026-07-31",
      "2026-08-07", "2026-08-14", "2026-08-28", "2026-09-04"
    ],
    location: {
      schoolOnly: true,
      requireRoom: true,
      requiredKeywords: ["研究室"],
      prompt: "請填寫實際工作的校內研究室名稱與房號。",
      forbiddenKeywords: ["家裡", "麥當勞", "星巴克", "咖啡廳"],
      sampleValues: ["圖書館101A"]
    },
    allowedWorkContents: ["課程字幕製作", "課程字幕編輯", "課程字幕校對"],
    note: "工作地點不得照抄範例；請依實際研究室與房號填寫。"
  }
];

function normalized(value) {
  return String(value ?? "").replaceAll(/\s+/g, "").toLowerCase();
}

export function findProfile(profiles, sheet) {
  const active = profiles.filter((profile) => profile.active !== false);
  const number = normalized(sheet.planNumber);
  if (number) {
    const matched = active.find((profile) => normalized(profile.planNumber) === number);
    if (matched) return matched;
  }
  const name = normalized(sheet.planName);
  return name ? active.find((profile) => normalized(profile.planName) === name) ?? null : null;
}

export function normalizeDateText(value) {
  const match = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function validateProfile(profile) {
  const errors = [];
  if (!String(profile.planName ?? "").trim()) errors.push("計畫名稱未填寫。");
  if (!String(profile.planNumber ?? "").trim()) errors.push("計畫編號未填寫。");
  if (!String(profile.unit ?? "").trim()) errors.push("執行單位未填寫。");
  if (!(Number(profile.hourlyRate) > 0)) errors.push("時薪必須大於 0。");
  for (const value of profile.blockedDates ?? []) {
    if (!normalizeDateText(value)) errors.push(`休假日期「${value}」無法辨識，請改成 2026-07-17 這種格式。`);
  }
  const start = String(profile.earliestStart ?? "");
  const end = String(profile.latestEnd ?? "");
  if (start && end && end <= start) errors.push("最晚結束時間必須晚於最早開始時間。");
  return errors;
}
