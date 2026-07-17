import { annotateImage, annotateRenderedDocx, buildAnnotations } from "./annotations.js";
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
  clearButton: document.querySelector("#clear-button"),
  uploadStage: document.querySelector("#upload-stage"),
  resultsPanel: document.querySelector("#results-panel"),
  annotatedDocument: document.querySelector("#annotated-document"),
  issueSummary: document.querySelector("#issue-summary"),
  issueList: document.querySelector("#issue-list"),
  declarationList: document.querySelector("#declaration-list"),
  completion: document.querySelector("#completion-callout"),
  download: document.querySelector("#download-report"),
  newCheck: document.querySelector("#new-check"),
  newCheckTop: document.querySelector("#new-check-top"),
  profileVersion: document.querySelector("#profile-version"),
  steps: [...document.querySelectorAll("#step-list li")]
};

const state = {
  profiles: [],
  sourceUrl: null,
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

function focusAnnotation(number) {
  const markers = [...elements.annotatedDocument.querySelectorAll(`[data-annotation-number="${number}"]`)];
  markers.forEach((marker) => { marker.dataset.active = "true"; });
  markers[0]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  window.setTimeout(() => markers.forEach((marker) => delete marker.dataset.active), 1600);
}

function renderIssues(annotations) {
  const summary = summarizeIssues(annotations);
  elements.issueSummary.replaceChildren(
    issueCount("必須修改", summary.error, "error"),
    issueCount("需要確認", summary.review, "review"),
    issueCount("填寫建議", summary.tip, "tip")
  );
  elements.issueList.replaceChildren();

  if (!annotations.length) {
    const empty = document.createElement("div");
    empty.className = "callout";
    empty.innerHTML = "<strong>沒有找到自動檢查錯誤</strong><span>仍請完成下方人工確認。</span>";
    elements.issueList.append(empty);
    return;
  }

  for (const annotation of annotations) {
    const article = document.createElement("article");
    article.className = "issue";
    article.dataset.severity = annotation.severity;
    const number = document.createElement("span");
    number.className = "issue__number";
    number.textContent = String(annotation.number);
    const copy = document.createElement("div");
    copy.className = "issue__copy";
    const title = document.createElement("strong");
    title.textContent = annotation.severity === "error" ? "必須修改" : annotation.severity === "review" ? "需要確認" : "填寫建議";
    const message = document.createElement("span");
    message.textContent = annotation.message;
    copy.append(title, message);
    if (annotation.entryIds.length) {
      const rows = document.createElement("small");
      rows.textContent = `相關列：${annotation.entryIds.join("、")}`;
      copy.append(rows);
    }
    const locate = document.createElement("button");
    locate.className = "issue__locate";
    locate.type = "button";
    locate.textContent = `查看標記 ${annotation.number}`;
    locate.addEventListener("click", () => focusAnnotation(annotation.number));
    copy.append(locate);
    article.append(number, copy);
    elements.issueList.append(article);
  }
}

function addCell(row, value, tagName = "td") {
  const cell = document.createElement(tagName);
  cell.textContent = value ?? "";
  row.append(cell);
}

function renderSheetFallback(sheet) {
  const paper = document.createElement("div");
  paper.className = "document-fallback";
  const title = document.createElement("h3");
  title.textContent = "計畫案工讀生及臨時工簽到單";
  const metadata = document.createElement("div");
  metadata.className = "document-metadata";
  for (const [label, value] of [["計畫名稱", sheet.planName], ["執行單位", sheet.unit], ["計畫編號", sheet.planNumber]]) {
    const line = document.createElement("p");
    line.append(`${label}：`, document.createTextNode(value ?? ""));
    metadata.append(line);
  }
  const table = document.createElement("table");
  const header = document.createElement("tr");
  ["編號", "日期", "開始", "結束", "時數", "酬金", "工作地點", "工作內容"].forEach((value) => addCell(header, value, "th"));
  table.append(header);
  for (const entry of sheet.entries ?? []) {
    const row = document.createElement("tr");
    [entry.id, entry.date, entry.start, entry.end, entry.hours, entry.pay, entry.location, entry.workContent].forEach((value) => addCell(row, value));
    table.append(row);
  }
  const totals = document.createElement("p");
  totals.textContent = `合計時數：${sheet.claimedTotalHours ?? ""}　合計金額：${sheet.claimedTotalPay ?? ""}`;
  paper.append(title, metadata, table, totals);
  elements.annotatedDocument.append(paper);
  return paper;
}

async function renderDocxSource(buffer, sheet, annotations) {
  const rendered = document.createElement("div");
  rendered.className = "docx-render";
  elements.annotatedDocument.append(rendered);
  try {
    const { renderAsync } = await import("docx-preview");
    await renderAsync(buffer, rendered, null, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreLastRenderedPageBreak: false,
      debug: false
    });
    annotateRenderedDocx(rendered, annotations);
  } catch {
    rendered.remove();
    annotateRenderedDocx(renderSheetFallback(sheet), annotations);
  }
}

