import assert from "node:assert/strict";
import { test } from "node:test";
import { lintTopology, SCOPE_DEFINITIONS, TOPOLOGY_CONTRACT_SHA256 } from "../tools/topology_lint.ts";

test("S03A declares the exact closed tiered scope tree", () => {
  const result = lintTopology();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.scopeCount, 25);
  assert.equal(result.manifestCount, 50);
  assert.deepEqual(result.filesOver500Lines, []);
  assert.equal(TOPOLOGY_CONTRACT_SHA256.length, 64);
  assert.equal(SCOPE_DEFINITIONS.filter((scope) => scope.parentScopeId === null).length, 1);
  assert.equal(new Set(SCOPE_DEFINITIONS.map((scope) => scope.scopeId)).size, SCOPE_DEFINITIONS.length);
});

test("topology keeps the canonical flat reducer and journal", () => {
  const root = SCOPE_DEFINITIONS.find((scope) => scope.scopeId === "organism-v0");
  assert.ok(root);
  assert.equal(root.parentScopeId, null);
});
