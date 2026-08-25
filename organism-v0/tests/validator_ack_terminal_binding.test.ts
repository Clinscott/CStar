import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { sha256Hex } from "../src/canonical.js";
import {
  acceptValidatorDispatchAck,
  acceptValidatorTerminal,
  createValidatorDispatchAck,
  createValidatorTerminal,
  recordValidatorResult,
  validatorAckIdempotencyKey,
  validatorTerminalIdempotencyKey,
  ValidatorBindingError,
  verifyValidatorDispatchAck,
  verifyValidatorTerminal,
  type ValidatorBindingContext,
  type ValidatorDispatchAck,
  type ValidatorTerminal,
} from "../src/validator_binding.js";

const h = (value: string) => sha256Hex(value);
const context: ValidatorBindingContext = {
  bead_id: "bead:validator-binding",
  set_id: "set:validator-binding",
  validation_id: "validation:validator-binding",
  effect_id: "effect:validator-binding",
  controller_generation: "generation:validator-binding",
  expected_revision: 0,
  validator_task_id: "task:validator-binding",
  work_packet_sha256: "a".repeat(64),
  validation_scope_sha256: "b".repeat(64),
  requested_model: "gpt-5.6-luna",
  requested_reasoning: "max",
  actual_identity: "unreported",
  validator_profile_hash: "c".repeat(64),
  terminal_schema: "corvus.terminal_packet.v1",
  dispatch_provenance_path: "/receipts/dispatch.json",
  dispatch_provenance_sha256: "d".repeat(64),
  host_spawn_receipt_sha256: "e".repeat(64),
};

function ack(overrides: Partial<ValidatorDispatchAck> = {}): ValidatorDispatchAck {
  const base = {
    ...context,
    idempotency_key: validatorAckIdempotencyKey(context.effect_id, context.validation_id,
      context.controller_generation, context.validator_task_id, context.work_packet_sha256),
  };
  const value = { ...base, ...overrides };
  return createValidatorDispatchAck({ ...value, idempotency_key: validatorAckIdempotencyKey(
    String(value.effect_id), String(value.validation_id), String(value.controller_generation),
    String(value.validator_task_id), String(value.work_packet_sha256),
  ) } as never);
}

function terminal(dispatch: ValidatorDispatchAck, overrides: Record<string, unknown> = {}): ValidatorTerminal {
  const base = {
    schema: "corvus.validator_terminal.v1",
    event_kind: "VALIDATOR_TERMINAL",
    binding_version: 1,
    bead_id: context.bead_id,
    set_id: context.set_id,
    validation_id: context.validation_id,
    effect_id: context.effect_id,
    controller_generation: context.controller_generation,
    expected_revision: 0,
    dispatch_ack_content_sha256: dispatch.ack_content_sha256,
    validator_task_id: context.validator_task_id,
    validator_turn_id: "turn:validator-binding",
    turn_state: "BOUND_AT_TERMINAL",
    host_terminal_receipt_path: "/receipts/terminal.json",
    host_terminal_receipt_sha256: "f".repeat(64),
    terminal_packet_path: "/receipts/terminal-packet.json",
    terminal_packet_sha256: "1".repeat(64),
    terminal_packet_schema: "researcher.independent_validation.v1",
    evidence_manifest_path: "/receipts/manifest.json",
    evidence_manifest_sha256: "2".repeat(64),
    evidence_manifest_schema: "cstar.independent_validation_input.v1",
    evidence_materialization_order: "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT",
    evidence_digest: "3".repeat(64),
    verdict: "ACCEPTED",
    requested_model: context.requested_model,
    requested_reasoning: context.requested_reasoning,
    actual_identity: "unreported",
    protected_effects: 0,
    retry_count: 0,
    descendant_count: 0,
    observed_at_ms: 0,
    observed_elapsed_ms: 0,
    ...overrides,
  };
  const packetHash = String(base.terminal_packet_sha256);
  const manifestHash = String(base.evidence_manifest_sha256);
  return createValidatorTerminal({
    ...base,
    idempotency_key: validatorTerminalIdempotencyKey(
      dispatch.ack_content_sha256, String(base.validation_id), String(base.validator_task_id),
      String(base.validator_turn_id), packetHash, manifestHash,
    ),
  } as never);
}

function hostTerminal(value: ValidatorTerminal) {
  return {
    validator_task_id: value.validator_task_id,
    validator_turn_id: value.validator_turn_id,
    host_terminal_receipt_sha256: value.host_terminal_receipt_sha256,
    terminal_packet_sha256: value.terminal_packet_sha256,
    evidence_manifest_sha256: value.evidence_manifest_sha256,
    terminal_packet_path: value.terminal_packet_path,
    evidence_manifest_path: value.evidence_manifest_path,
  };
}

