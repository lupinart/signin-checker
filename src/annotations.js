function clean(value) {
  return String(value ?? "").replaceAll(/\s+/g, "").replaceAll(/[：:，,／/.-]/g, "");
}

function valuesForField(sheet, field, entryIds = []) {
  const topLevel = {
    planName: sheet.planName,
    planNumber: sheet.planNumber,
    unit: sheet.unit,
    name: sheet.name,
    department: sheet.department,
    studentId: sheet.studentId,
    phone: sheet.phone,
    totalHours: sheet.claimedTotalHours,
    totalPay: sheet.claimedTotalPay,
    footerSignature: sheet.footerSignature
  };
  if (field in topLevel) return [String(topLevel[field] ?? "")].filter(Boolean);

  return (sheet.entries ?? []).filter((entry) => entryIds.includes(String(entry.id))).flatMap((entry) => {
    if (field === "time") return [entry.start, entry.end].filter(Boolean).map(String);
    return [entry[field]].filter((value) => value !== "" && value != null).map(String);
  });
}

export function buildAnnotations(issues, sheet) {
  const groups = new Map();
  for (const issue of issues) {
    const key = `${issue.code}:${issue.message}`;
    if (!groups.has(key)) groups.set(key, { ...issue, entryIds: [] });
    groups.get(key).entryIds.push(...(issue.entryIds ?? []).map(String));
  }

  return [...groups.values()].map((issue, index) => {
    const entryIds = [...new Set(issue.entryIds)];
    return {
      ...issue,
      number: index + 1,
      entryIds,
      searchTexts: valuesForField(sheet, issue.field, entryIds),
      targets: entryIds.map((entryId) => ({
        entryId,
        searchTexts: valuesForField(sheet, issue.field, [entryId])
      }))
    };
  });
}

function matchesText(element, values) {
  const haystack = clean(element.textContent);
  return values.some((value) => {
    const needle = clean(value);
    return needle && haystack.includes(needle);
  });
}

export function findAnnotationTarget(candidates, annotation) {
  const labelled = {
    planName: ["計畫名稱"],
    planNumber: ["計畫編號"],
    unit: ["執行單位"],
    name: ["姓名"],
    department: ["學系"],
    studentId: ["學號"],
    phone: ["聯絡電話"],
    totalHours: ["計酬基準", "小時"],
    totalPay: ["金額", "元"],
    footerSignature: ["簽名"]
  }[annotation.field];
  if (labelled) {
    const semanticMatch = candidates.find((candidate) => {
      const value = clean(candidate.textContent);
      return labelled.every((label) => value.includes(clean(label)))
        && (!annotation.searchTexts.length || matchesText(candidate, annotation.searchTexts));
    });
    if (semanticMatch) return semanticMatch;
  }
  return candidates.find((candidate) => matchesText(candidate, annotation.searchTexts));
}

export function fieldColumnIndex(field, cellCount) {
  const expandedTimeColumns = cellCount >= 9;
  return ({
    date: 1,
    hours: expandedTimeColumns ? 4 : 3,
    pay: expandedTimeColumns ? 5 : 4,
    location: expandedTimeColumns ? 6 : 5,
    workContent: expandedTimeColumns ? 7 : 6,
    signature: expandedTimeColumns ? 8 : 7
  })[field] ?? -1;
}

function fieldCell(root, row, cells, field) {
  const directIndex = fieldColumnIndex(field, cells.length);
  if (directIndex >= 0 && cells[directIndex]) return cells[directIndex];
  const labels = {
    date: ["工作日期", "日期"],
    hours: ["工作時數", "時數"],
    pay: ["工作酬金", "酬金", "金額"],
    location: ["工作地點"],
    workContent: ["工作內容"],
    signature: ["簽章"]
  }[field];
  if (!labels) return null;
  const header = [...root.querySelectorAll("tr")].find((candidate) =>
    [...candidate.querySelectorAll("td, th")].some((cell) => labels.some((label) => clean(cell.textContent).includes(clean(label))))
  );
  if (!header || header === row) return null;
  const index = [...header.querySelectorAll("td, th")].findIndex((cell) =>
    labels.some((label) => clean(cell.textContent).includes(clean(label)))
  );
  return index >= 0 ? cells[index] : null;
}

function addDomMarker(target, annotation) {
  if (!target) return;
  target.classList.add("annotation-target");
  target.dataset.annotationNumber = String(annotation.number);
  target.dataset.severity = annotation.severity;
  const badge = document.createElement("span");
  badge.className = "annotation-badge";
  badge.textContent = String(annotation.number);
  badge.dataset.annotationNumber = String(annotation.number);
  badge.dataset.severity = annotation.severity;
  badge.setAttribute("aria-hidden", "true");
  badge.style.setProperty("--annotation-slot", String(target.querySelectorAll(":scope > .annotation-badge").length));
  target.append(badge);
}

export function annotateRenderedDocx(root, annotations) {
  for (const annotation of annotations) {
    if (annotation.targets.length) {
      for (const target of annotation.targets) {
        const row = [...root.querySelectorAll("tr")].find((candidate) => {
          const firstCell = candidate.querySelector("td, th");
          return firstCell && clean(firstCell.textContent) === clean(target.entryId);
        });
        if (!row) continue;
        const cells = [...row.querySelectorAll("td, th")];
        addDomMarker(fieldCell(root, row, cells, annotation.field)
          ?? cells.find((cell) => matchesText(cell, target.searchTexts))
          ?? cells[0], annotation);
      }
      continue;
    }

    const candidates = [...root.querySelectorAll("p, td, th")];
    addDomMarker(findAnnotationTarget(candidates, annotation), annotation);
  }
}

