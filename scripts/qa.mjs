import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
let exampleDocx = process.env.QA_DOCX_PATH;
let expectedRows = Number(process.env.QA_EXPECTED_ROWS || 0);
const chromePath = process.env.QA_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const artifactDir = new URL("../artifacts/", import.meta.url);
const artifactPath = (name) => fileURLToPath(new URL(name, artifactDir));
const ocrFixture = new URL("ocr-fixture.png", artifactDir);
await mkdir(artifactDir, { recursive: true });

if (!exampleDocx) {
  const cell = (value) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
  const row = (values) => `<w:tr>${values.map(cell).join("")}</w:tr>`;
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:r><w:t>一、計畫名稱：A82 發展雲端知識體系計畫</w:t></w:r></w:p>
    <w:p><w:r><w:t>二、執行單位：數位教育發展處數位課程發展組</w:t></w:r></w:p>
    <w:p><w:r><w:t>三、計畫編號：115609782</w:t></w:r></w:p><w:tbl>
    ${row(["編號", "工作日期", "開始", "結束", "時數", "工作酬金", "工作地點", "工作內容", "簽章"])}
    ${row(["1", "7/1", "09:00", "12:00", "3", "588", "維澈樓312研究室", "課程字幕製作", ""])}
    ${row(["2", "7/2", "13:00", "16:00", "3", "588", "家裡", "課程字幕編輯", ""])}
    </w:tbl><w:p><w:r><w:t>X 6小時 金額:1176元</w:t></w:r></w:p></w:body></w:document>`;
  exampleDocx = artifactPath("qa-fixture.docx");
  expectedRows = 2;
  await writeFile(exampleDocx, zipSync({ "word/document.xml": strToU8(xml) }));
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-TW" });
const ocrFixturePage = await context.newPage();
await ocrFixturePage.setContent(`
  <style>body{margin:50px;background:white;color:black;font:30px/1.8 Arial,sans-serif}pre{white-space:pre-wrap}</style>
  <pre>計畫名稱：A82 發展雲端知識體系計畫
計畫編號：115609782
執行單位：數位教育發展處數位課程發展組

1 7/1 09:00 12:00 3 588 維澈樓312研究室 課程字幕製作

X 3小時　金額：588元</pre>
`);
await ocrFixturePage.screenshot({ path: fileURLToPath(ocrFixture), fullPage: true });
await ocrFixturePage.close();

const page = await context.newPage();
const consoleErrors = [];
const failedResources = [];
const outgoingWrites = [];
function monitor(target) {
  target.on("console", (message) => {
    const knownTesseractWarning = message.text().startsWith("Warning: Parameter not found:")
      && message.location().url.includes("tesseract-core");
    if (message.type() === "error" && !knownTesseractWarning) {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  target.on("response", (response) => {
    if (response.status() >= 400) failedResources.push({ status: response.status(), url: response.url() });
  });
  target.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) outgoingWrites.push({ method: request.method(), url: request.url() });
  });
}
monitor(page);

await page.goto(baseUrl, { waitUntil: "networkidle" });
assert.match(await page.locator("body").innerText(), /文件、照片與辨識文字不會離開這台裝置/);
await page.screenshot({ path: artifactPath("checker-desktop.png"), fullPage: true });

await page.locator("#docx-input").setInputFiles(exampleDocx);
await page.locator("#results-panel").waitFor({ state: "visible" });
const rows = Math.max(0, await page.locator("#annotated-document tr").count() - 1);
if (expectedRows) assert.equal(rows, expectedRows);
else assert.ok(rows > 0);
assert.match(await page.locator("#results-status").innerText(), /檢查完成/);
assert.equal(await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
  .filter((element) => element.offsetParent !== null && !(element.labels?.length) && !element.getAttribute("aria-label")).length), 0);
assert.ok(await page.locator(".issue").count() > 0);
assert.ok(await page.locator("[data-annotation-number]").count() > 0);
assert.equal(await page.locator(".issue").count(), await page.locator(".issue__number").count());
await page.screenshot({ path: artifactPath("checker-results.png"), fullPage: true });

const ocrPage = await context.newPage();
monitor(ocrPage);
await ocrPage.goto(baseUrl, { waitUntil: "networkidle" });
await ocrPage.locator("#image-input").setInputFiles(fileURLToPath(ocrFixture));
await ocrPage.locator("#review-panel").waitFor({ state: "visible", timeout: 120_000 });
await ocrPage.screenshot({ path: artifactPath("checker-ocr-review.png"), fullPage: true });
await ocrPage.locator("#run-check").click();
await ocrPage.locator("#results-panel").waitFor({ state: "visible" });
assert.match(await ocrPage.locator("#results-status").innerText(), /檢查完成/);
assert.equal(await ocrPage.locator("#ocr-raw").count(), 0);
assert.ok(await ocrPage.locator(".photo-frame img").count() > 0);
assert.ok(await ocrPage.locator(".image-annotation").count() > 0);
assert.ok(await ocrPage.locator(".issue").count() > 0);
await ocrPage.screenshot({ path: artifactPath("checker-ocr-results.png"), fullPage: true });
await ocrPage.close();

await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
await page.locator("#admin-layout").waitFor({ state: "visible" });
assert.match(await page.locator("#storage-mode").innerText(), /本機規則/);
await page.locator("#school-only").uncheck();
await page.locator("#save-profile").click();
await page.locator("#save-status").waitFor({ state: "visible" });
assert.match(await page.locator("#save-status").innerText(), /已儲存/);
assert.equal(await page.locator("#school-only").isChecked(), false);
await page.screenshot({ path: artifactPath("admin-desktop.png"), fullPage: true });

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator("#docx-input").setInputFiles(exampleDocx);
await page.locator("#results-panel").waitFor({ state: "visible" });
assert.equal(await page.getByText("工作地點包含「家裡」，本計畫要求在校內工作。").count(), 0);

const layouts = [];
for (const width of [320, 375, 414, 768, 1024, 1440, 1920]) {
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width, height: 900 });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  const dimensions = await mobile.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  layouts.push({ width, ...dimensions });
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, `horizontal overflow at ${width}px`);
  await mobile.screenshot({ path: artifactPath(`checker-${width}.png`), fullPage: true });
  if (width <= 768) {
    await mobile.locator("#docx-input").setInputFiles(exampleDocx);
    await mobile.locator("#results-panel").waitFor({ state: "visible" });
    const resultDimensions = await mobile.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(resultDimensions.scrollWidth <= resultDimensions.clientWidth, `result horizontal overflow at ${width}px`);
    await mobile.screenshot({ path: artifactPath(`checker-results-${width}.png`), fullPage: true });
    await mobile.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const adminDimensions = await mobile.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(adminDimensions.scrollWidth <= adminDimensions.clientWidth, `admin horizontal overflow at ${width}px`);
    if (width === 320) await mobile.screenshot({ path: artifactPath("admin-320.png"), fullPage: true });
  }
  await mobile.close();
}

await browser.close();
await writeFile(new URL("qa-report.json", artifactDir), JSON.stringify({ rows, layouts, consoleErrors, failedResources, outgoingWrites }, null, 2));
if (failedResources.length) console.error(failedResources);
assert.deepEqual(consoleErrors, []);
assert.deepEqual(outgoingWrites, []);
console.log(`QA passed: Word ${rows} rows, local photo OCR, ${layouts.length} mobile widths, no console errors.`);
