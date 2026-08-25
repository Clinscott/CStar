import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { RavensCycleWeave, RavensStageContractAdapter } from  '../../src/node/core/runtime/weaves/ravens_cycle.js';
import type { RuntimeContext } from  '../../src/node/core/runtime/contracts.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-RAVENS-CYCLE',
        trace_id: 'TRACE-RAVENS-CYCLE',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Ravens cycle compatibility boundary', () => {
    it('fails closed without attempting cycle execution', async () => {
        const weave = new RavensCycleWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:ravens-cycle',
                payload: {
                    project_root: '/tmp/untrusted-target',
                    cwd: '/tmp/untrusted-target',
                },
            },
            createContext('/tmp/cstar'),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /cycle execution is decommissioned/i);
        assert.equal(result.metadata?.adapter, 'compatibility:ravens-cycle-rejected');
        assert.equal(result.metadata?.read_only, true);
        assert.equal(result.metadata?.execution_attempted, false);
        assert.equal(result.metadata?.cycle_result, undefined);
    });

    it('has no process runner or repository mutation primitive', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'weaves', 'ravens_cycle.ts'),
            'utf-8',
        );

        assert.doesNotMatch(
            source,
            /from ['"]node:fs['"]|from ['"]node:child_process['"]|execa|subprocess|\.spawn\(|\.exec\(|writeFile|write_text|checkout|commit_changes/,
        );
    });

    it('publishes read-only transitional stage contracts under stable weave ids', async () => {
        const adapter = new RavensStageContractAdapter('hunt');
        const result = await adapter.execute(
            {
                weave_id: 'weave:ravens-hunt',
                payload: {
                    project_root: '/tmp/cstar',
                    cwd: '/tmp/cstar',
                    target: {
                        target_kind: 'FILE',
                        target_path: 'src/core/sample.py',
                    },
                },
            },
            createContext('/tmp/cstar'),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal((result.metadata?.stage_result as any)?.stage, 'hunt');
        assert.equal((result.metadata?.stage_result as any)?.target.target_path, 'src/core/sample.py');
        assert.equal((result.metadata?.stage_result as any)?.metadata.contract_only, true);
    });
});
