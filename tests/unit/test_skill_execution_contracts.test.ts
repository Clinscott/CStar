import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { handleAutobot, isAutobotMcpEnabled } from '../../src/tools/cstar-kernel-mcp/tools/autobot.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);

function readProjectFile(relativePath: string): string {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

describe('decommissioned skill execution contracts', () => {
    it('keeps AutoBot out of registry entries and intent routing', () => {
        const registry = JSON.parse(readProjectFile('.agents/skill_registry.json')) as {
            entries?: unknown;
            intent_grammar?: { ORCHESTRATE?: { triggers?: string[] } };
        };
        assert.ok(registry.entries && typeof registry.entries === 'object');
        assert.equal(Array.isArray(registry.entries), false);
        const entries = registry.entries as Record<string, { id?: string }>;

        assert.deepEqual(Object.keys(entries), ['corvus-forge', 'researcher', 'cstar-closeout']);
        assert.equal(entries['corvus-forge']?.id, 'corvus-forge');
        assert.equal(entries['researcher']?.id, 'researcher');
        assert.equal(entries['cstar-closeout']?.id, 'cstar-closeout');
        assert.equal(Object.hasOwn(entries, 'mimir-harvester'), false);
        assert.equal(Object.hasOwn(entries, 'autobot'), false);
        assert.equal(registry.intent_grammar?.ORCHESTRATE?.triggers?.includes('autobot'), false);
    });

    it('uses a decommission tombstone instead of a host-discoverable AutoBot skill', () => {
        assert.equal(fs.existsSync(path.join(PROJECT_ROOT, '.agents/skills/autobot/SKILL.md')), false);
        const tombstone = readProjectFile('.agents/skills/autobot/DECOMMISSIONED.md');
        assert.match(tombstone, /not a discoverable\s+host skill/);
        assert.match(tombstone, /Do not invoke these scripts directly/);
    });

    it('removes direct AutoBot fallback instructions from active extension skills', () => {
        const restoration = readProjectFile('.agents/extension/skills/restoration/SKILL.md');
        const bookmarkWeaver = readProjectFile('scripts/bookmark_weaver.py');
        assert.doesNotMatch(restoration, /delegate_to_subagent\(["']autobot["']\)/);
        assert.doesNotMatch(bookmarkWeaver, /cstar\.ts["'], ["']skill["'], ["']autobot/);
    });

    it('keeps the source compatibility handler permanently fail-closed', async () => {
        const previous = process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
        const childProcess = require('node:child_process') as typeof import('node:child_process');
        const spawnSync = mock.method(childProcess, 'spawnSync', () => {
            throw new Error('decommissioned handler attempted to spawn a subprocess');
        });
        process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = '1';
        try {
            assert.equal(isAutobotMcpEnabled(), false);
            const response = await handleAutobot({ intent: 'must not execute' });
            assert.equal(response.isError, true);
            const payload = JSON.parse(response.content[0].text) as { error?: string };
            assert.match(payload.error ?? '', /permanently decommissioned/);
            assert.equal(spawnSync.mock.callCount(), 0);
        } finally {
            mock.restoreAll();
            if (previous === undefined) {
                delete process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
            } else {
                process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = previous;
            }
        }
    });
});
