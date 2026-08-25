import { canonicalSha256, isPlainJsonObject } from "./canonical.js";

export const REDUCER_VERSION = "corvus.organism.reducer.v0" as const;
export const STATE_SCHEMA = "corvus.organism.state.v0" as const;
export const EVENT_SCHEMA = "corvus.organism.event.v0" as const;

export type LifecycleState =
  | "INITIAL"
  | "INTENT_RECEIVED"
  | "INTENT_VERIFIED"
  | "NEEDS_OPERATOR_INPUT"
  | "PLAN_DERIVED"
  | "SET_BOUND"
  | "EFFECT_RESERVED"
  | "EFFECT_ACKED"
  | "EFFECT_FAILED"
  | "EFFECT_UNKNOWN"
  | "WORK_DISPATCHED"
  | "TERMINAL_RECORDED"
  | "INDEPENDENT_VALIDATED"
  | "RESULT_RECORDED"
  | "TRANSFER_CHECKPOINTED"
  | "RECOVERY_REQUIRED"
  | "RECOVERY_SET_BOUND"
  | "REJECTED"
  | "UNKNOWN"
  | "CANCELLED"
  | "REVOKED"
  | "CLOSED_BY_OPERATOR"
  | "CLOSED";

export type TerminalFence = "OPEN" | "TERMINAL" | "CANCELLED" | "REVOKED" | "CIRCUIT_BREAKER";

export interface OrganismState {
  readonly schema: typeof STATE_SCHEMA;
  readonly revision: number;
  readonly scope: string;
  readonly controller_generation: string;
  readonly lifecycle_state: LifecycleState;
  readonly terminal_fence: TerminalFence;
  readonly circuit_breaker_open: boolean;
  readonly seen_idempotency: Readonly<Record<string, string>>;
  readonly task_started_generations: readonly string[];
  readonly task_completed_generations: readonly string[];
}

export type ReducerEventType =
  | "INTENT_RECEIVED"
  | "INTENT_VERIFIED"
  | "NEEDS_OPERATOR_INPUT"
  | "PLAN_DERIVED"
  | "SET_BOUND"
  | "EFFECT_RESERVED"
  | "EFFECT_ACKED"
  | "EFFECT_FAILED"
  | "EFFECT_UNKNOWN"
  | "WORK_DISPATCHED"
  | "TERMINAL_RECORDED"
  | "INDEPENDENT_VALIDATED"
  | "RESULT_RECORDED"
  | "TRANSFER_CHECKPOINTED"
  | "RECOVERY_REQUIRED"
  | "RECOVERY_SET_BOUND"
  | "REJECTED"
  | "UNKNOWN"
  | "CANCELLED"
  | "REVOKED"
  | "CONTROLLER_REVOKED"
  | "CLOSED_BY_OPERATOR"
  | "CLOSED"
  | "TASK_STARTED"
  | "TASK_COMPLETE";

export interface ReducerEvent {
  readonly schema: typeof EVENT_SCHEMA;
  readonly event_type: ReducerEventType;
  readonly scope: string;
  readonly controller_generation: string;
  readonly expected_revision: number;
  readonly idempotency_key: string;
  readonly payload: unknown;
  readonly protected_gates: readonly string[];
}

export interface ReducerEventInput {
  readonly event_type: ReducerEventType;
  readonly scope: string;
  readonly controller_generation: string;
  readonly expected_revision: number;
  readonly idempotency_key?: string;
  readonly payload?: unknown;
  readonly protected_gates?: readonly string[];
}

export interface ReductionResult {
  readonly state: OrganismState;
  readonly event_sha256: string;
  readonly replayed: boolean;
}

export type ReducerErrorCode =
  | "INVALID_STATE"
  | "INVALID_EVENT"
  | "STALE_REVISION"
  | "SKIPPED_REVISION"
  | "OUT_OF_ORDER"
  | "CROSS_SCOPE"
  | "STALE_GENERATION"
  | "REVOKED_GENERATION"
  | "IDEMPOTENCY_CONFLICT"
  | "PROTECTED_EFFECT"
  | "TERMINAL_FENCE"
  | "CIRCUIT_BREAKER_OPEN";

