import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const artifactDir = new URL("../artifacts/", import.meta.url);
const fixturePath = fileURLToPath(new URL("ocr-fixture.png", artifactDir));
const chromePath = process.env.QA_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1200, height: 700 }, locale: "zh-TW" });

const fixture = await context.newPage();
await fixture.setContent(`
  <style>body{margin:50px;background:white;color:black;font:30px/1.8 Arial,sans-serif}pre{white-space:pre-wrap}</style>
  <pre>計畫名稱：A82 發展雲端知識體系計畫
計畫編號：115609782
執行單位：數位教育發展處數位課程發展組

1 7/1 09:00 12:00 3 588 維澈樓312研究室 課程字幕製作

X 3小時　金額：588元</pre>
`);
await fixture.screenshot({ path: fixturePath, fullPage: true });
await fixture.close();

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator("#image-input").setInputFiles(fixturePath);
await page.locator("#review-panel").waitFor({ state: "visible", timeout: 120_000 });
assert.match(await page.locator("#file-status").innerText(), /照片辨識完成/);
assert.ok((await page.locator("#ocr-raw").inputValue()).length > 20);
assert.equal(await page.locator("#plan-number").inputValue(), "115609782");
assert.equal(await page.locator('[data-entry-field="workContent"]').inputValue(), "課程字幕製作");
await page.screenshot({ path: fileURLToPath(new URL("checker-ocr-review.png", artifactDir)), fullPage: true });

await browser.close();
console.log("OCR QA passed: image recognized locally and opened for manual confirmation.");
