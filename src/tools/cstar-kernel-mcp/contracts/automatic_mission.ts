import { z } from 'zod';

const boundedText = z.string().min(1).max(16_384);
const boundedReference = z.string().min(1).max(512);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ceiling = z.number().int().nonnegative().safe();
const expiry = z.number().int().positive().safe();

export const automaticMissionAdapterSchema = z.object({
    adapter_ref: boundedReference,
    capability: boundedReference.optional(),
    provider: boundedReference.optional(),
    requested_model: boundedReference.optional(),
}).strict();

export const automaticMissionCallbackSchema = z.object({
    callback_thread_id: boundedReference.optional(),
    expected_packet: boundedReference.optional(),
    callback_required: z.boolean().optional(),
}).strict();

export const automaticMissionValidatorSchema = z.object({
    validator_id: boundedReference.optional(),
    ticket_ref: boundedReference.optional(),
    evidence_root: boundedReference.optional(),
}).strict();

export const automaticMissionDesignSchema = z.object({
    description: boundedText.optional(),
    root_task: boundedReference.optional(),
    targets: z.array(boundedReference).max(256).optional(),
    target_paths: z.array(boundedReference).max(256).optional(),
    outputs: z.array(boundedReference).max(256).optional(),
    required_output_paths: z.array(boundedReference).max(256).optional(),
    prohibitions: z.array(boundedReference).max(256).optional(),
    prohibited_actions: z.array(boundedReference).max(256).optional(),
    retry_ceiling: ceiling.optional(),
    attempt_ceiling: ceiling.optional(),
    spend_ceiling: ceiling.optional(),
    expires_at: expiry.optional(),
    adapter: automaticMissionAdapterSchema.optional(),
    callback: automaticMissionCallbackSchema.optional(),
    validator: automaticMissionValidatorSchema.optional(),
}).strict();

export const automaticMissionConstraintsSchema = z.object({
    retry_ceiling: ceiling.optional(),
    attempt_ceiling: ceiling.optional(),
    spend_ceiling: ceiling.optional(),
    expires_at: expiry.optional(),
    expiry_at: expiry.optional(),
    max_retries: ceiling.optional(),
    max_attempts: ceiling.optional(),
    max_spend: ceiling.optional(),
    retry_limit: ceiling.optional(),
    attempt_limit: ceiling.optional(),
    spend_limit: ceiling.optional(),
}).strict();

export const automaticMissionRootRecordSchema = z.object({
    schema: z.literal('cstar.root_user_instruction_record.v1').optional(),
    record_id: boundedReference.optional(),
    thread_id: boundedReference,
    turn_id: boundedReference,
    timestamp: boundedReference,
    text: boundedText,
    content: z.array(z.object({ type: z.literal('input_text'), text: boundedText }).strict())
        .max(64).optional(),
    raw_line: z.string().max(4 * 1024 * 1024).optional(),
}).strict();

export const automaticMissionRootRecordInputSchema = automaticMissionRootRecordSchema;

/** Internal cstar_mission ingress.  It describes work; it never launches it. */
export const automaticMissionSchema = z.object({
    objective: boundedText,
    design: z.union([automaticMissionDesignSchema, boundedText]).nullable().optional(),
    constraints: automaticMissionConstraintsSchema.nullable().optional(),
    root_user_record: automaticMissionRootRecordInputSchema.optional(),
    root_user_records: z.array(automaticMissionRootRecordInputSchema).max(256).optional(),
    idempotency_key: boundedReference.optional(),
    compatibility_profile: z.enum(['cstar_mission_v1', 'legacy_singleton_v1']).optional(),
    action: z.enum(['draft', 'bind', 'materialize', 'queue_dispatch']).optional(),
    queue_dispatch: z.boolean().optional(),
}).strict();

export const cstarMissionSchema = automaticMissionSchema;
export const automaticMissionContractSchema = automaticMissionSchema;
export const automaticMissionRequestSchema = automaticMissionSchema;

export const automaticMissionIdentifiersSchema = z.object({
    mission_id: boundedReference,
    decision_id: boundedReference,
    bead_id: boundedReference,
    request_id: boundedReference,
    request_sha256: digest,
    idempotency_key: boundedReference,
    design_sha256: digest.nullable(),
    constraints_sha256: digest,
    binding_sha256: digest,
}).strict();

export const automaticMissionSetGrantSchema = z.object({
    schema: z.literal('cstar.mission_set_grant.v1'),
    grant_id: boundedReference,
    mission_id: boundedReference,
    decision_id: boundedReference,
    bead_id: boundedReference,
    request_id: boundedReference,
    design_sha256: digest,
    constraints_sha256: digest,
    root_task: boundedReference.nullable(),
    root_task_sha256: digest,
    targets: z.array(boundedReference),
    outputs: z.array(boundedReference),
    prohibitions: z.array(boundedReference),
    retry_ceiling: ceiling,
    attempt_ceiling: ceiling,
    spend_ceiling: ceiling,
    expires_at: expiry,
    root_user_thread_id: boundedReference,
    root_user_turn_id: boundedReference,
    root_user_record_sha256: digest,
    root_user_record_set_sha256: digest,
    root_user_record_count: z.number().int().positive(),
    selected_root_user_record_index: z.number().int().nonnegative(),
    authority_binding_sha256: digest,
    adapter: automaticMissionAdapterSchema.nullable(),
    callback: automaticMissionCallbackSchema.nullable(),
    validator: automaticMissionValidatorSchema.nullable(),
    status: z.enum(['BOUND', 'CONSUMED', 'REVOKED', 'EXPIRED']),
    issued_at: z.number().int().nonnegative(),
    consumed_at: z.number().int().nonnegative().optional(),
    revoked_at: z.number().int().nonnegative().optional(),
    revocation_reason: boundedText.optional(),
}).strict();

export const automaticMissionOutcomeSchema = z.object({
    outcome: z.enum([
        'ok', 'needs_input', 'guardrail_block', 'domain_terminal',
        'transport_error', 'internal_error',
    ]),
    kind: z.enum([
        'ok', 'needs_input', 'guardrail_block', 'domain_terminal',
        'transport_error', 'internal_error',
    ]),
    status: z.enum([
        'ok', 'needs_input', 'guardrail_block', 'domain_terminal',
        'transport_error', 'internal_error',
    ]),
    state: z.enum(['DRAFT', 'NEEDS_DESIGN', 'SET_BOUND', 'MATERIALIZED', 'DISPATCH_QUEUED']),
}).passthrough();

export type AutomaticMissionContractInput = z.infer<typeof automaticMissionSchema>;
export type AutomaticMissionSetGrantInput = z.infer<typeof automaticMissionSetGrantSchema>;
