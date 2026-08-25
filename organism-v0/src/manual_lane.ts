import { canonicalJson, canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
import { verifyIntentEnvelope, type IntentEnvelope, type RootAuthorityGrant } from "./intent.js";
import { validateClosedObject } from "./schemas.js";
import { assertSetRecord, type SetRecord } from "./work_packets.js";

export const MANUAL_RECEIPT_SCHEMA = "corvus.manual_emergency_receipt.v1" as const;
export const MANUAL_LANE_STATE_SCHEMA = "corvus.manual_lane_state.v1" as const;
export const MANUAL_TERMINAL_SCHEMA = "corvus.manual_terminal.v1" as const;
export const MANUAL_FIXTURE_EFFECT_KIND = "MANUAL_EMERGENCY_FIXTURE" as const;
export const MANUAL_EMERGENCY_EFFECT_KIND = MANUAL_FIXTURE_EFFECT_KIND;
export const MANUAL_FIXTURE_ID = "fixture:manual-emergency" as const;
export type ManualCommand = "EXECUTE" | "CANCELLED" | "REVOKED";
export type ManualTerminalStatus = "DELIVERED_UNVERIFIED" | "CANCELLED" | "REVOKED";
type JsonRecord = Record<string, unknown>;

export interface ManualFixtureEffect {
  readonly effect_id: string; readonly effect_kind: typeof MANUAL_FIXTURE_EFFECT_KIND;
  readonly fixture_id: string; readonly payload: unknown; readonly write_allowlist: readonly string[];
  readonly scope?: string; readonly set_id?: string; readonly controller_generation?: string;
}
export interface ManualLaneRequest {
  readonly lane_id: string; readonly operator_grant: RootAuthorityGrant; readonly intent: IntentEnvelope;
  readonly set: SetRecord; readonly scope: string; readonly controller_generation: string;
  readonly write_allowlist: readonly string[]; readonly effects?: readonly ManualFixtureEffect[];
  readonly effect?: ManualFixtureEffect; readonly measured_start: unknown; readonly measured_end: unknown;
  readonly ack?: unknown; readonly command?: ManualCommand; readonly state?: ManualLaneState;
  readonly requested_model?: string; readonly requested_reasoning?: string; readonly actual_identity?: string;
  readonly retry_budget?: number; readonly protected_effects?: readonly string[];
  readonly protected_gates?: readonly string[]; readonly automatic_continuation?: boolean;
  readonly automatic_fallback?: boolean; readonly automatic_escalation?: boolean;
}
export interface ManualLaneMetrics {
  readonly effects: number; readonly terminals: number; readonly retries: number; readonly descendants: number;
  readonly calls: number; readonly waits: number; readonly model_calls: number; readonly provider_calls: number;
  readonly tool_calls: number; readonly token_usage: "unavailable";
  readonly overshoot: "unavailable" | "BUDGET_OVERSHOOT";
}
export interface ManualTerminalEvent {
  readonly schema: typeof MANUAL_TERMINAL_SCHEMA; readonly lane_id: string; readonly set_id: string;
  readonly scope: string; readonly controller_generation: string; readonly effect_id: string;
  readonly effect_kind: typeof MANUAL_FIXTURE_EFFECT_KIND; readonly status: ManualTerminalStatus;
  readonly terminal_number: number; readonly fenced: true;
}
export interface ManualLaneState {
  readonly schema: typeof MANUAL_LANE_STATE_SCHEMA; readonly lane_id: string; readonly set_id: string;
  readonly scope: string; readonly controller_generation: string;
  readonly fence: "OPEN" | "TERMINAL" | "CANCELLED" | "REVOKED";
  readonly terminal_count: number; readonly effect_count: number; readonly terminal_sha256: string | null;
}
export interface ManualEmergencyReceipt {
  readonly schema: typeof MANUAL_RECEIPT_SCHEMA; readonly lane_id: string;
  readonly operator_grant: RootAuthorityGrant; readonly intent_sha256: string; readonly set_id: string;
  readonly scope: string; readonly effect_id: string; readonly effect_kind: typeof MANUAL_FIXTURE_EFFECT_KIND;
  readonly write_allowlist: readonly string[]; readonly measured_start: unknown; readonly measured_end: unknown;
  readonly ack: unknown; readonly terminal_sha256: string; readonly protected_gates: readonly string[];
  readonly result: unknown; readonly receipt_sha256: string;
}
export interface ManualLaneOutcome {
  readonly receipt: ManualEmergencyReceipt; readonly receipt_bytes: string; readonly receipt_utf8: string;
  readonly receipt_sha256: string; readonly terminal: ManualTerminalEvent | null; readonly terminal_sha256: string;
  readonly state: ManualLaneState; readonly metrics: ManualLaneMetrics; readonly effect_count: number;
  readonly terminal_count: number; readonly replayed: boolean;
}
export type ManualLaneErrorCode = "INVALID_REQUEST" | "AUTHORITY_REQUIRED" | "SCOPE_MISMATCH" | "SET_MISMATCH"
  | "INTENT_MISMATCH" | "EFFECT_COUNT" | "ALLOWLIST_MISMATCH" | "PROTECTED_EFFECT" | "RETRY_BUDGET"
  | "AUTOMATIC_CONTINUATION" | "STALE_GENERATION" | "TERMINAL_FENCE" | "DUPLICATE_CONFLICT" | "INVALID_RECEIPT";
export class ManualLaneError extends Error {
  readonly code: ManualLaneErrorCode;
  constructor(code: ManualLaneErrorCode, message: string) { super(message); this.name = "ManualLaneError"; this.code = code; }
}

const SHA256 = /^[0-9a-f]{64}$/u;
const GRANT_KEYS = ["grant_type", "grant_id", "scope"] as const;
const EFFECT_KEYS = ["effect_id", "effect_kind", "fixture_id", "payload", "write_allowlist", "scope", "set_id",
  "controller_generation", "protected_effects", "protected_gates", "retry_budget"] as const;
const REQUEST_KEYS = new Set([
  "lane_id", "operator_grant", "intent", "set", "set_id", "scope", "controller_generation", "write_allowlist",
  "effects", "effect", "effect_id", "effect_kind", "fixture_id", "payload", "measured_start", "measured_end",
  "ack", "command", "operation", "control", "state", "lane_state", "requested_model", "requested_reasoning",
  "actual_identity", "retry_budget", "retries", "attempt", "descendants", "calls", "waits", "model_calls",
  "provider_calls", "tool_calls", "protected_effects", "requested_protected_effects", "protected_gates",
  "automatic_continuation", "automatic_fallback", "automatic_escalation", "fallback", "provider_fallback",
  "escalation", "promotion", "replay", "replacement",
]);
const STATE_KEYS = ["schema", "lane_id", "set_id", "scope", "controller_generation", "fence", "terminal_count",
  "effect_count", "terminal_sha256"] as const;
function record(value: unknown): value is JsonRecord { return isPlainJsonObject(value); }
function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function fail(code: ManualLaneErrorCode, message: string): never { throw new ManualLaneError(code, message); }
function canonical(value: unknown, label: string): string {
  try { return canonicalSha256(value); } catch (error) {
    return fail("INVALID_REQUEST", `${label} is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function sameJson(left: unknown, right: unknown): boolean {
  try { return canonicalSha256(left) === canonicalSha256(right); } catch { return false; }
}
function rejectForbidden(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(rejectForbidden); return; }
  if (!record(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower === "authority" || lower.includes("operator_grant") || lower.endsWith("_authority")
      || lower.startsWith("lifecycle") || lower === "controller" || lower === "terminal"
      || lower === "terminal_packet" || lower === "acceptance" || lower === "validation_result"
      || lower === "effect_id" || lower === "idempotency_key") fail("INVALID_REQUEST", `Forbidden payload field ${key}`);
    rejectForbidden(child);
  }
}
function assertGrant(value: unknown): asserts value is RootAuthorityGrant {
  if (!record(value) || !exactKeys(value, GRANT_KEYS) || value.grant_type !== "ROOT_AUTHORITY"
    || !nonEmptyString(value.grant_id) || !nonEmptyString(value.scope)) fail("AUTHORITY_REQUIRED", "Typed ROOT_AUTHORITY grant required");
}
function assertAllowlist(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => {
    if (typeof entry !== "string" || entry.length === 0 || entry.includes("\\") || entry.includes("\0")) return false;
    if (entry.startsWith("/") || /^[A-Za-z]:/u.test(entry)) return false;
    return entry.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }) || new Set(value).size !== value.length) fail("ALLOWLIST_MISMATCH", "Write allowlist is invalid");
}
function commandFrom(value: unknown): ManualCommand {
  if (value === undefined) return "EXECUTE";
  if (typeof value !== "string") fail("INVALID_REQUEST", "Manual command must be a string");
  const command = value.toUpperCase();
  if (["EXECUTE", "RUN", "DELIVER"].includes(command)) return "EXECUTE";
  if (["CANCEL", "CANCELLED"].includes(command)) return "CANCELLED";
  if (["REVOKE", "REVOKED"].includes(command)) return "REVOKED";
  fail("INVALID_REQUEST", `Unsupported manual command ${value}`);
}
function commandAliases(request: JsonRecord): ManualCommand {
  const values = ["command", "operation", "control"].filter((key) => key in request).map((key) => commandFrom(request[key]));
  if (values.length === 0) return "EXECUTE";
  if (values.some((value) => value !== values[0])) fail("INVALID_REQUEST", "Manual command aliases conflict");
  return values[0];
}
function assertNoProtectedEffects(request: JsonRecord, intent: IntentEnvelope, effect: JsonRecord): void {
  const values: unknown[] = [intent.requested_protected_effects, request.protected_effects, request.requested_protected_effects,
    request.protected_gates, effect.protected_effects, effect.protected_gates];
  if (values.some((value) => value !== undefined && (!Array.isArray(value) || value.length > 0))) {
    fail("PROTECTED_EFFECT", "Protected effects are closed in the manual lane");
  }
}
function assertZero(value: unknown, label: string): void { if (value !== undefined && value !== 0) fail("RETRY_BUDGET", `${label} must be zero`); }
function assertFalse(value: unknown, label: string): void { if (value !== undefined && value !== false) fail("AUTOMATIC_CONTINUATION", `${label} must be false`); }
function deriveFixtureEffectId(input: { lane_id: string; set_id: string; scope: string; fixture_id: string; payload: unknown; write_allowlist: readonly string[] }): string {
  return `manual-effect:${canonicalSha256({ schema: "corvus.manual_fixture_effect.v1", ...input, effect_kind: MANUAL_FIXTURE_EFFECT_KIND })}`;
}
function normalizeEffect(request: JsonRecord, effects: readonly unknown[], laneId: string, set: SetRecord, scope: string,
  generation: string, allowlist: readonly string[]): JsonRecord {
  if (effects.length !== 1) fail("EFFECT_COUNT", "Manual lane requires exactly one fixture effect");
  const value = effects[0];
  if (!record(value) || !Object.keys(value).every((key) => EFFECT_KEYS.includes(key as never))) fail("INVALID_REQUEST", "Fixture effect is not closed");
  const effect = value as JsonRecord;
  if (effect.protected_effects !== undefined || effect.protected_gates !== undefined) {
    assertNoProtectedEffects(request, request.intent as IntentEnvelope, effect);
  }
  const kind = effect.effect_kind ?? request.effect_kind ?? MANUAL_FIXTURE_EFFECT_KIND;
  if (kind !== MANUAL_FIXTURE_EFFECT_KIND) fail("INVALID_REQUEST", "Effect kind is not the manual fixture kind");
  const fixtureId = effect.fixture_id ?? request.fixture_id ?? MANUAL_FIXTURE_ID;
  if (!nonEmptyString(fixtureId)) fail("INVALID_REQUEST", "Fixture ID is required");
  const payload = effect.payload ?? request.payload ?? {};
  canonical(payload, "fixture payload"); rejectForbidden(payload);
  const effectAllowlist = effect.write_allowlist ?? allowlist;
  assertAllowlist(effectAllowlist);
  if (!sameJson(effectAllowlist, allowlist)) fail("ALLOWLIST_MISMATCH", "Effect allowlist does not match request");
  if (effect.scope !== undefined && effect.scope !== scope) fail("SCOPE_MISMATCH", "Effect scope mismatch");
  if (effect.set_id !== undefined && effect.set_id !== set.set_id) fail("SET_MISMATCH", "Effect SET mismatch");
  if (effect.controller_generation !== undefined && effect.controller_generation !== generation) fail("STALE_GENERATION", "Effect generation stale");
  assertZero(effect.retry_budget, "Effect retry budget");
  const effectId = effect.effect_id ?? request.effect_id ?? deriveFixtureEffectId({ lane_id: laneId, set_id: set.set_id,
    scope, fixture_id: fixtureId, payload, write_allowlist: effectAllowlist });
  if (!nonEmptyString(effectId)) fail("INVALID_REQUEST", "Fixture effect ID is required");
  return { effect_id: effectId, effect_kind: MANUAL_FIXTURE_EFFECT_KIND, fixture_id: fixtureId, payload,
    write_allowlist: [...effectAllowlist], scope, set_id: set.set_id, controller_generation: generation };
}
function initialState(laneId: string, setId: string, scope: string, generation: string): ManualLaneState {
  return { schema: MANUAL_LANE_STATE_SCHEMA, lane_id: laneId, set_id: setId, scope, controller_generation: generation,
    fence: "OPEN", terminal_count: 0, effect_count: 0, terminal_sha256: null };
}
function parseState(value: unknown, laneId: string, setId: string, scope: string, generation: string): ManualLaneState {
  if (value === undefined) return initialState(laneId, setId, scope, generation);
  if (!record(value) || !exactKeys(value, STATE_KEYS) || value.schema !== MANUAL_LANE_STATE_SCHEMA
    || !nonEmptyString(value.lane_id) || !nonEmptyString(value.set_id) || !nonEmptyString(value.scope)
    || !nonEmptyString(value.controller_generation) || !["OPEN", "TERMINAL", "CANCELLED", "REVOKED"].includes(String(value.fence))
    || !Number.isSafeInteger(value.terminal_count) || value.terminal_count < 0 || !Number.isSafeInteger(value.effect_count)
    || value.effect_count < 0 || (value.terminal_sha256 !== null && !hash(value.terminal_sha256))) fail("INVALID_REQUEST", "State malformed");
  if (value.lane_id !== laneId || value.set_id !== setId || value.scope !== scope) fail("SCOPE_MISMATCH", "State scope mismatch");
  if (value.controller_generation !== generation) fail("STALE_GENERATION", "State generation stale");
  if (value.fence === "OPEN" && (value.terminal_count !== 0 || value.terminal_sha256 !== null)) fail("INVALID_REQUEST", "Open state has terminal");
  if (value.fence !== "OPEN" && (value.terminal_count < 1 || value.terminal_sha256 === null)) fail("INVALID_REQUEST", "Fenced state lacks terminal");
  return value as ManualLaneState;
}
function makeMetrics(effects: number, terminals: number): ManualLaneMetrics {
  return { effects, terminals, retries: 0, descendants: 0, calls: 0, waits: 0, model_calls: 0, provider_calls: 0,
    tool_calls: 0, token_usage: "unavailable", overshoot: "unavailable" };
}
function normalizeAck(value: unknown, command: ManualCommand, effectId: string): unknown {
  const expected = command === "EXECUTE" ? "ACK" : command, ack = value === undefined ? expected : value;
  canonical(ack, "ack");
  if (typeof ack === "string") { if (ack !== expected) fail("INVALID_REQUEST", `ACK must be ${expected}`); return ack; }
  if (!record(ack) || (ack.status ?? ack.transport_status) !== expected) fail("INVALID_REQUEST", "ACK status mismatch");
  if (ack.effect_id !== undefined && ack.effect_id !== effectId) fail("SET_MISMATCH", "ACK effect mismatch");
  return ack;
}
function makeTerminal(input: { lane_id: string; set_id: string; scope: string; controller_generation: string; effect_id: string; status: ManualTerminalStatus; terminal_number: number }): ManualTerminalEvent {
  return { schema: MANUAL_TERMINAL_SCHEMA, lane_id: input.lane_id, set_id: input.set_id, scope: input.scope,
    controller_generation: input.controller_generation, effect_id: input.effect_id, effect_kind: MANUAL_FIXTURE_EFFECT_KIND,
    status: input.status, terminal_number: input.terminal_number, fenced: true };
}
function validateReceiptShape(value: unknown): value is ManualEmergencyReceipt {
  if (!validateClosedObject(value, MANUAL_RECEIPT_SCHEMA).valid || !record(value)) return false;
  if (!nonEmptyString(value.lane_id) || !hash(value.intent_sha256) || !nonEmptyString(value.set_id) || !nonEmptyString(value.scope)
    || !nonEmptyString(value.effect_id) || value.effect_kind !== MANUAL_FIXTURE_EFFECT_KIND || !Array.isArray(value.write_allowlist)
    || !value.write_allowlist.every((entry) => typeof entry === "string") || !hash(value.terminal_sha256)
    || !Array.isArray(value.protected_gates) || !value.protected_gates.every((entry) => typeof entry === "string") || !hash(value.receipt_sha256)) return false;
  try { assertGrant(value.operator_grant); canonical(value.measured_start, "receipt start"); canonical(value.measured_end, "receipt end");
    canonical(value.ack, "receipt ack"); canonical(value.result, "receipt result");
    return hashOmittingField(value, "receipt_sha256") === value.receipt_sha256;
  } catch { return false; }
}
export function verifyManualEmergencyReceipt(value: unknown): value is ManualEmergencyReceipt { return validateReceiptShape(value); }
export const verifyManualReceipt = verifyManualEmergencyReceipt;
export function assertManualEmergencyReceipt(value: unknown): asserts value is ManualEmergencyReceipt {
  if (!verifyManualEmergencyReceipt(value)) fail("INVALID_RECEIPT", "Receipt is not verified");
}
export function manualEmergencyReceiptSha256(value: unknown): string { assertManualEmergencyReceipt(value); return value.receipt_sha256; }
function assertRequestClosed(request: JsonRecord): void { for (const key of Object.keys(request)) if (!REQUEST_KEYS.has(key)) fail("INVALID_REQUEST", `Unknown request field ${key}`); }
function assertCommon(request: JsonRecord, intent: IntentEnvelope, set: SetRecord, scope: string, generation: string): void {
  const result = verifyIntentEnvelope(intent);
  if (!result.valid || intent.parse_outcome !== "ACCEPTED") fail("AUTHORITY_REQUIRED", "Intent is not verified and accepted");
  const grant = request.operator_grant; assertGrant(grant);
  if (grant.scope !== scope || !intent.requested_scope_hints.includes(scope)) fail("SCOPE_MISMATCH", "Grant scope mismatch");
  if (!intent.operator_grant_refs.some((candidate) => sameJson(candidate, grant))) fail("AUTHORITY_REQUIRED", "Grant is not in intent");
  try { assertSetRecord(set); } catch { fail("SET_MISMATCH", "SET is not verified"); }
  if (set.scope !== scope) fail("SCOPE_MISMATCH", "SET scope mismatch");
  if (set.controller_generation !== generation) fail("STALE_GENERATION", "SET generation stale");
  if (set.intent_envelope_sha256 !== intent.envelope_sha256) fail("INTENT_MISMATCH", "SET intent hash mismatch");
  if (request.set_id !== undefined && request.set_id !== set.set_id) fail("SET_MISMATCH", "SET ID mismatch");
  if (request.requested_model !== undefined && request.requested_model !== set.requested_model) fail("INTENT_MISMATCH", "Model mismatch");
  if (request.requested_reasoning !== undefined && request.requested_reasoning !== set.requested_reasoning) fail("INTENT_MISMATCH", "Reasoning mismatch");
  if (request.actual_identity !== undefined && !nonEmptyString(request.actual_identity)) fail("INVALID_REQUEST", "Actual identity malformed");
  assertAllowlist(request.write_allowlist); assertNoProtectedEffects(request, intent, record(request.effect) ? request.effect : {});
  if (set.retry_budget !== 0) fail("RETRY_BUDGET", "SET retry budget is not zero");
  for (const key of ["retry_budget", "retries", "descendants", "calls", "waits", "model_calls", "provider_calls", "tool_calls"]) assertZero(request[key], key);
  if (request.attempt !== undefined && request.attempt !== 1) fail("RETRY_BUDGET", "Attempt is not one");
  for (const key of ["automatic_continuation", "automatic_fallback", "automatic_escalation", "fallback", "provider_fallback", "escalation", "promotion", "replay", "replacement"]) assertFalse(request[key], key);
}

/** Run one pure, no-I/O, no-transport, no-model, no-provider manual fixture lane. */
export function runManualEmergencyLane(input: unknown): ManualLaneOutcome {
  if (!record(input)) fail("INVALID_REQUEST", "Request must be a plain object");
  assertRequestClosed(input);
  const request = input, command = commandAliases(request), laneId = request.lane_id, scope = request.scope, generation = request.controller_generation;
  if (!nonEmptyString(laneId) || !nonEmptyString(scope) || !nonEmptyString(generation)) fail("INVALID_REQUEST", "Lane identity is required");
  if (!("measured_start" in request) || !("measured_end" in request)) fail("INVALID_REQUEST", "Measured bounds are required");
  canonical(request.measured_start, "measured_start"); canonical(request.measured_end, "measured_end");
  if (!record(request.intent)) fail("AUTHORITY_REQUIRED", "Intent is required");
  const intent = request.intent as IntentEnvelope, set = request.set;
  assertCommon(request, intent, set as SetRecord, scope, generation);
  const effects: readonly unknown[] = request.effects !== undefined
    ? (Array.isArray(request.effects) ? request.effects : fail("EFFECT_COUNT", "Effects must be an array"))
    : request.effect !== undefined ? [request.effect]
      : [{ effect_id: request.effect_id, effect_kind: request.effect_kind, fixture_id: request.fixture_id, payload: request.payload }];
  if (request.effects !== undefined && request.effect !== undefined) fail("EFFECT_COUNT", "Both effect forms supplied");
  const effect = normalizeEffect(request, effects, laneId, set as SetRecord, scope, generation, request.write_allowlist as readonly string[]);
  const prior = parseState(request.state ?? request.lane_state, laneId, (set as SetRecord).set_id, scope, generation);
  if (command === "EXECUTE" && prior.fence !== "OPEN") fail("TERMINAL_FENCE", "Manual lane is fenced");
  if (command !== "EXECUTE" && prior.fence !== "OPEN" && prior.fence !== command) fail("DUPLICATE_CONFLICT", "Different terminal already fences lane");
  const effectId = String(effect.effect_id), duplicate = command !== "EXECUTE" && prior.fence === command;
  const terminal = duplicate ? null : makeTerminal({ lane_id: laneId, set_id: (set as SetRecord).set_id, scope, controller_generation: generation,
    effect_id: effectId, status: command === "EXECUTE" ? "DELIVERED_UNVERIFIED" : command, terminal_number: prior.terminal_count + 1 });
  const terminalSha256 = duplicate ? (prior.terminal_sha256 as string) : canonicalSha256(terminal);
  const effectCount = duplicate ? 0 : command === "EXECUTE" ? 1 : 0, terminalCount = duplicate ? 0 : 1;
  const nextState: ManualLaneState = duplicate ? prior : { ...prior, fence: command === "EXECUTE" ? "TERMINAL" : command,
    terminal_count: prior.terminal_count + 1, effect_count: prior.effect_count + effectCount, terminal_sha256: terminalSha256 };
  const metrics = makeMetrics(effectCount, terminalCount), ack = normalizeAck(request.ack, command, effectId);
  const result = { schema: "corvus.manual_emergency_result.v1", status: command === "EXECUTE" ? "DELIVERED_UNVERIFIED" : command,
    effect_count: effectCount, terminal_count: terminalCount, terminal, metrics,
    requested_model: request.requested_model ?? (set as SetRecord).requested_model,
    requested_reasoning: request.requested_reasoning ?? (set as SetRecord).requested_reasoning,
    actual_identity: request.actual_identity ?? "unreported", replayed: duplicate };
  const base = { schema: MANUAL_RECEIPT_SCHEMA, lane_id: laneId,
    operator_grant: { grant_type: (request.operator_grant as RootAuthorityGrant).grant_type, grant_id: (request.operator_grant as RootAuthorityGrant).grant_id, scope: (request.operator_grant as RootAuthorityGrant).scope },
    intent_sha256: intent.envelope_sha256, set_id: (set as SetRecord).set_id, scope, effect_id: effectId,
    effect_kind: MANUAL_FIXTURE_EFFECT_KIND, write_allowlist: [...(request.write_allowlist as readonly string[])], measured_start: request.measured_start,
    measured_end: request.measured_end, ack, terminal_sha256: terminalSha256, protected_gates: [], result };
  const receipt = withSelfHash(base, "receipt_sha256") as ManualEmergencyReceipt; assertManualEmergencyReceipt(receipt);
  const bytes = canonicalJson(receipt);
  return { receipt, receipt_bytes: bytes, receipt_utf8: bytes, receipt_sha256: receipt.receipt_sha256, terminal,
    terminal_sha256: terminalSha256, state: nextState, metrics, effect_count: effectCount, terminal_count: terminalCount, replayed: duplicate };
}
export const executeManualEmergency = runManualEmergencyLane;
export const runManualLane = runManualEmergencyLane;
export const manualEmergencyLane = runManualEmergencyLane;

function transition(state: unknown, command: "CANCELLED" | "REVOKED", generation?: string): ManualLaneState {
  if (!record(state) || !exactKeys(state, STATE_KEYS)) fail("INVALID_REQUEST", "State malformed");
  const parsed = parseState(state, String(state.lane_id), String(state.set_id), String(state.scope), String(state.controller_generation));
  if (generation !== undefined && generation !== parsed.controller_generation) fail("STALE_GENERATION", "State generation stale");
  if (parsed.fence === command) return parsed;
  if (parsed.fence !== "OPEN") fail("TERMINAL_FENCE", "Lane already fenced");
  const terminal = makeTerminal({ lane_id: parsed.lane_id, set_id: parsed.set_id, scope: parsed.scope,
    controller_generation: parsed.controller_generation, effect_id: "manual-effect:unbound", status: command, terminal_number: parsed.terminal_count + 1 });
  return { ...parsed, fence: command, terminal_count: parsed.terminal_count + 1, terminal_sha256: canonicalSha256(terminal) };
}
function transitionOpenState(state: unknown, generation?: string): ManualLaneState {
  if (!record(state) || !exactKeys(state, STATE_KEYS)) fail("INVALID_REQUEST", "State malformed");
  const parsed = parseState(state, String(state.lane_id), String(state.set_id), String(state.scope), String(state.controller_generation));
  if (generation !== undefined && generation !== parsed.controller_generation) fail("STALE_GENERATION", "State generation stale");
  if (parsed.fence !== "OPEN") fail("TERMINAL_FENCE", "Continuation is fenced");
  return parsed;
}
export function cancelManualLane(state: ManualLaneState, generation?: string): ManualLaneState { return transition(state, "CANCELLED", generation); }
export function revokeManualLane(state: ManualLaneState, generation?: string): ManualLaneState { return transition(state, "REVOKED", generation); }
export function continueManualLane(state: ManualLaneState, generation?: string): ManualLaneState { return transitionOpenState(state, generation); }
export const cancel = cancelManualLane;
export const revoke = revokeManualLane;
export const continueLane = continueManualLane;
