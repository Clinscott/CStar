import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { verifySterlingMandate, type MandateEvidence } from '../../../src/node/core/sterling_mandate.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { resolveValidationEvidenceRoot } from '../../../src/tools/cstar-kernel-mcp/contracts/validation_evidence_root.js';
import type {
    HallBeadRecord,
    HallValidationEvidenceManifestV3,
    HallValidationRun,
} from '../../../src/types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../../src/types/validation_evidence.js';

const roots: string[] = [];
const previousNodeTestContext = process.env.NODE_TEST_CONTEXT;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function makeRoot(label: string): string {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), `cstar-${label}-`));
    roots.push(root);
    return root;
}

function writeFile(root: string, relativePath: string, content: string): string {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
    return absolutePath;
}

function repositoryId(root: string): string {
    return buildHallRepositoryId(normalizeHallPath(path.resolve(root)));
}

function fixture() {
    const controlRoot = makeRoot('sterling-control');
    const evidenceRoot = path.join(controlRoot, 'CStar', 'work', 'nested-luna');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const repoId = repositoryId(controlRoot);
    const bead: HallBeadRecord = {
        bead_id: 'bead:test:sterling-root-binding',
        repo_id: repoId,
        target_kind: 'VALIDATION',
        rationale: 'Synthetic evidence-root binding.',
        status: 'READY_FOR_REVIEW',
        created_at: Date.now() - 1_000,
        updated_at: Date.now() - 500,
    };
    const loreRelative = 'tests/features/root-binding.feature';
    const isolationRelative = 'tests/unit/root-binding.test.ts';
    const checkRelative = 'work/evidence/root-binding-check.txt';
    const validationManifestRelative = 'work/evidence/validation-manifest.json';
    const lorePath = writeFile(evidenceRoot, loreRelative, 'Feature: Root binding\n  Scenario: exact root\n');
    const isolationPath = writeFile(evidenceRoot, isolationRelative, 'export const rootBinding = true;\n');
    const checkPath = writeFile(evidenceRoot, checkRelative, 'focused root binding passed\n');
    const validationManifestContent = '{"schema":"cstar.independent_validation_input.v1"}\n';
    const validationManifestPath = writeFile(
        evidenceRoot,
        validationManifestRelative,
        validationManifestContent,
    );
    const validationManifestSha256 = sha256(validationManifestContent);
    const now = Date.now();
    const validatorThreadId = 'test-sterling-root-validator';
    const validatorTurnId = 'test-sterling-root-turn';
    const manifest: HallValidationEvidenceManifestV3 = {
        schema: 'cstar.validation-evidence.v3',
        validator_identity: `codex-subagent:${validatorThreadId}:turn:${validatorTurnId}`,
        validator_identity_source: 'test_fixture',
        request_thread_id: 'test-sterling-root-recorder',
        request_turn_id: 'test-sterling-root-recorder-turn',
        subject: {
            repository_id: repoId,
            bead_id: bead.bead_id,
            target_path: null,
            work_receipt_kind: 'host_validation_manifest',
            work_receipt_id: `host-validation:${validationManifestSha256}`,
            validation_id: 'validation:test:sterling-root-binding',
            validation_manifest_schema: 'cstar.independent_validation_input.v1',
            validation_manifest_path: validationManifestPath,
            validation_manifest_sha256: validationManifestSha256,
        },
        independence: {
            policy: 'depth_one_codex_subagent_from_recording_root_v1',
            recorder_thread_id: 'test-sterling-root-recorder',
            recorder_turn_id: 'test-sterling-root-recorder-turn',
            recorder_record_set_sha256: 'a'.repeat(64),
            validator_thread_id: validatorThreadId,
            validator_turn_id: validatorTurnId,
            validator_parent_thread_id: 'test-sterling-root-recorder',
            validator_agent_path: '/root/validator',
            validator_session_sha256: 'b'.repeat(64),
            validator_final_record_sha256: 'c'.repeat(64),
            validator_task_complete_record_sha256: 'd'.repeat(64),
            validator_completed_at: now,
        },
        artifacts: [
            { path: lorePath, sha256: sha256(fs.readFileSync(lorePath, 'utf-8')) },
            { path: isolationPath, sha256: sha256(fs.readFileSync(isolationPath, 'utf-8')) },
        ],
        checks: [{
            name: 'focused root binding check',
            status: 'pass',
            evidence_path: checkPath,
            sha256: sha256(fs.readFileSync(checkPath, 'utf-8')),
        }],
    };
    const validationId = manifest.subject.validation_id;
    const record: HallValidationRun = {
        validation_id: validationId,
        repo_id: repoId,
        bead_id: bead.bead_id,
        verdict: 'ACCEPTED',
        authority_class: 'verified_v3',
        validator_identity: manifest.validator_identity,
        validator_identity_source: manifest.validator_identity_source,
        evidence_manifest: manifest,
        evidence_sha256: hashValidationEvidenceManifest(manifest),
        created_at: now,
    };
    const evidence: MandateEvidence = {
        lore_paths: [loreRelative],
        isolation_paths: [isolationRelative],
        audit: { validation_id: validationId },
    };
    return {
        controlRoot,
        evidenceRoot,
        repoId,
        bead,
        evidence,
        record,
        lorePath,
    };
}

