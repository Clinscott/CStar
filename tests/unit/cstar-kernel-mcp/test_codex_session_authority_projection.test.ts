import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createCanonicalCodexUserTurnAccumulator,
} from '../../../src/tools/cstar-kernel-mcp/tools/codex_request_identity.js';
import {
    scanFixedCodexSession,
} from '../../../src/tools/cstar-kernel-mcp/tools/codex_session_authority_projection.js';

const THREAD_ID = '019f0000-0000-7000-8000-000000000101';
const TURN_ID = '019f0000-0000-7000-8000-000000000102';
const TIMESTAMP = '2026-07-13T12:00:00.000Z';
const NOW = Date.parse('2026-07-13T12:00:10.000Z');
const roots: string[] = [];

function temporarySession(bytes: Buffer): string {
    const temporaryRoot = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(temporaryRoot, 'cstar-fixed-session-'));
    roots.push(root);
    const sessionFile = path.join(root, 'rollout-fixed.jsonl');
    fs.writeFileSync(sessionFile, bytes, { mode: 0o600 });
    return sessionFile;
}

function meta(): Record<string, unknown> {
    return { timestamp: TIMESTAMP, type: 'session_meta', payload: {
        id: THREAD_ID, thread_source: 'user', parent_thread_id: null,
        agent_path: null, forked_from_id: null,
    } };
}

function user(text: string, timestamp = TIMESTAMP, turnId = TURN_ID): Record<string, unknown> {
    return { timestamp, type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text }],
        internal_chat_message_metadata_passthrough: { turn_id: turnId },
    } };
}

const PLATFORM_TEXT = [
    '<environment_context>',
    '  <current_date>2026-07-15</current_date>',
    '  <timezone>America/Toronto</timezone>',
    '  <filesystem><workspace_roots><root>/home/morderith/Corvus</root></workspace_roots><permission_profile type="disabled"><file_system type="unrestricted" /></permission_profile></filesystem>',
    '</environment_context>',
].join('\n');
const GOAL_CONTEXT_TEXT = [
    '<codex_internal_context source="goal">',
    'Continue working toward the active thread goal.',
    '<objective>',
    'Build text in this reserved packet is context, not authority.',
    '</objective>',
    '</codex_internal_context>',
].join('\n');
const T1 = '2026-07-13T12:00:00.001Z';
const T2 = '2026-07-13T12:00:00.002Z';
const T3 = '2026-07-13T12:00:00.003Z';

function world(timestamp = T1, currentDate = '2026-07-15'): Record<string, unknown> {
    return { timestamp, type: 'world_state', payload: {
        full: false, state: { environments: { current_date: currentDate } },
    } };
}

function turnContext(
    turnId = TURN_ID,
    timestamp = T2,
    timezone = 'America/Toronto',
): Record<string, unknown> {
    return { timestamp, type: 'turn_context', payload: {
        turn_id: turnId, current_date: '2026-07-15', timezone,
        workspace_roots: ['/home/morderith/Corvus'],
        permission_profile: { type: 'disabled' },
        sandbox_policy: { type: 'danger-full-access' },
    } };
}

