import test from "node:test";
import assert from "node:assert/strict";
import { buildAnnotations } from "../src/annotations.js";

const sheet = {
  planName: "測試計畫",
  planNumber: "115000001",
  unit: "測試單位",
  entries: [
    { id: "1", date: "2026-07-01", start: "09:00", end: "18:30", hours: 9.5, pay: 1862, location: "家裡", workContent: "資料整理" }
  ],
  claimedTotalHours: 9.5,
  claimedTotalPay: 1862
};

test("numbers grouped issues and maps them to document fields", () => {
  const annotations = buildAnnotations([
    { code: "DAILY_HOURS_EXCEEDED", severity: "error", message: "超過每日 8 小時。", entryIds: ["1"], field: "hours" },
    { code: "LOCATION_NOT_ALLOWED", severity: "error", message: "工作地點不在校內。", entryIds: ["1"], field: "location" }
  ], sheet);

  assert.deepEqual(annotations.map(({ number, field, entryIds }) => ({ number, field, entryIds })), [
    { number: 1, field: "hours", entryIds: ["1"] },
    { number: 2, field: "location", entryIds: ["1"] }
  ]);
  assert.equal(annotations[0].searchTexts[0], "9.5");
  assert.equal(annotations[1].searchTexts[0], "家裡");
});

test("maps metadata and totals without an entry id", () => {
  const annotations = buildAnnotations([
    { code: "PLAN_NUMBER_MISMATCH", severity: "error", message: "計畫編號不符。", field: "planNumber" },
    { code: "TOTAL_PAY_MISMATCH", severity: "error", message: "合計金額錯誤。", field: "totalPay" }
  ], sheet);

  assert.deepEqual(annotations[0].searchTexts, ["115000001"]);
  assert.deepEqual(annotations[1].searchTexts, ["1862"]);
});
