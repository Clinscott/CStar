import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    buildHostGovernorResumeInvocation,
    formatPlanningDigestBadge,
    formatPlanningSessionSummary,
    resumeHostGovernorIfAvailable,
} from '../../src/node/core/operator_resume.js';
import type {
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';

class TrapDispatchPort implements RuntimeDispatchPort {
    public calls = 0;

    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('legacy resume must not dispatch');
    }
}

describe('retired operator host-governor resume', () => {
    it('builds only a non-executing compatibility invocation', () => {
        assert.deepEqual(
            buildHostGovernorResumeInvocation({
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                task: 'Resume the operator surface.',
                source: 'cli',
            }),
            {
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Resume the operator surface.',
                    ledger: undefined,
                    auto_execute: false,
                    auto_replan_blocked: false,
                    max_parallel: 1,
                    max_promotions: undefined,
                    dry_run: undefined,
                    project_root: '/tmp/corvus',
                    cwd: '/tmp/corvus',
                    source: 'cli',
                },
                session: undefined,
                target: undefined,
            },
        );
    });

    it('does not propagate former execution or replanning flags', () => {
        const invocation = buildHostGovernorResumeInvocation({
            workspaceRoot: '/tmp/corvus',
            cwd: '/tmp/corvus',
            autoExecute: true,
            autoReplanBlocked: true,
        });

        assert.equal(invocation.payload.auto_execute, false);
        assert.equal(invocation.payload.auto_replan_blocked, false);
    });

    it('does nothing without explicit resume intent', async () => {
        const dispatchPort = new TrapDispatchPort();
        let wakeCount = 0;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CODEX_SHELL: '1' },
            },
            { wakeKernel: async () => { wakeCount += 1; } },
        );

        assert.deepEqual(result, { resumed: false, provider: null, wokeKernel: false });
        assert.equal(wakeCount, 0);
        assert.equal(dispatchPort.calls, 0);
    });

    it('explicit legacy resume fails without wake, dispatch, or planning summary', async () => {
        const dispatchPort = new TrapDispatchPort();
        let wakeCount = 0;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                explicitHostResume: true,
                env: { CODEX_SHELL: '1' },
                task: 'Resume the operator surface.',
                source: 'cli',
            },
            { wakeKernel: async () => { wakeCount += 1; } },
        );

        assert.equal(result.resumed, false);
        assert.equal(result.provider, null);
        assert.equal(result.wokeKernel, false);
        assert.equal(result.planningSummary, undefined);
        assert.equal(result.governorResult?.status, 'FAILURE');
        assert.equal(result.governorResult?.error, 'legacy_host_governor_resume_retired_use_cstar_handoff');
        assert.equal(result.governorResult?.metadata?.execution_dispatched, false);
        assert.equal(result.governorResult?.metadata?.kernel_wake_started, false);
        assert.equal(result.governorResult?.metadata?.hall_mutation_started, false);
        assert.equal(wakeCount, 0);
        assert.equal(dispatchPort.calls, 0);
    });

    it('retains pure planning-summary formatting for historical display', () => {
        const session: any = {
            session_id: 'chant-session:TRACE-RESUME',
            status: 'PROPOSAL_REVIEW',
            normalized_intent: 'resume planning',
            summary: 'Proposal ready.',
            metadata: {
                trace_id: 'TRACE-RESUME',
                branch_ledger_digest: {
                    total_branches: 3,
                    groups: [
                        { branch_kind: 'research', branch_count: 2, needs_revision: false },
                        { branch_kind: 'critique', branch_count: 1, needs_revision: true },
                    ],
                    artifacts: ['src/runtime.ts'],
                },
            },
        };

        assert.equal(formatPlanningDigestBadge(session), 'R=2 C=1 REV=1 A=1');
        assert.equal(
            formatPlanningSessionSummary(session),
            'PROPOSAL_REVIEW | TRACE-RESUME | {R=2 C=1 REV=1 A=1} | Proposal ready.',
        );
    });

    it('contains no Hall-summary read in the explicit resume path', () => {
        const source = fs.readFileSync(
            new URL('../../src/node/core/operator_resume.ts', import.meta.url),
            'utf8',
        );
        const resumePath = source.slice(
            source.indexOf('export async function executeHostGovernorResume'),
            source.indexOf('export async function resumeHostGovernorIfAvailable'),
        );

        for (const forbidden of [
            'getHallPlanningSession(',
            'listHallPlanningSessions(',
            'resolveResumePlanningSession(',
            'resolveResultPlanningSession(',
            'buildResultPlanningSummary(',
        ]) {
            assert.equal(resumePath.includes(forbidden), false, `resume path retained ${forbidden}`);
        }
    });
});
