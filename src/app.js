import { annotateImage, annotateRenderedDocx, buildAnnotations } from "./annotations.js";
import { parseDocx } from "./docx.js";
import { parseOcrText, recognizeImage } from "./ocr.js";
import { findProfile } from "./profiles.js";
import { summarizeIssues } from "./report.js";
import { checkTimesheet } from "./rules.js";
import { loadProfiles } from "./store.js";

const elements = {
  docxInput: document.querySelector("#docx-input"),
  imageInput: document.querySelector("#image-input"),
  uploadZone: document.querySelector("#upload-zone"),
  fileStatus: document.querySelector("#file-status"),
  ocrProgress: document.querySelector("#ocr-progress"),
  ocrPercent: document.querySelector("#ocr-percent"),
  ocrBar: document.querySelector("#ocr-bar"),
  uploadStage: document.querySelector("#upload-stage"),
  reviewPanel: document.querySelector("#review-panel"),
  reviewConfidence: document.querySelector("#review-confidence"),
  reviewCancel: document.querySelector("#review-cancel"),
  reviewPhoto: document.querySelector("#review-photo"),
  reviewForm: document.querySelector("#review-form"),
  reviewEntries: document.querySelector("#review-entries"),
  addEntry: document.querySelector("#add-entry"),
  resultsPanel: document.querySelector("#results-panel"),
  resultsStatus: document.querySelector("#results-status"),
  annotatedDocument: document.querySelector("#annotated-document"),
  issueSummary: document.querySelector("#issue-summary"),
  issueList: document.querySelector("#issue-list"),
  manualCheckList: document.querySelector("#manual-check-list"),
  profileVersion: document.querySelector("#profile-version"),
  newCheckTop: document.querySelector("#new-check-top"),
  steps: [...document.querySelectorAll("#step-list li")]
};

const state = {
  profiles: [],
  sourceUrl: null,
  currentProfile: null,
  sheet: null,
  result: null,
  reviewLines: [],
  footerSignatureFound: false
};