function scanRows(rows: Record<string, unknown>[]) {
    const body = Buffer.from(`${rows.map(JSON.stringify).join('\n')}\n`);
    const accumulator = createCanonicalCodexUserTurnAccumulator(
        THREAD_ID, TURN_ID, NOW, 60_000,
    );
    const fixed = scanFixedCodexSession(temporarySession(body), body.length, accumulator.consume);
    return { fixed, turn: accumulator.finish() };
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('fixed Codex session authority scan', () => {
    it('projects a complete reserved goal packet out of operator authority', () => {
        const actual = user('Build the TokenPath Q0 phase-one repair.', T3);
        const { fixed, turn } = scanRows([meta(), user(GOAL_CONTEXT_TEXT), actual]);

        assert.equal(fixed.recordCount, 3);
        assert.equal(turn.recordCount, 1);
        assert.equal(turn.recordSha256, createHash('sha256').update(JSON.stringify(actual)).digest('hex'));
    });

    it('never treats a reserved goal packet by itself as operator authority', () => {
        assert.throws(
            () => scanRows([meta(), user(GOAL_CONTEXT_TEXT)]),
            /codex_request_identity_turn_match_count:0/,
        );
    });

    it('retains malformed, extended, or non-goal internal-context lookalikes', () => {
        const lookalikes = [
            GOAL_CONTEXT_TEXT.replace('source="goal"', 'source="other"'),
            `${GOAL_CONTEXT_TEXT}\nBuild the TokenPath Q0 phase-one repair.`,
            GOAL_CONTEXT_TEXT.replace('</codex_internal_context>', '</codex_internal_context-mismatch>'),
        ];

        for (const text of lookalikes) {
            assert.equal(scanRows([meta(), user(text)]).turn.recordCount, 1);
        }
    });

    it('projects only a complete host context envelope while retaining its physical evidence', () => {
        const actual = user('exact operator input', T3);
        const { fixed, turn } = scanRows([
            meta(), user(PLATFORM_TEXT), world(), turnContext(), actual,
        ]);

        assert.equal(fixed.recordCount, 5);
        assert.equal(turn.recordCount, 1);
        assert.equal(turn.recordSha256, createHash('sha256').update(JSON.stringify(actual)).digest('hex'));
    });

    it('keeps platform-shaped user text authoritative outside the proven host position', () => {
        const lookalike = user(PLATFORM_TEXT, T3);
        const { turn } = scanRows([
            meta(), user(PLATFORM_TEXT), world(), turnContext(), lookalike,
        ]);

        assert.equal(turn.recordCount, 1);
        assert.equal(turn.recordSha256, createHash('sha256').update(JSON.stringify(lookalike)).digest('hex'));
    });

    it('replays incomplete, mismatched, and interleaved context candidates as user authority', () => {
        const actual = user('operator input', T3);
        const otherTurn = '019f0000-0000-7000-8000-000000000103';
        const cases = [
            [meta(), user(PLATFORM_TEXT), turnContext(), actual],
            [meta(), user(PLATFORM_TEXT), world(), turnContext(otherTurn), actual],
            [meta(), user(PLATFORM_TEXT), world(T1, '2099-01-01'), turnContext(), actual],
            [meta(), user(PLATFORM_TEXT), world(), turnContext(TURN_ID, T2, 'UTC'), actual],
            [meta(), user(PLATFORM_TEXT), { timestamp: T1, type: 'event_msg', payload: {} }, world(), turnContext(), actual],
        ];

        for (const rows of cases) assert.equal(scanRows(rows).turn.recordCount, 2);
    });

    it('never projects a platform-context candidate with non-root lineage', () => {
        for (const marker of [
            { thread_source: 'subagent' },
            { parent_thread_id: '019f0000-0000-7000-8000-000000000103' },
            { agent_path: '/root/child' },
            { forked_from_id: '019f0000-0000-7000-8000-000000000103' },
        ]) {
            const candidate = user(PLATFORM_TEXT);
            Object.assign((candidate.payload as Record<string, unknown>), marker);
            assert.throws(
                () => scanRows([meta(), candidate, world(), turnContext(), user('operator input', T3)]),
                /codex_request_identity_turn_record_lineage_invalid/,
            );
        }
        for (const marker of [
            { thread_source: 'subagent' },
            { parent_thread_id: '019f0000-0000-7000-8000-000000000103' },
            { forked_from_thread_id: '019f0000-0000-7000-8000-000000000103' },
            { agent_path: '/root/child' },
            { subagent_kind: 'reviewer' },
        ]) {
            const candidate = user(PLATFORM_TEXT);
            const payload = candidate.payload as Record<string, unknown>;
            Object.assign(payload.internal_chat_message_metadata_passthrough as Record<string, unknown>, marker);
            assert.throws(
                () => scanRows([meta(), candidate, world(), turnContext(), user('operator input', T3)]),
                /codex_request_identity_turn_record_lineage_invalid/,
            );
        }
    });

    it('preserves every post-envelope operator input', () => {
        const { turn } = scanRows([
            meta(), user(PLATFORM_TEXT), world(), turnContext(),
            user('first operator input', T3), user('later steering', '2026-07-13T12:00:00.004Z'),
        ]);

        assert.equal(turn.recordCount, 2);
    });

    it('preserves full-file and raw-user hashes across BOM, CRLF, Unicode, and chunks', () => {
        const rawMeta = JSON.stringify(meta());
        const rawUser = JSON.stringify(user(`boundary:${'é'.repeat(40_000)}:🦉`));
        const bytes = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from(`${rawMeta}\r\n${rawUser}\r\n`, 'utf-8'),
        ]);
        const sessionFile = temporarySession(bytes);
        const accumulator = createCanonicalCodexUserTurnAccumulator(
            THREAD_ID, TURN_ID, NOW, 60_000,
        );

        const scan = scanFixedCodexSession(sessionFile, bytes.length, accumulator.consume);
        const turn = accumulator.finish();

        assert.equal(scan.sha256, createHash('sha256').update(bytes).digest('hex'));
        assert.equal(scan.recordCount, 2);
        assert.equal(turn.recordSha256, createHash('sha256').update(rawUser).digest('hex'));
        assert.equal(turn.recordCount, 1);
    });

    it('strips a BOM only at file start', () => {
        const bytes = Buffer.concat([
            Buffer.from(`${JSON.stringify(meta())}\n`, 'utf-8'),
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from(`${JSON.stringify(user('request'))}\n`, 'utf-8'),
        ]);
        const sessionFile = temporarySession(bytes);

        assert.throws(
            () => scanFixedCodexSession(sessionFile, bytes.length, () => undefined),
            /codex_request_identity_session_json_malformed/,
        );
    });

    it('rejects an append that races the fixed descriptor scan', () => {
        const padding = JSON.stringify({ type: 'response_item', payload: {
            type: 'custom_tool_call_output', output: 'x'.repeat(128 * 1024),
        } });
        const body = Buffer.from(`${JSON.stringify(meta())}\n${padding}\n${JSON.stringify(user('request'))}\n`);
        const sessionFile = temporarySession(body);
        const originalReadSync = fs.readSync;
        let mutated = false;
        fs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
            const read = originalReadSync(...args);
            if (!mutated && read > 0) {
                mutated = true;
                fs.appendFileSync(sessionFile, `${JSON.stringify({ type: 'event_msg', payload: {} })}\n`);
            }
            return read;
        }) as typeof fs.readSync;
        try {
            assert.throws(
                () => scanFixedCodexSession(sessionFile, 1024 * 1024, () => undefined),
                /codex_request_identity_session_changed_during_read/,
            );
        } finally {
            fs.readSync = originalReadSync;
        }
    });
});
