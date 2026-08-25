import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { fileURLToPath } from 'node:url';

import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    registry.setRoot(originalRoot);
    mock.restoreAll();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Augury read-only degraded-session boundary', () => {
    it('returns a bounded freshness gap without writing logs or state', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-read-only-'));
        roots.push(root);
        registry.setRoot(root);
        mock.method(database, 'listHallPlanningSessions', () => {
            throw new Error('synthetic_secret_bearing_session_failure');
        });

        const result = await handleAugury({ prompt: 'build a bounded synthetic fixture' });
        const payload = JSON.parse(result.content[0]!.text);

        assert.equal(result.isError, undefined);
        assert.equal(payload.session_freshness_gap, 'active_session_projection_unavailable');
        assert.doesNotMatch(JSON.stringify(payload), /synthetic_secret_bearing_session_failure/);
        assert.equal(fs.existsSync(path.join(root, 'logs')), false);
        assert.equal(fs.existsSync(path.join(root, '.agents')), false);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('has no bootstrap-log dependency in the Augury read handler', () => {
        const source = fs.readFileSync(
            fileURLToPath(new URL('../../../src/tools/cstar-kernel-mcp/tools/augury.ts', import.meta.url)),
            'utf-8',
        );
        assert.doesNotMatch(source, /logBootstrapError/);
    });
});