let entrySequence = 0;

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
    issueCount("需要確認", summary.review, "review")
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
    title.textContent = annotation.severity === "error" ? "必須修改" : "需要確認";
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
  for (const [label, value] of [
    ["計畫名稱", sheet.planName], ["執行單位", sheet.unit], ["計畫編號", sheet.planNumber],
    ["姓名", sheet.name], ["學系", sheet.department], ["學號", sheet.studentId], ["聯絡電話", sheet.phone]
  ]) {
    const line = document.createElement("p");
    line.append(`${label}：`, document.createTextNode(value ?? ""));
    metadata.append(line);
  }
  const table = document.createElement("table");
  const header = document.createElement("tr");
  ["編號", "日期", "開始", "結束", "時數", "酬金", "工作地點", "工作內容", "簽章"].forEach((value) => addCell(header, value, "th"));
  table.append(header);
  for (const entry of sheet.entries ?? []) {
    const row = document.createElement("tr");
    [entry.id, entry.date, entry.start, entry.end, entry.hours, entry.pay, entry.location, entry.workContent, entry.signature].forEach((value) => addCell(row, value));
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

function renderManualChecks(declarations) {
  elements.manualCheckList.replaceChildren();
  for (const declaration of declarations) {
    const item = document.createElement("li");
    item.textContent = declaration.label;
    elements.manualCheckList.append(item);
  }
}

async function showResults(sheet, source) {
  if (!state.profiles.length) throw new Error("找不到可用的計畫規則，請聯絡管理者。");
  const matched = findProfile(state.profiles, sheet);
  const profile = matched ?? (state.profiles.length === 1 ? state.profiles[0] : null);
  if (!profile) {
    const available = state.profiles.map((item) => `${item.planNumber}（${item.planName}）`).join("、");
    throw new Error(`無法從文件辨識出對應的計畫，請確認簽到單上的計畫編號是否清楚。目前啟用中的計畫：${available}。`);
  }
  state.sheet = sheet;
  state.currentProfile = profile;
  state.result = checkTimesheet(sheet, profile);
  const annotations = buildAnnotations(state.result.issues, sheet);
  renderIssues(annotations);
  renderManualChecks(state.result.declarations);
  elements.profileVersion.textContent = matched ? "" : `未能從文件對應計畫，暫以「${profile.planName}」的規則檢查`;
  elements.annotatedDocument.replaceChildren();
  if (source.kind === "docx") await renderDocxSource(source.buffer, sheet, annotations);
  else await renderImageSource(source.url, annotations, source.lines);
  elements.reviewPanel.hidden = true;
  elements.resultsPanel.hidden = false;
  elements.uploadZone.hidden = true;
  setStep(2);
  elements.resultsStatus.textContent = annotations.length
    ? `檢查完成，共有 ${annotations.length} 項提醒，請依編號核對。`
    : "檢查完成，沒有找到自動檢查錯誤；仍請完成下方人工核對。";
  elements.resultsStatus.dataset.tone = annotations.length ? "error" : "success";
  setStatus("");
  elements.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleDocx(file) {
  setStatus(`正在本機解析並檢查 ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const sheet = await parseDocx(buffer);
    await showResults(sheet, { kind: "docx", buffer });
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function addEntryCard(entry = {}) {
  entrySequence += 1;
  const card = document.createElement("article");
  card.className = "entry-card";
  const head = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "工作列";
  const remove = document.createElement("button");
  remove.className = "button button--quiet";
  remove.type = "button";
  remove.textContent = "刪除這列";
  remove.addEventListener("click", () => card.remove());
  head.append(title, remove);
  const grid = document.createElement("div");
  grid.className = "field-grid";
  for (const [labelText, name, type] of [
    ["日期", "date", "date"],
    ["開始", "start", "time"],
    ["結束", "end", "time"],
    ["時數", "hours", "text"],
    ["酬金", "pay", "text"],
    ["工作地點", "location", "text"],
    ["工作內容", "workContent", "text"],
    ["簽章（照片上的簽名文字）", "signature", "text"]
  ]) {
    const field = document.createElement("div");
    field.className = "field";
    const id = `entry-${entrySequence}-${name}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    const input = document.createElement("input");
    input.className = "input";
    input.id = id;
    input.type = type;
    input.dataset.entryField = name;
    if (name === "hours" || name === "pay") input.inputMode = "decimal";
    input.value = entry[name] ?? "";
    field.append(label, input);
    grid.append(field);
  }
  card.append(head, grid);
  elements.reviewEntries.append(card);
}

function setReviewValue(name, value) {
  const input = elements.reviewForm.elements.namedItem(name);
  if (input) input.value = value ?? "";
}

function renderReviewForm(sheet, confidence) {
  for (const name of ["planName", "planNumber", "unit", "name", "department", "studentId", "phone"]) {
    setReviewValue(name, sheet[name]);
  }
  setReviewValue("claimedTotalHours", sheet.claimedTotalHours);
  setReviewValue("claimedTotalPay", sheet.claimedTotalPay);
  setReviewValue("footerSignature", sheet.footerSignature);
  state.footerSignatureFound = Boolean(sheet.footerSignatureFound);
  elements.reviewEntries.replaceChildren();
  const entries = sheet.entries?.length ? sheet.entries : [{}];
  entries.forEach((entry) => addEntryCard(entry));
  elements.reviewConfidence.textContent = `自動辨識信心約 ${Math.round(confidence)}%，內容以你照片上的原件為準。`;
  elements.reviewPhoto.src = state.sourceUrl;
  elements.uploadZone.hidden = true;
  elements.resultsPanel.hidden = true;
  elements.reviewPanel.hidden = false;
  elements.reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function numberOrBlank(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed.replaceAll(",", ""));
  return Number.isNaN(parsed) ? trimmed : parsed;
}

function collectReviewSheet() {
  const form = elements.reviewForm.elements;
  const fieldValue = (name) => form.namedItem(name).value.trim();
  const entries = [...elements.reviewEntries.querySelectorAll(".entry-card")]
    .map((card, index) => {
      const value = (name) => card.querySelector(`[data-entry-field="${name}"]`).value.trim();
      return {
        id: String(index + 1),
        date: value("date"),
        start: value("start"),
        end: value("end"),
        hours: numberOrBlank(value("hours")),
        pay: numberOrBlank(value("pay")),
        location: value("location"),
        workContent: value("workContent"),
        signature: value("signature")
      };
    })
    .filter((entry) => entry.date || entry.start || entry.end || entry.location || entry.workContent);
  const footerSignature = fieldValue("footerSignature");

  return {
    planName: fieldValue("planName"),
    planNumber: fieldValue("planNumber"),
    unit: fieldValue("unit"),
    name: fieldValue("name"),
    department: fieldValue("department"),
    studentId: fieldValue("studentId"),
    phone: fieldValue("phone"),
    footerSignature,
    footerSignatureFound: Boolean(state.footerSignatureFound || footerSignature),
    entries,
    claimedTotalHours: numberOrBlank(fieldValue("claimedTotalHours")),
    claimedTotalPay: numberOrBlank(fieldValue("claimedTotalPay"))
  };
}

async function handleImage(file) {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = URL.createObjectURL(file);
  elements.ocrProgress.hidden = false;
  setStatus(`正在本機辨識 ${file.name}，第一次載入中文模型會較久。`);
  try {
    const recognized = await recognizeImage(file, (progress) => {
      elements.ocrPercent.textContent = `${progress}%`;
      elements.ocrBar.style.setProperty("--progress-scale", String(progress / 100));
    });
    const workContents = [...new Set(state.profiles.flatMap((profile) => profile.allowedWorkContents ?? []))];
    const sheet = parseOcrText(recognized.text, {}, { workContents });
    state.reviewLines = recognized.lines;
    renderReviewForm(sheet, recognized.confidence ?? 0);
    setStatus("辨識完成，請在下方核對並修正內容後開始檢查。");
  } catch (error) {
    setStatus(`照片辨識未完成：${error.message}。請換一張清楚、正面的照片，或改用 Word。`, "error");
  } finally {
    elements.ocrProgress.hidden = true;
  }
}

function clearAll() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
  state.sheet = null;
  state.result = null;
  state.currentProfile = null;
  state.reviewLines = [];
  state.footerSignatureFound = false;
  elements.docxInput.value = "";
  elements.imageInput.value = "";
  elements.reviewPanel.hidden = true;
  elements.reviewEntries.replaceChildren();
  elements.reviewPhoto.removeAttribute("src");
  elements.resultsPanel.hidden = true;
  elements.annotatedDocument.replaceChildren();
  elements.uploadZone.hidden = false;
  setStatus("尚未選擇檔案。");
  setStep(1);
}

function startAnotherCheck() {
  clearAll();
  elements.uploadStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.docxInput.addEventListener("change", (event) => event.target.files[0] && handleDocx(event.target.files[0]));
elements.imageInput.addEventListener("change", (event) => event.target.files[0] && handleImage(event.target.files[0]));
elements.newCheckTop.addEventListener("click", startAnotherCheck);
elements.reviewCancel.addEventListener("click", startAnotherCheck);
elements.addEntry.addEventListener("click", () => addEntryCard());
elements.reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await showResults(collectReviewSheet(), { kind: "image", url: state.sourceUrl, lines: state.reviewLines });
  } catch (error) {
    setStatus(error.message, "error");
  }
});

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
