import { canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
import { validateClosedObject } from "./schemas.js";

export const SET_SCHEMA = "corvus.set_record.v1" as const;
export const WORK_PACKET_SCHEMA = "corvus.work_packet.v1" as const;
export const SET_TERMINAL_SCHEMA = "corvus.terminal_packet.v1" as const;

export interface SetRecordInput {
  readonly set_id: string;
  readonly plan_id: string;
  readonly intent_envelope_sha256: string;
  readonly decision_id: string;
  readonly bead_id: string;
  readonly controller_generation: string;
  readonly scope: string;
  readonly work_packet_hashes: readonly string[];
  readonly capability_profile_hash: string;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly lease: unknown;
  readonly ceilings: unknown;
  readonly retry_budget: number;
  readonly terminal_schema: string;
  readonly validation_requirements: unknown;
  readonly protected_gates: readonly string[];
}

export interface SetRecord extends SetRecordInput {
  readonly schema: typeof SET_SCHEMA;
  readonly set_sha256: string;
}

export interface WorkManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface WorkPacketInput {
  readonly packet_id: string;
  readonly set_id: string;
  readonly cell_id: string;
  readonly controller_generation: string;
  readonly scope: string;
  readonly action: string;
  readonly input_manifest: readonly WorkManifestEntry[];
  readonly input_manifest_sha256?: string;
  readonly write_allowlist: readonly string[];
  readonly output_allowlist: readonly string[];
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity?: string;
  readonly lease: unknown;
  readonly ceilings: unknown;
  readonly retry_budget: number;
  readonly terminal_schema: string;
  readonly tests: readonly string[];
  readonly protected_gates: readonly string[];
  readonly transfer_checkpoint_ref: string;
}

export interface WorkPacket extends Omit<WorkPacketInput, "input_manifest_sha256"> {
  readonly schema: typeof WORK_PACKET_SCHEMA;
  readonly actual_identity: string;
  readonly input_manifest_sha256: string;
  readonly packet_sha256: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class WorkPacketError extends Error {
  readonly code: "INVALID_SET" | "INVALID_PACKET";
  readonly issues: readonly ValidationIssue[];

  constructor(code: WorkPacketError["code"], message: string, issues: readonly ValidationIssue[] = []) {
    super(message);
    this.name = "WorkPacketError";
    this.code = code;
    this.issues = issues;
  }
}

const SHA256 = /^[0-9a-f]{64}$/u;
const SET_KEYS = [
  "schema", "set_id", "plan_id", "intent_envelope_sha256", "decision_id", "bead_id",
  "controller_generation", "scope", "work_packet_hashes", "capability_profile_hash",
  "requested_model", "requested_reasoning", "lease", "ceilings", "retry_budget",
  "terminal_schema", "validation_requirements", "protected_gates", "set_sha256",
] as const;
const PACKET_KEYS = [
  "schema", "packet_id", "set_id", "cell_id", "controller_generation", "scope", "action",
  "input_manifest", "input_manifest_sha256", "write_allowlist", "output_allowlist",
  "requested_model", "requested_reasoning", "actual_identity", "lease", "ceilings", "retry_budget",
  "terminal_schema", "tests", "protected_gates", "transfer_checkpoint_ref", "packet_sha256",
] as const;
const MANIFEST_KEYS = ["path", "sha256"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function strings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(string);
}

function packageRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    && segments.join("/") === value;
}

export function validatePackagePathList(value: unknown, allowEmpty = true): value is readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(packageRelativePath)) return false;
  return new Set(value).size === value.length;
}

function canonical(value: unknown, label: string): string {
  try {
    return canonicalSha256(value);
  } catch (error) {
    throw new WorkPacketError("INVALID_PACKET", `${label} is not canonical JSON`, [{
      path: label,
      message: error instanceof Error ? error.message : String(error),
    }]);
  }
}

function validManifest(value: unknown): value is readonly WorkManifestEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => {
    return record(entry) && exactKeys(entry, MANIFEST_KEYS)
      && packageRelativePath(entry.path) && hash(entry.sha256);
  }) && validatePackagePathList(value.map((entry) => (entry as Record<string, unknown>).path), false);
}

function validSetShape(value: unknown, requireHash: boolean): value is SetRecord {
  if (!record(value)) return false;
  const keys = requireHash ? SET_KEYS : SET_KEYS.filter((key) => key !== "set_sha256");
  return exactKeys(value, keys)
    && value.schema === SET_SCHEMA
    && string(value.set_id) && string(value.plan_id)
    && hash(value.intent_envelope_sha256) && string(value.decision_id) && string(value.bead_id)
    && string(value.controller_generation) && string(value.scope)
    && Array.isArray(value.work_packet_hashes) && value.work_packet_hashes.length > 0
    && value.work_packet_hashes.every(hash) && hash(value.capability_profile_hash)
    && string(value.requested_model) && string(value.requested_reasoning)
    && Number.isSafeInteger(value.retry_budget) && value.retry_budget === 0
    && string(value.terminal_schema) && strings(value.protected_gates)
    && (!requireHash || hash(value.set_sha256));
}

