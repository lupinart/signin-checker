import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFILES, findProfile, validateProfile } from "../src/profiles.js";

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
