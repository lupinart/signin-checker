import test from "node:test";
import assert from "node:assert/strict";

import { checkTimesheet } from "../src/rules.js";

const profile = {
  planName: "A82 發展雲端知識體系計畫",
  planNumber: "115609782",
  unit: "數位教育發展處數位課程發展組",
  hourlyRate: 196,
  location: {
    schoolOnly: true,
    requireRoom: true,
    requiredKeywords: ["研究室"],
    forbiddenKeywords: ["家裡", "麥當勞", "星巴克", "咖啡廳"],
    sampleValues: ["圖書館101A"]
  },
  allowedWorkContents: ["課程字幕製作", "課程字幕編輯", "課程字幕校對"],
  blockedDates: ["2026-07-03", "2026-07-10", "2026-07-17", "2026-07-24", "2026-07-30", "2026-07-31"],
  allowedWeekdays: [1, 2, 3, 4, 5],
  earliestStart: "08:00",
  latestEnd: "18:00"
};

function entry(overrides = {}) {
  return {
    id: "1",
    date: "2026-07-01",
    start: "09:00",
    end: "12:00",
    hours: 3,
    pay: 588,
    location: "維澈樓 312 研究室",
    workContent: "課程字幕製作",
    ...overrides
  };
}

function sheet(entries, overrides = {}) {
  return {
    planName: profile.planName,
    planNumber: profile.planNumber,
    unit: profile.unit,
    entries,
    claimedTotalHours: entries.reduce((sum, item) => sum + Number(item.hours || 0), 0),
    claimedTotalPay: entries.reduce((sum, item) => sum + Number(item.pay || 0), 0),
    ...overrides
  };
}

function codes(result) {
  return result.issues.map((issue) => issue.code);
}

test("flags more than eight hours and missing rest across rows on the same day", () => {
  const result = checkTimesheet(sheet([
    entry({ id: "1", date: "2026-07-02", start: "08:00", end: "12:00", hours: 4, pay: 784 }),
    entry({ id: "2", date: "2026-07-02", start: "12:00", end: "17:00", hours: 5, pay: 980 })
  ]), profile);

  assert.ok(codes(result).includes("DAILY_HOURS_EXCEEDED"));
  assert.ok(codes(result).includes("BREAK_REQUIRED"));
});

test("accepts two shifts separated by at least thirty minutes", () => {
  const result = checkTimesheet(sheet([
    entry({ id: "1", start: "09:00", end: "12:00" }),
    entry({ id: "2", start: "13:00", end: "16:00" })
  ]), profile);

  assert.ok(!codes(result).includes("BREAK_REQUIRED"));
  assert.ok(!codes(result).includes("DAILY_HOURS_EXCEEDED"));
});

test("flags overlapping shifts", () => {
  const result = checkTimesheet(sheet([
    entry({ id: "1", start: "09:00", end: "12:00" }),
    entry({ id: "2", start: "11:30", end: "14:00", hours: 2.5, pay: 490 })
  ]), profile);

  assert.ok(codes(result).includes("TIME_OVERLAP"));
});

test("recalculates row hours and pay", () => {
  const result = checkTimesheet(sheet([
    entry({ hours: 2, pay: 500 })
  ], { claimedTotalHours: 2, claimedTotalPay: 500 }), profile);

  assert.ok(codes(result).includes("ROW_HOURS_MISMATCH"));
  assert.ok(codes(result).includes("ROW_PAY_MISMATCH"));
  assert.ok(codes(result).includes("TOTAL_HOURS_MISMATCH"));
  assert.ok(codes(result).includes("TOTAL_PAY_MISMATCH"));
  assert.equal(result.calculated.totalHours, 3);
  assert.equal(result.calculated.totalPay, 588);
});

