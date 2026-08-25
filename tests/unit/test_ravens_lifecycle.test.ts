import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RavensAdapter } from  '../../src/node/core/runtime/adapters.js';
import type { RuntimeContext, WeaveInvocation } from  '../../src/node/core/runtime/contracts.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-RAVENS',
        trace_id: 'TRACE-RAVENS',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Ravens lifecycle compatibility boundary', () => {
    let tmpRoot: string;
    let invocation: WeaveInvocation<{ action: 'start' | 'stop' | 'status' | 'cycle' | 'sweep'; shadow_forge?: boolean; spoke?: string }>;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-ravens-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens', 'norn.py'), '# warden', 'utf-8');
        invocation = {
            weave_id: 'weave:ravens',
            payload: { action: 'status' },
        };
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    function buildTarget(repoRoot: string, slug: string = 'brain', domain: 'brain' | 'spoke' = 'brain') {
        return {
            slug,
            domain,
            repo_root: repoRoot,
            requested_path: domain === 'spoke' ? `spoke://${slug}/` : repoRoot,
        };
    }

    it('preserves bounded read-only status reporting', async () => {
        const adapter = new RavensAdapter(() => [buildTarget(tmpRoot)]);
        const result = await adapter.execute(invocation, createContext(tmpRoot));

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /DECOMMISSIONED \(READ-ONLY\)/);
        assert.equal(result.metadata?.adapter, 'compatibility:ravens-read-only-status');
        assert.equal(result.metadata?.decommissioned, true);
        assert.equal(result.metadata?.read_only, true);
        assert.equal(result.metadata?.execution_attempted, false);
        assert.deepEqual(result.metadata?.active_wardens, ['norn']);
    });

    it('rejects start, sweep, and cycle before repository discovery or execution', async () => {
        let repositoryReads = 0;
        const adapter = new RavensAdapter(() => {
            repositoryReads += 1;
            return [buildTarget(tmpRoot)];
        });

        for (const action of ['start', 'sweep', 'cycle'] as const) {
            const result = await adapter.execute(
                {
                    weave_id: 'weave:ravens',
                    payload: { action, shadow_forge: true, spoke: 'example' },
                },
                createContext(tmpRoot),
            );

            assert.equal(result.status, 'FAILURE');
            assert.match(result.error ?? '', /execution is decommissioned/i);
            assert.equal(result.metadata?.adapter, 'compatibility:ravens-execution-rejected');
            assert.equal(result.metadata?.requested_action, action);
            assert.equal(result.metadata?.execution_attempted, false);
        }

        assert.equal(repositoryReads, 0);
    });

    it('reports stop as a read-only no-op without repository discovery', async () => {
        let repositoryReads = 0;
        const adapter = new RavensAdapter(() => {
            repositoryReads += 1;
            return [buildTarget(tmpRoot)];
        });
        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'stop' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /No resident Ravens daemon/i);
        assert.equal(result.metadata?.execution_attempted, false);
        assert.equal(repositoryReads, 0);
    });

    it('fails a scoped status request when its mounted target is absent', async () => {
        const adapter = new RavensAdapter(() => []);
        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'status', spoke: 'missing' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /read-only status reporting/i);
        assert.equal(result.metadata?.execution_attempted, false);
    });

    it('contains no cycle delegation or autonomous sweep implementation', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'adapters.ts'),
            'utf-8',
        );
        const ravensSection = source.slice(
            source.indexOf('export class RavensAdapter'),
            source.indexOf('export class DynamicCommandAdapter'),
        );

        assert.doesNotMatch(
            ravensSection,
            /RavensCycleWeave|cycleWeave|executeCycleForTarget|delegated_weave_id|sweep_results|runtime:ravens-sweep|hostTextInvoker|ravens:supervisor/,
        );
    });
});