test("LIVE_TWO_STAGE_BINDING accepts one ACK then one host-bound terminal", () => {
  const dispatch = ack();
  assert.equal(verifyValidatorDispatchAck(dispatch), true);
  const acceptedAck = acceptValidatorDispatchAck({
    context, ack: dispatch, host_spawn_receipt: {
      validator_task_id: context.validator_task_id,
      host_spawn_receipt_sha256: context.host_spawn_receipt_sha256,
    },
  });
  const value = terminal(dispatch);
  assert.equal(verifyValidatorTerminal(value), true);
  const acceptedTerminal = acceptValidatorTerminal({
    context, ack: dispatch, terminal: value, existing: acceptedAck.binding,
    host_terminal_receipt: hostTerminal(value),
  });
  assert.equal(acceptedTerminal.binding.stage, "TERMINAL_BOUND");
  assert.equal(acceptedTerminal.binding.dispatch_ack_content_sha256, dispatch.ack_content_sha256);
});

test("EXACT_ACK_REPLAY and EXACT_TERMINAL_REPLAY do not create new bindings", () => {
  const dispatch = ack();
  const firstAck = acceptValidatorDispatchAck({ context, ack: dispatch, host_spawn_receipt: {
    validator_task_id: context.validator_task_id, host_spawn_receipt_sha256: context.host_spawn_receipt_sha256,
  } });
  const replayAck = acceptValidatorDispatchAck({ context, ack: dispatch, existing: firstAck.binding, host_spawn_receipt: {
    validator_task_id: context.validator_task_id, host_spawn_receipt_sha256: context.host_spawn_receipt_sha256,
  } });
  assert.equal(replayAck.replayed, true);
  const value = terminal(dispatch);
  const firstTerminal = acceptValidatorTerminal({ context, ack: dispatch, terminal: value, existing: firstAck.binding,
    host_terminal_receipt: hostTerminal(value) });
  const replayTerminal = acceptValidatorTerminal({ context, ack: dispatch, terminal: value, existing: firstTerminal.binding,
    host_terminal_receipt: hostTerminal(value) });
  assert.equal(replayTerminal.replayed, true);
});

