import { z } from 'zod';

export const dispatchMetricSchema = z.object({
    name: z.string().min(1).describe('Metric name, e.g. precision, pass_rate, artifact_integrity'),
    threshold: z.string().min(1).describe('Acceptance threshold, e.g. >= 0.95 or zero P1/P2 blockers'),
    acceptance_rule: z.string().optional().describe('How PMT/CoS should judge this metric'),
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

export const dispatchCallbackSchema = z.object({
    expected_packet: z.string().min(1).describe('Required final report packet name'),
    callback_required: z.boolean().optional().describe('Defaults true'),
    callback_thread_id: z.string().optional().describe('Destination callback thread; defaults to source_callback_thread_id'),
});

export const dispatchRetrySchema = z.object({
    budget: z.number().int().min(0).describe('Allowed retry budget'),
    spent: z.number().int().min(0).optional().describe('Retries already spent'),
});

export const dispatchRequestSchema = {
    bead_id: z.string().optional().describe('CStar bead id anchoring the request'),
    decision_id: z.string().optional().describe('Decision id; generated if absent and bead_id is present'),
    owner_pmt_thread_id: z.string().min(1).describe('Pinned PMT thread that owns review/package state'),
    source_callback_thread_id: z.string().min(1).describe('Thread that must receive the compact callback packet'),
    objective: z.string().min(1).describe('Bounded work objective'),
    prompt: z.string().optional().describe('Prompt/mission text for the authorized surface'),
    target_paths: z.array(z.string()).optional().describe('Bounded target files/repos/paths'),
    system_under_test: z.string().optional().describe('System under test when relevant'),
    scope: z.string().min(1).describe('Scope boundary and project/spoke context'),
    authority_lane: z.enum(['green', 'yellow', 'red']).describe('Authority/risk lane'),
    required_metrics: z.array(dispatchMetricSchema).min(1).describe('Required metrics with thresholds'),
    artifact_expectations: z.array(z.string().min(1)).min(1).describe('Expected artifacts/reports/packages'),
    prohibited_actions: z.array(z.string().min(1)).min(1).describe('Actions explicitly forbidden to the dispatched surface'),
    requested_actions: z.array(z.string().min(1)).optional().describe('Actions the request asks the surface to perform; checked against prohibited_actions/red gates'),
    spend_policy: dispatchSpendPolicySchema.describe('Spend/live-source policy and retry cap'),
    live_source_policy: z.string().optional().describe('Additional live-source/source-adapter policy text'),
    retry_policy: dispatchRetrySchema.optional().describe('Decision retry budget/spent contract'),
    callback_contract: dispatchCallbackSchema.describe('Callback packet contract'),
    package_locks: z.array(dispatchPackageLockSchema).optional().describe('Optional package/hash locks'),
    dispatch_surface_ref: z.string().optional().describe('Optional explicit authorized surface path; missing paths fail closed'),
};

export const forgeExecuteSchema = {
    ...dispatchRequestSchema,
    forge_request_receipt_id: z.string().min(1).describe('Receipt id returned by cstar_forge_request; must start with dispatch-forge-'),
    forge_request_decision_id: z.string().min(1).describe('Decision id from the cstar_forge_request receipt'),
    forge_request_bead_id: z.string().optional().describe('Bead id from the cstar_forge_request receipt; must match bead_id when both are supplied'),
    execution_mode: z.enum(['no_op', 'live_authorized']).describe('no_op validates the execution contract without live spend; live_authorized invokes an approved adapter after all gates pass'),
    execution_adapter_ref: z.string().optional().describe('Explicit approved Forge/Hermes/MiniMax adapter reference; unregistered adapters fail closed'),
    operator_authorization_ref: z.string().optional().describe('Explicit operator approval reference required for live Forge execution'),
};
