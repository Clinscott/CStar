import path from 'node:path';
import { z } from 'zod';
import {
    FORGE_NATIVE_AUTHORIZATION_SCHEMA,
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA,
    FORGE_NATIVE_DELIVERY_SCHEMA,
    FORGE_NATIVE_EXECUTE_SCHEMA,
    FORGE_NATIVE_PLAN_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    FORGE_NATIVE_REQUEST_SCHEMA,
    FORGE_NATIVE_WORKER_PACKAGE_SCHEMA,
    FORGE_NATIVE_WORKER_RECEIPT_SCHEMA,
} from '../../../types/forge_native_swarm.js';

const DIGEST = z.string().regex(/^[a-f0-9]{64}$/);
const ID = z.string().trim().min(1).max(192).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/);
const ABSOLUTE = z.string().min(1).max(4096).refine(
    (value) => path.isAbsolute(value)
        && path.resolve(value) === value
        && !value.includes('\0')
        && !value.split(path.sep).some((segment) => segment === '.' || segment === '..'),
    'canonical absolute path required',
);
const PATHS = z.array(ABSOLUTE).max(4096);
const IDENTITY = z.object({
    model: z.literal(FORGE_NATIVE_REQUESTED_MODEL),
    reasoning: z.literal(FORGE_NATIVE_REQUESTED_REASONING),
}).strict();
const RETRY = z.object({
    initial_attempts: z.literal(1),
    repair_continuations: z.literal(1),
    unknown_retries: z.literal(0),
}).strict();

export const forgeNativeIdentitySchema = IDENTITY;

export const forgeNativeAuthorityScopeSchema = z.object({
    decision_id: ID,
    set_batch_id: ID,
    connection_id: z.literal(FORGE_NATIVE_CONNECTION_ID),
    generation: z.number().int().positive().optional(),
    request_id: ID,
    request_sha256: DIGEST,
    source_repository: ABSOLUTE,
    source_head: z.string().regex(/^[a-f0-9]{40,64}$/),
    execution_root: ABSOLUTE,
    read_allowlist: PATHS,
    write_allowlist: PATHS.min(1),
    test_allowlist: PATHS.min(1),
    quarantine_allowlist: PATHS,
    effect_exclusions: z.array(z.string().trim().min(1).max(256)).max(256),
    model_policy_sha256: DIGEST,
    retry_policy: RETRY,
    cancellation_policy: z.literal('interrupt_all_then_cancel_or_unknown'),
}).strict();

export const forgeNativeRequestSchema = z.object({
    schema: z.literal(FORGE_NATIVE_REQUEST_SCHEMA),
    authority: forgeNativeAuthorityScopeSchema,
    goal: z.string().trim().min(1).max(65536),
    acceptance: z.array(z.string().trim().min(1).max(8192)).min(1).max(128),
    source_identity: z.object({
        repository: ABSOLUTE,
        head: z.string().regex(/^[a-f0-9]{40,64}$/),
        execution_root: ABSOLUTE,
    }).strict(),
    requested_identity: IDENTITY,
    capabilities: z.array(z.enum(FORGE_NATIVE_CAPABILITIES as unknown as [string, ...string[]])).min(1),
    deadline_at: z.number().int().safe().positive(),
    idempotency_key: ID,
    evidence_root: ABSOLUTE.optional(),
    binding_sha256: DIGEST.optional(),
}).strict();

export const forgeNativeAuthorizationSchema = z.object({
    schema: z.literal(FORGE_NATIVE_AUTHORIZATION_SCHEMA),
    request_id: ID,
    request_sha256: DIGEST,
    authorization_id: ID,
    authorization_ref: z.string().trim().min(1).max(512),
    authority: forgeNativeAuthorityScopeSchema,
    scope_sha256: DIGEST,
    evidence_root: ABSOLUTE,
    requested_identity: IDENTITY,
    actual_identity: z.literal('unreported'),
    actual_identity_attested: z.literal(false),
    binding_sha256: DIGEST,
}).strict();

export const forgeNativeWorkerPackageSchema = z.object({
    schema: z.literal(FORGE_NATIVE_WORKER_PACKAGE_SCHEMA),
    run_id: ID,
    work_package_id: ID,
    goal: z.string().trim().min(1).max(65536),
    acceptance: z.array(z.string().trim().min(1).max(8192)).min(1).max(128),
    execution_root: ABSOLUTE,
    source_identity: z.object({
        repository: ABSOLUTE,
        head: z.string().regex(/^[a-f0-9]{40,64}$/),
    }).strict(),
    read_allowlist: PATHS,
    write_allowlist: PATHS.min(1),
    test_allowlist: PATHS.min(1),
    protected_effect_exclusions: z.array(z.string().trim().min(1).max(256)).max(256),
    topology_ceiling: z.object({
        parent: z.literal(1),
        leaves: z.literal(3),
        descendants: z.literal(0),
    }).strict(),
    requested_identity: IDENTITY,
    evidence_root: ABSOLUTE,
    deadline_at: z.number().int().safe().positive(),
}).strict();

