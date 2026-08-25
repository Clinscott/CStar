export interface SchemaDeclaration {
  readonly schema: string;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

const declaration = (schema: string, required: readonly string[]): SchemaDeclaration =>
  Object.freeze({
    schema,
    required: Object.freeze([...required]),
    additionalProperties: false as const,
  });

export const V0_SCHEMA_DECLARATIONS = Object.freeze({
  "corvus.intent_envelope.v1": declaration("corvus.intent_envelope.v1", [
    "schema",
    "raw_text_utf8",
    "raw_text_sha256",
    "normalized_text_utf8",
    "source",
    "received_at_measured",
    "operator_grant_refs",
    "requested_scope_hints",
    "requested_protected_effects",
    "policy_version",
    "parse_outcome",
    "verification",
    "envelope_sha256",
  ]),
  "corvus.plan_envelope.v1": declaration("corvus.plan_envelope.v1", [
    "schema",
    "intent_envelope_sha256",
    "plan_id",
    "decision_id",
    "bead_id",
    "set_id",
    "controller_generation",
    "scope",
    "owner",
    "ordered_cells",
    "model_policy_ref",
    "capability_profile_ref",
    "acceptance_matrix",
    "protected_gates",
    "transfer_checkpoint_policy",
    "plan_sha256",
  ]),
  "corvus.set_record.v1": declaration("corvus.set_record.v1", [
    "schema",
    "set_id",
    "plan_id",
    "intent_envelope_sha256",
    "decision_id",
    "bead_id",
    "controller_generation",
    "scope",
    "work_packet_hashes",
    "capability_profile_hash",
    "requested_model",
    "requested_reasoning",
    "lease",
    "ceilings",
    "retry_budget",
    "terminal_schema",
    "validation_requirements",
    "protected_gates",
    "set_sha256",
  ]),
  "corvus.effect_outbox.v1": declaration("corvus.effect_outbox.v1", [
    "schema",
    "effect_id",
    "idempotency_key",
    "set_id",
    "cell_id",
    "sequence",
    "effect_kind",
    "controller_generation",
    "payload_sha256",
    "input_manifest_sha256",
    "output_allowlist_sha256",
    "capability_profile_hash",
    "lease",
    "expected_state_revision",
    "status",
    "created_revision",
  ]),
  "corvus.effect_inbox.v1": declaration("corvus.effect_inbox.v1", [
    "schema",
    "effect_id",
    "idempotency_key",
    "transport_status",
    "host_task_id",
    "host_turn_id",
    "returned_thread_id",
    "returned_turn_id",
    "requested_model",
    "requested_reasoning",
    "actual_identity",
    "result_sha256",
    "observed_state_revision",
    "received_at_measured",
    "failure_code",
    "inbox_sha256",
  ]),
  "corvus.journal_event.v1": declaration("corvus.journal_event.v1", [
    "schema",
    "revision",
    "sequence",
    "event_type",
    "scope",
    "controller_generation",
    "prior_event_sha256",
    "state_before_sha256",
    "state_after_sha256",
    "effect_id",
    "idempotency_key",
    "payload_sha256",
    "timestamp_measured",
    "event_sha256",
  ]),
  "corvus.snapshot.v1": declaration("corvus.snapshot.v1", [
    "schema",
    "revision",
    "last_event_sha256",
    "reducer_version",
    "state_sha256",
    "outbox_sha256",
    "inbox_sha256",
    "snapshot_sha256",
  ]),
  "corvus.work_packet.v1": declaration("corvus.work_packet.v1", [
    "schema",
    "packet_id",
    "set_id",
    "cell_id",
    "controller_generation",
    "scope",
    "action",
    "input_manifest",
    "input_manifest_sha256",
    "write_allowlist",
    "output_allowlist",
    "requested_model",
    "requested_reasoning",
    "actual_identity",
    "lease",
    "ceilings",
    "retry_budget",
    "terminal_schema",
    "tests",
    "protected_gates",
    "transfer_checkpoint_ref",
    "packet_sha256",
  ]),
  "corvus.terminal_packet.v1": declaration("corvus.terminal_packet.v1", [
    "schema",
    "packet_id",
    "set_id",
    "cell_id",
    "status",
    "output_manifest",
    "source_manifest",
    "tests",
    "bytes_lines",
    "model_calls",
    "requested_model",
    "requested_reasoning",
    "actual_identity",
    "elapsed_time",
    "tool_calls",
    "waits",
    "retries",
    "descendants",
    "token_usage",
    "hard_enforcement",
    "failure_code",
    "protected_effects",
    "terminal_sha256",
  ]),
  "corvus.independent_result.v1": declaration("corvus.independent_result.v1", [
    "schema",
    "packet_id",
    "terminal_sha256",
    "validator_profile",
    "separate_ancestry",
    "rerun_evidence",
    "verdict",
    "gaps",
    "result_sha256",
  ]),
  "corvus.manual_emergency_receipt.v1": declaration("corvus.manual_emergency_receipt.v1", [
    "schema",
    "lane_id",
    "operator_grant",
    "intent_sha256",
    "set_id",
    "scope",
    "effect_id",
    "effect_kind",
    "write_allowlist",
    "measured_start",
    "measured_end",
    "ack",
    "terminal_sha256",
    "protected_gates",
    "result",
    "receipt_sha256",
  ]),
  "corvus.transfer_checkpoint.v1": declaration("corvus.transfer_checkpoint.v1", [
    "schema",
    "status",
    "source_identity",
    "durable_store_snapshots",
    "artifact_verification",
    "runtime_bootstrap_parity",
    "architecture",
    "restore_rehearsal",
    "gaps",
    "protected_gates",
    "timestamp_measured",
    "predecessor_checkpoint",
  ]),
} as const);

export const SCHEMA_DECLARATIONS = V0_SCHEMA_DECLARATIONS;
export type SchemaName = keyof typeof V0_SCHEMA_DECLARATIONS;

export interface ValidationIssue {
  readonly path: string;
  readonly code: "NOT_OBJECT" | "UNKNOWN_FIELD" | "MISSING_FIELD" | "SCHEMA_MISMATCH";
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function resolveDeclaration(schema: SchemaName | SchemaDeclaration): SchemaDeclaration {
  return typeof schema === "string" ? V0_SCHEMA_DECLARATIONS[schema] : schema;
}

/** Validate required fields and reject every undeclared top-level field. */
export function validateClosedObject(
  value: unknown,
  schema: SchemaName | SchemaDeclaration,
): ValidationResult {
  const declarationValue = resolveDeclaration(schema);
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    return {
      valid: false,
      issues: [{
        path: "$",
        code: "NOT_OBJECT",
        message: "Value must be a plain JSON object",
      }],
    };
  }

  const allowed = new Set(declarationValue.required);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({
        path: `$.${key}`,
        code: "UNKNOWN_FIELD",
        message: `Unknown field ${key}`,
      });
    }
  }
  for (const key of declarationValue.required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issues.push({
        path: `$.${key}`,
        code: "MISSING_FIELD",
        message: `Missing required field ${key}`,
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "schema") && value.schema !== declarationValue.schema) {
    issues.push({
      path: "$.schema",
      code: "SCHEMA_MISMATCH",
      message: `Expected schema ${declarationValue.schema}`,
    });
  }
  return { valid: issues.length === 0, issues };
}

export const validateSchema = validateClosedObject;

export function isValidClosedObject(
  value: unknown,
  schema: SchemaName | SchemaDeclaration,
): boolean {
  return validateClosedObject(value, schema).valid;
}

export const isValidSchema = isValidClosedObject;

export class SchemaValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

export function assertValidClosedObject(
  value: unknown,
  schema: SchemaName | SchemaDeclaration,
): asserts value is Record<string, unknown> {
  const result = validateClosedObject(value, schema);
  if (!result.valid) {
    throw new SchemaValidationError(result.issues);
  }
}

export const assertValidSchema = assertValidClosedObject;
