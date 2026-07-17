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

function parseRow(line, context) {
  const head = /^(\d{1,2})\s+(\d{1,2}\s*[\/.-]\s*\d{1,2})\s+(\d{1,2}\s*[:：]\s*\d{2})\s+(\d{1,2}\s*[:：]\s*\d{2})\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*)\s+(.+)$/.exec(line);
  if (!head) return null;

  const remainder = clean(head[7]);
  const compactRemainder = remainder.replaceAll(/\s+/g, "");
  const knownContent = /(課程字幕(?:製作|編輯|校對))$/.exec(compactRemainder);
  let location = remainder;
  let workContent = "";
  if (knownContent) {
    workContent = knownContent[1];
    location = compactRemainder.slice(0, knownContent.index);
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
    pay: Number(head[6].replaceAll(",", "")),
    location,
    workContent
  };
}

export function parseOcrText(rawText, context) {
  const lines = String(rawText ?? "").split(/\r?\n/).map(clean).filter(Boolean);
  const hoursMatch = /(?:X|×)\s*(\d+(?:\.\d+)?)\s*小時/i.exec(rawText);
  const payMatch = /金額\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?)\s*元/.exec(rawText);
  const entries = lines.map((line) => parseRow(line, context)).filter(Boolean);

  return {
    planName: metadata(lines, "計畫名稱"),
    planNumber: metadata(lines, "計畫編號"),
    unit: metadata(lines, "執行單位"),
    entries,
    claimedTotalHours: hoursMatch ? Number(hoursMatch[1]) : entries.reduce((sum, item) => sum + item.hours, 0),
    claimedTotalPay: payMatch ? Number(payMatch[1].replaceAll(",", "")) : entries.reduce((sum, item) => sum + item.pay, 0),
    rawText: String(rawText ?? "")
  };
}

export async function recognizeImage(image, onProgress = () => {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_tra", "eng"], 1, {
    logger(message) {
      if (message.status === "recognizing text") onProgress(Math.round((message.progress ?? 0) * 100));
    }
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}
