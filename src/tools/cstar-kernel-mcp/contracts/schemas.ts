import { z } from 'zod';
import { researcherAuthorityBindingSchema } from './researcher_host_completion.js';

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

/** Strict internal projection emitted by the native Researcher request lane. */
export const researcherNativeRequestSchema = z.object({
    schema: z.literal('cstar.researcher_request.v2'),
    contract_version: z.literal('v2'),
    bead_id: z.string().min(1).optional(),
    set_id: z.string().min(1).optional(),
    decision_id: z.string().min(1),
    authorization_id: z.string().min(1).nullable().optional(),
    authorization_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    authorization_expires_at: z.number().int().nonnegative().nullable().optional(),
    source_callback_thread_id: z.string().min(1),
    objective: z.string().trim().min(1).max(8_000),
    research_questions: z.array(z.string().trim().min(1)).min(1),
    target_spokes: z.array(z.string().trim().min(1)),
    primary_requested_action: z.literal('report'),
    target_paths: z.array(z.string()),
    scope: z.string().trim().min(1),
    system_under_test: z.string().nullable(),
    authority_lane: z.enum(['green', 'yellow', 'red']),
    source_grants: z.array(z.record(z.string(), z.unknown())),
    source_budget: z.record(z.string(), z.unknown()),
    spend_policy: z.record(z.string(), z.unknown()),
    retry_policy: z.record(z.string(), z.unknown()),
    adapter_binding: z.record(z.string(), z.unknown()).nullable().optional(),
    output_boundary: z.record(z.string(), z.unknown()).nullable().optional(),
    authority_binding: researcherAuthorityBindingSchema.optional(),
    selector: z.object({
        requested_model: z.literal('gpt-5.6-luna'),
        requested_reasoning: z.literal('max'),
        selector_status: z.literal('enforced'),
        actual_identity: z.literal('unreported'),
    }).strict(),
    expected_artifacts: z.array(z.string().trim().min(1)).min(1),
    metrics: z.array(dispatchMetricSchema).min(1),
    prohibitions: z.array(z.string().trim().min(1)).min(1),
    idempotency_key: z.string().min(8),
    request_id: z.string().min(1),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((request, context) => {
    const authFields = [request.authorization_id, request.authorization_sha256,
        request.authorization_expires_at];
    if (authFields.some((value) => value !== undefined && value !== null)
        && authFields.some((value) => value === undefined || value === null)) {
        context.addIssue({ code: 'custom', path: ['authorization_id'],
            message: 'Researcher authorization fields must be supplied together.' });
    }
    if (request.authority_binding && (
        request.authority_binding.request_id !== request.request_id
        || request.authority_binding.request_sha256 !== request.request_sha256
        || request.authority_binding.bead_id !== request.bead_id
        || request.authority_binding.set_id !== request.set_id
        || request.authority_binding.decision_id !== request.decision_id
        || request.authority_binding.authorization_id !== request.authorization_id
        || request.authority_binding.authorization_sha256 !== request.authorization_sha256
        || request.authority_binding.authorization_expires_at !== request.authorization_expires_at
    )) context.addIssue({ code: 'custom', path: ['authority_binding'],
        message: 'Researcher authority binding must match the canonical request.' });
});

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
