import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reconcileDelegatedWorkflowRequest } from '../../src/node/core/runtime/host_workflows/delegated_request_reconciler.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

function source(relativePath: string): string {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf-8');
}

describe('One Mind retirement source boundary', () => {
    it('keeps fulfillment free of claim, model, reconciliation, and mutation dependencies', () => {
        const fulfillment = source('src/node/core/one_mind_broker/fulfillment.ts');

        assert.doesNotMatch(fulfillment, /requestHostText|requestHostDelegatedExecution|resolveHostDelegatedExecution/);
        assert.doesNotMatch(fulfillment, /claimHallOneMindRequest|claimNextHallOneMindRequest/);
        assert.doesNotMatch(fulfillment, /saveHallOneMind|ensureHealthySynapseDb|updateSynapseRecord|new Database/);
        assert.doesNotMatch(fulfillment, /StateRegistry|reconcileDelegatedWorkflowRequest|execFile|spawn\s*\(/);
        assert.match(fulfillment, /one-mind-retired-read-only/);
    });

    it('keeps manager and status projection free of Hall writes', () => {
        const manager = source('src/node/core/one_mind_broker/manager.ts');
        const command = source('src/node/core/commands/one-mind.ts');

        assert.doesNotMatch(manager, /saveHallOneMindBroker|claimHallOneMindRequest/);
        assert.doesNotMatch(command, /seedHallBrokerIfMissing|while\s*\(|process\.exit\s*\(/);
        assert.match(command, /Inspect retired One Mind Hall history \(read-only\)/);
    });

    it('removes implementation from delegation contracts and provider-native process fallback', () => {
        const delegation = source('src/core/host_delegation.ts');
        const taskKindDeclaration = delegation.match(/export type DelegatedExecutionTaskKind = ([^;]+);/)?.[1] ?? '';

        assert.doesNotMatch(taskKindDeclaration, /implementation/);
        assert.doesNotMatch(delegation, /invokeProviderNativeDelegation|corvus-delegate-native|\['exec'/);
        assert.match(delegation, /Provider-native delegated execution is retired/);
        assert.ok(
            delegation.indexOf('assertAdvisoryTaskKind(request.task_kind)')
                < delegation.indexOf('resolveHostProvider(env)'),
            'retired task kinds must be rejected before provider resolution or bridge execution',
        );
    });

    it('prevents historical broker state from steering Mimir or admitting subagents', () => {
        const bridge = source('src/core/one_mind_bridge.ts');
        const mimir = source('src/core/mimir_client.ts');

        assert.doesNotMatch(bridge, /CORVUS_ONE_MIND_BROKER_ACTIVE|interactive-host-session-bus/);
        assert.match(bridge, /executionAllowed: false/);
        assert.match(bridge, /retired-subagent-execution-boundary/);
        assert.doesNotMatch(mimir, /getHallOneMindBroker|saveHallOneMindRequest|listHallOneMindRequests/);
        assert.match(mimir, /if \(!decision\.executionAllowed\)/);
        assert.ok(
            mimir.indexOf('if (!decision.executionAllowed)')
                < mimir.indexOf("if (transportMode === 'host_session')"),
            'Mimir must reject a retired subagent before either transport runs',
        );
    });

    it('prevents Research and Critique from producing unfulfillable broker requests', () => {
        const research = source('src/node/core/runtime/host_workflows/research.ts');
        const critique = source('src/node/core/runtime/host_workflows/critique.ts');

        for (const workflow of [research, critique]) {
            assert.doesNotMatch(workflow, /saveHallOneMindRequest|queued_request_ids/);
            assert.doesNotMatch(workflow, /broker fulfillment/);
            assert.match(workflow, /non-terminal status/);
        }
    });

    it('tombstones callback reconciliation before any lifecycle mutation', () => {
        const reconciler = source('src/node/core/runtime/host_workflows/delegated_request_reconciler.ts');

        assert.match(reconciler, /delegated reconciliation is retired/);
        assert.doesNotMatch(reconciler, /saveHall|OrchestratorReaper|engraveReadyForReviewMemory|mapOutcome/);
    });

    it('rejects a legacy callback packet without touching its workspace', async () => {
        const missingRoot = `/tmp/cstar-retired-one-mind-reconcile-${process.pid}-${Date.now()}`;

        await assert.rejects(
            reconcileDelegatedWorkflowRequest(
                missingRoot,
                { request_id: 'legacy-callback' } as never,
            ),
            /delegated reconciliation is retired/,
        );
        assert.equal(fs.existsSync(missingRoot), false);
    });

    it('marks every compatibility host-subagent prompt advisory-only', () => {
        const subagents = source('src/core/host_subagents.ts');

        assert.match(subagents, /EXECUTION CLASS: advisory-only/);
        assert.match(subagents, /Do not modify files or state, run mutating commands, spawn workers, or claim implementation/);
        assert.doesNotMatch(subagents, /title: 'Backend Implementer'/);
        assert.doesNotMatch(subagents, /Own server-side implementation|Own UI-facing implementation|Own structural cleanup/);
    });

    it('removes One Mind from active runtime identity and execution ownership', () => {
        const dispatcher = source('src/node/core/runtime/dispatcher.ts');
        const state = source('src/node/core/state.ts');
        const processBridge = source('src/node/core/CorvusProcess.ts');
        const ceremony = source('src/node/ceremony.ts');
        const leases = source('src/core/lease_manager.py');

        assert.doesNotMatch(dispatcher, /assignedAgent[^\n]+ONE-MIND/);
        assert.doesNotMatch(state, /The One Mind: All intelligence/);
        assert.doesNotMatch(processBridge, /The One Mind returned no intelligence/);
        assert.match(ceremony, /RETIRED\/READ-ONLY/);
        assert.doesNotMatch(ceremony, /getHallOneMindBroker/);
        assert.doesNotMatch(leases, /agent_id: str = "ONE_MIND"/);
    });
});
