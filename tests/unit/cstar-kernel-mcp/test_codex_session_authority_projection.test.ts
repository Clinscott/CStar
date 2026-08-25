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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-fixed-session-'));
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

function user(text: string): Record<string, unknown> {
    return { timestamp: TIMESTAMP, type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text }],
        internal_chat_message_metadata_passthrough: { turn_id: TURN_ID },
    } };
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('fixed Codex session authority scan', () => {
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
