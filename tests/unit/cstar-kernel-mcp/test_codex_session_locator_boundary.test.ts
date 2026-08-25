import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { findCodexSessionFile } from '../../../src/tools/cstar-kernel-mcp/tools/codex_session_locator.js';

const roots: string[] = [];

function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-session-locator-'));
    roots.push(root);
    return root;
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Codex session locator storage boundary', () => {
    it('finds one nested exact thread file without whole-directory materialization', () => {
        const root = makeRoot();
        const nested = path.join(root, '2026', '07', '14');
        fs.mkdirSync(nested, { recursive: true });
        const expected = path.join(nested, 'rollout-019f0000-0000-7000-8000-000000000001.jsonl');
        fs.writeFileSync(expected, '{}\n', { mode: 0o600 });

        assert.equal(
            findCodexSessionFile(root, '019f0000-0000-7000-8000-000000000001'),
            expected,
        );

        const source = fs.readFileSync(
            new URL('../../../src/tools/cstar-kernel-mcp/tools/codex_session_locator.ts', import.meta.url),
            'utf8',
        );
        assert.doesNotMatch(source, /readdirSync/);
        assert.match(source, /MAX_SESSION_FILES_SCANNED/);
        assert.match(source, /MAX_SESSION_DIRECTORY_DEPTH/);
    });

    it('fails closed on duplicate matches and excessive nesting', () => {
        const duplicateRoot = makeRoot();
        const thread = '019f0000-0000-7000-8000-000000000002';
        for (const branch of ['a', 'b']) {
            const directory = path.join(duplicateRoot, branch);
            fs.mkdirSync(directory);
            fs.writeFileSync(path.join(directory, `rollout-${thread}.jsonl`), '{}\n', { mode: 0o600 });
        }
        assert.throws(
            () => findCodexSessionFile(duplicateRoot, thread),
            /operator_authorization_session_match_count:2/,
        );

        const deepRoot = makeRoot();
        let directory = deepRoot;
        for (let depth = 0; depth < 18; depth += 1) {
            directory = path.join(directory, `d${depth}`);
            fs.mkdirSync(directory);
        }
        assert.throws(
            () => findCodexSessionFile(deepRoot, thread),
            /operator_authorization_session_depth_limit_exceeded/,
        );
    });
});
