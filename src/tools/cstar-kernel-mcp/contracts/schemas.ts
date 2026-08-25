import { z } from 'zod';
import {
    forgeNativeControlReceiptSchema,
    forgeNativeDeliverySchema,
    forgeNativePlanSchema,
    forgeNativeWorkerReceiptSchema,
} from './forge_native_swarm.js';

export {
    automaticMissionOutcomeSchema,
    automaticMissionSchema,
    automaticMissionCoordinatorSchema,
    cstarMissionCoordinatorOutcomeSchema,
    cstarMissionCoordinatorSchema,
    cstarMissionCoordinatorToolSchema,
    cstarMissionPublicSchema,
    cstarMissionSchema,
    type CstarMissionCoordinatorInput,
} from './automatic_mission.js';

export const dispatchMetricSchema = z.object({
    name: z.string().min(1).describe('Metric name, e.g. precision, pass_rate, artifact_integrity'),
    threshold: z.string().min(1).describe('Acceptance threshold, e.g. >= 0.95 or zero P1/P2 blockers'),
    acceptance_rule: z.string().optional().describe('How CoS or an independent validator should judge this metric'),
    unit: z.string().optional().describe('Metric unit if applicable'),
});

export const dispatchPackageLockSchema = z.object({
    path: z.string().min(1).describe('Artifact/package path under review'),
    sha256: z.string().min(1).describe('Expected sha256 hash for the package/artifact'),
});

export const dispatchSpendPolicySchema = z.object({
    mode: z.enum(['no_spend', 'dry_run', 'live_authorized']).describe('No-spend by default; live_authorized still requires operator_authorization_ref'),
    max_retries: z.number().int().min(0).optional().describe('Maximum retry budget'),
    live_source_allowed: z.boolean().optional().describe('Whether live source collection is authorized'),
    operator_authorization_ref: z.string().optional().describe('Explicit operator approval reference for live spend/source paths'),
});

export const forgeRequestSpendPolicySchema = z.object({
    mode: z.enum(['no_spend', 'dry_run', 'live_authorized'])
        .describe('live_authorized requests remain pending until cstar_forge_authorize binds one current explicit work-referenced root-user build or resume instruction'),
    max_retries: z.number().int().min(0).optional().describe('Must be zero for a live Forge request'),
    live_source_allowed: z.boolean().optional().describe('Must be false for the bounded Forge authorization profile'),
}).strict().describe('Forge request spend intent. Legacy freeform operator_authorization_ref is forbidden here.');

export const dispatchCallbackSchema = z.object({
    expected_packet: z.string().min(1).describe('Required final report packet name'),
    callback_required: z.boolean().optional().describe('Defaults true'),
    callback_thread_id: z.string().optional().describe('Destination callback thread; defaults to source_callback_thread_id'),
});

export const dispatchRetrySchema = z.object({
    budget: z.number().int().min(0).describe('Allowed retry budget'),
    spent: z.number().int().min(0).optional().describe('Retries already spent'),
});

export const dispatchRequestedActionSchema = z.enum([
    'request_receipt',
    'response_only',
    'project_files',
    'validation_artifacts',
    'authorized_source_collection',
]);

export const dispatchProhibitedActionSchema = z.enum([
    'request_receipt',
    'response_only',
    'project_files',
    'validation_artifacts',
    'authorized_source_collection',
    'git_branch',
    'git_commit',
    'git_push',
    'git_merge',
    'git_pull_request',
    'install',
    'deploy',
    'restart',
    'activation',
    'secret_config_mutation',
    'credential_mutation',
    'token_mutation',
    'direct_state_write',
    'destructive_cleanup',
    'permission_change',
    'process_control',
    'service_control',
    'steering',
    'locked_holdout',
    'expanded_spend',
    'production_claim',
    'out_of_scope_writes',
]);

export const dispatchRequestSchema = {
    bead_id: z.string().optional().describe('CStar bead id anchoring the request'),
    decision_id: z.string().optional().describe('Decision id; generated if absent and bead_id is present'),
    state_update_thread_id: z.string().min(1).optional().describe('Optional project information-repository thread for bounded context reads and state-update packets; grants no authority'),
    owner_pmt_thread_id: z.string().min(1).optional().describe('Deprecated compatibility alias for state_update_thread_id; grants no ownership or review authority'),
    source_callback_thread_id: z.string().min(1).describe('Thread that must receive the compact callback packet'),
    objective: z.string().min(1).describe('Bounded work objective'),
    prompt: z.string().optional().describe('Prompt/mission text for the authorized surface'),
    target_paths: z.array(z.string()).optional().describe('Bounded target files/repos/paths'),
    required_output_paths: z.array(z.string()).optional().describe('Exact files the Forge worker must deliver; each must be contained by an explicit target and covered by operator authorization before project_files live execution'),
    system_under_test: z.string().optional().describe('System under test when relevant'),
    scope: z.string().min(1).describe('Scope boundary and project/spoke context'),
    authority_lane: z.enum(['green', 'yellow', 'red']).describe('Authority/risk lane'),
    required_metrics: z.array(dispatchMetricSchema).min(1).describe('Required metrics with thresholds'),
    artifact_expectations: z.array(z.string().min(1)).min(1).describe('Expected artifacts/reports/packages'),
    prohibited_actions: z.array(dispatchProhibitedActionSchema).min(1).describe('Exact canonical action ids explicitly forbidden to the dispatched surface'),
    requested_actions: z.array(dispatchRequestedActionSchema).min(1).describe('Exact canonical action ids that alone define requested authority; exactly one primary action is required'),
    spend_policy: dispatchSpendPolicySchema.describe('Spend/live-source policy and retry cap'),
    live_source_policy: z.string().optional().describe('Additional live-source/source-adapter policy text'),
    fixture_policy: z.literal('synthetic_only').optional().describe('Live Forge work is restricted to synthetic fixtures; required for live authorization'),
    retry_policy: dispatchRetrySchema.optional().describe('Decision retry budget/spent contract'),
    callback_contract: dispatchCallbackSchema.optional().describe('Optional callback packet contract; Researcher requests derive a deterministic callback when omitted'),
    package_locks: z.array(dispatchPackageLockSchema).optional().describe('Optional package/hash locks'),
    dispatch_surface_ref: z.string().optional().describe('Optional explicit authorized surface path; missing paths fail closed'),
};

