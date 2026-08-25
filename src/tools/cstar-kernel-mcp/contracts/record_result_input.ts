import { z } from 'zod';

export const reliabilityReceiptSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).strict().describe('Hash-bound host SPRT/Gungnir receipt; it must also appear in the independent validation manifest artifacts.');

export const recordResultInputZodSchema = z.object({
    bead_id: z.string().describe('Target bead id'),
    verdict: z.enum(['ACCEPTED', 'REJECTED', 'INCONCLUSIVE', 'SUCCESS', 'FAILURE']).describe('Reported validation verdict'),
    notes: z.string().optional().describe('Compact validation notes'),
    validation_id: z.string().optional().describe('Caller-stable validation id for idempotent recording'),
    forge_execution_receipt_id: z.string().optional().describe('Forge execution receipt to finalize only after this independent validation'),
    host_validation_receipt: z.object({
        validator_thread_id: z.string().regex(/^[0-9a-f-]{36}$/i),
        validator_turn_id: z.string().regex(/^[0-9a-f-]{36}$/i),
        manifest_path: z.string().min(1),
        manifest_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    }).strict().optional().describe('Depth-one validator receipt recorded by the canonical root CoS for host-workflow validation'),
    host_artifact_validation_receipt: z.object({
        controller_receipt_path: z.string().min(1),
        controller_receipt_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        controller_id: z.string().min(1).max(240),
        executor_id: z.string().min(1).max(240),
        validator_receipt_path: z.string().min(1),
        validator_receipt_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        validator_id: z.string().min(1).max(240),
    }).strict().optional().describe('Hash-bound host-native controller and independent-validator artifacts; no Forge receipt or transcript lookup is required'),
    validation_ticket: z.string().min(1).max(256).optional()
        .describe('Opaque one-use kernel ticket required for positive Forge validation'),
    validation_ticket_request: z.object({
        execution_receipt_id: z.string().min(1),
        attempt_id: z.string().min(1),
        scope_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        expires_at: z.number().int().positive().optional(),
        validator_thread_id: z.string().min(1).optional()
            .describe('Intended independent validator thread when the kernel is minting for a verified host receipt'),
        validator_turn_id: z.string().min(1).optional()
            .describe('Intended independent validator turn when the kernel is minting for a verified host receipt'),
    }).strict().optional().describe('Strict request for the kernel to mint one validator ticket for a delivered Forge receipt'),
    validation_evidence: z.object({
        artifacts: z.array(z.object({
            path: z.string().min(1),
            sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        })).min(1).max(50),
        checks: z.array(z.object({
            name: z.string().min(1).max(240),
            status: z.enum(['pass', 'fail']),
            evidence_path: z.string().min(1),
            sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        })).min(1).max(25),
    }).strict().optional().describe('Hash-verified local evidence; CStar binds it to an exact supported work or validation receipt'),
    reliability_receipt: reliabilityReceiptSchema.optional(),
}).strict();

export const recordResultInputSchema = recordResultInputZodSchema.shape;
export type RecordResultInput = z.infer<typeof recordResultInputZodSchema>;
