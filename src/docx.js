import { strFromU8, unzipSync } from "fflate";
import { inferPeriod } from "./period.js";

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function withoutTextBoxes(xml) {
  return xml.replaceAll(/<w:txbxContent(?:\s[^>]*)?>[\s\S]*?<\/w:txbxContent>/g, "");
}

function xmlText(fragment) {
  return decodeXml([...fragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join(""));
}

function paragraphs(xml) {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((match) => xmlText(match[1]))
    .filter(Boolean);
}

function tableRows(xml) {
  return [...xml.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cellMatch) => xmlText(cellMatch[1]))
  );
}

function normalizeTime(value) {
  const match = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(value);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}

function normalizeDate(value, year, fallbackMonth) {
  const match = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})/.exec(value);
  if (!match) return "";
  const month = Number(match[1]) || fallbackMonth;
  const day = Number(match[2]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function numberValue(value) {
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function optionalNumberValue(value) {
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : "";
}

function metadata(lines, label, nextLabel) {
  const line = lines.find((value) => value.includes(label));
  if (!line) return "";
  const after = line.slice(line.indexOf(label) + label.length);
  return (nextLabel ? after.split(nextLabel)[0] : after).replace(/^\s*[：:]\s*/, "").trim();
}

function personalValue(value, label, nextLabels) {
  const compact = String(value).replaceAll(/\s+/g, "");
  const next = nextLabels.join("|");
  const match = new RegExp(`${label}[：:]?(.+?)(?=${next}|$)`).exec(compact);
  return match ? match[1].replace(/^□?/, "").replace(/□$/, "") : "";
}

function workEntry(cells, context) {
  const id = numberValue(cells[0]);
  if (!id) return null;

  let dateCell;
  let startCell;
  let endCell;
  let hoursCell;
  let payCell;
  let locationCell;
  let workCell;
  let signatureCell;

  if (cells.length >= 9) {
    [, dateCell, startCell, endCell, hoursCell, payCell, locationCell, workCell, signatureCell] = cells;
  } else if (cells.length >= 8) {
    const times = [...cells[2].matchAll(/\d{1,2}\s*[:：]\s*\d{2}/g)].map((match) => match[0]);
    dateCell = cells[1];
    [startCell = "", endCell = ""] = times;
    hoursCell = cells[3];
    payCell = cells[4];
    locationCell = cells[5];
    workCell = cells[6];
    signatureCell = cells[7];
  } else {
    return null;
  }

  const date = normalizeDate(dateCell, context.year, context.month);
  const start = normalizeTime(startCell);
  const end = normalizeTime(endCell);
  if (!date && !start && !end) return null;

  return {
    id: String(id),
    date,
    start,
    end,
    hours: numberValue(hoursCell),
    pay: optionalNumberValue(payCell),
    location: String(locationCell ?? "").trim(),
    workContent: String(workCell ?? "").trim(),
    signature: String(signatureCell ?? "").trim()
  };
}

export async function parseDocx(input, fallbackContext = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const archive = unzipSync(bytes);
  const documentXml = archive["word/document.xml"];
  if (!documentXml) throw new Error("無法讀取 Word 文件內容，請確認檔案是有效的 DOCX。");

  const rawXml = strFromU8(documentXml);
  const context = inferPeriod(xmlText(rawXml), fallbackContext);
  const xml = withoutTextBoxes(rawXml);
  const lines = paragraphs(xml);
  const entries = tableRows(xml)
    .map((cells) => workEntry(cells, context))
    .filter(Boolean);
  const completeText = lines.join(" ");
  const personalText = xmlText(rawXml);
  const hoursMatch = /(?:X|×)\s*(\d+(?:\.\d+)?)\s*小時/i.exec(completeText);
  const payMatch = /金額\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?)\s*元/.exec(completeText);

  return {
    planName: metadata(lines, "計畫名稱", "二、"),
    planNumber: metadata(lines, "計畫編號", "四、"),
    unit: metadata(lines, "執行單位", "三、"),
    name: personalValue(personalText, "姓名", ["學系", "學號", "聯絡電話"]),
    department: personalValue(personalText, "學系", ["學號", "聯絡電話"]),
    studentId: personalValue(personalText, "學號", ["校外人士", "聯絡電話"]),
    phone: personalValue(personalText, "聯絡電話", ["編號", "工作日期"]),
    entries,
    claimedTotalHours: hoursMatch ? Number(hoursMatch[1]) : "",
    claimedTotalPay: payMatch ? numberValue(payMatch[1]) : ""
  };
}
