import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { verifySterlingMandate } from '../../../src/node/core/sterling_mandate.js';
import { assertValidationRecordAuthority } from '../../../src/tools/pennyone/intel/validation_record_authority.js';
import { verifyHostArtifactValidationEvidence } from '../../../src/tools/cstar-kernel-mcp/tools/host_artifact_validation.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { isValidationEvidenceManifestV4StructurallyValid } from '../../../src/types/validation_evidence.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const roots: string[] = [];
const SHA = 'a'.repeat(64);
const originalRegistryRoot = registry.getRoot();

function writeJson(root: string, name: string, value: unknown): { path: string; sha256: string } {
    const candidate = path.join(root, name);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(candidate, content);
    return { path: candidate, sha256: createHash('sha256').update(content).digest('hex') };
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-host-artifact-validation-'));
    roots.push(root);
    const beadId = 'bead:mcp:host-artifact-test';
    const validationId = 'HOST-ARTIFACT-VALIDATION-001';
    const controller = writeJson(root, 'controller.json', {
        schema: 'test.controller.v1', bead: beadId, controller: 'OS',
        result: 'PASS_PENDING_INDEPENDENT_VALIDATION',
    });
    const validator = writeJson(root, 'validator.json', {
        schema: 'test.validator.v1', validation_id: validationId, verdict: 'ACCEPTED',
        topology: 'FRESH_OUTSIDE_IMPLEMENTATION_ANCESTRY', protected_effects: 0,
    });
    const evidence = writeJson(root, 'evidence.json', { tests: '26/26', protected_effects: 0 });
    const payload = {
        artifacts: [controller, validator, evidence],
        checks: [{ name: 'integrated_suite', status: 'pass' as const, evidence_path: evidence.path, sha256: evidence.sha256 }],
    };
    const receipt = {
        controller_receipt_path: controller.path,
        controller_receipt_sha256: controller.sha256,
        controller_id: 'OS',
        executor_id: 'host-native-work-cell',
        validator_receipt_path: validator.path,
        validator_receipt_sha256: validator.sha256,
        validator_id: validationId,
    };
    const subject = {
        repository_id: 'cstar', bead_id: beadId, target_path: null,
        validation_id: validationId, verdict: 'ACCEPTED',
    };
    const identity = {
        source: 'codex_request_meta' as const,
        session_id: 'session', thread_id: 'recorder-thread', turn_id: 'recorder-turn',
        thread_source: 'user' as const,
        turn_record_sha256: SHA, turn_record_set_sha256: SHA, turn_record_count: 1,
        turn_first_timestamp: '2026-08-19T00:00:00.000Z', turn_timestamp: '2026-08-19T00:00:00.000Z',
    };
    return { root, payload, receipt, subject, identity };
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRegistryRoot);
    cleanupOperatorAuthorizationFixtures();
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('host-native artifact validation', () => {
    it('persists a kernel-verifiable V4 authority receipt without Forge or transcript lookup', () => {
        const value = fixture();
        const verified = verifyHostArtifactValidationEvidence(
            value.root, value.payload, value.receipt, value.subject, value.identity,
        );
        assert.equal(verified.manifest.schema, 'cstar.validation-evidence.v4');
        assert.equal(verified.validator_identity_source, 'test_fixture');
        assert.equal(isValidationEvidenceManifestV4StructurallyValid(verified.manifest), true);
        assertValidationRecordAuthority({
            authority_class: 'verified_v4',
            evidence_sha256: verified.evidence_sha256,
            validator_identity: verified.validator_identity,
            validator_identity_source: verified.validator_identity_source,
            evidence_manifest: verified.manifest,
        }, verified);
    });

    it('records a verified V4 result through the public result handler without a Forge receipt', async () => {
        const value = fixture();
        registry.setRoot(value.root);
        const db = database.getWritableDb(value.root);
        const repoId = buildHallRepositoryId(normalizeHallPath(value.root));
        const now = Date.now();
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'VALIDATION', ?, 'Host artifact public handler test', 'READY_FOR_REVIEW', ?, ?)
        `).run(value.subject.bead_id, repoId, path.join(value.root, 'target.txt'), now, now);
        const session = createSession({
            textParts: ['Record the independently validated host-native work result.'],
        });

        const result = await handleRecordResult({
            bead_id: value.subject.bead_id,
            verdict: 'ACCEPTED',
            validation_id: value.subject.validation_id,
            host_artifact_validation_receipt: value.receipt,
            validation_evidence: value.payload,
        }, validRequestContext(session.threadId, session.turnId));

        assert.equal(result.isError, undefined, result.content[0].text);
        const parsed = JSON.parse(result.content[0].text);
        assert.equal(parsed.status, 'recorded_verified');
        assert.equal(parsed.validation_authority, 'verified_v4');
        assert.equal(parsed.authoritative, true);
        assert.equal(parsed.forge_validation, undefined);
        const stored = db.prepare(`
            SELECT verdict, authority_class, validator_identity_source
            FROM hall_validation_runs WHERE validation_id = ?
        `).get(value.subject.validation_id) as Record<string, unknown>;
        assert.equal(stored.verdict, 'ACCEPTED');
        assert.equal(stored.authority_class, 'verified_v4');
        assert.ok(['host_artifact_receipt', 'test_fixture'].includes(String(stored.validator_identity_source)));
        const targetPath = path.join(value.root, 'target.txt');
        const mandate = verifySterlingMandate({
            bead_id: value.subject.bead_id,
            repo_id: repoId,
            target_kind: 'VALIDATION',
            target_path: targetPath,
            rationale: 'Host artifact public handler test',
            status: 'READY_FOR_REVIEW',
            created_at: now,
            updated_at: now,
        }, { audit: { validation_id: value.subject.validation_id } }, value.root, Date.now(), value.root);
        assert.equal(mandate.verdict, 'ACCEPTED');
        assert.ok(mandate.legs.every((leg) => leg.status === 'satisfied'));
    });

    it('rejects a validator identity that overlaps the controller or executor', () => {
        const value = fixture();
        assert.throws(() => verifyHostArtifactValidationEvidence(
            value.root,
            value.payload,
            { ...value.receipt, controller_id: value.receipt.validator_id },
            value.subject,
            value.identity,
        ), /host_artifact_validation_independence_invalid/);
    });

    it('rejects a non-accepted or in-ancestry validator receipt', () => {
        const value = fixture();
        const rejected = writeJson(value.root, 'validator-rejected.json', {
            validation_id: value.subject.validation_id,
            verdict: 'REJECTED',
            topology: 'IMPLEMENTATION_ANCESTRY',
            protected_effects: 0,
        });
        const payload = {
            ...value.payload,
            artifacts: [value.payload.artifacts[0], rejected, value.payload.artifacts[2]],
        };
        assert.throws(() => verifyHostArtifactValidationEvidence(
            value.root,
            payload,
            {
                ...value.receipt,
                validator_receipt_path: rejected.path,
                validator_receipt_sha256: rejected.sha256,
            },
            value.subject,
            value.identity,
        ), /host_artifact_validator_receipt_scope_invalid/);
    });
});