export const forgeRequestSchema = {
    ...dispatchRequestSchema,
    callback_contract: dispatchCallbackSchema.describe('Callback packet contract; required for Forge requests'),
    spend_policy: forgeRequestSpendPolicySchema,
    execution_adapter_ref: z.string().optional().describe('Legacy-v2 compatibility adapter reference only; current v3 must omit this field and uses the codex-host state-only transport'),
};

export const forgeAuthorizeSchema = {
    forge_request_receipt_id: z.string().regex(/^dispatch-forge-[a-f0-9]{32}$/)
        .describe('Immutable pending Forge request receipt returned by cstar_forge_request'),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/)
        .describe('Exact canonical request digest returned by cstar_forge_request'),
    goal_resume_id: z.string().regex(/^(?:goal-resume|goal-resume-v2):[a-f0-9]{64}$/).optional()
        .describe('Router-supplied immutable CStar goal-continuation receipt; never operator-authored request material'),
};

export const forgeExecuteSchema = {
    ...dispatchRequestSchema,
    callback_contract: dispatchCallbackSchema.describe('Callback packet contract; required for Forge execution'),
    spend_policy: forgeRequestSpendPolicySchema.describe('Canonical request spend policy; execute authority comes only from the request-bound root-user authorization reference and durable receipt'),
    forge_request_receipt_id: z.string().min(1).describe('Receipt id returned by cstar_forge_request; must start with dispatch-forge-'),
    forge_request_decision_id: z.string().min(1).describe('Decision id from the cstar_forge_request receipt'),
    forge_request_bead_id: z.string().optional().describe('Bead id from the cstar_forge_request receipt; must match bead_id when both are supplied'),
    execution_mode: z.enum(['no_op', 'live_authorized']).describe('no_op validates without live spend; live_authorized requires a durable immutable request and request-bound one-shot operator attestation'),
    execution_adapter_ref: z.string().optional().describe('Legacy-v2 compatibility adapter reference only; current v3 must omit this field and uses the codex-host state-only transport; unregistered or v3-supplied adapters fail closed'),
    operator_authorization_ref: z.string().optional().describe('Request-bound operator attestation reference; a nonempty string alone is not authority'),
    idempotency_key: z.string().min(1).describe('Caller-stable key for this exact execution attempt; replays never invoke the adapter twice'),
    retry_of_attempt_id: z.string().optional().describe('Kernel/router-populated parent for an exact independently validated FAILED_RETRYABLE pre-provider continuation; never operator-authored'),
};

const forgeNativeRunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/);

export const forgeSwarmStatusSchema = z.object({
    run_id: forgeNativeRunIdSchema,
}).strict();

export const forgeSwarmPlanSchema = z.object({
    run_id: forgeNativeRunIdSchema,
    control_receipt: forgeNativeControlReceiptSchema,
    plan: forgeNativePlanSchema,
}).strict();

export const forgeSwarmUpdateSchema = z.object({
    run_id: forgeNativeRunIdSchema,
    control_receipt: forgeNativeControlReceiptSchema,
    plan: forgeNativePlanSchema,
    worker_receipt: forgeNativeWorkerReceiptSchema,
}).strict();

export const forgeSwarmCompleteSchema = z.object({
    run_id: forgeNativeRunIdSchema,
    control_receipt: forgeNativeControlReceiptSchema,
    aggregate: forgeNativeDeliverySchema,
}).strict();

export const forgeSwarmTaskGraphNodeSchema = z.object({
    task_id: forgeNativeRunIdSchema,
    parent_task_id: forgeNativeRunIdSchema.nullable(),
    role: z.enum(['parent', 'leaf']),
    work_item_id: forgeNativeRunIdSchema.nullable(),
    requested_model: z.string().trim().min(1).max(256),
    requested_reasoning: z.string().trim().min(1).max(64),
    actual_identity: z.literal('unreported'),
    actual_identity_attested: z.literal(false),
    status: z.enum(['PLANNED', 'SPAWNED', 'RUNNING', 'SUCCEEDED', 'FAILED',
        'CANCELLED', 'UNKNOWN', 'COMPLETED']),
}).strict();

export const forgeSwarmCancelSchema = z.object({
    action: z.enum(['request', 'finalize']),
    run_id: forgeNativeRunIdSchema,
    control_receipt: forgeNativeControlReceiptSchema,
    plan: forgeNativePlanSchema.optional(),
    all_tasks_inspectable: z.boolean().optional(),
    observed_task_graph: z.array(forgeSwarmTaskGraphNodeSchema).max(4).optional(),
    reason: z.string().trim().min(1).max(256).optional(),
}).strict();
