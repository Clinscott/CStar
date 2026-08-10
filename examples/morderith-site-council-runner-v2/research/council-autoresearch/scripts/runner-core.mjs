import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function fail(message) {
  throw new Error(message);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`could not read JSON ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function resolveRepoPath(repoRoot, input, label = "path") {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    fail(`${label} must be a non-empty path`);
  }
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, input);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    fail(`${label} escapes the repository root`);
  }
  return resolved;
}

export function loadContract(repoRoot, contractPath) {
  const file = resolveRepoPath(repoRoot, contractPath, "contract path");
  const contract = readJson(file);
  if (contract.schema_version !== "2.0.0" || contract.runner_version !== "2.0.0") {
    fail("runner v2 requires a schema_version and runner_version of 2.0.0");
  }
  if (!Array.isArray(contract.council_order) || contract.council_order.length !== 19) {
    fail("contract must declare exactly 19 Council protocols");
  }
  if (new Set(contract.council_order).size !== 19) fail("contract Council protocols must be unique");
  if (!Array.isArray(contract.aspects) || contract.aspects.length !== 9) {
    fail("contract must declare exactly nine site aspects");
  }
  if (new Set(contract.aspects.map(({ id }) => id)).size !== 9) {
    fail("contract aspect IDs must be unique");
  }
  assertTokenPath(contract.token_path, "contract.token_path");
  return { contract, file, sha256: sha256File(file) };
}

export function assertTokenPath(value, label = "token_path") {
  if (!value || typeof value !== "object") fail(`${label} is required`);
  const expected = {
    status: "quarantined",
    actionable: false,
    steering_allowed: false,
    observation_writes_allowed: false,
    independent_promotion_required: true,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) fail(`${label}.${key} must be ${JSON.stringify(expectedValue)}`);
  }
}

export function buildChildEnvironment(parentEnvironment, contract, controlRoot) {
  const environment = {};
  for (const key of contract.augury.environment_allowlist) {
    if (typeof parentEnvironment[key] === "string") environment[key] = parentEnvironment[key];
  }
  Object.assign(environment, contract.augury.fixed_environment, {
    CSTAR_CONTROL_ROOT: controlRoot,
  });
  return environment;
}

export class BoundedTextBuffer {
  constructor(limitBytes) {
    if (!Number.isInteger(limitBytes) || limitBytes < 1) fail("buffer limit must be positive");
    this.limitBytes = limitBytes;
    this.buffers = [];
    this.bytes = 0;
    this.truncated = false;
  }

  append(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const remaining = this.limitBytes - this.bytes;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    const accepted = buffer.subarray(0, remaining);
    this.buffers.push(accepted);
    this.bytes += accepted.byteLength;
    if (accepted.byteLength < buffer.byteLength) this.truncated = true;
  }

  text() {
    return Buffer.concat(this.buffers).toString("utf8");
  }

  summary() {
    return { bytes: this.bytes, truncated: this.truncated, text: this.text() };
  }
}

export function deterministicCouncilOrder(councilOrder, seed) {
  if (typeof seed !== "string" || seed.length < 8 || seed.length > 256) {
    fail("seed must contain 8 to 256 characters");
  }
  const order = [...councilOrder];
  let counter = 0;
  for (let index = order.length - 1; index > 0; index -= 1) {
    const digest = createHash("sha256").update(`${seed}\0${counter++}`).digest();
    const swapIndex = digest.readUInt32BE(0) % (index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

export function ratingContextSha256(bindings) {
  for (const field of [
    "baseline_sha256",
    "candidate_sha256",
    "packet_sha256",
    "rubric_sha256",
    "evidence_sha256",
  ]) {
    assertSha256(bindings?.[field], `bindings.${field}`);
  }
  if (bindings.baseline_sha256 === bindings.candidate_sha256) {
    fail("baseline and candidate hashes must differ");
  }
  return sha256(canonicalJson(bindings));
}

export function makeEnvelope({
  phase,
  status,
  contractSha256,
  provenance = {},
  frozenHashes = {},
  evidenceClasses = {},
  diagnostics = { bytes: 0, truncated: false },
  nextAllowedAction,
  data = {},
}) {
  assertSha256(contractSha256, "envelope.contract_sha256");
  return {
    schema_version: "2.0.0",
    runner_version: "2.0.0",
    phase,
    status,
    provenance,
    frozen_hashes: { contract_sha256: contractSha256, ...frozenHashes },
    evidence_classes: evidenceClasses,
    token_path: {
      status: "quarantined",
      actionable: false,
      steering_allowed: false,
      observation_writes_allowed: false,
      independent_promotion_required: true,
    },
    diagnostics,
    next_allowed_action: nextAllowedAction,
    data,
  };
}

export function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function isPassingLegacyGate(value) {
  if (value === "pass") return true;
  if (value && typeof value === "object" && value.status === "pass") return true;
  return false;
}

export function isPassingV2Gate(value) {
  if (!value || typeof value !== "object" || value.status !== "pass") return false;
  assertSha256(value.evidence_sha256, "gate.evidence_sha256");
  return true;
}
