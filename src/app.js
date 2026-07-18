import { annotateRenderedDocx, buildAnnotations } from "./annotations.js";
import { parseDocx } from "./docx.js";
import { findProfile } from "./profiles.js";
import { summarizeIssues } from "./report.js";
import { checkTimesheet } from "./rules.js";
import { loadProfiles } from "./store.js";

const elements = {
  docxInput: document.querySelector("#docx-input"),
  uploadZone: document.querySelector("#upload-zone"),
  fileStatus: document.querySelector("#file-status"),
  uploadStage: document.querySelector("#upload-stage"),
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

function renderManualChecks(declarations) {
  elements.manualCheckList.replaceChildren();
  for (const declaration of declarations) {
    const item = document.createElement("li");
    item.textContent = declaration.label;
    elements.manualCheckList.append(item);
  }
}

async function showResults(sheet, buffer) {
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
  await renderDocxSource(buffer, sheet, annotations);
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
    await showResults(sheet, buffer);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function clearAll() {
  state.sheet = null;
  state.result = null;
  state.currentProfile = null;
  elements.docxInput.value = "";
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
elements.newCheckTop.addEventListener("click", startAnotherCheck);

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
  else setStatus("只支援 DOCX（Word）檔。", "error");
});

try {
  state.profiles = await loadProfiles();
  if (!state.profiles.length) setStatus("目前沒有已啟用的計畫規則，請聯絡管理者。", "error");
} catch (error) {
  setStatus(error.message, "error");
}
