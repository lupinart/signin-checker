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