describe('Sterling repository evidence-root binding', () => {
    beforeEach(() => {
        process.env.NODE_TEST_CONTEXT = 'cstar-sterling-root-binding';
    });

    afterEach(() => {
        if (previousNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
        else process.env.NODE_TEST_CONTEXT = previousNodeTestContext;
        while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    });

    it('binds hub worktrees and spokes, and keeps Sterling manifest equality independent of cwd', () => {
        const value = fixture();
        const codeRoot = value.evidenceRoot;
        const spokeRoot = makeRoot('sterling-spoke');
        assert.equal(
            resolveValidationEvidenceRoot(value.repoId, ` ${value.controlRoot}/ `, codeRoot, value.controlRoot),
            path.resolve(codeRoot),
        );
        assert.equal(
            resolveValidationEvidenceRoot(repositoryId(spokeRoot), spokeRoot, codeRoot, value.controlRoot),
            path.resolve(spokeRoot),
        );
        assert.throws(
            () => resolveValidationEvidenceRoot('repo:missing', value.controlRoot, codeRoot, value.controlRoot),
            /validation_repository_binding_mismatch/,
        );
        assert.throws(
            () => resolveValidationEvidenceRoot(repositoryId(spokeRoot), value.controlRoot, codeRoot, value.controlRoot),
            /validation_repository_binding_mismatch/,
        );

        mock.method(database, 'getValidationRunById', () => value.record);
        const accepted = verifySterlingMandate(value.bead, value.evidence, value.controlRoot, Date.now(), codeRoot);
        assert.equal(
            accepted.verdict,
            'ACCEPTED',
        );
        assert.equal(
            verifySterlingMandate(
                value.bead,
                value.evidence,
                value.controlRoot,
                Date.now(),
                makeRoot('sterling-wrong-root'),
            ).verdict,
            'REJECTED',
        );

        const outsideTraversal = { ...value.evidence, lore_paths: ['../outside.feature'] };
        assert.equal(
            verifySterlingMandate(value.bead, outsideTraversal, value.controlRoot, Date.now(), codeRoot).verdict,
            'REJECTED',
        );
        const hardlink = path.join(codeRoot, 'tests/features/root-binding-alias.feature');
        fs.linkSync(value.lorePath, hardlink);
        const aliasEvidence = { ...value.evidence, lore_paths: ['tests/features/root-binding-alias.feature'] };
        assert.equal(
            verifySterlingMandate(value.bead, aliasEvidence, value.controlRoot, Date.now(), codeRoot).verdict,
            'REJECTED',
        );

        fs.writeFileSync(value.lorePath, 'Feature: Root binding changed\n', 'utf-8');
        assert.equal(
            verifySterlingMandate(value.bead, value.evidence, value.controlRoot, Date.now(), codeRoot).verdict,
            'REJECTED',
        );
    });
});