function validateSetCanonical(value: SetRecord): void {
  canonical(value.lease, "lease");
  canonical(value.ceilings, "ceilings");
  canonical(value.validation_requirements, "validation_requirements");
}

export function createSetRecord(input: SetRecordInput): SetRecord {
  if (!record(input) || !exactKeys(input, SET_KEYS.filter((key) => key !== "schema" && key !== "set_sha256"))) {
    throw new WorkPacketError("INVALID_SET", "SET input is not closed");
  }
  const base = { schema: SET_SCHEMA, ...input };
  if (!validSetShape(base, false)) throw new WorkPacketError("INVALID_SET", "SET fields are invalid");
  validateSetCanonical(base as SetRecord);
  return withSelfHash(base, "set_sha256") as SetRecord;
}

export const makeSetRecord = createSetRecord;
export const bindSetRecord = createSetRecord;

export function verifySetRecord(value: unknown): value is SetRecord {
  if (!validSetShape(value, true)) return false;
  try {
    return hashOmittingField(value, "set_sha256") === value.set_sha256
      && (validateSetCanonical(value), true);
  } catch {
    return false;
  }
}

export function assertSetRecord(value: unknown): asserts value is SetRecord {
  const result = validateClosedObject(value, SET_SCHEMA);
  if (!result.valid || !verifySetRecord(value)) {
    throw new WorkPacketError("INVALID_SET", "SET record is not verified", result.issues);
  }
}

function validPacketShape(value: unknown, requireHash: boolean): value is WorkPacket {
  if (!record(value)) return false;
  const keys = requireHash ? PACKET_KEYS : PACKET_KEYS.filter((key) => key !== "packet_sha256");
  return exactKeys(value, keys)
    && value.schema === WORK_PACKET_SCHEMA
    && string(value.packet_id) && string(value.set_id) && string(value.cell_id)
    && string(value.controller_generation) && string(value.scope) && string(value.action)
    && validManifest(value.input_manifest) && hash(value.input_manifest_sha256)
    && validatePackagePathList(value.write_allowlist) && validatePackagePathList(value.output_allowlist)
    && string(value.requested_model) && string(value.requested_reasoning)
    && string(value.actual_identity) && Number.isSafeInteger(value.retry_budget)
    && value.retry_budget === 0 && value.terminal_schema === SET_TERMINAL_SCHEMA
    && strings(value.tests) && value.tests.length > 0 && strings(value.protected_gates)
    && string(value.transfer_checkpoint_ref)
    && (!requireHash || hash(value.packet_sha256));
}

export function createWorkPacket(input: WorkPacketInput): WorkPacket {
  if (!record(input) || Object.keys(input).some((key) => !PACKET_KEYS.includes(key as never)
    || key === "schema" || key === "packet_sha256")) {
    throw new WorkPacketError("INVALID_PACKET", "Work packet contains an unknown or forbidden field");
  }
  const inputHash = canonical(input.input_manifest);
  if (input.input_manifest_sha256 !== undefined && input.input_manifest_sha256 !== inputHash) {
    throw new WorkPacketError("INVALID_PACKET", "input_manifest_sha256 does not bind current-cell bytes");
  }
  const base = {
    schema: WORK_PACKET_SCHEMA,
    ...input,
    actual_identity: input.actual_identity ?? "unreported",
    input_manifest_sha256: inputHash,
  };
  if (!validPacketShape(base, false)) throw new WorkPacketError("INVALID_PACKET", "Work packet fields are invalid");
  canonical(base.lease, "lease");
  canonical(base.ceilings, "ceilings");
  return withSelfHash(base, "packet_sha256") as WorkPacket;
}

export const makeWorkPacket = createWorkPacket;
export const bindWorkPacket = createWorkPacket;
export const buildWorkPacket = createWorkPacket;

export function verifyWorkPacket(value: unknown): value is WorkPacket {
  if (!validPacketShape(value, true)) return false;
  try {
    return hashOmittingField(value, "packet_sha256") === value.packet_sha256
      && canonical(value.lease, "lease") !== ""
      && canonical(value.ceilings, "ceilings") !== "";
  } catch {
    return false;
  }
}

export function assertWorkPacket(value: unknown): asserts value is WorkPacket {
  const result = validateClosedObject(value, WORK_PACKET_SCHEMA);
  if (!result.valid || !verifyWorkPacket(value)) {
    throw new WorkPacketError("INVALID_PACKET", "Work packet is not a verified closed packet", result.issues);
  }
}

export const validateWorkPacket = verifyWorkPacket;
export const validateSetRecord = verifySetRecord;
export const workPacketSha256 = (packet: WorkPacket): string => {
  assertWorkPacket(packet);
  return packet.packet_sha256;
};
