import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const TOPOLOGY_CONTRACT_SHA256 =
  "a0096f1c49f3012b89c256c30eb6c9e2892a8f7a3ff8b68b2da80538c91fa011";

export type ScopeDefinition = {
  scopeId: string;
  parentScopeId: string | null;
  relativeDir: string;
  rolePath: string;
  profilePath: string;
  agentsPath: string;
  roleId: string;
  profileId: string;
};

const subsystem = (relativeDir: string, parentScopeId: string, scopeId: string, roleId = "subsystem-controller.v1"): ScopeDefinition => ({
  scopeId,
  parentScopeId,
  relativeDir,
  rolePath: `${relativeDir}/role-manifest.v1.json`,
  profilePath: `${relativeDir}/capability-profile.v1.json`,
  agentsPath: `${relativeDir}/AGENTS.md`,
  roleId,
  profileId: roleId,
});

export const SCOPE_DEFINITIONS: ScopeDefinition[] = [
  { scopeId: "organism-v0", parentScopeId: null, relativeDir: ".", rolePath: "manifest/organism-role-manifest.v1.json", profilePath: "manifest/capability-profile-registry.v1.json", agentsPath: "AGENTS.md", roleId: "organism-supervisor.v1", profileId: "organism-supervisor.v1" },
  subsystem("systems/control-plane", "organism-v0", "systems/control-plane", "system-controller.v1"),
  subsystem("systems/control-plane/subsystems/intent", "systems/control-plane", "systems/control-plane/subsystems/intent"),
  subsystem("systems/control-plane/subsystems/reducer-journal", "systems/control-plane", "systems/control-plane/subsystems/reducer-journal"),
  subsystem("systems/control-plane/subsystems/effects-outbox-inbox", "systems/control-plane", "systems/control-plane/subsystems/effects-outbox-inbox"),
  subsystem("systems/control-plane/subsystems/transport", "systems/control-plane", "systems/control-plane/subsystems/transport"),
  subsystem("systems/nervous-system", "organism-v0", "systems/nervous-system", "system-controller.v1"),
  subsystem("systems/nervous-system/subsystems/senses-researcher", "systems/nervous-system", "systems/nervous-system/subsystems/senses-researcher"),
  subsystem("systems/nervous-system/subsystems/relay-and-attention", "systems/nervous-system", "systems/nervous-system/subsystems/relay-and-attention"),
  subsystem("systems/memory-and-evidence", "organism-v0", "systems/memory-and-evidence", "system-controller.v1"),
  subsystem("systems/memory-and-evidence/subsystems/hall-projection", "systems/memory-and-evidence", "systems/memory-and-evidence/subsystems/hall-projection"),
  subsystem("systems/memory-and-evidence/subsystems/working-memory", "systems/memory-and-evidence", "systems/memory-and-evidence/subsystems/working-memory"),
  subsystem("systems/memory-and-evidence/subsystems/evidence-quarantine", "systems/memory-and-evidence", "systems/memory-and-evidence/subsystems/evidence-quarantine"),
  subsystem("systems/memory-and-evidence/subsystems/consolidation", "systems/memory-and-evidence", "systems/memory-and-evidence/subsystems/consolidation"),
  subsystem("systems/immune-and-validation", "organism-v0", "systems/immune-and-validation", "system-controller.v1"),
  subsystem("systems/immune-and-validation/subsystems/fresh-eyes", "systems/immune-and-validation", "systems/immune-and-validation/subsystems/fresh-eyes", "validator.v1"),
  subsystem("systems/immune-and-validation/subsystems/corvus-eye", "systems/immune-and-validation", "systems/immune-and-validation/subsystems/corvus-eye", "validator.v1"),
  subsystem("systems/immune-and-validation/subsystems/security-gates", "systems/immune-and-validation", "systems/immune-and-validation/subsystems/security-gates"),
  subsystem("systems/motor-action", "organism-v0", "systems/motor-action", "system-controller.v1"),
  subsystem("systems/motor-action/subsystems/action-control", "systems/motor-action", "systems/motor-action/subsystems/action-control"),
  subsystem("systems/motor-action/subsystems/native-work-cells", "systems/motor-action", "systems/motor-action/subsystems/native-work-cells"),
  subsystem("systems/motor-action/subsystems/project-controllers", "systems/motor-action", "systems/motor-action/subsystems/project-controllers"),
  subsystem("systems/spokes", "organism-v0", "systems/spokes", "system-controller.v1"),
  subsystem("systems/spokes/enm", "systems/spokes", "systems/spokes/enm", "spoke-adapter.v1"),
  subsystem("systems/spokes/aerathea", "systems/spokes", "systems/spokes/aerathea", "spoke-adapter.v1"),
];

