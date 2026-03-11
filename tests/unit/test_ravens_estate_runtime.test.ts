import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RavensAdapter } from '../../src/node/core/runtime/adapters.ts';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { closeDb, getHallRepositoryRecord, saveHallMountedSpoke } from '../../src/tools/pennyone/intel/database.ts';
import { StateRegistry } from '../../src/node/core/state.ts';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-RAVENS-ESTATE',
        trace_id: 'TRACE-RAVENS-ESTATE',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'subkernel',
        target_domain: 'estate',
        interactive: false,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Ravens estate sweep runtime (CS-P7-05)', () => {
    let tmpRoot: string;
    let keepOsRoot: string;
    let astroRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-ravens-estate-'));
        keepOsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-ravens-keepos-'));
        astroRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-ravens-astrologer-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'src', 'sentinel', 'wardens', 'norn.py'), '# warden', 'utf-8');
        registry.setRoot(tmpRoot);
        closeDb();
        StateRegistry.save(StateRegistry.get());

        const repo = getHallRepositoryRecord(tmpRoot);
        if (!repo) {
            throw new Error('Failed to materialize Hall repository for ravens estate test.');
        }

        saveHallMountedSpoke({
            spoke_id: 'spoke:keepos',
            repo_id: repo.repo_id,
            slug: 'keepos',
            kind: 'git',
            root_path: keepOsRoot,
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_only',
            projection_status: 'current',
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        saveHallMountedSpoke({
            spoke_id: 'spoke:astrologer',
            repo_id: repo.repo_id,
            slug: 'astrologer',
            kind: 'git',
            root_path: astroRoot,
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_only',
            projection_status: 'current',
            created_at: Date.now(),
            updated_at: Date.now(),
        });
    });

    afterEach(() => {
        closeDb();
    });

    it('sweeps the mounted estate and isolates target failures', async () => {
        const adapter = new RavensAdapter({
            id: 'weave:ravens-cycle',
            execute: async (invocation) => {
                const repoRoot = String((invocation.payload as { project_root: string }).project_root).replace(/\\/g, '/');
                if (repoRoot === astroRoot.replace(/\\/g, '/')) {
                    return {
                        weave_id: 'weave:ravens-cycle',
                        status: 'FAILURE',
                        output: '',
                        error: 'astrologer cycle failed',
                        metadata: {},
                    };
                }

                return {
                    weave_id: 'weave:ravens-cycle',
                    status: 'SUCCESS',
                    output: `cycle:${path.basename(repoRoot)}`,
                    metadata: {
                        cycle_result: {
                            status: 'SUCCESS',
                            summary: `cycle:${path.basename(repoRoot)}`,
                            mission_id: `ravens-cycle:${path.basename(repoRoot)}`,
                            stages: [],
                        },
                    },
                };
            },
        } as any);

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'sweep' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.match(result.output, /3 target\(s\)/);
        assert.equal((result.metadata?.sweep_results as Array<unknown>).length, 3);
        assert.equal((result.metadata?.isolated_failures as Array<unknown>).length, 1);
    });

    it('can target a single mounted spoke by slug', async () => {
        const visited: string[] = [];
        const adapter = new RavensAdapter({
            id: 'weave:ravens-cycle',
            execute: async (invocation) => {
                visited.push(String((invocation.payload as { project_root: string }).project_root).replace(/\\/g, '/'));
                return {
                    weave_id: 'weave:ravens-cycle',
                    status: 'SUCCESS',
                    output: 'single target complete',
                    metadata: {},
                };
            },
        } as any);

        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens',
                payload: { action: 'cycle', spoke: 'keepos' },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.deepEqual(visited, [keepOsRoot.replace(/\\/g, '/')]);
        assert.equal(result.metadata?.target_slug, 'keepos');
    });
});
