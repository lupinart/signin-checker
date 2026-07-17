import { parseDocx } from "./docx.js";
import { parseOcrText, recognizeImage } from "./ocr.js";
import { findProfile } from "./profiles.js";
import { buildAnonymousReport, summarizeIssues } from "./report.js";
import { checkTimesheet } from "./rules.js";
import { loadProfiles } from "./store.js";

const elements = {
  period: document.querySelector("#period"),
  docxInput: document.querySelector("#docx-input"),
  imageInput: document.querySelector("#image-input"),
  uploadZone: document.querySelector("#upload-zone"),
  fileStatus: document.querySelector("#file-status"),
  ocrProgress: document.querySelector("#ocr-progress"),
  ocrPercent: document.querySelector("#ocr-percent"),
  ocrBar: document.querySelector("#ocr-bar"),
  sourcePreview: document.querySelector("#source-preview"),
  clearButton: document.querySelector("#clear-button"),
  uploadStage: document.querySelector("#upload-stage"),
  reviewPanel: document.querySelector("#review-panel"),
  resultsPanel: document.querySelector("#results-panel"),
  sourceKind: document.querySelector("#source-kind"),
  planName: document.querySelector("#plan-name"),
  planNumber: document.querySelector("#plan-number"),
  unit: document.querySelector("#unit"),
  profilePickerWrap: document.querySelector("#profile-picker-wrap"),
  profilePicker: document.querySelector("#profile-picker"),
  entryList: document.querySelector("#entry-list"),
  totalHours: document.querySelector("#total-hours"),
  totalPay: document.querySelector("#total-pay"),
  rawWrap: document.querySelector("#ocr-raw-wrap"),
  rawText: document.querySelector("#ocr-raw"),
  addRow: document.querySelector("#add-row"),
  backToReview: document.querySelector("#back-to-review"),
  issueSummary: document.querySelector("#issue-summary"),
  issueList: document.querySelector("#issue-list"),
  declarationList: document.querySelector("#declaration-list"),
  completion: document.querySelector("#completion-callout"),
  download: document.querySelector("#download-report"),
  newCheck: document.querySelector("#new-check"),
  profileVersion: document.querySelector("#profile-version"),
  steps: [...document.querySelectorAll("#step-list li")]
};

const state = {
  profiles: [],
  sourceUrl: null,
  sourceKind: "",
  currentProfile: null,
  sheet: null,
  result: null
};

function setStatus(message, tone = "") {
  elements.fileStatus.textContent = message;
  elements.fileStatus.dataset.tone = tone;
}

function setStep(step) {
  elements.steps.forEach((item, index) => {
    item.removeAttribute("aria-current");
    item.dataset.complete = index + 1 < step ? "true" : "false";
    if (index + 1 === step) item.setAttribute("aria-current", "step");
  });
}

function contextFromPeriod() {
  const [year, month] = elements.period.value.split("-").map(Number);
  return { year: year || new Date().getFullYear(), month: month || new Date().getMonth() + 1 };
}

function setValue(element, value) {
  element.value = value ?? "";
}

function field(label, name, value, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const id = `entry-${options.entryId}-${name}`;
  const labelElement = document.createElement("label");
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  const input = document.createElement("input");
  input.className = "input";
  input.id = id;
  input.name = name;
  input.value = value ?? "";
  input.dataset.entryField = name;
  if (options.type) input.type = options.type;
  if (options.step) input.step = options.step;
  if (options.inputMode) input.inputMode = options.inputMode;
  wrapper.append(labelElement, input);
  return wrapper;
}

function createEntryCard(entry, index) {
  const card = document.createElement("article");
  card.className = "entry-card";
  card.dataset.entryId = String(entry.id || index + 1);

  const head = document.createElement("div");
  head.className = "entry-card__head";
  const number = document.createElement("span");
  number.className = "entry-card__number";
  number.textContent = `第 ${card.dataset.entryId} 列`;
  const remove = document.createElement("button");
  remove.className = "button button--quiet";
  remove.type = "button";
  remove.textContent = "移除";
  remove.addEventListener("click", () => {
    card.remove();
    renumberEntries();
  });
  head.append(number, remove);

  const grid = document.createElement("div");
  grid.className = "field-grid";
  const id = card.dataset.entryId;
  grid.append(
    field("日期", "date", entry.date, { entryId: id, type: "date" }),
    field("開始", "start", entry.start, { entryId: id, type: "time" }),
    field("結束", "end", entry.end, { entryId: id, type: "time" }),
    field("時數", "hours", entry.hours, { entryId: id, type: "number", step: "0.01", inputMode: "decimal" }),
    field("日薪", "pay", entry.pay, { entryId: id, type: "number", step: "1", inputMode: "numeric" }),
    field("工作地點", "location", entry.location, { entryId: id }),
    field("工作內容", "workContent", entry.workContent, { entryId: id })
  );
  card.append(head, grid);
  return card;
}