type JsonRecord = Record<string, unknown>;

const loadJson = (path: string): JsonRecord => JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
const hash = (value: unknown): boolean => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export type TopologyLintResult = {
  ok: boolean;
  errors: string[];
  scopeCount: number;
  manifestCount: number;
  filesOver500Lines: string[];
};

export function lintTopology(root = resolve(import.meta.dirname, "..")): TopologyLintResult {
  const errors: string[] = [];
  let manifestCount = 0;
  for (const scope of SCOPE_DEFINITIONS) {
    const rolePath = join(root, scope.rolePath);
    const profilePath = join(root, scope.profilePath);
    const agentsPath = join(root, scope.agentsPath);
    for (const path of [rolePath, profilePath, agentsPath]) {
      if (!existsSync(path)) errors.push(`missing:${path}`);
    }
    if (!existsSync(rolePath) || !existsSync(profilePath) || !existsSync(agentsPath)) continue;
    const role = loadJson(rolePath);
    const profile = loadJson(profilePath);
    manifestCount += 2;
    if (role.schema !== "corvus.organism.role_manifest.v1") errors.push(`role-schema:${scope.scopeId}`);
    if (role.contract !== "corvus.organism.tiered_topology.v1") errors.push(`role-contract:${scope.scopeId}`);
    if (role.scope_id !== scope.scopeId) errors.push(`role-scope:${scope.scopeId}`);
    if (role.parent_scope_id !== scope.parentScopeId) errors.push(`role-parent:${scope.scopeId}`);
    if (role.role_id !== scope.roleId) errors.push(`role-id:${scope.scopeId}`);
    if (role.controller_identity !== "cstar" || role.controller_generation_source !== "cstar-durable-state") errors.push(`controller:${scope.scopeId}`);
    if (role.succession_rule !== "atomic_revoke_identify_bind_append") errors.push(`succession:${scope.scopeId}`);
    if (!Array.isArray(role.health_signal_ids) || role.health_signal_ids.length !== 10) errors.push(`health:${scope.scopeId}`);
    if (!hash(role.contract_sha256) || role.contract_sha256 !== TOPOLOGY_CONTRACT_SHA256 || !hash(role.local_contract_hash) || role.local_contract_hash !== TOPOLOGY_CONTRACT_SHA256) errors.push(`role-hash:${scope.scopeId}`);
    if (role.authority_grant !== false || role.automatic_cognition !== false || role.automatic_worker_execution !== false || role.forge !== "TOMBSTONED_PERMANENT" || role.closed !== true || !hash(role.manifest_sha256)) errors.push(`role-closure:${scope.scopeId}`);
    if (scope.parentScopeId === null ? role.parent_manifest_hash !== null : role.parent_manifest_hash !== TOPOLOGY_CONTRACT_SHA256) errors.push(`parent-hash:${scope.scopeId}`);
    if (profile.schema === "corvus.organism.capability_profile_registry.v1") {
      const profiles = profile.profiles;
      if (!Array.isArray(profiles) || !profiles.some((item) => (item as JsonRecord).profile_id === scope.profileId)) errors.push(`profile-registry:${scope.scopeId}`);
    } else {
      if (profile.schema !== "corvus.organism.capability_profile.v1") errors.push(`profile-schema:${scope.scopeId}`);
      if (profile.scope_id !== scope.scopeId || profile.profile_id !== scope.profileId || profile.role_id !== scope.roleId) errors.push(`profile-binding:${scope.scopeId}`);
      if (!hash(profile.contract_sha256) || profile.contract_sha256 !== TOPOLOGY_CONTRACT_SHA256 || profile.authority_grant !== false || profile.automatic_launch !== false || profile.descendants !== 0 || profile.closed !== true || !hash(profile.profile_sha256)) errors.push(`profile-closure:${scope.scopeId}`);
    }
    const agents = readFileSync(agentsPath, "utf8");
    for (const required of ["Scope", "Controller", "contract", "Forge", "subordinate", "health", "succession"]) {
      if (!agents.toLowerCase().includes(required.toLowerCase())) errors.push(`agents-${required}:${scope.scopeId}`);
    }
  }
  const filesOver500Lines: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const lines = readFileSync(path, "utf8").split("\n").length - (readFileSync(path, "utf8").endsWith("\n") ? 1 : 0);
        if (lines > 500) filesOver500Lines.push(path);
      }
    }
  };
  walk(root);
  if (filesOver500Lines.length) errors.push(`line-limit:${filesOver500Lines.join(",")}`);
  return { ok: errors.length === 0, errors, scopeCount: SCOPE_DEFINITIONS.length, manifestCount, filesOver500Lines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = lintTopology();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
