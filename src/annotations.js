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

function fallbackBox(annotation) {
  const firstEntry = Number(annotation.entryIds[0] ?? 1);
  const x = { date: 10, time: 23, hours: 44, pay: 54, location: 63, workContent: 80, signature: 94 }[annotation.field] ?? 8;
  const width = { time: 20, location: 22, workContent: 18 }[annotation.field] ?? 13;
  const metadataY = { planName: 7, unit: 12, planNumber: 17, name: 20, department: 20, studentId: 23, phone: 23, totalHours: 86, totalPay: 86, footerSignature: 92 }[annotation.field];
  return { left: x, top: metadataY ?? Math.min(78, 28 + (firstEntry - 1) * 8), width, height: 6 };
}

function lineBox(annotation, lines, imageWidth, imageHeight) {
  const targets = annotation.searchTexts.map(clean).filter(Boolean);
  const matched = lines.find((line) => targets.some((target) => {
    const lineText = clean(line.text);
    return lineText.includes(target) || target.includes(lineText);
  }));
  if (!matched?.bbox || !imageWidth || !imageHeight) return fallbackBox(annotation);
  const padding = 1.2;
  return {
    left: Math.max(0, (matched.bbox.x0 / imageWidth) * 100 - padding),
    top: Math.max(0, (matched.bbox.y0 / imageHeight) * 100 - padding),
    width: Math.min(100, ((matched.bbox.x1 - matched.bbox.x0) / imageWidth) * 100 + padding * 2),
    height: Math.min(100, ((matched.bbox.y1 - matched.bbox.y0) / imageHeight) * 100 + padding * 2)
  };
}

export function annotateImage(root, annotations, lines, imageWidth, imageHeight) {
  const overlay = document.createElement("div");
  overlay.className = "image-annotations";
  for (const annotation of annotations) {
    const box = lineBox(annotation, lines, imageWidth, imageHeight);
    const marker = document.createElement("span");
    marker.className = "image-annotation";
    marker.dataset.annotationNumber = String(annotation.number);
    marker.dataset.severity = annotation.severity;
    marker.style.left = `${box.left}%`;
    marker.style.top = `${box.top}%`;
    marker.style.width = `${box.width}%`;
    marker.style.height = `${box.height}%`;
    const badge = document.createElement("span");
    badge.className = "annotation-badge";
    badge.textContent = String(annotation.number);
    marker.append(badge);
    overlay.append(marker);
  }
  root.append(overlay);
}
