import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type {
    HostGovernorWeavePayload,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.ts';
import { HostGovernorWeave } from '../../src/node/core/runtime/weaves/host_governor.js';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public calls = 0;

    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('retired Host Governor must not dispatch');
    }
}

function createContext(): RuntimeContext {
    return {
        mission_id: 'MISSION-HOST-GOVERNOR-RETIRED',
        bead_id: 'bead:host-governor-retired',
        trace_id: 'TRACE-HOST-GOVERNOR-RETIRED',
        persona: 'ALFRED',
        workspace_root: '/tmp/cstar-host-governor-retired',
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: { CODEX_SHELL: '1' },
        timestamp: 1,
    };
}

describe('retired Host Governor compatibility adapter', () => {
    it('fails closed without dispatching or invoking the legacy cognition port', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let cognitionCalls = 0;
        const weave = new HostGovernorWeave(dispatchPort, async () => {
            cognitionCalls += 1;
            return 'should not run';
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Promote and execute every available bead.',
                    auto_execute: true,
                    auto_replan_blocked: true,
                    project_root: '/tmp/cstar-host-governor-retired',
                } satisfies HostGovernorWeavePayload,
            },
            createContext(),
        );

        assert.equal(dispatchPort.calls, 0);
        assert.equal(cognitionCalls, 0);
        assert.equal(result.weave_id, 'weave:host-governor');
        assert.equal(result.status, 'FAILURE');
        assert.equal(result.output, '');
        assert.match(result.error ?? '', /Host Governor is decommissioned/);
        assert.match(result.error ?? '', /explicit cstar-kernel lifecycle transitions/);
        assert.match(result.error ?? '', /cstar_forge_request -> cstar_forge_execute/);
        assert.match(result.error ?? '', /Researcher/);
        assert.deepEqual(result.metadata, {
            capability_status: 'decommissioned',
            execution_attempted: false,
            lifecycle_mutation_attempted: false,
            required_routes: {
                lifecycle: 'cstar-kernel',
                implementation: 'cstar_forge_request -> cstar_forge_execute',
                research: 'authorized Researcher request',
            },
        });
    });

    it('returns the same non-actuating result regardless of legacy authority flags', async () => {
        const weave = new HostGovernorWeave();
        const context = createContext();

        const enabled = await weave.execute({
            weave_id: 'weave:host-governor',
            payload: { auto_execute: true, auto_replan_blocked: true, dry_run: false },
        }, context);
        const disabled = await weave.execute({
            weave_id: 'weave:host-governor',
            payload: { auto_execute: false, auto_replan_blocked: false, dry_run: true },
        }, context);

        assert.deepEqual(enabled, disabled);
    });

    it('keeps only the fail-closed compatibility boundary in source', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'weaves', 'host_governor.ts'),
            'utf-8',
        );

        assert.doesNotMatch(source, /host_bridge|pennyone|database|host_governor_policy/);
        assert.doesNotMatch(source, /node:(?:fs|child_process)|\.dispatch\s*\(|saveHall|getDb|writeFile|appendFile/);
        assert.doesNotMatch(source, /weave:chant|weave:orchestrate|observation/i);
        assert.match(source, /execution_attempted:\s*false/);
        assert.match(source, /lifecycle_mutation_attempted:\s*false/);
    });
});
