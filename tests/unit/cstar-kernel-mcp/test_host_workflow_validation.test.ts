import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import SqliteDatabase from 'better-sqlite3';

import {
    isValidationEvidenceManifestV3StructurallyValid,
} from '../../../src/types/validation_evidence.js';
import {
    verifyHostWorkflowValidationEvidence,
    type HostValidationSubject,
} from '../../../src/tools/cstar-kernel-mcp/tools/host_workflow_validation.js';
import type { VerifiedCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { saveValidationRunToDb } from '../../../src/tools/cstar-kernel-mcp/tools/validation_run_store.js';

const RECORDER_THREAD = '019f0000-0000-7000-8000-000000000101';
const RECORDER_TURN = '019f0000-0000-7000-8000-000000000102';
const VALIDATOR_THREAD = '019f0000-0000-7000-8000-000000000201';
const VALIDATOR_TURN = '019f0000-0000-7000-8000-000000000202';
const BEAD_ID = 'bead:repair:test-host-validation';
const VALIDATION_ID = 'val-test-host-validation-v1';
const NOW = Date.parse('2026-07-18T14:00:10.000Z');
const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
const roots: string[] = [];
const originalEnv = {
    CODEX_HOME: process.env.CODEX_HOME,
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
    CSTAR_FORGE_TEST_MODE: process.env.CSTAR_FORGE_TEST_MODE,
};

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

interface FixtureOptions {
    parentThreadId?: string;
    sessionId?: string;
    forkedFromId?: string;
    spawnParentThreadId?: string;
    threadSource?: string;
    depth?: number;
    payloadAgentPath?: string | null;
    spawnAgentPath?: string | null;
    omitPayloadAgentPath?: boolean;
    omitSpawnAgentPath?: boolean;
    omitSpawn?: boolean;
    agentNickname?: string;
    agentRole?: string | null;
    finalText?: string;
    completedAt?: number;
    laterCompletion?: boolean;
    laterActivity?: boolean;
    manifestBeadId?: string;
    manifestValidationId?: string;
    checkStatus?: 'pass' | 'fail';
    omitChecks?: boolean;
}

function recorder(): VerifiedCodexRequestIdentity {
    return {
        source: 'codex_request_meta',
        session_id: RECORDER_THREAD,
        thread_id: RECORDER_THREAD,
        turn_id: RECORDER_TURN,
        thread_source: 'user',
        turn_record_sha256: 'a'.repeat(64),
        turn_record_set_sha256: 'b'.repeat(64),
        turn_record_count: 1,
        turn_first_timestamp: '2026-07-18T14:00:00.000Z',
        turn_timestamp: '2026-07-18T14:00:00.000Z',
    };
}

function subject(): HostValidationSubject {
    return {
        repository_id: 'repo:test',
        bead_id: BEAD_ID,
        target_path: 'src/test.ts',
        validation_id: VALIDATION_ID,
        verdict: 'ACCEPTED',
    };
}

function fixture(options: FixtureOptions = {}) {
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-host-validation-'));
    roots.push(root);
    const codexHome = path.join(root, 'codex-home');
    const sessions = path.join(codexHome, 'sessions', '2026', '07', '18');
    fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
    fs.chmodSync(path.join(codexHome, 'sessions'), 0o700);
    const project = path.join(root, 'project');
    fs.mkdirSync(path.join(project, 'evidence'), { recursive: true, mode: 0o700 });
    const artifactPath = path.join(project, 'artifact.txt');
    const checkPath = path.join(project, 'evidence', 'check.txt');
    fs.writeFileSync(artifactPath, 'artifact\n', { mode: 0o600 });
    fs.writeFileSync(checkPath, 'PASS\n', { mode: 0o600 });
    const payload = {
        artifacts: [{ path: 'artifact.txt', sha256: sha256('artifact\n') }],
        checks: options.omitChecks ? [] : [{
            name: 'focused check',
            status: options.checkStatus ?? 'pass' as 'pass' | 'fail',
            evidence_path: 'evidence/check.txt',
            sha256: sha256('PASS\n'),
        }],
    };
    const manifest = {
        schema: 'cstar.independent_validation_input.v1',
        bead_id: options.manifestBeadId ?? BEAD_ID,
        validation_id: options.manifestValidationId ?? VALIDATION_ID,
        reported_verdict: 'ACCEPTED',
        artifacts: payload.artifacts.map((entry) => ({ ...entry, bytes: 9 })),
        checks: payload.checks,
    };
    const manifestContent = `${JSON.stringify(manifest)}\n`;
    const manifestPath = path.join(project, 'evidence', 'manifest.json');
    fs.writeFileSync(manifestPath, manifestContent, { mode: 0o600 });
    const manifestSha256 = sha256(manifestContent);
    const finalText = options.finalText ?? [
        'Independent validation complete.',
        `Manifest ${manifestSha256}`,
        `Validation ${VALIDATION_ID}`,
    ].join('\n');
    const completedAt = options.completedAt ?? NOW - 1_000;
    const finalTimestamp = new Date(completedAt + 500).toISOString();
    const completedTimestamp = new Date(completedAt + 600).toISOString();
    const parentThreadId = options.parentThreadId ?? RECORDER_THREAD;
    const spawn: Record<string, unknown> = {
        parent_thread_id: options.spawnParentThreadId ?? RECORDER_THREAD,
        depth: options.depth ?? 1,
        agent_path: options.spawnAgentPath === undefined
            ? '/root/validator' : options.spawnAgentPath,
        agent_nickname: options.agentNickname ?? 'Validator',
        agent_role: options.agentRole === undefined ? 'validator' : options.agentRole,
    };
    if (options.omitSpawnAgentPath) delete spawn.agent_path;
    const subagent: Record<string, unknown> = {};
    if (!options.omitSpawn) subagent.thread_spawn = spawn;
    const sessionMeta: Record<string, unknown> = {
        session_id: options.sessionId ?? RECORDER_THREAD,
        id: VALIDATOR_THREAD,
        forked_from_id: options.forkedFromId ?? RECORDER_THREAD,
        parent_thread_id: parentThreadId,
        source: { subagent },
        thread_source: options.threadSource ?? 'subagent',
        agent_path: options.payloadAgentPath === undefined
            ? '/root/validator' : options.payloadAgentPath,
        agent_nickname: options.agentNickname ?? 'Validator',
        agent_role: options.agentRole === undefined ? 'validator' : options.agentRole,
    };
    if (options.omitPayloadAgentPath) delete sessionMeta.agent_path;
    const rows: unknown[] = [{
        timestamp: '2026-07-18T13:59:00.000Z',
        type: 'session_meta',
        payload: sessionMeta,
    }, {
        timestamp: finalTimestamp,
        type: 'response_item',
        payload: {
            type: 'message', role: 'assistant', phase: 'final_answer',
            content: [{ type: 'output_text', text: finalText }],
            internal_chat_message_metadata_passthrough: { turn_id: VALIDATOR_TURN },
        },
    }, {
        timestamp: completedTimestamp,
        type: 'event_msg',
        payload: {
            type: 'task_complete', turn_id: VALIDATOR_TURN,
            last_agent_message: finalText, completed_at: completedAt / 1_000,
        },
    }];
    if (options.laterCompletion) rows.push({
        timestamp: new Date(completedAt + 100).toISOString(),
        type: 'event_msg',
        payload: {
            type: 'task_complete', turn_id: '019f0000-0000-7000-8000-000000000299',
            last_agent_message: 'later', completed_at: (completedAt + 100) / 1_000,
        },
    });
    if (options.laterActivity) rows.push({
        timestamp: new Date(completedAt + 100).toISOString(),
        type: 'response_item',
        payload: {
            type: 'message', role: 'assistant', phase: 'commentary',
            content: [{ type: 'output_text', text: 'later activity' }],
            internal_chat_message_metadata_passthrough: {
                turn_id: '019f0000-0000-7000-8000-000000000298',
            },
        },
    });
    fs.writeFileSync(
        path.join(sessions, `rollout-test-${VALIDATOR_THREAD}.jsonl`),
        `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        { mode: 0o600 },
    );
    process.env.CODEX_HOME = codexHome;
    process.env.NODE_TEST_CONTEXT = '1';
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    return {
        root: project,
        payload,
        receipt: {
            validator_thread_id: VALIDATOR_THREAD,
            validator_turn_id: VALIDATOR_TURN,
            manifest_path: 'evidence/manifest.json',
            manifest_sha256: manifestSha256,
        },
    };
}

function verify(options: FixtureOptions = {}) {
    const value = fixture(options);
    return verifyHostWorkflowValidationEvidence(
        value.root, value.payload, value.receipt, subject(), recorder(), NOW,
    );
}

function currentHost(options: FixtureOptions = {}): FixtureOptions {
    return {
        omitPayloadAgentPath: true,
        spawnAgentPath: null,
        agentNickname: 'nickname is not authority',
        agentRole: null,
        ...options,
    };
}

function expectFailure(options: FixtureOptions, message: string): void {
    assert.throws(() => verify(options), (error: unknown) => {
        assert.equal((error as Error).message, message);
        return true;
    });
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    for (const [name, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('host-workflow independent validation', () => {
    it('retains explicit matching /root/<role> path compatibility', () => {
        const verified = verify();
        assert.equal(verified?.manifest.schema, 'cstar.validation-evidence.v3');
        assert.equal(verified?.validator_identity_source, 'test_fixture');
        assert.equal(isValidationEvidenceManifestV3StructurallyValid(verified?.manifest), true);
        if (verified?.manifest.schema === 'cstar.validation-evidence.v3') {
            assert.equal(verified.manifest.subject.repository_id, 'repo:test');
            assert.equal(verified.manifest.subject.target_path, 'src/test.ts');
            assert.equal(verified.manifest.independence.validator_parent_thread_id, RECORDER_THREAD);
            assert.equal(verified.manifest.independence.validator_agent_path, '/root/validator');
        }
    });

    it('accepts the exact default-host null/absent path shape with a fixed informational path', () => {
        const verified = verify(currentHost());
        assert.equal(isValidationEvidenceManifestV3StructurallyValid(verified?.manifest), true);
        if (verified?.manifest.schema === 'cstar.validation-evidence.v3') {
            assert.equal(verified.manifest.independence.validator_agent_path, '/root/validator');
        }
    });

    it('requires every default-host authority-bearing lineage field to match the root', () => {
        const wrongRoot = '019f0000-0000-7000-8000-000000000999';
        const invalid: FixtureOptions[] = [
            { sessionId: wrongRoot },
            { parentThreadId: wrongRoot },
            { forkedFromId: wrongRoot },
            { spawnParentThreadId: wrongRoot },
            { threadSource: 'user' },
            { depth: 2 },
            { omitSpawn: true },
        ];
        for (const options of invalid) {
            expectFailure(currentHost(options), 'host_validation_validator_lineage_invalid');
        }
    });

    it('rejects partial, mismatched, and widened path-presence shapes', () => {
        const invalid: FixtureOptions[] = [
            { omitPayloadAgentPath: true },
            { omitSpawnAgentPath: true },
            { spawnAgentPath: null },
            { payloadAgentPath: null, spawnAgentPath: null },
            { omitPayloadAgentPath: true, omitSpawnAgentPath: true },
            { payloadAgentPath: '/root/validator', spawnAgentPath: '/root/reviewer' },
        ];
        for (const options of invalid) {
            expectFailure(options, 'host_validation_validator_lineage_invalid');
        }
    });

    it('rejects malformed explicit paths instead of widening legacy compatibility', () => {
        for (const agentPath of [
            '/root/team/validator',
            '/other/validator',
            '/root/Validator',
            '/root/validator-role',
            '/root/',
        ]) {
            expectFailure(
                { payloadAgentPath: agentPath, spawnAgentPath: agentPath },
                'host_validation_validator_lineage_invalid',
            );
        }
    });

    it('rejects a final response that does not bind the exact manifest digest', () => {
        expectFailure(
            { finalText: `Validation ${VALIDATION_ID} without the digest` },
            'host_validation_validator_final_not_bound_to_manifest',
        );
    });

    it('rejects wrong bead and validation-id scope', () => {
        expectFailure({ manifestBeadId: 'bead:other' }, 'host_validation_manifest_scope_mismatch');
        expectFailure({ manifestValidationId: 'val-other' }, 'host_validation_manifest_scope_mismatch');
    });

    it('rejects failed or missing checks', () => {
        expectFailure({ checkStatus: 'fail' }, 'validation_evidence_check_not_passed');
        expectFailure({ omitChecks: true }, 'host_validation_evidence_required');
    });

    it('rejects stale and superseded validator completions', () => {
        expectFailure(
            { completedAt: NOW - 25 * 60 * 60 * 1_000 },
            'host_validation_validator_receipt_stale_or_future_dated',
        );
        expectFailure({ laterCompletion: true }, 'host_validation_validator_turn_not_latest');
        expectFailure({ laterActivity: true }, 'host_validation_validator_turn_not_latest');
    });

    it('persists only the kernel-minted v3 proof and rejects cross-scope replay', () => {
        const value = fixture();
        const verified = verifyHostWorkflowValidationEvidence(
            value.root, value.payload, value.receipt, subject(), recorder(), NOW,
        )!;
        const db = new SqliteDatabase(':memory:');
        db.exec(`CREATE TABLE hall_validation_runs (
            validation_id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, scan_id TEXT,
            bead_id TEXT, target_path TEXT, verdict TEXT NOT NULL, sprt_verdict TEXT,
            pre_scores_json TEXT, post_scores_json TEXT, benchmark_json TEXT, notes TEXT,
            authority_class TEXT, evidence_sha256 TEXT, validator_identity TEXT,
            validator_identity_source TEXT, evidence_manifest_json TEXT,
            created_at INTEGER, legacy_trace_id INTEGER
        )`);
        const record = {
            validation_id: VALIDATION_ID,
            repo_id: 'repo:test',
            bead_id: BEAD_ID,
            target_path: 'src/test.ts',
            verdict: 'ACCEPTED' as const,
            authority_class: 'verified_v3' as const,
            evidence_sha256: verified.evidence_sha256,
            validator_identity: verified.validator_identity,
            validator_identity_source: verified.validator_identity_source,
            evidence_manifest: verified.manifest,
            created_at: NOW,
        };
        delete process.env.NODE_TEST_CONTEXT;
        delete process.env.CSTAR_FORGE_TEST_MODE;
        saveValidationRunToDb(db, record, verified);
        assert.equal(
            (db.prepare('SELECT authority_class FROM hall_validation_runs').get() as { authority_class: string }).authority_class,
            'verified_v3',
        );
        assert.throws(
            () => saveValidationRunToDb(db, { ...record, repo_id: 'repo:other', authority_class: 'reported' }),
            /validation_id_scope_conflict/,
        );
        const second = new SqliteDatabase(':memory:');
        second.exec(db.prepare("SELECT sql FROM sqlite_master WHERE name='hall_validation_runs'").get().sql as string);
        assert.throws(
            () => saveValidationRunToDb(second, record),
            /verified_validation_v3_kernel_proof_required/,
        );
        second.close();
        db.close();
    });
});
