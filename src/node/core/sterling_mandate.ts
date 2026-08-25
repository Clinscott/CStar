import { createHash } from 'node:crypto';
import path from 'node:path';

import { database } from '../../tools/pennyone/intel/database.js';
import { assertForgeValidationManifestCurrent } from '../../tools/pennyone/intel/forge_validation_controller.js';
import {
    readBoundedUtf8FileInside,
    resolveExistingRelativePathInside,
} from '../../tools/cstar-kernel-mcp/contracts/runtime.js';
import type {
    HallBeadRecord,
    HallValidationEvidenceManifest,
    HallValidationRun,
} from '../../types/hall.js';
import {
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    isValidationEvidenceManifestV3StructurallyValid,
    VALIDATION_EVIDENCE_SHA256,
} from '../../types/validation_evidence.js';

export interface MandateAuditProof {
    validation_id?: string;
}

export interface MandateEvidence {
    lore_paths?: string[];
    isolation_paths?: string[];
    audit?: MandateAuditProof;
}

export interface MandateLegReport {
    leg: 'lore' | 'isolation' | 'audit';
    status: 'satisfied' | 'unsatisfied';
    reason: string;
    artifacts?: string[];
}

export interface MandateVerdict {
    verdict: 'ACCEPTED' | 'REJECTED';
    bead_id: string;
    hub_root: string;
    legs: MandateLegReport[];
    reasons: string[];
    evaluated_at: number;
}

interface VerifiedMandateArtifact {
    relative_path: string;
    absolute_path: string;
    sha256: string;
    content: string;
}

const MAX_MANDATE_ARTIFACTS = 25;
const MAX_MANDATE_ARTIFACT_BYTES = 1024 * 1024;
const MAX_VALIDATION_AGE_MS = 24 * 60 * 60 * 1000;
const GHERKIN_KEYWORD_RE = /^\s*(Feature|Scenario Outline|Scenario|Background|Rule)\s*:/m;

function unsatisfied(leg: MandateLegReport['leg'], reason: string): MandateLegReport {
    return { leg, status: 'unsatisfied', reason };
}

function normalizeDeclaredPaths(paths: string[] | undefined): string[] | null {
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_MANDATE_ARTIFACTS) return null;
    const normalized = paths.map((candidate) => candidate.trim().replace(/\\/g, '/'));
    if (new Set(normalized).size !== normalized.length) return null;
    return normalized;
}

function readDeclaredArtifact(
    hubRoot: string,
    declaredPath: string,
    kind: 'lore' | 'isolation',
): VerifiedMandateArtifact | null {
    if (
        !declaredPath
        || path.isAbsolute(declaredPath)
        || declaredPath.includes('\0')
        || declaredPath.startsWith('../')
    ) return null;
    if (kind === 'lore' && !declaredPath.endsWith('.feature')) return null;
    if (
        kind === 'isolation'
        && (!declaredPath.startsWith('tests/') || !/\.(?:test\.ts|py)$/.test(declaredPath))
    ) return null;
    try {
        const absolutePath = resolveExistingRelativePathInside(hubRoot, declaredPath, 'file');
        const file = readBoundedUtf8FileInside(hubRoot, absolutePath, MAX_MANDATE_ARTIFACT_BYTES);
        return {
            relative_path: path.relative(path.resolve(hubRoot), absolutePath).replace(/\\/g, '/'),
            absolute_path: absolutePath,
            sha256: createHash('sha256').update(file.content, 'utf-8').digest('hex'),
            content: file.content,
        };
    } catch {
        return null;
    }
}

function checkDeclaredArtifacts(
    evidence: MandateEvidence,
    hubRoot: string,
    kind: 'lore' | 'isolation',
): { report: MandateLegReport; files: VerifiedMandateArtifact[] } {
    const declared = normalizeDeclaredPaths(kind === 'lore' ? evidence.lore_paths : evidence.isolation_paths);
    if (!declared) return { report: unsatisfied(kind, `${kind}_artifacts_required_or_invalid`), files: [] };
    const files = declared.map((candidate) => readDeclaredArtifact(hubRoot, candidate, kind));
    if (files.some((file) => file === null)) {
        return { report: unsatisfied(kind, `${kind}_artifact_containment_or_integrity_failed`), files: [] };
    }
    const verified = files as VerifiedMandateArtifact[];
    if (kind === 'lore' && verified.some((file) => !GHERKIN_KEYWORD_RE.test(file.content))) {
        return { report: unsatisfied(kind, 'lore_artifact_is_not_gherkin'), files: [] };
    }
    return {
        report: {
            leg: kind,
            status: 'satisfied',
            reason: `${kind}_artifacts_verified`,
            artifacts: verified.map((file) => file.relative_path),
        },
        files: verified,
    };
}

