import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shows a prominent manual-review warning before and after automated checking", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const warnings = html.match(/人工檢查不可省略/g) ?? [];

  assert.ok(warnings.length >= 2);
  assert.match(html, /僅供提醒參考/);
  assert.match(html, /不能把「未報錯」視為文件正確/);
});

test("keeps the student page focused on a primary upload action", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /admin\.html|管理規則/);
  assert.doesNotMatch(html, /empty-panel|文件會在這裡展開/);
  assert.match(html, /<h2[^>]*>上傳簽到單<\/h2>/);
  assert.ok(html.indexOf('id="upload-zone"') < html.indexOf('id="review-panel"'));
});
