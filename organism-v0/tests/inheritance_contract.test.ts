import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInheritance } from "../tools/inheritance_check.ts";

test("child contracts add restrictions and cannot grant authority", () => {
  const result = checkInheritance();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.negativeProofs.includes("one-canonical-reducer"));
  assert.ok(result.negativeProofs.includes("one-canonical-journal"));
  assert.ok(result.negativeProofs.includes("one-active-cstar-controller-per-scope"));
  assert.ok(result.negativeProofs.includes("child-restrictions-only"));
  assert.equal(result.negativeProofs.filter((proof) => proof.endsWith(":no-authority-grant")).length, 25);
});

test("Forge is tombstoned in every local contract", () => {
  const result = checkInheritance();
  assert.equal(result.errors.filter((error) => error.includes("forge-tombstone")).length, 0);
  assert.equal(result.errors.filter((error) => error.includes("actionable-contract-text")).length, 0);
});
