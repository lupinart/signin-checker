import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";

import { parseDocx } from "../src/docx.js";

const cell = (value) => value?.raw
  ? `<w:tc><w:p>${value.raw}</w:p></w:tc>`
  : `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
const row = (values) => `<w:tr>${values.map(cell).join("")}</w:tr>`;

function docxFixture({ annotatedPay = false, secondPayValue = "588" } = {}) {
  const secondPay = annotatedPay
    ? { raw: `<w:r><w:drawing><wps:txbx xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:txbxContent><w:p><w:r><w:t>❌ 連續4小時，1天不可超過8小時</w:t></w:r></w:p></w:txbxContent></wps:txbx></w:drawing></w:r><w:r><w:t>588</w:t></w:r>` }
    : secondPayValue;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>一、計畫名稱：A82 發展雲端知識體系計畫</w:t></w:r></w:p>
        <w:p><w:r><w:t>二、執行單位：數位教育發展處數位課程發展組</w:t></w:r></w:p>
        <w:p><w:r><w:t>三、計畫編號：115609782</w:t></w:r></w:p>
        <w:tbl>
          ${row(["編號", "工作日期", "開始", "結束", "時數", "工作酬金", "工作地點", "工作內容", "簽章"])}
          ${row(["1", "7/1", "9:00", "12:00", "3", "588", "維澈樓312研究室", "課程字幕製作", "柯同學"])}
          ${row(["2", "7/1", "13:00", "16:00", "3", secondPay, "維澈樓312研究室", "課程字幕編輯", "柯同學"])}
        </w:tbl>
        <w:p><w:r><w:t>計酬基準196元/時 X 6小時</w:t></w:r></w:p>
        <w:p><w:r><w:t>金額:1176元</w:t></w:r></w:p>
      </w:body>
    </w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml) });
}

test("parses plan metadata, work rows and totals from a DOCX in memory", async () => {
  const result = await parseDocx(docxFixture(), { year: 2026, month: 7 });

  assert.equal(result.planName, "A82 發展雲端知識體系計畫");
  assert.equal(result.planNumber, "115609782");
  assert.equal(result.unit, "數位教育發展處數位課程發展組");
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0], {
    id: "1",
    date: "2026-07-01",
    start: "09:00",
    end: "12:00",
    hours: 3,
    pay: 588,
    location: "維澈樓312研究室",
    workContent: "課程字幕製作"
  });
  assert.equal(result.claimedTotalHours, 6);
  assert.equal(result.claimedTotalPay, 1176);
});

test("ignores instructional text boxes anchored inside table cells", async () => {
  const result = await parseDocx(docxFixture({ annotatedPay: true }), { year: 2026, month: 7 });

  assert.equal(result.entries[1].pay, 588);
});

test("keeps an unfilled pay cell blank for student review", async () => {
  const result = await parseDocx(docxFixture({ secondPayValue: "" }), { year: 2026, month: 7 });

  assert.equal(result.entries[1].pay, "");
});

test("ignores blank numbered rows and rejects files without Word XML", async () => {
  const parsed = await parseDocx(docxFixture(), { year: 2026, month: 7 });
  assert.equal(parsed.entries.length, 2);

  await assert.rejects(
    () => parseDocx(zipSync({ "readme.txt": strToU8("not a docx") }), { year: 2026, month: 7 }),
    /無法讀取 Word 文件內容/
  );
});
