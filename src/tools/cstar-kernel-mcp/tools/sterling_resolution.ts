import type { HallBeadRecord } from '../../../types/hall.js';
import type { SovereignBead } from '../../../types/bead.js';
import {
    verifySterlingMandate,
    type MandateEvidence,
    type MandateVerdict,
} from '../../../node/core/sterling_mandate.js';
import { database } from '../../pennyone/intel/database.js';
import { CODE_ROOT } from '../contracts/runtime.js';

export interface SterlingMandateAuditEntry {
    verdict: MandateVerdict['verdict'];
    evaluated_at: number;
    legs: MandateVerdict['legs'];
    reasons: string[];
    actor: string;
}

function hallBead(bead: SovereignBead | HallBeadRecord): HallBeadRecord {
    if ('bead_id' in bead) return bead;
    return {
        bead_id: bead.id,
        repo_id: bead.repo_id,
        rationale: bead.rationale,
        status: bead.status,
        target_path: bead.target_path,
        baseline_scores: bead.baseline_scores,
        metadata: bead.metadata,
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    } as HallBeadRecord;
}

export function gateSterlingResolution(input: {
    bead: SovereignBead | HallBeadRecord;
    evidence: MandateEvidence | undefined;
    resolved_validation_id: string | undefined;
    hub_root: string;
    evidence_root?: string;
    actor: string;
    now?: number;
}): SterlingMandateAuditEntry {
    const validationId = input.evidence?.audit?.validation_id?.trim();
    if (!validationId || input.resolved_validation_id !== validationId) {
        throw new Error('sterling_validation_id_must_match_resolved_validation_id');
    }
    const validation = database.getValidationRunById(validationId);
    const evidenceRoot = input.evidence_root
        ?? (validation?.evidence_manifest?.schema === 'cstar.validation-evidence.v3'
            ? CODE_ROOT : input.hub_root);
    const verdict = verifySterlingMandate(
        hallBead(input.bead),
        input.evidence,
        input.hub_root,
        input.now ?? Date.now(),
        evidenceRoot,
    );
    if (verdict.verdict === 'REJECTED') {
        throw new Error(
            `Sterling Mandate REJECTED for bead '${verdict.bead_id}': `
            + `${verdict.reasons.join('; ')}. Provide fresh contained lore_paths and `
            + 'isolation_paths bound to the exact independent validation receipt.',
        );
    }
    return {
        verdict: verdict.verdict,
        evaluated_at: verdict.evaluated_at,
        legs: verdict.legs,
        reasons: verdict.reasons,
        actor: input.actor,
    };
}
