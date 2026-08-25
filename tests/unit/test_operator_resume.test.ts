import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    buildHostGovernorResumeInvocation,
    executeHostGovernorResume,
    formatPlanningDigestBadge,
    formatPlanningSessionSummary,
    resumeHostGovernorIfAvailable,
} from '../../src/node/core/operator_resume.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.js';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public calls = 0;

    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('operator resume must not dispatch');
    }
}

describe('retired operator Host Governor resume compatibility', () => {
    it('builds only a dry-run, non-actuating legacy invocation', () => {
        assert.deepEqual(
            buildHostGovernorResumeInvocation({
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                task: 'Resume the operator surface.',
                source: 'cli',
                autoExecute: true,
                autoReplanBlocked: true,
                dryRun: false,
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
                    dry_run: true,
                    project_root: '/tmp/corvus',
                    cwd: '/tmp/corvus',
                    source: 'cli',
                },
                session: undefined,
                target: undefined,
            },
        );
    });

    it('does not wake or dispatch through the direct compatibility function', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let wakeCalls = 0;

        const result = await executeHostGovernorResume(
            dispatchPort,
            { workspaceRoot: '/tmp/corvus', cwd: '/tmp/corvus' },
            'codex',
            { wakeKernel: async () => { wakeCalls += 1; } },
        );

        assert.equal(dispatchPort.calls, 0);
        assert.equal(wakeCalls, 0);
        assert.equal(result.resumed, false);
        assert.equal(result.provider, 'codex');
        assert.equal(result.wokeKernel, false);
        assert.equal(result.governorResult?.status, 'TRANSITIONAL');
        assert.equal(result.governorResult?.metadata?.execution_attempted, false);
        assert.equal(result.governorResult?.metadata?.kernel_wake_attempted, false);
    });

    it('does not wake or dispatch when provider discovery sees an active host', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let wakeCalls = 0;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CODEX_SHELL: '1' },
            },
            { wakeKernel: async () => { wakeCalls += 1; } },
        );

        assert.equal(dispatchPort.calls, 0);
        assert.equal(wakeCalls, 0);
        assert.equal(result.resumed, false);
        assert.equal(result.provider, 'codex');
        assert.equal(result.wokeKernel, false);
    });

    it('formats planning session summaries without resuming execution', () => {
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

    it('proves operator resume and TUI status/entry contain no wake or resume dispatch', () => {
        const sourceRoot = path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core');
        const resumeSource = fs.readFileSync(path.join(sourceRoot, 'operator_resume.ts'), 'utf-8');
        const tuiSource = fs.readFileSync(path.join(sourceRoot, 'tui', 'operator_tui.ts'), 'utf-8');

        assert.doesNotMatch(resumeSource, /ANS\.wake|\.dispatch\s*\(/);
        assert.doesNotMatch(tuiSource, /resumeHostGovernorIfAvailable|appendResumeEvents/);
        assert.doesNotMatch(tuiSource, /Resume host-governed operator/);
        assert.doesNotMatch(tuiSource, /StateRegistry\.postToBlackboard|StateRegistry\.save/);
        assert.match(tuiSource, /Local handoff is decommissioned/);
        assert.match(tuiSource, /Local broadcast is decommissioned/);
        assert.doesNotMatch(tuiSource, /state\.gungnir_score\.toFixed|state\.intent_integrity\.toFixed/);
        assert.match(tuiSource, /HUD\.boxRow\('GUNGNIR', 'not measured'/);
        assert.match(tuiSource, /HUD\.boxRow\('INTEGRITY', 'not measured'/);
    });
});