function renumberEntries() {
  [...elements.entryList.children].forEach((card, index) => {
    card.dataset.entryId = String(index + 1);
    card.querySelector(".entry-card__number").textContent = `第 ${index + 1} 列`;
  });
}

function renderEntries(entries) {
  elements.entryList.replaceChildren();
  const rows = entries.length ? entries : [{ id: "1", date: "", start: "", end: "", hours: "", pay: "", location: "", workContent: "" }];
  rows.forEach((entry, index) => elements.entryList.append(createEntryCard(entry, index)));
}

function populateProfilePicker() {
  elements.profilePicker.replaceChildren();
  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.planNumber} · ${profile.planName}`;
    elements.profilePicker.append(option);
  }
}

function selectProfile(sheet) {
  const matched = findProfile(state.profiles, sheet);
  state.currentProfile = matched ?? state.profiles[0] ?? null;
  elements.profilePickerWrap.hidden = Boolean(matched);
  if (state.currentProfile) elements.profilePicker.value = state.currentProfile.id;
}

function showReview(sheet, sourceKind) {
  state.sheet = sheet;
  state.sourceKind = sourceKind;
  elements.resultsPanel.hidden = true;
  elements.reviewPanel.hidden = false;
  elements.sourceKind.textContent = sourceKind === "docx" ? "Word 本機解析" : "照片本機 OCR";
  setValue(elements.planName, sheet.planName);
  setValue(elements.planNumber, sheet.planNumber);
  setValue(elements.unit, sheet.unit);
  setValue(elements.totalHours, sheet.claimedTotalHours);
  setValue(elements.totalPay, sheet.claimedTotalPay);
  renderEntries(sheet.entries ?? []);
  elements.rawWrap.hidden = sourceKind !== "image";
  setValue(elements.rawText, sheet.rawText);
  selectProfile(sheet);
  elements.clearButton.hidden = false;
  elements.clearButton.disabled = false;
  setStep(2);
  elements.reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetSourcePreview() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  elements.sourcePreview.replaceChildren();
  elements.sourcePreview.hidden = true;
}

async function handleDocx(file) {
  resetSourcePreview();
  setStatus(`正在本機解析 ${file.name}…`);
  try {
    const sheet = await parseDocx(await file.arrayBuffer(), contextFromPeriod());
    setStatus(`已在本機讀取 ${sheet.entries.length} 筆工作紀錄。`, "success");
    showReview(sheet, "docx");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handleImage(file) {
  resetSourcePreview();
  state.sourceUrl = URL.createObjectURL(file);
  const image = document.createElement("img");
  image.src = state.sourceUrl;
  image.alt = "待檢查的簽到單照片預覽";
  elements.sourcePreview.append(image);
  elements.sourcePreview.hidden = false;
  elements.ocrProgress.hidden = false;
  setStatus(`正在本機辨識 ${file.name}，第一次載入中文模型會較久。`);
  try {
    const recognized = await recognizeImage(file, (progress) => {
      elements.ocrPercent.textContent = `${progress}%`;
      elements.ocrBar.style.setProperty("--progress-scale", String(progress / 100));
    });
    const sheet = parseOcrText(recognized.text, contextFromPeriod());
    setStatus(`照片辨識完成，整體信心約 ${Math.round(recognized.confidence)}%。請逐欄確認。`, "success");
    showReview(sheet, "image");
  } catch (error) {
    setStatus(`照片辨識未完成：${error.message}。請確認網路可載入辨識模型，或改用 Word。`, "error");
  } finally {
    elements.ocrProgress.hidden = true;
  }
}

function collectSheet() {
  const entries = [...elements.entryList.querySelectorAll(".entry-card")].map((card, index) => {
    const value = (name) => card.querySelector(`[data-entry-field="${name}"]`).value;
    return {
      id: String(index + 1),
      date: value("date"),
      start: value("start"),
      end: value("end"),
      hours: Number(value("hours")),
      pay: Number(value("pay")),
      location: value("location"),
      workContent: value("workContent")
    };
  });
  return {
    planName: elements.planName.value.trim(),
    planNumber: elements.planNumber.value.trim(),
    unit: elements.unit.value.trim(),
    entries,
    claimedTotalHours: Number(elements.totalHours.value),
    claimedTotalPay: Number(elements.totalPay.value)
  };
}

function groupedIssues(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const key = `${issue.code}:${issue.message}`;
    if (!groups.has(key)) groups.set(key, { ...issue, entryIds: [] });
    groups.get(key).entryIds.push(...(issue.entryIds ?? []));
  }
  return [...groups.values()].map((issue) => ({ ...issue, entryIds: [...new Set(issue.entryIds)] }));
}

function markEntryErrors(issues) {
  const errorIds = new Set(issues.filter((issue) => issue.severity === "error").flatMap((issue) => issue.entryIds ?? []));
  [...elements.entryList.children].forEach((card) => {
    card.dataset.hasError = errorIds.has(card.dataset.entryId) ? "true" : "false";
  });
}

function issueCount(label, count, tone) {
  const box = document.createElement("div");
  box.className = `issue-count issue-count--${tone}`;
  const number = document.createElement("strong");
  number.textContent = String(count);
  const text = document.createElement("span");
  text.textContent = label;
  box.append(number, text);
  return box;
}

function renderIssues(result) {
  const summary = summarizeIssues(result.issues);
  elements.issueSummary.replaceChildren(
    issueCount("必須修改", summary.error, "error"),
    issueCount("需要確認", summary.review, "review"),
    issueCount("填寫建議", summary.tip, "tip")
  );
  elements.issueList.replaceChildren();
  const issues = groupedIssues(result.issues);
  if (!issues.length) {
    const empty = document.createElement("div");
    empty.className = "callout";
    const title = document.createElement("strong");
    title.textContent = "沒有找到自動檢查錯誤";
    const note = document.createElement("span");
    note.textContent = "仍請完成下方人工確認。";
    empty.append(title, note);
    elements.issueList.append(empty);
  }
  for (const issue of issues) {
    const article = document.createElement("article");
    article.className = "issue";
    article.dataset.severity = issue.severity;
    const title = document.createElement("strong");
    title.textContent = issue.severity === "error" ? "必須修改" : issue.severity === "review" ? "需要確認" : "填寫建議";
    const message = document.createElement("span");
    message.textContent = issue.message;
    article.append(title, message);
    if (issue.entryIds.length) {
      const rows = document.createElement("small");
      rows.textContent = `相關列：${issue.entryIds.join("、")}`;
      article.append(rows);
      const locate = document.createElement("button");
      locate.className = "button button--quiet";
      locate.type = "button";
      locate.textContent = "返回該列";
      locate.addEventListener("click", () => {
        elements.resultsPanel.hidden = true;
        elements.reviewPanel.hidden = false;
        setStep(2);
        const card = elements.entryList.querySelector(`[data-entry-id="${CSS.escape(issue.entryIds[0])}"]`);
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.querySelector("input")?.focus({ preventScroll: true });
      });
      article.append(locate);
    }
    elements.issueList.append(article);
  }
}

function updateCompletion() {
  const boxes = [...elements.declarationList.querySelectorAll("input[type=checkbox]")];
  const complete = boxes.length > 0 && boxes.every((box) => box.checked);
  elements.download.disabled = !complete;
  elements.completion.querySelector("strong").textContent = complete ? "人工確認已完成" : "尚未完成人工確認";
  elements.completion.querySelector("span").textContent = complete ? "你可以下載不含個資的檢查清單。" : "勾選全部項目後，再下載匿名檢查清單。";
}

function renderDeclarations(declarations) {
  elements.declarationList.replaceChildren();
  for (const declaration of declarations) {
    const label = document.createElement("label");
    label.className = "check-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = declaration.code;
    checkbox.addEventListener("change", updateCompletion);
    const text = document.createElement("span");
    text.textContent = declaration.label;
    label.append(checkbox, text);
    elements.declarationList.append(label);
  }
  updateCompletion();
}

function showResults(sheet, profile) {
  state.sheet = sheet;
  state.currentProfile = profile;
  state.result = checkTimesheet(sheet, profile);
  markEntryErrors(state.result.issues);
  renderIssues(state.result);
  renderDeclarations(state.result.declarations);
  elements.profileVersion.textContent = `${profile.planName} · 規則版本 ${profile.version ?? 1}`;
  elements.reviewPanel.hidden = true;
  elements.resultsPanel.hidden = false;
  setStep(4);
  elements.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function reportMarkdown(report) {
  const tone = { error: "必須修改", review: "需要確認", tip: "填寫建議" };
  return [
    "# 簽到單匿名檢查清單",
    "",
    `- 計畫：${report.profile.planName}`,
    `- 計畫編號：${report.profile.planNumber}`,
    `- 規則版本：${report.profile.version}`,
    `- 產生時間：${report.generatedAt}`,
    `- 必須修改：${report.summary.error}`,
    `- 需要確認：${report.summary.review}`,
    "",
    "## 檢查問題",
    "",
    ...report.issues.flatMap((issue) => [`- [${tone[issue.severity]}] ${issue.message}${issue.entryIds.length ? `（第 ${issue.entryIds.join("、")} 列）` : ""}`]),
    "",
    "## 人工確認",
    "",
    ...report.declarations.map((item) => `- [x] ${item.label}`),
    "",
    `> ${report.privacy}`,
    ""
  ].join("\n");
}

function downloadReport() {
  const report = buildAnonymousReport({ profile: state.currentProfile, sheet: state.sheet, result: state.result });
  const blob = new Blob([reportMarkdown(report)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `簽到單檢查清單-${state.currentProfile.planNumber}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  resetSourcePreview();
  state.sheet = null;
  state.result = null;
  state.currentProfile = null;
  elements.docxInput.value = "";
  elements.imageInput.value = "";
  elements.reviewPanel.reset();
  elements.reviewPanel.hidden = true;
  elements.resultsPanel.hidden = true;
  elements.rawWrap.hidden = true;
  elements.entryList.replaceChildren();
  elements.clearButton.hidden = true;
  elements.clearButton.disabled = true;
  setStatus("尚未選擇檔案。");
  setStep(1);
}

