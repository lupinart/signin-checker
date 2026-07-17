import test from "node:test";
import assert from "node:assert/strict";

import { buildAnonymousReport, summarizeIssues } from "../src/report.js";

test("summarizes issue severities", () => {
  assert.deepEqual(summarizeIssues([
    { severity: "error" },
    { severity: "error" },
    { severity: "review" },
    { severity: "tip" }
  ]), { error: 2, review: 1, tip: 1 });
});

test("anonymous report excludes source text and personal fields", () => {
  const report = buildAnonymousReport({
    profile: { planName: "A82 計畫", planNumber: "115609782", version: 3 },
    sheet: {
      name: "柯同學",
      studentId: "11400000",
      phone: "0919000000",
      signature: "柯同學",
      rawText: "OCR 原文含姓名與電話"
    },
    result: {
      issues: [{ code: "BREAK_REQUIRED", severity: "error", message: "需要休息。", entryIds: ["3", "4"] }],
      calculated: { totalHours: 9, totalPay: 1764 },
      declarations: [{ code: "NO_DUPLICATE_CLAIM", label: "沒有重複請領。" }]
    }
  });

  const serialized = JSON.stringify(report);
  assert.match(serialized, /A82 計畫/);
  assert.match(serialized, /BREAK_REQUIRED/);
  assert.doesNotMatch(serialized, /柯同學|11400000|0919000000|OCR 原文/);
});
