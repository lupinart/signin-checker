import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFILES, findProfile, normalizeDateText, validateProfile } from "../src/profiles.js";

test("finds a project by number before falling back to its name", () => {
  const byNumber = findProfile(DEFAULT_PROFILES, { planNumber: "115609782", planName: "辨識錯誤" });
  assert.equal(byNumber.planName, "A82 發展雲端知識體系計畫");

  const byName = findProfile(DEFAULT_PROFILES, { planNumber: "", planName: "A82 發展雲端知識體系計畫" });
  assert.equal(byName.planNumber, "115609782");
});

test("validates required admin fields and nested location rules", () => {
  assert.deepEqual(validateProfile(DEFAULT_PROFILES[0]), []);
  const errors = validateProfile({
    planName: "",
    planNumber: "",
    unit: "",
    hourlyRate: 0,
    location: { schoolOnly: true, requireRoom: true }
  });

  assert.ok(errors.includes("計畫名稱未填寫。"));
  assert.ok(errors.includes("計畫編號未填寫。"));
  assert.ok(errors.includes("執行單位未填寫。"));
  assert.ok(errors.includes("時薪必須大於 0。"));
});

test("normalizes common blocked-date formats and rejects unreadable ones", () => {
  assert.equal(normalizeDateText("2026-07-17"), "2026-07-17");
  assert.equal(normalizeDateText("2026/7/17"), "2026-07-17");
  assert.equal(normalizeDateText("2026.7.17"), "2026-07-17");
  assert.equal(normalizeDateText("2026年7月17日"), "2026-07-17");
  assert.equal(normalizeDateText("7/17"), null);
  assert.equal(normalizeDateText("2026-13-01"), null);
});

test("rejects unreadable blocked dates and reversed working hours", () => {
  const errors = validateProfile({
    ...DEFAULT_PROFILES[0],
    blockedDates: ["7/17"],
    earliestStart: "18:00",
    latestEnd: "08:00"
  });

  assert.ok(errors.some((error) => error.includes("休假日期「7/17」")));
  assert.ok(errors.includes("最晚結束時間必須晚於最早開始時間。"));
});