elements.docxInput.addEventListener("change", (event) => event.target.files[0] && handleDocx(event.target.files[0]));
elements.imageInput.addEventListener("change", (event) => event.target.files[0] && handleImage(event.target.files[0]));
elements.clearButton.addEventListener("click", clearAll);
elements.newCheck.addEventListener("click", () => {
  clearAll();
  elements.uploadStage.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.backToReview.addEventListener("click", () => {
  elements.resultsPanel.hidden = true;
  elements.reviewPanel.hidden = false;
  setStep(2);
});
elements.addRow.addEventListener("click", () => {
  elements.entryList.append(createEntryCard({ id: String(elements.entryList.children.length + 1) }, elements.entryList.children.length));
});
elements.profilePicker.addEventListener("change", () => {
  state.currentProfile = state.profiles.find((profile) => profile.id === elements.profilePicker.value) ?? null;
});
elements.reviewPanel.addEventListener("submit", (event) => {
  event.preventDefault();
  const sheet = collectSheet();
  const profile = findProfile(state.profiles, sheet) ?? state.profiles.find((item) => item.id === elements.profilePicker.value) ?? state.currentProfile;
  if (!profile) {
    setStatus("找不到可用的計畫規則，請聯絡管理者。", "error");
    return;
  }
  showResults(sheet, profile);
});
elements.download.addEventListener("click", downloadReport);

for (const eventName of ["dragenter", "dragover"]) {
  elements.uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadZone.dataset.dragging = "true";
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadZone.dataset.dragging = "false";
  });
}
elements.uploadZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith(".docx")) handleDocx(file);
  else if (file.type.startsWith("image/")) handleImage(file);
  else setStatus("只支援 DOCX 或圖片檔。", "error");
});

try {
  state.profiles = await loadProfiles();
  populateProfilePicker();
  if (!state.profiles.length) setStatus("目前沒有已啟用的計畫規則，請聯絡管理者。", "error");
} catch (error) {
  setStatus(error.message, "error");
}