export const forgeNativeControlReceiptSchema = z.object({
    schema: z.literal(FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA),
    run_id: ID,
    request_id: ID,
    lease_id: ID,
    lease_expires_at: z.number().int().safe().positive(),
    cancellation_secret_sha256: DIGEST,
}).strict();

export const forgeNativeExecuteBindingSchema = z.object({
    schema: z.literal(FORGE_NATIVE_EXECUTE_SCHEMA),
    run_id: ID,
    request_id: ID,
    request_sha256: DIGEST,
    scope_sha256: DIGEST,
    evidence_root: ABSOLUTE,
    worker_package: forgeNativeWorkerPackageSchema,
    control_receipt: forgeNativeControlReceiptSchema,
    requested_identity: IDENTITY,
    actual_identity: z.literal('unreported'),
    actual_identity_attested: z.literal(false),
    binding_sha256: DIGEST,
}).strict();

export const forgeNativePlanSchema = z.object({
    schema: z.literal(FORGE_NATIVE_PLAN_SCHEMA),
    run_id: ID,
    parent_task_id: ID,
    work_items: z.array(z.object({
        work_item_id: ID,
        idempotency_key: ID,
        objective: z.string().trim().min(1).max(65536),
        write_paths: PATHS,
        test_paths: PATHS,
        output_paths: PATHS,
        useful: z.literal(true),
        leaf_index: z.number().int().min(0).max(2),
    }).strict()).max(3),
    integration_paths: PATHS,
    expected_outputs: PATHS,
    plan_sha256: DIGEST,
}).strict();

export const forgeNativeWorkerReceiptSchema = z.object({
    schema: z.literal(FORGE_NATIVE_WORKER_RECEIPT_SCHEMA),
    run_id: ID,
    work_item_id: ID,
    task_id: ID,
    parent_task_id: ID,
    role: z.enum(['parent', 'leaf']),
    status: z.enum(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']),
    requested_identity: z.object({
        model: z.string().trim().min(1),
        reasoning: z.string().trim().min(1),
    }).strict(),
    actual_identity: z.string().trim().min(1).max(256),
    actual_identity_attested: z.boolean(),
    changed_files: z.array(z.object({
        path: ABSOLUTE,
        sha256: DIGEST,
        byte_count: z.number().int().nonnegative(),
    }).strict()).max(4096),
    checks: z.array(z.object({
        command: z.string().trim().min(1).max(8192),
        status: z.enum(['passed', 'failed', 'untested']),
        evidence_sha256: DIGEST.optional(),
    }).strict()).max(256),
    artifacts: z.array(z.object({
        path: ABSOLUTE,
        sha256: DIGEST,
        byte_count: z.number().int().nonnegative(),
    }).strict()).max(256),
    descendants: z.array(ID).max(16),
    evidence_sha256: DIGEST,
}).strict();

export const forgeNativeDeliverySchema = z.object({
    schema: z.literal(FORGE_NATIVE_DELIVERY_SCHEMA),
    status: z.literal('DELIVERED_UNVERIFIED'),
    run_id: ID,
    request_id: ID,
    plan: forgeNativePlanSchema,
    task_graph: z.array(z.record(z.string(), z.unknown())).min(1).max(4),
    worker_receipts: z.array(forgeNativeWorkerReceiptSchema).min(1).max(4),
    changed_files: z.array(z.object({
        path: ABSOLUTE,
        sha256: DIGEST,
        byte_count: z.number().int().nonnegative(),
    }).strict()),
    checks: z.array(z.object({
        command: z.string().trim().min(1),
        status: z.enum(['passed', 'failed', 'untested']),
        evidence_sha256: DIGEST.optional(),
    }).strict()),
    artifacts: z.array(z.object({
        path: ABSOLUTE,
        sha256: DIGEST,
        byte_count: z.number().int().nonnegative(),
    }).strict()),
    requested_identity: z.object({
        model: z.string().trim().min(1),
        reasoning: z.string().trim().min(1),
    }).strict(),
    actual_identities: z.array(z.string().trim().min(1).max(256)),
    unresolved_gaps: z.array(z.string().trim().min(1).max(256)),
    candidate_digest: DIGEST,
    receipt_sha256: DIGEST,
}).strict();

export type ForgeNativeRequestInput = z.infer<typeof forgeNativeRequestSchema>;
export type ForgeNativeAuthorizationInput = z.infer<typeof forgeNativeAuthorizationSchema>;
export type ForgeNativePlanInput = z.infer<typeof forgeNativePlanSchema>;
export type ForgeNativeWorkerReceiptInput = z.infer<typeof forgeNativeWorkerReceiptSchema>;
