import type Database from 'better-sqlite3';

import {
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    VALIDATION_EVIDENCE_SHA256,
    type CStarValidationRunRecord,
} from '../../../types/validation_evidence.js';
import {
    consumeKernelVerifiedValidationEvidence,
    type VerifiedValidationEvidence,
} from './validation_evidence.js';

function json(value: unknown): string {
    return JSON.stringify(value ?? {});
}

export function saveValidationRunToDb(
    db: Database.Database,
    record: CStarValidationRunRecord,
    kernelEvidence?: VerifiedValidationEvidence,
): void {
    if (record.authority_class === 'verified') {
        throw new Error('verified_validation_v1_retired');
    }
    if (record.authority_class === 'verified_v2') {
        const manifest = record.evidence_manifest;
        if (
            !manifest
            || manifest.schema !== 'cstar.validation-evidence.v2'
            || !isValidationEvidenceManifestV2StructurallyValid(manifest)
            || !VALIDATION_EVIDENCE_SHA256.test(record.evidence_sha256 ?? '')
            || manifest.validator_identity !== record.validator_identity
            || manifest.validator_identity_source !== record.validator_identity_source
            || hashValidationEvidenceManifest(manifest) !== record.evidence_sha256
        ) {
            throw new Error('verified_validation_v2_manifest_invalid');
        }
        const syntheticFixture = manifest.validator_identity_source === 'test_fixture'
            && Boolean(process.env.NODE_TEST_CONTEXT);
        const exactKernelProof = kernelEvidence?.manifest === manifest
            && kernelEvidence.evidence_sha256 === record.evidence_sha256
            && kernelEvidence.validator_identity === record.validator_identity
            && kernelEvidence.validator_identity_source === record.validator_identity_source;
        if (!syntheticFixture && !exactKernelProof) {
            throw new Error('verified_validation_v2_kernel_proof_required');
        }
        if (kernelEvidence && (!exactKernelProof
            || !consumeKernelVerifiedValidationEvidence(kernelEvidence))) {
            throw new Error('verified_validation_v2_kernel_proof_invalid');
        }
    }

    const existing = db.prepare(`
        SELECT repo_id, bead_id, verdict, authority_class, evidence_sha256,
               validator_identity, validator_identity_source, evidence_manifest_json
        FROM hall_validation_runs WHERE validation_id = ?
    `).get(record.validation_id) as Record<string, unknown> | undefined;
    if (existing) {
        if (existing.repo_id !== record.repo_id || (existing.bead_id ?? null) !== (record.bead_id ?? null)) {
            throw new Error('validation_id_scope_conflict');
        }
        if (existing.authority_class === 'verified' || existing.authority_class === 'verified_v2') {
            const sameVerifiedReceipt = record.authority_class === existing.authority_class
                && existing.verdict === record.verdict
                && existing.evidence_sha256 === record.evidence_sha256
                && existing.validator_identity === record.validator_identity
                && existing.validator_identity_source === record.validator_identity_source
                && String(existing.evidence_manifest_json ?? '') === json(record.evidence_manifest);
            if (!sameVerifiedReceipt) throw new Error('verified_validation_receipt_immutable');
            return;
        }
    }

    db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, scan_id, bead_id, target_path, verdict,
            sprt_verdict, pre_scores_json, post_scores_json, benchmark_json, notes,
            authority_class, evidence_sha256, validator_identity, validator_identity_source,
            evidence_manifest_json, created_at, legacy_trace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(validation_id) DO UPDATE SET
            verdict = excluded.verdict,
            sprt_verdict = excluded.sprt_verdict,
            notes = excluded.notes,
            post_scores_json = excluded.post_scores_json,
            authority_class = excluded.authority_class,
            evidence_sha256 = excluded.evidence_sha256,
            validator_identity = excluded.validator_identity,
            validator_identity_source = excluded.validator_identity_source,
            evidence_manifest_json = excluded.evidence_manifest_json
    `).run(
        record.validation_id,
        record.repo_id,
        record.scan_id ?? null,
        record.bead_id ?? null,
        record.target_path ?? null,
        record.verdict,
        record.sprt_verdict ?? null,
        json(record.pre_scores),
        json(record.post_scores),
        json(record.benchmark),
        record.notes ?? null,
        record.authority_class ?? 'legacy_unverified',
        record.evidence_sha256 ?? null,
        record.validator_identity ?? null,
        record.validator_identity_source ?? null,
        record.evidence_manifest ? json(record.evidence_manifest) : null,
        record.created_at,
        record.legacy_trace_id ?? null,
    );
}
