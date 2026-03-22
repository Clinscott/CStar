import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveWorkspaceSelection, selectWorkspaceRoot } from  '../../src/node/core/launcher.js';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

describe('Launcher workspace selection (CS-P7-01)', () => {
    it('detects a workspace root from the launch cwd when invoked inside a repo', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-launcher-root-'));
        const nested = path.join(tmpRoot, 'src', 'nested');
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ name: 'workspace-root' }), 'utf-8');
        fs.mkdirSync(nested, { recursive: true });

        const resolved = resolveWorkspaceSelection(undefined, nested);
        assert.strictEqual(resolved.replace(/\\/g, '/'), tmpRoot.replace(/\\/g, '/'));
    });

    it('honors --root and updates the active registry root', () => {
        const launchCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-launcher-cwd-'));
        const mountedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-mounted-root-'));
        fs.mkdirSync(path.join(mountedRoot, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(mountedRoot, 'package.json'), JSON.stringify({ name: 'mounted-root' }), 'utf-8');

        const selected = selectWorkspaceRoot(['--root', mountedRoot], launchCwd);

        assert.strictEqual(selected.replace(/\\/g, '/'), mountedRoot.replace(/\\/g, '/'));
        assert.strictEqual(registry.getRoot().replace(/\\/g, '/'), mountedRoot.replace(/\\/g, '/'));
        assert.strictEqual(process.env.CSTAR_WORKSPACE_ROOT?.replace(/\\/g, '/'), mountedRoot.replace(/\\/g, '/'));
    });
});
