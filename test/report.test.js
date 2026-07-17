import test from "node:test";
import assert from "node:assert/strict";

import { summarizeIssues } from "../src/report.js";

test("summarizes issue severities", () => {
  assert.deepEqual(summarizeIssues([
    { severity: "error" },
    { severity: "error" },
    { severity: "review" },
    { severity: "tip" }
  ]), { error: 2, review: 1, tip: 1 });
});
