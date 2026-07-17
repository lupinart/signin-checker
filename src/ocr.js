import { footerSignature, personalValue } from "./fields.js";
import { inferPeriod } from "./period.js";
import { DEFAULT_PROFILES } from "./profiles.js";

function clean(value) {
  return String(value ?? "").replaceAll(/\s+/g, " ").trim();
}

function metadata(lines, label) {
  const flexibleLabel = [...label].join("\\s*");
  const pattern = new RegExp(`${flexibleLabel}\\s*[：:]?\\s*(.*)$`);
  const match = lines.map((line) => pattern.exec(line)).find(Boolean);
  return match ? clean(match[1]) : "";
}

function dateValue(value, year) {
  const match = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})/.exec(value);
  if (!match) return "";
  return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function timeValue(value) {
  const match = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(value);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}

function contentPattern(workContents) {
  const escaped = [...new Set(workContents.map((value) => String(value ?? "").replaceAll(/\s+/g, "")).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length ? new RegExp(`(${escaped.join("|")})`) : null;
}

function parseRow(line, context, knownContent) {
  const head = /^(\d{1,2})\s+(\d{1,2}\s*[\/.-]\s*\d{1,2})\s+(\d{1,2}\s*[:：]\s*\d{2})\s+(\d{1,2}\s*[:：]\s*\d{2})\s+(\d+(?:\.\d+)?)(?:\s+(\d[\d,]*))?\s+(.+)$/.exec(line);
  if (!head) return null;

  const remainder = clean(head[7]);
  const compactRemainder = remainder.replaceAll(/\s+/g, "");
  const matched = knownContent ? knownContent.exec(compactRemainder) : null;
  let location = remainder;
  let workContent = "";
  let signature = "";
  if (matched) {
    workContent = matched[1];
    location = compactRemainder.slice(0, matched.index);
    signature = compactRemainder.slice(matched.index + matched[1].length);
  } else {
    const split = remainder.split(/\s{2,}|[|｜]/).map(clean).filter(Boolean);
    if (split.length >= 2) {
      workContent = split.pop();
      location = split.join(" ");
    }
  }

  return {
    id: head[1],
    date: dateValue(head[2], context.year),
    start: timeValue(head[3]),
    end: timeValue(head[4]),
    hours: Number(head[5]),
    pay: head[6] ? Number(head[6].replaceAll(",", "")) : "",
    location,
    workContent,
    signature
  };
}

export function parseOcrText(rawText, fallbackContext = {}, options = {}) {
  const lines = String(rawText ?? "").split(/\r?\n/).map(clean).filter(Boolean);
  const context = inferPeriod(rawText, fallbackContext);
  const workContents = options.workContents?.length
    ? options.workContents
    : DEFAULT_PROFILES.flatMap((profile) => profile.allowedWorkContents ?? []);
  const knownContent = contentPattern(workContents);
  const hoursMatch = /(?:X|×)\s*(\d+(?:\.\d+)?)\s*小時/i.exec(rawText);
  const payMatch = /金額\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?)\s*元/.exec(rawText);
  const entries = [];
  const otherLines = [];
  for (const line of lines) {
    const entry = parseRow(line, context, knownContent);
    if (entry) entries.push(entry);
    else otherLines.push(line);
  }
  const footer = footerSignature(otherLines);

  return {
    planName: metadata(lines, "計畫名稱"),
    planNumber: metadata(lines, "計畫編號"),
    unit: metadata(lines, "執行單位"),
    name: personalValue(rawText, "姓名", ["學系", "學號", "聯絡電話"]),
    department: personalValue(rawText, "學系", ["學號", "聯絡電話"]),
    studentId: personalValue(rawText, "學號", ["校外人士", "聯絡電話"]),
    phone: personalValue(rawText, "聯絡電話", ["編號", "工作日期", "\n"]),
    footerSignatureFound: footer.found,
    footerSignature: footer.value,
    entries,
    claimedTotalHours: hoursMatch ? Number(hoursMatch[1]) : "",
    claimedTotalPay: payMatch ? Number(payMatch[1].replaceAll(",", "")) : "",
    rawText: String(rawText ?? "")
  };
}

async function preprocessImage(image) {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return image;
  try {
    const bitmap = await createImageBitmap(image);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const scale = Math.min(2.5, Math.max(1, 1800 / Math.min(sourceWidth, sourceHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const histogram = new Uint32Array(256);
    for (let index = 0; index < data.length; index += 4) {
      const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      data[index] = gray;
      histogram[gray] += 1;
    }

    const pixels = data.length / 4;
    let low = 0;
    let high = 255;
    let count = 0;
    for (let level = 0; level < 256; level += 1) {
      count += histogram[level];
      if (count >= pixels * 0.02) { low = level; break; }
    }
    count = 0;
    for (let level = 255; level >= 0; level -= 1) {
      count += histogram[level];
      if (count >= pixels * 0.02) { high = level; break; }
    }
    const range = Math.max(1, high - low);
    for (let index = 0; index < data.length; index += 4) {
      const stretched = Math.max(0, Math.min(255, Math.round(((data[index] - low) / range) * 255)));
      data[index] = stretched;
      data[index + 1] = stretched;
      data[index + 2] = stretched;
    }
    context.putImageData(imageData, 0, 0);
    return { canvas, scaleX: canvas.width / sourceWidth, scaleY: canvas.height / sourceHeight };
  } catch {
    return image;
  }
}

export async function recognizeImage(image, onProgress = () => {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_tra", "eng"], 1, {
    logger(message) {
      if (message.status === "recognizing text") onProgress(Math.round((message.progress ?? 0) * 100));
    }
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const prepared = await preprocessImage(image);
    const target = prepared.canvas ?? prepared;
    const scaleX = prepared.scaleX ?? 1;
    const scaleY = prepared.scaleY ?? 1;
    const { data } = await worker.recognize(target, {}, { blocks: true });
    const lines = (data.blocks ?? []).flatMap((block) => (block.paragraphs ?? []))
      .flatMap((paragraph) => paragraph.lines ?? [])
      .map((line) => ({
        text: line.text ?? "",
        bbox: line.bbox
          ? { x0: line.bbox.x0 / scaleX, y0: line.bbox.y0 / scaleY, x1: line.bbox.x1 / scaleX, y1: line.bbox.y1 / scaleY }
          : line.bbox
      }));
    return { text: data.text, confidence: data.confidence ?? 0, lines };
  } finally {
    await worker.terminate();
  }
}
