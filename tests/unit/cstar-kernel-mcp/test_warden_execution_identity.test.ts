import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { handleWarden } from '../../../src/tools/cstar-kernel-mcp/tools/warden.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    restoreEnv,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const originalPython = process.env.CSTAR_PYTHON_EXECUTABLE;
const roots: string[] = [];

function makeWardenFixture(): { root: string; sentinel: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-warden-identity-'));
    roots.push(root);
    const python = path.join(root, '.venv', 'bin', 'python');
    const sentinel = path.join(root, 'warden-ran.txt');
    fs.mkdirSync(path.dirname(python), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
        python,
        `#!/bin/sh\nprintf 'ran\\n' >> ${JSON.stringify(sentinel)}\nprintf '{"status":"ok"}\\n'\n`,
        { mode: 0o700 },
    );
    fs.writeFileSync(path.join(root, 'scripts', 'run_warden.py'), '# synthetic fixture\n', { mode: 0o600 });
    registry.setRoot(root);
    delete process.env.CSTAR_PYTHON_EXECUTABLE;
    return { root, sentinel };
}

afterEach(() => {
    registry.setRoot(originalRoot);
    restoreEnv('CSTAR_PYTHON_EXECUTABLE', originalPython);
    cleanupOperatorAuthorizationFixtures();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Warden execution request identity', () => {
    it('rejects missing and subagent identity before process launch, then runs once for canonical root-user identity', async () => {
        const { sentinel } = makeWardenFixture();
        const session = createSession({
            textParts: ['Synthetic root-user request for exactly one Warden scan.'],
        });

        const missing = await handleWarden({ action: 'scan', warden: 'mimir' });
        assert.equal(missing.isError, true);
        assert.match(JSON.parse(missing.content[0]!.text).error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(sentinel), false);

        const subagent = await handleWarden(
            { action: 'scan', warden: 'mimir' },
            validRequestContext(session.threadId, session.turnId, {
                thread_source: 'subagent',
                parent_thread_id: 'parent-thread',
                subagent_kind: 'review',
            }),
        );
        assert.equal(subagent.isError, true);
        assert.match(JSON.parse(subagent.content[0]!.text).error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(sentinel), false);

        const accepted = await handleWarden(
            { action: 'scan', warden: 'mimir' },
            validRequestContext(session.threadId, session.turnId),
        );
        assert.equal(accepted.isError, undefined);
        assert.equal(JSON.parse(accepted.content[0]!.text).status, 'ok');
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'ran\n');
    });
});