async function renderImageSource(url, annotations, lines) {
  const frame = document.createElement("div");
  frame.className = "photo-frame";
  const image = document.createElement("img");
  image.src = url;
  image.alt = "已標記問題的簽到單照片";
  frame.append(image);
  elements.annotatedDocument.append(frame);
  await image.decode().catch(() => {});
  annotateImage(frame, annotations, lines, image.naturalWidth, image.naturalHeight);
}

function updateCompletion() {
  const boxes = [...elements.declarationList.querySelectorAll("input[type=checkbox]")];
  const complete = boxes.length > 0 && boxes.every((box) => box.checked);
  elements.download.disabled = !complete;
  elements.completion.querySelector("strong").textContent = complete ? "人工確認已完成" : "尚未完成人工確認";
  elements.completion.querySelector("span").textContent = complete ? "你可以下載不含個資的檢查清單。" : "勾選全部項目後，再下載匿名檢查清單。";
  setStep(complete ? 3 : 2);
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

async function showResults(sheet, source) {
  const profile = findProfile(state.profiles, sheet) ?? state.profiles[0];
  if (!profile) throw new Error("找不到可用的計畫規則，請聯絡管理者。");
  state.sheet = sheet;
  state.currentProfile = profile;
  state.result = checkTimesheet(sheet, profile);
  const annotations = buildAnnotations(state.result.issues, sheet);
  renderIssues(annotations);
  renderDeclarations(state.result.declarations);
  elements.profileVersion.textContent = `${profile.planName} · 規則版本 ${profile.version ?? 1}`;
  elements.annotatedDocument.replaceChildren();
  if (source.kind === "docx") await renderDocxSource(source.buffer, sheet, annotations);
  else await renderImageSource(source.url, annotations, source.lines);
  elements.resultsPanel.hidden = false;
  elements.clearButton.hidden = false;
  elements.clearButton.disabled = false;
  setStatus(`檢查完成，共有 ${annotations.length} 項提醒。請依編號核對。`, annotations.length ? "error" : "success");
  elements.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleDocx(file) {
  setStatus(`正在本機解析並檢查 ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const sheet = await parseDocx(buffer, contextFromPeriod());
    await showResults(sheet, { kind: "docx", buffer });
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handleImage(file) {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = URL.createObjectURL(file);
  elements.ocrProgress.hidden = false;
  setStatus(`正在本機辨識並檢查 ${file.name}，第一次載入中文模型會較久。`);
  try {
    const recognized = await recognizeImage(file, (progress) => {
      elements.ocrPercent.textContent = `${progress}%`;
      elements.ocrBar.style.setProperty("--progress-scale", String(progress / 100));
    });
    const sheet = parseOcrText(recognized.text, contextFromPeriod());
    await showResults(sheet, { kind: "image", url: state.sourceUrl, lines: recognized.lines });
  } catch (error) {
    setStatus(`照片辨識未完成：${error.message}。請換一張清楚、正面的照片，或改用 Word。`, "error");
  } finally {
    elements.ocrProgress.hidden = true;
  }
}

function reportMarkdown(report) {
  const tone = { error: "必須修改", review: "需要確認", tip: "填寫建議" };
  return [
    "# 簽到單匿名檢查清單", "",
    `- 計畫：${report.profile.planName}`,
    `- 計畫編號：${report.profile.planNumber}`,
    `- 規則版本：${report.profile.version}`,
    `- 產生時間：${report.generatedAt}`,
    `- 必須修改：${report.summary.error}`,
    `- 需要確認：${report.summary.review}`, "", "## 檢查問題", "",
    ...report.issues.map((issue, index) => `${index + 1}. [${tone[issue.severity]}] ${issue.message}${issue.entryIds.length ? `（第 ${issue.entryIds.join("、")} 列）` : ""}`),
    "", "## 人工確認", "",
    ...report.declarations.map((item) => `- [x] ${item.label}`), "", `> ${report.privacy}`, ""
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
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  state.sheet = null;
  state.result = null;
  state.currentProfile = null;
  elements.docxInput.value = "";
  elements.imageInput.value = "";
  elements.resultsPanel.hidden = true;
  elements.annotatedDocument.replaceChildren();
  elements.clearButton.hidden = true;
  elements.clearButton.disabled = true;
  setStatus("尚未選擇檔案。");
  setStep(1);
}

function startAnotherCheck() {
  clearAll();
  elements.uploadStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.docxInput.addEventListener("change", (event) => event.target.files[0] && handleDocx(event.target.files[0]));
elements.imageInput.addEventListener("change", (event) => event.target.files[0] && handleImage(event.target.files[0]));
elements.clearButton.addEventListener("click", clearAll);
elements.newCheck.addEventListener("click", startAnotherCheck);
elements.newCheckTop.addEventListener("click", startAnotherCheck);
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
  if (!state.profiles.length) setStatus("目前沒有已啟用的計畫規則，請聯絡管理者。", "error");
} catch (error) {
  setStatus(error.message, "error");
}
