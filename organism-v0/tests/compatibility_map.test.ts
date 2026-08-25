import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCompatibility } from "../tools/compatibility_check.ts";

test("the 19 accepted S00-S03 bytes remain exact flat compatibility", () => {
  const result = checkCompatibility();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.rows, 19);
  assert.equal(result.pathMoves, 0);
  assert.equal(result.byteDonations, 0);
  assert.equal(result.duplicateReducerWriters, 0);
  assert.equal(result.duplicateJournalWriters, 0);
});
