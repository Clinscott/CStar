import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCOPE_DEFINITIONS, TOPOLOGY_CONTRACT_SHA256 } from "./topology_lint.ts";

export type InheritanceResult = { ok: boolean; errors: string[]; negativeProofs: string[] };

const forbiddenPositivePatterns: RegExp[] = [
  /(?:automatically|automatic)\s+(?:launch|execute|start|spawn)/i,
  /\b(?:contract|manifest|profile|declaration)\s+(?:may|can|does|will)\s+(?:grant|open|invoke)\s+(?:a\s+)?(?:protected effect|provider|lifecycle acceptance|authority)\b/i,
  /\b(?:direct|local)\s+(?:hall|sqlite|reducer|journal)\s+(?:write|mutation|authority)/i,
  /\bforge\s+(?:execute|action|live|fallback|route)/i,
];

export function checkInheritance(root = resolve(import.meta.dirname, "..")): InheritanceResult {
  const errors: string[] = [];
  const negativeProofs: string[] = [];
  const byScope = new Map(SCOPE_DEFINITIONS.map((scope) => [scope.scopeId, scope]));
  for (const scope of SCOPE_DEFINITIONS) {
    const agentsPath = join(root, scope.agentsPath);
    const rolePath = join(root, scope.rolePath);
    if (!existsSync(agentsPath) || !existsSync(rolePath)) {
      errors.push(`missing-contract:${scope.scopeId}`);
      continue;
    }
    const text = readFileSync(agentsPath, "utf8");
    const role = JSON.parse(readFileSync(rolePath, "utf8")) as Record<string, unknown>;
    const positive = forbiddenPositivePatterns.find((pattern) => pattern.test(text));
    if (positive) errors.push(`actionable-contract-text:${scope.scopeId}:${positive.source}`);
    if (!/(?:grants no|grant no|cannot grant|does not grant|never grant|not authority|no [^\n]*authority)/i.test(text)) errors.push(`authority-negative:${scope.scopeId}`);
    if (!text.includes("automatic cognition") && !text.includes("automatic worker execution") && !text.includes("automatic cognition or automatic worker")) errors.push(`cognition-negative:${scope.scopeId}`);
    if (text.includes("Forge = `TOMBSTONED_PERMANENT`") === false) errors.push(`forge-tombstone:${scope.scopeId}`);
    if (role.contract_sha256 !== TOPOLOGY_CONTRACT_SHA256 || role.local_contract_hash !== TOPOLOGY_CONTRACT_SHA256) errors.push(`hash:${scope.scopeId}`);
    if (role.authority_grant !== false || role.automatic_cognition !== false || role.automatic_worker_execution !== false || role.forge !== "TOMBSTONED_PERMANENT") errors.push(`role-negative:${scope.scopeId}`);
    if (scope.parentScopeId !== null) {
      const parent = byScope.get(scope.parentScopeId);
      if (!parent) errors.push(`unknown-parent:${scope.scopeId}`);
      else {
        const expectedParentPath = parent.relativeDir === "." ? "systems" : parent.relativeDir;
        if (scope.relativeDir !== expectedParentPath && scope.relativeDir.startsWith(`${expectedParentPath}/`) === false) errors.push(`parent-path:${scope.scopeId}`);
        if (role.parent_scope_id !== scope.parentScopeId) errors.push(`parent-binding:${scope.scopeId}`);
        if (role.parent_manifest_hash !== TOPOLOGY_CONTRACT_SHA256) errors.push(`parent-contract-hash:${scope.scopeId}`);
      }
    }
    negativeProofs.push(`${scope.scopeId}:no-authority-grant`);
    negativeProofs.push(`${scope.scopeId}:no-automatic-cognition`);
    negativeProofs.push(`${scope.scopeId}:forge-tombstoned`);
  }
  const rootAgents = readFileSync(join(root, "AGENTS.md"), "utf8");
  if (!rootAgents.includes("one canonical reducer") || !rootAgents.includes("one canonical journal")) errors.push("canonical-singletons-not-stated");
  negativeProofs.push("one-canonical-reducer");
  negativeProofs.push("one-canonical-journal");
  negativeProofs.push("one-active-cstar-controller-per-scope");
  negativeProofs.push("child-restrictions-only");
  return { ok: errors.length === 0, errors, negativeProofs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkInheritance();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