test("flags blocked dates, weekends and late work", () => {
  const result = checkTimesheet(sheet([
    entry({ id: "1", date: "2026-07-17" }),
    entry({ id: "2", date: "2026-07-12" }),
    entry({ id: "3", date: "2026-07-14", start: "21:00", end: "23:00", hours: 2, pay: 392 })
  ]), profile);

  assert.ok(codes(result).includes("BLOCKED_DATE"));
  assert.ok(codes(result).includes("WEEKDAY_NOT_ALLOWED"));
  assert.ok(codes(result).includes("OUTSIDE_ALLOWED_HOURS"));
});

test("applies the school-only location switch and still asks for confirmation", () => {
  const restricted = checkTimesheet(sheet([
    entry({ location: "家裡" })
  ]), profile);
  assert.ok(codes(restricted).includes("LOCATION_NOT_ALLOWED"));
  assert.ok(codes(restricted).includes("LOCATION_CONFIRM"));

  const unrestricted = checkTimesheet(sheet([
    entry({ location: "家裡" })
  ]), { ...profile, location: { ...profile.location, schoolOnly: false } });
  assert.ok(!codes(unrestricted).includes("LOCATION_NOT_ALLOWED"));
  assert.ok(codes(unrestricted).includes("LOCATION_CONFIRM"));
});

test("requires a specific room and warns when the sample location was copied", () => {
  const vague = checkTimesheet(sheet([
    entry({ location: "中原大學研究室" })
  ]), profile);
  assert.ok(codes(vague).includes("ROOM_REQUIRED"));

  const copied = checkTimesheet(sheet([
    entry({ location: "圖書館101A" })
  ]), profile);
  assert.ok(codes(copied).includes("SAMPLE_LOCATION_COPIED"));
});

test("requires a configured school-location keyword instead of relying only on a denylist", () => {
  const result = checkTimesheet(sheet([
    entry({ location: "桃園火車站 123" })
  ]), profile);

  assert.ok(codes(result).includes("LOCATION_CONTEXT_REQUIRED"));
});

test("checks fixed work content and falls back to confirmation when a project has no fixed list", () => {
  const fixed = checkTimesheet(sheet([
    entry({ workContent: "清潔研究室" })
  ]), profile);
  assert.ok(codes(fixed).includes("WORK_CONTENT_NOT_ALLOWED"));

  const flexible = checkTimesheet(sheet([
    entry({ workContent: "整理訪談逐字稿" })
  ]), { ...profile, allowedWorkContents: [] });
  assert.ok(!codes(flexible).includes("WORK_CONTENT_NOT_ALLOWED"));
  assert.ok(codes(flexible).includes("WORK_CONTENT_CONFIRM"));
});

test("flags incorrect plan metadata", () => {
  const result = checkTimesheet(sheet([entry()], {
    planName: "其他計畫",
    planNumber: "000",
    unit: "其他單位"
  }), profile);

  assert.ok(codes(result).includes("PLAN_NAME_MISMATCH"));
  assert.ok(codes(result).includes("PLAN_NUMBER_MISMATCH"));
  assert.ok(codes(result).includes("UNIT_MISMATCH"));
});

test("flags more than forty hours within an ISO week", () => {
  const entries = [13, 14, 15, 16, 17].map((day, index) => entry({
    id: String(index + 1),
    date: `2026-07-${day}`,
    start: "08:00",
    end: "17:00",
    hours: 8,
    pay: 1568
  }));
  const result = checkTimesheet(sheet(entries), profile);

  assert.ok(codes(result).includes("WEEKLY_HOURS_EXCEEDED"));
});

test("always returns manual declarations that automation cannot verify", () => {
  const result = checkTimesheet(sheet([entry()]), profile);
  const declarationCodes = result.declarations.map((item) => item.code);

  assert.deepEqual(declarationCodes, [
    "ACTUAL_LOCATION_CONFIRMED",
    "ACTUAL_WORK_CONFIRMED",
    "NO_DUPLICATE_CLAIM",
    "SIGNATURES_COMPLETE"
  ]);
});