function manifestIsAuthoritative(
    run: HallValidationRun,
    bead: HallBeadRecord,
    manifest: HallValidationEvidenceManifest,
    hubRoot: string,
    now: number,
): boolean {
    const forgeV2 = manifest.schema === 'cstar.validation-evidence.v2'
        && isValidationEvidenceManifestV2StructurallyValid(manifest);
    const hostV3 = manifest.schema === 'cstar.validation-evidence.v3'
        && isValidationEvidenceManifestV3StructurallyValid(manifest);
    if (!forgeV2 && !hostV3) return false;
    const identitySourceAllowed = manifest.validator_identity_source === 'codex_request_meta'
        || manifest.validator_identity_source === 'codex_subagent_receipt'
        || (manifest.validator_identity_source === 'test_fixture' && Boolean(process.env.NODE_TEST_CONTEXT));
    const authorityMatchesSchema = forgeV2
        ? run.authority_class === 'verified_v2' : run.authority_class === 'verified_v3';
    const independenceMatches = forgeV2
        ? manifest.request_thread_id !== manifest.independence.requester_thread_id
            && manifest.request_thread_id !== manifest.independence.executor_thread_id
        : manifest.subject.target_path === (bead.target_path ?? null)
            && manifest.subject.validation_id === run.validation_id
            && manifest.independence.validator_parent_thread_id
                === manifest.independence.recorder_thread_id
            && manifest.independence.recorder_thread_id === manifest.request_thread_id
            && manifest.independence.validator_thread_id
                !== manifest.independence.recorder_thread_id;
    const structurallyAuthoritative = run.repo_id === bead.repo_id
        && run.bead_id === bead.bead_id
        && (run.verdict === 'ACCEPTED' || run.verdict === 'SUCCESS')
        && authorityMatchesSchema
        && run.validator_identity === manifest.validator_identity
        && run.validator_identity_source === manifest.validator_identity_source
        && Boolean(run.validator_identity?.trim())
        && identitySourceAllowed
        && manifest.subject.repository_id === bead.repo_id
        && manifest.subject.bead_id === bead.bead_id
        && independenceMatches
        && manifest.artifacts.length > 0
        && manifest.artifacts.length <= 50
        && manifest.checks.length > 0
        && manifest.checks.length <= 25
        && manifest.checks.every((check) => check.status === 'pass')
        && VALIDATION_EVIDENCE_SHA256.test(run.evidence_sha256 ?? '')
        && hashValidationEvidenceManifest(manifest) === run.evidence_sha256
        && Number.isFinite(run.created_at)
        && run.created_at >= bead.created_at
        && run.created_at <= now + 60_000
        && now - run.created_at <= MAX_VALIDATION_AGE_MS;
    if (!structurallyAuthoritative) return false;
    if (hostV3) return true;
    try {
        assertForgeValidationManifestCurrent(database.getReadDb(hubRoot), manifest);
        return true;
    } catch {
        return false;
    }
}

function manifestFilesRemainValid(
    hubRoot: string,
    manifest: HallValidationEvidenceManifest,
): boolean {
    const files = [
        ...(manifest.schema === 'cstar.validation-evidence.v3' ? [{
            path: manifest.subject.validation_manifest_path,
            sha256: manifest.subject.validation_manifest_sha256,
        }] : []),
        ...manifest.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 })),
        ...manifest.checks.map((check) => ({ path: check.evidence_path, sha256: check.sha256 })),
    ];
    try {
        return files.every((entry) => {
            if (!VALIDATION_EVIDENCE_SHA256.test(entry.sha256)) return false;
            const file = readBoundedUtf8FileInside(hubRoot, entry.path, MAX_MANDATE_ARTIFACT_BYTES);
            return createHash('sha256').update(file.content, 'utf-8').digest('hex') === entry.sha256;
        });
    } catch {
        return false;
    }
}

function auditContainsDeclaredArtifacts(
    manifest: HallValidationEvidenceManifest,
    evidenceRoot: string,
    files: VerifiedMandateArtifact[],
): boolean {
    const artifactPairs = new Set(
        manifest.artifacts.map((entry) => `${path.resolve(evidenceRoot, entry.path)}\0${entry.sha256}`),
    );
    return files.every((file) => artifactPairs.has(`${path.resolve(file.absolute_path)}\0${file.sha256}`));
}

function checkAudit(
    bead: HallBeadRecord,
    evidence: MandateEvidence,
    hubRoot: string,
    evidenceRoot: string,
    files: VerifiedMandateArtifact[],
    now: number,
): MandateLegReport {
    const audit = evidence.audit;
    if (
        !audit
        || Object.keys(audit).some((key) => key !== 'validation_id')
    ) {
        return unsatisfied('audit', 'unsupported_audit_proof_fields');
    }
    const validationId = audit.validation_id?.trim();
    if (!validationId) return unsatisfied('audit', 'verified_validation_id_required');
    const run = database.getValidationRunById(validationId);
    const manifest = run?.evidence_manifest;
    if (!run || !manifest || !manifestIsAuthoritative(run, bead, manifest, hubRoot, now)) {
        return unsatisfied('audit', 'validation_receipt_not_authoritative_for_bead');
    }
    if (!manifestFilesRemainValid(evidenceRoot, manifest)) {
        return unsatisfied('audit', 'validation_evidence_files_changed_or_unavailable');
    }
    if (!auditContainsDeclaredArtifacts(manifest, evidenceRoot, files)) {
        return unsatisfied('audit', 'lore_or_isolation_not_bound_to_validation_receipt');
    }
    return {
        leg: 'audit',
        status: 'satisfied',
        reason: 'independent_validation_receipt_verified',
        artifacts: [validationId],
    };
}

export function verifySterlingMandate(
    bead: HallBeadRecord,
    evidence: MandateEvidence | undefined,
    hubRoot: string,
    now = Date.now(),
    evidenceRoot = hubRoot,
): MandateVerdict {
    const fresh = evidence ?? {};
    const lore = checkDeclaredArtifacts(fresh, evidenceRoot, 'lore');
    const isolation = checkDeclaredArtifacts(fresh, evidenceRoot, 'isolation');
    const audit = checkAudit(
        bead,
        fresh,
        hubRoot,
        evidenceRoot,
        [...lore.files, ...isolation.files],
        now,
    );
    const legs = [lore.report, isolation.report, audit];
    const reasons = legs
        .filter((leg) => leg.status === 'unsatisfied')
        .map((leg) => `[${leg.leg}] ${leg.reason}`);
    return {
        verdict: reasons.length === 0 ? 'ACCEPTED' : 'REJECTED',
        bead_id: bead.bead_id,
        hub_root: hubRoot,
        legs,
        reasons,
        evaluated_at: now,
    };
}
