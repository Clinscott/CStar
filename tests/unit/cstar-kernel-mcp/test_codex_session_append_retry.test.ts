import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { retryAppendOnlyCodexSessionRead } from
    '../../../src/tools/cstar-kernel-mcp/tools/codex_session_append_retry.js';

const MAX_BYTES = 1024 * 1024;
const SESSION_CHANGED = 'codex_request_identity_session_changed_during_read';
const roots: string[] = [];

function sessionFile(): string {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(),
        'cstar-session-retry-'));
    roots.push(root);
    const file = path.join(root, 'rollout.jsonl');
    fs.writeFileSync(file, '{"type":"session_meta"}\n', { mode: 0o600 });
    return file;
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('append-only Codex session retry', () => {
    it('retries deterministic same-inode append growth and includes the new snapshot', () => {
        const file = sessionFile();
        let attempts = 0;
        const result = retryAppendOnlyCodexSessionRead(file, MAX_BYTES, () => {
            attempts += 1;
            if (attempts === 1) {
                fs.appendFileSync(file, '{"type":"event_msg"}\n');
                throw new Error(SESSION_CHANGED);
            }
            return fs.readFileSync(file, 'utf8');
        });

        assert.equal(attempts, 2);
        assert.match(result, /event_msg/);
    });

    it('stops after three continuously growing scans', () => {
        const file = sessionFile();
        let attempts = 0;
        assert.throws(
            () => retryAppendOnlyCodexSessionRead(file, MAX_BYTES, () => {
                attempts += 1;
                fs.appendFileSync(file, `${JSON.stringify({ attempt: attempts })}\n`);
                throw new Error(SESSION_CHANGED);
            }),
            new RegExp(SESSION_CHANGED),
        );
        assert.equal(attempts, 3);
    });

    it('rejects truncation, replacement, symlink drift, and rewritten prefixes', () => {
        const mutations: Array<(file: string) => void> = [
            (file) => fs.truncateSync(file, 2),
            (file) => {
                fs.renameSync(file, `${file}.original`);
                fs.writeFileSync(file, '{"type":"replacement"}\n', { mode: 0o600 });
            },
            (file) => {
                fs.renameSync(file, `${file}.original`);
                fs.symlinkSync(`${file}.original`, file);
            },
            (file) => {
                const descriptor = fs.openSync(file, 'r+');
                try {
                    fs.writeSync(descriptor, Buffer.from('X'), 0, 1, 0);
                } finally {
                    fs.closeSync(descriptor);
                }
                fs.appendFileSync(file, '{"type":"event_msg"}\n');
            },
        ];

        for (const mutate of mutations) {
            const file = sessionFile();
            let attempts = 0;
            assert.throws(
                () => retryAppendOnlyCodexSessionRead(file, MAX_BYTES, () => {
                    attempts += 1;
                    mutate(file);
                    return 'must-not-return';
                }),
                new RegExp(SESSION_CHANGED),
            );
            assert.equal(attempts, 1);
        }
    });

    it('rejects initially unsafe opened files before invoking the reader', () => {
        const file = sessionFile();
        fs.chmodSync(file, 0o666);
        let attempts = 0;
        assert.throws(
            () => retryAppendOnlyCodexSessionRead(file, MAX_BYTES, () => {
                attempts += 1;
                return 'must-not-return';
            }),
            /codex_request_identity_opened_session_file_is_unsafe/,
        );
        assert.equal(attempts, 0);
    });

    it('never retries malformed records or ambiguous authority evidence', () => {
        for (const message of [
            'codex_request_identity_session_json_malformed',
            'forge_set_manifest_operator_signal_ambiguous',
        ]) {
            const file = sessionFile();
            let attempts = 0;
            assert.throws(
                () => retryAppendOnlyCodexSessionRead(file, MAX_BYTES, () => {
                    attempts += 1;
                    throw new Error(message);
                }),
                new RegExp(message),
            );
            assert.equal(attempts, 1);
        }
    });
});
