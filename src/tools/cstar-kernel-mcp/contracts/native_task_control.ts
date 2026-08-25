import { z } from 'zod';

import {
    FORGE_ROUTE_STATE,
    NATIVE_CIRCUIT_BREAKER_SCHEMA,
    NATIVE_COHORT_WAIT_SCHEMA,
    NATIVE_CONTROLLER_LEASE_SCHEMA,
    NATIVE_GOAL_GENERATION_SCHEMA,
    NATIVE_ROLE_MANIFEST_SCHEMA,
    NATIVE_SUCCESSION_RECEIPT_SCHEMA,
    NATIVE_TASK_CONTROL_EVENT_SCHEMA,
    NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA,
} from '../../../types/native_task_control.js';

export * from '../../../types/native_task_control.js';
export {
    assertKnownFields,
    canonicalBytes,
    canonicalHash,
    canonicalJson,
    canonicalSha256,
    canonicalize,
    hashCanonical,
    parseCanonicalJson,
    parseStrictJson,
    parseStrictObject,
    sha256Bytes,
} from '../../../core/native_task_control/canonical.js';
export {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlContractError,
    NativeTaskControlError,
} from '../../../core/native_task_control/errors.js';
export {
    MAX_NATIVE_POLICY_DEPTH,
    assertNarrowingNativeTaskControlPolicy,
    hashNativeTaskControlPolicy,
    inheritNativeTaskControlPolicy,
    normalizeNativeTaskControlPolicy,
    parseNativeTaskControlPolicy,
    validateNativeTaskControlPolicy,
} from '../../../core/native_task_control/policy.js';

const boundedId = z.string().min(1).max(256);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegative = z.number().int().nonnegative();
const stringList = z.array(z.string().min(1));
const policyFields = {
    max_model_requests: nonnegative.optional(),
    max_tool_calls: nonnegative.optional(),
    max_native_waits: nonnegative.optional(),
    max_retries: nonnegative.optional(),
    max_replays: nonnegative.optional(),
    max_fallbacks: nonnegative.optional(),
    max_uncached_input_tokens: nonnegative.optional(),
    max_output_plus_reasoning_tokens: nonnegative.optional(),
    max_wall_time_seconds: nonnegative.optional(),
    max_descendants: nonnegative.optional(),
    max_replacements: nonnegative.optional(),
    max_succession: nonnegative.optional(),
    max_depth: nonnegative.optional(),
    allowed_sources: stringList.optional(),
    allowed_scopes: stringList.optional(),
    allowed_effects: stringList.optional(),
    prohibited_effects: stringList.optional(),
    required_effects: stringList.optional(),
    effect_permissions: z.record(z.string(), z.boolean()).optional(),
};

export const nativeTaskControlPolicySchema = z.object(policyFields).strict();
export const nativeRoleManifestSchema = z.object({
    schema: z.literal(NATIVE_ROLE_MANIFEST_SCHEMA),
    manifest_id: boundedId,
    root_id: boundedId,
    role_slots: z.array(z.object({
        role_slot_id: boundedId,
        role: z.string().min(1),
        replacement_allowed: z.boolean().optional(),
        max_replacements: nonnegative.optional(),
    }).strict()),
    policy: nativeTaskControlPolicySchema,
    role_manifest_sha256: digest,
}).strict();

const identityFields = {
    root_id: boundedId,
    bead_id: boundedId,
    set_id: boundedId,
    phase_id: boundedId,
    task_logical_id: boundedId,
    partition_id: boundedId,
    goal_generation: nonnegative,
    controller_generation: nonnegative,
    occupant_generation: nonnegative,
    work_package_sha256: digest,
    role_manifest_sha256: digest,
    effective_policy_sha256: digest,
    previous_event_sha256: digest.nullable(),
};

export const nativeGoalGenerationSchema = z.object({
    schema: z.literal(NATIVE_GOAL_GENERATION_SCHEMA),
    ...identityFields,
    goal_id: boundedId,
    objective: z.string().min(1),
}).strict();

export const nativeControllerLeaseSchema = z.object({
    schema: z.literal(NATIVE_CONTROLLER_LEASE_SCHEMA),
    ...identityFields,
    lease_id: boundedId,
    role_slot_id: boundedId,
    controller_id: boundedId,
    acquired_at: nonnegative,
    expires_at: nonnegative,
}).strict();

export const nativeTaskControlEventSchema = z.object({
    schema: z.literal(NATIVE_TASK_CONTROL_EVENT_SCHEMA),
    ...identityFields,
    event_id: boundedId,
    event_kind: z.enum([
        'START', 'PROGRESS', 'COMPLETE', 'FAILED', 'CANCEL_REQUEST', 'CANCEL_ACK',
        'REVOKED', 'UNKNOWN', 'TIMEOUT', 'SUCCESSION_PREPARE', 'SUCCESSION_COMMIT',
    ]),
    role_slot_id: boundedId,
    task_id: boundedId.optional(),
    native_task_id: boundedId.optional(),
    observed_at: nonnegative.optional(),
    detail: z.string().optional(),
}).strict();

export const nativeSuccessionReceiptSchema = z.object({
    schema: z.literal(NATIVE_SUCCESSION_RECEIPT_SCHEMA),
    ...identityFields,
    receipt_id: boundedId,
    phase: z.enum(['SUCCESSION_PREPARE', 'SUCCESSION_COMMIT']),
    old_lease_id: boundedId,
    successor_lease_id: boundedId.optional(),
    active_task_ids: z.array(boundedId),
    last_event_sha256: digest,
}).strict();

export const nativeCohortWaitSchema = z.object({
    schema: z.literal(NATIVE_COHORT_WAIT_SCHEMA),
    ...identityFields,
    wait_id: boundedId,
    task_ids: z.array(boundedId),
    state: z.enum(['PENDING', 'COMPLETE', 'TIMEOUT', 'FENCED']),
    wait_seconds: nonnegative,
    event_sha256: digest.optional(),
}).strict();

export const nativeCircuitBreakerSchema = z.object({
    schema: z.literal(NATIVE_CIRCUIT_BREAKER_SCHEMA),
    ...identityFields,
    breaker_id: boundedId,
    state: z.enum(['CLOSED', 'OPEN']),
    reason: z.string().optional(),
    opened_by_event_sha256: digest.optional(),
}).strict();

export const nativeWorkTerminalReceiptSchema = z.object({
    schema: z.literal(NATIVE_WORK_TERMINAL_RECEIPT_SCHEMA),
    ...identityFields,
    receipt_id: boundedId,
    state: z.enum(['DELIVERED_UNVERIFIED', 'TRANSFER_READY', 'TRANSFER_READY_WITH_GAP', 'TRANSFER_NOT_READY', 'BLOCKED']),
    terminal_event_kind: z.enum(['COMPLETE', 'FAILED', 'CANCEL_ACK', 'REVOKED', 'UNKNOWN', 'TIMEOUT']),
    terminal_event_sha256: digest,
    tests_status: z.enum(['PASS', 'FAIL', 'UNAVAILABLE']).optional(),
}).strict();

export const NATIVE_FORGE_ROUTE = FORGE_ROUTE_STATE;
export const FORGE_EXECUTION_ROUTE = FORGE_ROUTE_STATE;
export const FORGE_TOMBSTONE = FORGE_ROUTE_STATE;
export const nativeForgeRouteSchema = z.literal(FORGE_ROUTE_STATE);
