import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.ts';
import type { RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { closeDb, getHallRepositoryRecord, saveHallMountedSpoke } from '../../src/tools/pennyone/intel/database.ts';
import { StateRegistry } from '../../src/node/core/state.ts';

class EchoSpokeAdapter implements RuntimeAdapter<{ message: string }> {
    public readonly id = 'weave:spoke-echo';

    public async execute(
        invocation: WeaveInvocation<{ message: string }>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: invocation.payload.message,
            metadata: {
                workspace_root: context.workspace_root,
                target_domain: context.target_domain,
                spoke_name: context.spoke_name,
                spoke_root: context.spoke_root,
                requested_root: context.requested_root,
            },
        };
    }
}

describe('Mounted spoke runtime targeting (CS-P7-04)', () => {
    let tmpRoot: string;
    let tmpSpoke: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-spoke-runtime-'));
        tmpSpoke = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-spoke-target-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        registry.setRoot(tmpRoot);
        closeDb();
        StateRegistry.save(StateRegistry.get());

        const repo = getHallRepositoryRecord(tmpRoot);
        if (!repo) {
            throw new Error('Failed to materialize Hall repository for spoke runtime test.');
        }

        saveHallMountedSpoke({
            spoke_id: 'spoke:keepos',
            repo_id: repo.repo_id,
            slug: 'keepos',
            kind: 'git',
            root_path: tmpSpoke,
            remote_url: 'https://github.com/example/KeepOS.git',
            default_branch: 'main',
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

    it('resolves a spoke selector to the mounted estate root', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        dispatcher.registerAdapter(new EchoSpokeAdapter());

        const result = await dispatcher.dispatch({
            weave_id: 'weave:spoke-echo',
            payload: { message: 'estate ready' },
            target: {
                domain: 'spoke',
                spoke: 'keepos',
                requested_path: 'spoke://keepos/src/main.ts',
            },
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.workspace_root, tmpSpoke.replace(/\\/g, '/'));
        assert.equal(result.metadata?.target_domain, 'spoke');
        assert.equal(result.metadata?.spoke_name, 'keepos');
        assert.equal(result.metadata?.spoke_root, tmpSpoke.replace(/\\/g, '/'));
        assert.equal(result.metadata?.requested_root, 'spoke://keepos/src/main.ts');
    });

    it('fails early when a requested spoke is not mounted', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        dispatcher.registerAdapter(new EchoSpokeAdapter());

        const result = await dispatcher.dispatch({
            weave_id: 'weave:spoke-echo',
            payload: { message: 'estate ready' },
            target: {
                domain: 'spoke',
                spoke: 'missing',
            },
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requested estate target/i);
    });
});
