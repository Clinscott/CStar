import type { HallValidationEvidenceManifest } from '../../../types/validation_evidence.js';
import {
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    isValidationEvidenceManifestV3StructurallyValid,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import {
    consumeKernelVerifiedValidationEvidence,
    type VerifiedValidationEvidence,
} from '../../cstar-kernel-mcp/tools/validation_evidence.js';

export interface ValidationAuthorityRecord {
    authority_class?: string;
    evidence_sha256?: string;
    validator_identity?: string;
    validator_identity_source?: string;
    evidence_manifest?: HallValidationEvidenceManifest;
}

export function isImmutableValidationAuthority(value: unknown): boolean {
    return value === 'verified' || value === 'verified_v2' || value === 'verified_v3';
}

export function assertValidationRecordAuthority(
    record: ValidationAuthorityRecord,
    kernelEvidence?: VerifiedValidationEvidence,
): void {
    if (record.authority_class === 'verified') throw new Error('verified_validation_v1_retired');
    if (record.authority_class !== 'verified_v2' && record.authority_class !== 'verified_v3') return;
    const manifest = record.evidence_manifest;
    const errorPrefix = record.authority_class === 'verified_v2'
        ? 'verified_validation_v2' : 'verified_validation_v3';
    const expectedSchema = record.authority_class === 'verified_v2'
        ? 'cstar.validation-evidence.v2' : 'cstar.validation-evidence.v3';
    const structurallyValid = expectedSchema === 'cstar.validation-evidence.v2'
        ? isValidationEvidenceManifestV2StructurallyValid(manifest)
        : isValidationEvidenceManifestV3StructurallyValid(manifest);
    if (
        !manifest
        || manifest.schema !== expectedSchema
        || !structurallyValid
        || !VALIDATION_EVIDENCE_SHA256.test(record.evidence_sha256 ?? '')
        || manifest.validator_identity !== record.validator_identity
        || manifest.validator_identity_source !== record.validator_identity_source
        || hashValidationEvidenceManifest(manifest) !== record.evidence_sha256
    ) {
        throw new Error(`${errorPrefix}_manifest_invalid`);
    }
    const syntheticFixture = manifest.validator_identity_source === 'test_fixture'
        && Boolean(process.env.NODE_TEST_CONTEXT);
    const exactKernelProof = kernelEvidence?.manifest === manifest
        && kernelEvidence.evidence_sha256 === record.evidence_sha256
        && kernelEvidence.validator_identity === record.validator_identity
        && kernelEvidence.validator_identity_source === record.validator_identity_source;
    if (!syntheticFixture && !exactKernelProof) {
        throw new Error(`${errorPrefix}_kernel_proof_required`);
    }
    if (kernelEvidence && (!exactKernelProof
        || !consumeKernelVerifiedValidationEvidence(kernelEvidence))) {
        throw new Error(`${errorPrefix}_kernel_proof_invalid`);
    }
}
