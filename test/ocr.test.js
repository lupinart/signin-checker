import test from "node:test";
import assert from "node:assert/strict";

import { parseOcrText } from "../src/ocr.js";

test("turns clean OCR lines into editable timesheet data", () => {
  const text = `
    計畫名稱：A82 發展雲端知識體系計畫
    執行單位：數位教育發展處數位課程發展組
    計畫編號：115609782
    1 7/1 9:00 12:00 3 588 維澈樓312研究室 課程字幕製作
    2 7/1 13:00 16:00 3 588 維澈樓312研究室 課程字幕編輯
    計酬基準 196 元/時 X 6 小時 金額 1176 元
  `;

  const result = parseOcrText(text, { year: 2026, month: 7 });

  assert.equal(result.planName, "A82 發展雲端知識體系計畫");
  assert.equal(result.planNumber, "115609782");
  assert.equal(result.unit, "數位教育發展處數位課程發展組");
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[1].start, "13:00");
  assert.equal(result.entries[1].location, "維澈樓312研究室");
  assert.equal(result.entries[1].workContent, "課程字幕編輯");
  assert.equal(result.claimedTotalHours, 6);
  assert.equal(result.claimedTotalPay, 1176);
});

test("keeps uncertain OCR lines for manual review instead of inventing rows", () => {
  const result = parseOcrText("日期糊掉了 研究室 9點到？", { year: 2026, month: 7 });

  assert.equal(result.entries.length, 0);
  assert.match(result.rawText, /日期糊掉了/);
});

test("tolerates spaces inserted between Chinese characters by OCR", () => {
  const text = `
    計 畫 名 稱：A82 發展雲端知識體系計畫
    執 行 單 位：數位教育發展處數位課程發展組
    計 畫 編 號：115609782
    1 7/1 09:00 12:00 3 588 維 澈 樓 312 研 究 室 課 程 字 幕 製 作
  `;

  const result = parseOcrText(text, { year: 2026, month: 7 });

  assert.equal(result.planNumber, "115609782");
  assert.equal(result.entries[0].location, "維澈樓312研究室");
  assert.equal(result.entries[0].workContent, "課程字幕製作");
});

test("infers a Gregorian date from the ROC year in photographed text", () => {
  const result = parseOcrText(`
    計畫案工讀生及臨時工簽到單（115 年 7 月）
    1 7/1 09:00 12:00 3 588 維澈樓312研究室 課程字幕製作
  `);

  assert.equal(result.entries[0].date, "2026-07-01");
  assert.equal(result.claimedTotalHours, "");
  assert.equal(result.claimedTotalPay, "");
});

test("splits work content using the project rules passed in options", () => {
  const result = parseOcrText("1 7/1 09:00 12:00 3 588 維澈樓312研究室 資料標註整理 柯同學", { year: 2026, month: 7 }, {
    workContents: ["資料標註整理"]
  });

  assert.equal(result.entries[0].location, "維澈樓312研究室");
  assert.equal(result.entries[0].workContent, "資料標註整理");
  assert.equal(result.entries[0].signature, "柯同學");
});

test("finds the footer signature line in photographed text", () => {
  const signed = parseOcrText(`
    1 7/1 09:00 12:00 3 588 維澈樓312研究室 課程字幕製作
    工讀生簽名：柯同學
  `, { year: 2026, month: 7 });
  assert.equal(signed.footerSignatureFound, true);
  assert.equal(signed.footerSignature, "柯同學");

  const missing = parseOcrText("1 7/1 09:00 12:00 3 588 維澈樓312研究室 課程字幕製作", { year: 2026, month: 7 });
  assert.equal(missing.footerSignatureFound, false);
});

test("keeps a blank photographed name blank instead of swallowing the next label", () => {
  const result = parseOcrText("姓名： 學系：企管碩一 學號：114000001", { year: 2026, month: 7 });

  assert.equal(result.name, "");
  assert.equal(result.department, "企管碩一");
});

test("keeps a photographed row when the wage cell is blank", () => {
  const result = parseOcrText("1 7/1 09:00 12:00 3 維澈樓312研究室 課程字幕製作", { year: 2026, month: 7 });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].pay, "");
});
