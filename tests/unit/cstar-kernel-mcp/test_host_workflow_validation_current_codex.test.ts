import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    verifyHostWorkflowValidationEvidence,
    type HostValidationSubject,
} from '../../../src/tools/cstar-kernel-mcp/tools/host_workflow_validation.js';
import type { VerifiedCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import type { ValidationEvidencePayload } from '../../../src/tools/cstar-kernel-mcp/tools/validation_evidence.js';

const RECORDER_THREAD = '019f0000-0000-7000-8000-000000000101';
const RECORDER_TURN = '019f0000-0000-7000-8000-000000000102';
const VALIDATOR_THREAD = '019f0000-0000-7000-8000-000000000201';
const VALIDATOR_TURN = '019f0000-0000-7000-8000-000000000202';
const OTHER_THREAD = '019f0000-0000-7000-8000-000000000999';
const BEAD_ID = 'bead:repair:test-host-validation-current-codex';
const VALIDATION_ID = 'val-test-host-validation-current-codex-v1';
const NOW = Date.parse('2026-07-18T14:00:10.000Z');
const roots: string[] = [];
const originalEnv = {
    CODEX_HOME: process.env.CODEX_HOME,
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
    CSTAR_FORGE_TEST_MODE: process.env.CSTAR_FORGE_TEST_MODE,
};

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
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

interface FixtureOptions {
    omitForkedFromId?: boolean;
    forkedFromId?: string | null;
    parentThreadId?: string;
    spawnParentThreadId?: string;
    depth?: number;
    sessionId?: string;
}

function fixture(options: FixtureOptions = {}) {
    const temporaryRoot = fs.mkdtempSync(path.join('/tmp', 'cstar-current-codex-validation-'));
    roots.push(temporaryRoot);
    const codexHome = path.join(temporaryRoot, 'codex-home');
    const sessions = path.join(codexHome, 'sessions', '2026', '07', '18');
    fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
    fs.chmodSync(path.join(codexHome, 'sessions'), 0o700);
    const project = path.join(temporaryRoot, 'project');
    fs.mkdirSync(path.join(project, 'evidence'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(project, 'artifact.txt'), 'artifact\n', { mode: 0o600 });
    fs.writeFileSync(path.join(project, 'evidence', 'check.txt'), 'PASS\n', { mode: 0o600 });
    const payload: ValidationEvidencePayload = {
        artifacts: [{ path: 'artifact.txt', sha256: sha256('artifact\n') }],
        checks: [{
            name: 'focused check', status: 'pass', evidence_path: 'evidence/check.txt',
            sha256: sha256('PASS\n'),
        }],
    };
    const manifestContent = `${JSON.stringify({
        schema: 'cstar.independent_validation_input.v1',
        bead_id: BEAD_ID,
        validation_id: VALIDATION_ID,
        reported_verdict: 'ACCEPTED',
        artifacts: payload.artifacts.map((entry) => ({ ...entry, bytes: 9 })),
        checks: payload.checks,
    })}\n`;
    fs.writeFileSync(path.join(project, 'evidence', 'manifest.json'), manifestContent, { mode: 0o600 });
    const manifestSha256 = sha256(manifestContent);
    const completedAt = NOW - 1_000;
    const finalText = [
        'Independent validation complete.',
        `Manifest ${manifestSha256}`,
        `Validation ${VALIDATION_ID}`,
    ].join('\n');
    const sessionMeta: Record<string, unknown> = {
        session_id: options.sessionId ?? RECORDER_THREAD,
        id: VALIDATOR_THREAD,
        parent_thread_id: options.parentThreadId ?? RECORDER_THREAD,
        source: { subagent: { thread_spawn: {
            parent_thread_id: options.spawnParentThreadId ?? RECORDER_THREAD,
            depth: options.depth ?? 1,
            agent_path: '/root/validator',
        } } },
        thread_source: 'subagent',
        agent_path: '/root/validator',
    };
    if (!options.omitForkedFromId) {
        sessionMeta.forked_from_id = options.forkedFromId === undefined
            ? RECORDER_THREAD : options.forkedFromId;
    }
    const rows = [{
        timestamp: '2026-07-18T13:59:00.000Z', type: 'session_meta', payload: sessionMeta,
    }, {
        timestamp: new Date(completedAt + 500).toISOString(), type: 'response_item', payload: {
            type: 'message', role: 'assistant', phase: 'final_answer',
            content: [{ type: 'output_text', text: finalText }],
            internal_chat_message_metadata_passthrough: { turn_id: VALIDATOR_TURN },
        },
    }, {
        timestamp: new Date(completedAt + 600).toISOString(), type: 'event_msg', payload: {
            type: 'task_complete', turn_id: VALIDATOR_TURN, last_agent_message: finalText,
            completed_at: completedAt / 1_000,
        },
    }];
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

function expectLineageFailure(options: FixtureOptions): void {
    assert.throws(
        () => verify(options),
        /host_validation_validator_lineage_invalid/,
    );
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    for (const [name, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('current Codex depth-one validator lineage', () => {
    it('accepts missing, null, and empty legacy fork ids with authoritative lineage', () => {
        for (const options of [
            { omitForkedFromId: true },
            { forkedFromId: null },
            { forkedFromId: '' },
        ]) {
            const verified = verify(options);
            assert.equal(verified?.manifest.independence.validator_parent_thread_id, RECORDER_THREAD);
        }
    });

    it('accepts the legacy valid shape with a matching fork id', () => {
        const verified = verify();
        assert.equal(verified?.manifest.independence.validator_thread_id, VALIDATOR_THREAD);
        assert.equal(verified?.manifest.independence.policy, 'depth_one_codex_subagent_from_recording_root_v1');
    });

    it('rejects a present wrong or contradictory fork id', () => {
        expectLineageFailure({ forkedFromId: OTHER_THREAD });
        expectLineageFailure({ forkedFromId: 'not-a-thread' });
    });

    it('rejects missing, null, and empty fork ids when parent, depth, or root evidence is wrong', () => {
        const legacyAbsent = { omitForkedFromId: true };
        for (const options of [
            { ...legacyAbsent, parentThreadId: OTHER_THREAD },
            { ...legacyAbsent, spawnParentThreadId: OTHER_THREAD },
            { ...legacyAbsent, depth: 2 },
            { ...legacyAbsent, sessionId: OTHER_THREAD },
            { forkedFromId: null, parentThreadId: OTHER_THREAD },
            { forkedFromId: '', depth: 0 },
        ]) {
            expectLineageFailure(options);
        }
    });
});