test("negative binding codes reject task, turn, scope, hash, order, and duplicate substitutions", () => {
  const dispatch = ack();
  const accepted = acceptValidatorDispatchAck({ context, ack: dispatch, host_spawn_receipt: {
    validator_task_id: context.validator_task_id, host_spawn_receipt_sha256: context.host_spawn_receipt_sha256,
  } });
  assert.throws(() => acceptValidatorDispatchAck({ context, ack: ack({ validator_task_id: "task:caller" }),
    host_spawn_receipt: { validator_task_id: context.validator_task_id, host_spawn_receipt_sha256: context.host_spawn_receipt_sha256 } }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "ACK_TASK_ID_NOT_HOST_BOUND");
  const value = terminal(dispatch);
  assert.throws(() => acceptValidatorTerminal({ context, ack: dispatch, terminal: terminal(dispatch, { validator_turn_id: "unavailable" }),
    existing: accepted.binding, host_terminal_receipt: hostTerminal(value) }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  assert.throws(() => acceptValidatorTerminal({ context, ack: dispatch, terminal: terminal(dispatch, { validation_id: "validation:other" }),
    existing: accepted.binding, host_terminal_receipt: hostTerminal(value) }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "TERMINAL_VALIDATION_ID_MISMATCH");
  assert.throws(() => acceptValidatorTerminal({ context, ack: dispatch, terminal: terminal(dispatch, { terminal_packet_sha256: "4".repeat(64) }),
    existing: accepted.binding, host_terminal_receipt: hostTerminal(value) }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "TERMINAL_PACKET_HASH_MISMATCH");
  const bound = acceptValidatorTerminal({ context, ack: dispatch, terminal: value, existing: accepted.binding,
    host_terminal_receipt: hostTerminal(value) });
  assert.throws(() => acceptValidatorTerminal({ context, ack: dispatch, terminal: terminal(dispatch, { verdict: "REJECTED" }),
    existing: bound.binding, host_terminal_receipt: hostTerminal(value) }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "TERMINAL_IDEMPOTENCY_CONFLICT");
  const result = recordValidatorResult({ binding: bound.binding, terminal: value, verdict: "ACCEPTED" });
  assert.throws(() => recordValidatorResult({ binding: result.binding, terminal: value, verdict: "REJECTED" }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "DUPLICATE_RECORD_RESULT");
});

test("terminal-before-ACK, identity substitution, and legacy materialization are closed", () => {
  const dispatch = ack();
  const value = terminal(dispatch);
  assert.throws(() => acceptValidatorTerminal({ context, ack: dispatch, terminal: value,
    host_terminal_receipt: hostTerminal(value) }),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "TERMINAL_BEFORE_ACK");
  assert.throws(() => createValidatorDispatchAck({ ...context, idempotency_key: "0".repeat(64), actual_identity: "caller" } as never),
    (error: unknown) => error instanceof ValidatorBindingError && error.code === "ACK_IDEMPOTENCY_CONFLICT");
  const accepted = acceptValidatorDispatchAck({ context, ack: dispatch, host_spawn_receipt: {
    validator_task_id: context.validator_task_id, host_spawn_receipt_sha256: context.host_spawn_receipt_sha256,
  } });
  const bound = acceptValidatorTerminal({ context, ack: dispatch, terminal: value, existing: accepted.binding,
    host_terminal_receipt: hostTerminal(value) });
  assert.equal(recordValidatorResult({ binding: bound.binding, terminal: value, verdict: value.verdict }).replayed, false);
});

test("ACCEPTED_LEGACY_FORWARD_BIND preserves the measured terminal-before-manifest order", () => {
  const terminalPath = "/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803/work/receipts/cso-d004-d003/enm-aurora-pulse-r1-abi-adapter-forward-repair-01-independent-validation-terminal.v1.json";
  const manifestPath = "/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-state-only-luna-host-seam-batch1-20260803/work/receipts/cso-d004-d003/enm-aurora-pulse-r1-abi-adapter-forward-repair-01-independent-validation-input.v1.json";
  const terminalBytes = fs.readFileSync(terminalPath, "utf8");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const terminalPacketSha256 = "90284744010181892c9efa374e54ffd24b4c86fcb824cf878504efd8046d321d";
  const evidenceManifestSha256 = "4eda80e7d1d1be2d737ea02f51e6945ba8e06e1c0543f613408b49b9cf2ccd7b";
  assert.equal(sha256Hex(terminalBytes), terminalPacketSha256);
  assert.equal(sha256Hex(fs.readFileSync(manifestPath, "utf8")), evidenceManifestSha256);
  assert.equal(manifest.validation_stage_order, "MANIFEST_MATERIALIZED_AFTER_VALIDATOR_TERMINAL_FOR_LEGACY_KERNEL_RECORD_ATTEMPT");
  const legacyContext: ValidatorBindingContext = { ...context,
    bead_id: "bead:mcp:r1-platform-neutral-researcher-abi-is-authoritat-msujyurh",
    set_id: "ENM-AURORA-PULSE-PLATFORM-NEUTRAL-RESEARCHER-ADAPTER-FORWARD-REPAIR-SET-01",
    validation_id: "ENM-AURORA-PULSE-R1-ABI-ADAPTER-FORWARD-REPAIR-01-INDEPENDENT-VALIDATION",
    effect_id: "effect:cstar:26a7e6a85b77bd956a74f2ebca1d890cd65a85d8045b8349154369b3a6fb860a",
    controller_generation: "legacy-forward-generation", validator_task_id: "01a0065e-0570-7ba2-8e87-b5db5750030e" };
  const dispatch = ack({ ...legacyContext });
  const acked = acceptValidatorDispatchAck({ context: legacyContext, ack: dispatch,
    host_spawn_receipt: { validator_task_id: legacyContext.validator_task_id, host_spawn_receipt_sha256: legacyContext.host_spawn_receipt_sha256 } });
  const value = terminal(dispatch, { bead_id: legacyContext.bead_id, set_id: legacyContext.set_id,
    validation_id: legacyContext.validation_id, effect_id: legacyContext.effect_id,
    controller_generation: legacyContext.controller_generation, validator_task_id: legacyContext.validator_task_id,
    terminal_packet_path: terminalPath, terminal_packet_sha256: terminalPacketSha256,
    terminal_packet_schema: "researcher.independent_validation.v1", evidence_manifest_path: manifestPath,
    evidence_manifest_sha256: evidenceManifestSha256, evidence_materialization_order: "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT" });
  const bound = acceptValidatorTerminal({ context: legacyContext, ack: dispatch, terminal: value, existing: acked.binding,
    host_terminal_receipt: hostTerminal(value) });
  assert.equal(bound.binding.stage, "TERMINAL_BOUND");
  assert.equal(value.evidence_materialization_order, "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT");
});