export class ReducerError extends Error {
  readonly code: ReducerErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ReducerErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ReducerError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const EVENT_KEYS = [
  "schema",
  "event_type",
  "scope",
  "controller_generation",
  "expected_revision",
  "idempotency_key",
  "payload",
  "protected_gates",
];

const EVENT_TYPES = new Set<ReducerEventType>([
  "INTENT_RECEIVED",
  "INTENT_VERIFIED",
  "NEEDS_OPERATOR_INPUT",
  "PLAN_DERIVED",
  "SET_BOUND",
  "EFFECT_RESERVED",
  "EFFECT_ACKED",
  "EFFECT_FAILED",
  "EFFECT_UNKNOWN",
  "WORK_DISPATCHED",
  "TERMINAL_RECORDED",
  "INDEPENDENT_VALIDATED",
  "RESULT_RECORDED",
  "TRANSFER_CHECKPOINTED",
  "RECOVERY_REQUIRED",
  "RECOVERY_SET_BOUND",
  "REJECTED",
  "UNKNOWN",
  "CANCELLED",
  "REVOKED",
  "CONTROLLER_REVOKED",
  "CLOSED_BY_OPERATOR",
  "CLOSED",
  "TASK_STARTED",
  "TASK_COMPLETE",
]);

const TRANSITIONS: Readonly<Record<LifecycleState, readonly ReducerEventType[]>> = {
  INITIAL: ["INTENT_RECEIVED"],
  INTENT_RECEIVED: ["INTENT_VERIFIED", "NEEDS_OPERATOR_INPUT", "REJECTED"],
  INTENT_VERIFIED: ["PLAN_DERIVED", "REJECTED"],
  NEEDS_OPERATOR_INPUT: ["INTENT_RECEIVED", "REJECTED"],
  PLAN_DERIVED: ["SET_BOUND", "REJECTED"],
  SET_BOUND: ["EFFECT_RESERVED", "REJECTED"],
  EFFECT_RESERVED: ["EFFECT_ACKED", "EFFECT_FAILED", "EFFECT_UNKNOWN", "REJECTED"],
  EFFECT_ACKED: ["WORK_DISPATCHED", "TERMINAL_RECORDED", "REJECTED"],
  EFFECT_FAILED: ["RECOVERY_REQUIRED", "REJECTED"],
  EFFECT_UNKNOWN: ["RECOVERY_REQUIRED", "REJECTED"],
  WORK_DISPATCHED: ["TERMINAL_RECORDED", "EFFECT_UNKNOWN", "UNKNOWN", "REJECTED"],
  TERMINAL_RECORDED: ["INDEPENDENT_VALIDATED", "REJECTED", "UNKNOWN"],
  INDEPENDENT_VALIDATED: ["RESULT_RECORDED", "REJECTED", "UNKNOWN"],
  RESULT_RECORDED: ["TRANSFER_CHECKPOINTED", "REJECTED"],
  TRANSFER_CHECKPOINTED: ["CLOSED", "REJECTED"],
  RECOVERY_REQUIRED: ["RECOVERY_SET_BOUND", "CLOSED_BY_OPERATOR", "REJECTED"],
  RECOVERY_SET_BOUND: ["EFFECT_RESERVED", "REJECTED"],
  REJECTED: [],
  UNKNOWN: [],
  CANCELLED: [],
  REVOKED: [],
  CLOSED_BY_OPERATOR: [],
  CLOSED: [],
};

const TERMINAL_STATES = new Set<LifecycleState>([
  "REJECTED",
  "UNKNOWN",
  "CANCELLED",
  "REVOKED",
  "CLOSED_BY_OPERATOR",
  "CLOSED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function cloneState(state: OrganismState): OrganismState {
  return {
    ...state,
    seen_idempotency: { ...state.seen_idempotency },
    task_started_generations: [...state.task_started_generations],
    task_completed_generations: [...state.task_completed_generations],
  };
}

function validateState(state: unknown): asserts state is OrganismState {
  if (!isRecord(state)
    || state.schema !== STATE_SCHEMA
    || !Number.isSafeInteger(state.revision)
    || state.revision < 0
    || !nonEmptyString(state.scope)
    || !nonEmptyString(state.controller_generation)
    || typeof state.lifecycle_state !== "string"
    || !Object.prototype.hasOwnProperty.call(TRANSITIONS, state.lifecycle_state)
    || !["OPEN", "TERMINAL", "CANCELLED", "REVOKED", "CIRCUIT_BREAKER"].includes(String(state.terminal_fence))
    || typeof state.circuit_breaker_open !== "boolean"
    || !isRecord(state.seen_idempotency)
    || !Array.isArray(state.task_started_generations)
    || !Array.isArray(state.task_completed_generations)
    || !state.task_started_generations.every(nonEmptyString)
    || !state.task_completed_generations.every(nonEmptyString)) {
    throw new ReducerError("INVALID_STATE", "Reducer state is malformed");
  }
}

function validateEvent(event: unknown): asserts event is ReducerEvent {
  if (!isRecord(event) || !hasExactKeys(event, EVENT_KEYS)) {
    throw new ReducerError("INVALID_EVENT", "Reducer event has an unknown or missing field");
  }
  if (event.schema !== EVENT_SCHEMA
    || typeof event.event_type !== "string"
    || !EVENT_TYPES.has(event.event_type as ReducerEventType)
    || !nonEmptyString(event.scope)
    || !nonEmptyString(event.controller_generation)
    || !Number.isSafeInteger(event.expected_revision)
    || event.expected_revision < 0
    || !nonEmptyString(event.idempotency_key)
    || !Array.isArray(event.protected_gates)
    || !event.protected_gates.every((gate) => typeof gate === "string")) {
    throw new ReducerError("INVALID_EVENT", "Reducer event has an invalid typed field");
  }
  try {
    canonicalSha256(event.payload);
  } catch (error) {
    throw new ReducerError("INVALID_EVENT", "Reducer event payload is not canonical JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function isTerminal(state: OrganismState): boolean {
  return TERMINAL_STATES.has(state.lifecycle_state) || state.terminal_fence !== "OPEN";
}

function nextLifecycleState(current: LifecycleState, eventType: ReducerEventType): LifecycleState {
  if (eventType === "CANCELLED") {
    return "CANCELLED";
  }
  if (eventType === "REVOKED" || eventType === "CONTROLLER_REVOKED") {
    return "REVOKED";
  }
  if (eventType === "EFFECT_UNKNOWN" || eventType === "UNKNOWN" || eventType === "EFFECT_FAILED") {
    return eventType === "EFFECT_FAILED" ? "EFFECT_FAILED" : "RECOVERY_REQUIRED";
  }
  if (eventType === "TASK_STARTED" || eventType === "TASK_COMPLETE") {
    return current;
  }
  return eventType as LifecycleState;
}

function nextFence(eventType: ReducerEventType, nextState: LifecycleState): TerminalFence {
  if (eventType === "CANCELLED") {
    return "CANCELLED";
  }
  if (eventType === "REVOKED" || eventType === "CONTROLLER_REVOKED") {
    return "REVOKED";
  }
  if (TERMINAL_STATES.has(nextState)) {
    return "TERMINAL";
  }
  return "OPEN";
}

function transitionAllowed(state: OrganismState, eventType: ReducerEventType): boolean {
  if (eventType === "CANCELLED" || eventType === "REVOKED" || eventType === "CONTROLLER_REVOKED") {
    return true;
  }
  if (eventType === "TASK_STARTED" || eventType === "TASK_COMPLETE") {
    return !isTerminal(state);
  }
  return TRANSITIONS[state.lifecycle_state].includes(eventType);
}

export function initialReducerState(scope: string, controllerGeneration: string): OrganismState {
  if (!nonEmptyString(scope) || !nonEmptyString(controllerGeneration)) {
    throw new TypeError("scope and controller generation must be non-empty strings");
  }
  return {
    schema: STATE_SCHEMA,
    revision: 0,
    scope,
    controller_generation: controllerGeneration,
    lifecycle_state: "INITIAL",
    terminal_fence: "OPEN",
    circuit_breaker_open: false,
    seen_idempotency: {},
    task_started_generations: [],
    task_completed_generations: [],
  };
}

export const initialState = initialReducerState;

export function makeReducerEvent(input: ReducerEventInput): ReducerEvent {
  const eventWithoutKey = {
    schema: EVENT_SCHEMA,
    event_type: input.event_type,
    scope: input.scope,
    controller_generation: input.controller_generation,
    expected_revision: input.expected_revision,
    payload: input.payload ?? {},
    protected_gates: input.protected_gates ?? [],
  };
  return {
    ...eventWithoutKey,
    idempotency_key: input.idempotency_key
      ?? canonicalSha256({ schema: EVENT_SCHEMA, ...eventWithoutKey }),
  };
}

export const createReducerEvent = makeReducerEvent;
export const makeEvent = makeReducerEvent;

/** Apply one event without mutating prior state. Same-key/same-bytes is a replay. */
export function reduce(state: OrganismState, event: ReducerEvent): ReductionResult {
  validateState(state);
  validateEvent(event);
  const prior = cloneState(state);
  const eventSha256 = canonicalSha256(event);
  const priorEvent = prior.seen_idempotency[event.idempotency_key];
  if (priorEvent !== undefined) {
    if (priorEvent !== eventSha256) {
      throw new ReducerError("IDEMPOTENCY_CONFLICT", "Idempotency key has a different event", {
        idempotency_key: event.idempotency_key,
      });
    }
    return { state: prior, event_sha256: eventSha256, replayed: true };
  }

  if (event.scope !== prior.scope) {
    throw new ReducerError("CROSS_SCOPE", "Event scope does not match reducer scope", {
      expected: prior.scope,
      received: event.scope,
    });
  }
  if (event.controller_generation !== prior.controller_generation) {
    const code = prior.terminal_fence === "REVOKED" ? "REVOKED_GENERATION" : "STALE_GENERATION";
    throw new ReducerError(code, "Event controller generation is not current", {
      expected: prior.controller_generation,
      received: event.controller_generation,
    });
  }
  if (prior.circuit_breaker_open) {
    throw new ReducerError("CIRCUIT_BREAKER_OPEN", "Reducer circuit breaker is open");
  }
  if (isTerminal(prior)) {
    throw new ReducerError("TERMINAL_FENCE", "Terminal or revoked reducer state rejects new events");
  }
  if (event.expected_revision < prior.revision) {
    throw new ReducerError("STALE_REVISION", "Event expected revision is stale", {
      expected_revision: prior.revision,
      received_revision: event.expected_revision,
    });
  }
  if (event.expected_revision > prior.revision) {
    throw new ReducerError("SKIPPED_REVISION", "Event expected revision skips a state revision", {
      expected_revision: prior.revision,
      received_revision: event.expected_revision,
    });
  }
  if (event.protected_gates.length > 0) {
    throw new ReducerError("PROTECTED_EFFECT", "S01 reducer events cannot carry protected effects", {
      protected_gates: [...event.protected_gates],
    });
  }
  if (event.event_type === "TASK_STARTED"
    && prior.task_completed_generations.includes(prior.controller_generation)) {
    throw new ReducerError(
      "CIRCUIT_BREAKER_OPEN",
      "Same-generation task_started after task_complete opens the circuit breaker",
    );
  }
  if (event.event_type === "TASK_COMPLETE"
    && !prior.task_started_generations.includes(prior.controller_generation)) {
    throw new ReducerError("OUT_OF_ORDER", "task_complete requires a same-generation task_started event");
  }
  if (!transitionAllowed(prior, event.event_type)) {
    throw new ReducerError("OUT_OF_ORDER", `Event ${event.event_type} is not valid after ${prior.lifecycle_state}`, {
      state: prior.lifecycle_state,
      event_type: event.event_type,
    });
  }

  const nextStateValue = nextLifecycleState(prior.lifecycle_state, event.event_type);
  const started = event.event_type === "TASK_STARTED"
    && !prior.task_started_generations.includes(prior.controller_generation)
    ? [...prior.task_started_generations, prior.controller_generation]
    : [...prior.task_started_generations];
  const completed = event.event_type === "TASK_COMPLETE"
    && !prior.task_completed_generations.includes(prior.controller_generation)
    ? [...prior.task_completed_generations, prior.controller_generation]
    : [...prior.task_completed_generations];
  const next: OrganismState = {
    ...prior,
    revision: prior.revision + 1,
    lifecycle_state: nextStateValue,
    terminal_fence: nextFence(event.event_type, nextStateValue),
    circuit_breaker_open: false,
    seen_idempotency: { ...prior.seen_idempotency, [event.idempotency_key]: eventSha256 },
    task_started_generations: started,
    task_completed_generations: completed,
  };
  return { state: next, event_sha256: eventSha256, replayed: false };
}

export const reduceState = reduce;
export const applyEvent = reduce;

export function stateSha256(state: OrganismState): string {
  validateState(state);
  return canonicalSha256(state);
}

