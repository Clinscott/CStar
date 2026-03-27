import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildHostGovernorResumeInvocation,
    formatPlanningDigestBadge,
    formatPlanningSessionSummary,
    resumeHostGovernorIfAvailable,
} from  '../../src/node/core/operator_resume.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import { closeDb, saveHallPlanningSession } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'Host governor synchronized the mission.',
        };
    }
}

describe('Operator entry host-governor resume', () => {
    it('builds a single canonical host-governor resume invocation', () => {
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
                    auto_execute: true,
                    auto_replan_blocked: true,
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

    it('does nothing when no host provider is active', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let woke = false;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CORVUS_HOST_SESSION_ACTIVE: 'false' },
            },
            {
                wakeKernel: async () => {
                    woke = true;
                },
            },
        );

        assert.equal(result.resumed, false);
        assert.equal(result.provider, null);
        assert.equal(result.wokeKernel, false);
        assert.equal(woke, false);
        assert.equal(dispatchPort.invocation, null);
    });

    it('wakes the kernel and dispatches the host governor when a host provider is active', async () => {
        const dispatchPort = new CaptureDispatchPort();
        let wakeCount = 0;

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: '/tmp/corvus',
                cwd: '/tmp/corvus',
                env: { CODEX_SHELL: '1' },
                task: 'Resume the operator surface.',
                source: 'cli',
            },
            {
                wakeKernel: async () => {
                    wakeCount += 1;
                },
            },
        );

        assert.equal(result.resumed, true);
        assert.equal(result.provider, 'codex');
        assert.equal(result.wokeKernel, true);
        assert.equal(result.governorResult?.status, 'SUCCESS');
        assert.equal(wakeCount, 1);
        assert.deepEqual(dispatchPort.invocation, {
            weave_id: 'weave:host-governor',
            payload: {
                task: 'Resume the operator surface.',
                ledger: undefined,
                auto_execute: true,
                auto_replan_blocked: true,
                max_parallel: 1,
                max_promotions: undefined,
                dry_run: undefined,
                project_root: '/tmp/corvus',
                cwd: '/tmp/corvus',
                source: 'cli',
            },
            session: undefined,
            target: undefined,
        });
    });

    it('formats compact planning session summaries from Hall digest metadata', () => {
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

    it('captures planning summary from the Hall when resume dispatch points to a planning session', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-resume-summary-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-CLI',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'resume host cli',
            normalized_intent: 'resume host cli',
            summary: 'Proposal ready for review.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-CLI',
                branch_ledger_digest: {
                    total_branches: 2,
                    groups: [
                        { branch_kind: 'research', branch_count: 2, needs_revision: false },
                    ],
                    artifacts: ['README.md'],
                },
            },
        });

        const dispatchPort: RuntimeDispatchPort = {
            async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
                return {
                    weave_id: invocation.weave_id,
                    status: 'SUCCESS',
                    output: 'Host governor synchronized the mission.',
                    metadata: {
                        planning_session_id: 'chant-session:TRACE-CLI',
                    },
                };
            },
        };

        const result = await resumeHostGovernorIfAvailable(
            dispatchPort,
            {
                workspaceRoot: tmpRoot,
                cwd: tmpRoot,
                env: { CODEX_SHELL: '1' },
                task: 'Resume the operator surface.',
                source: 'cli',
            },
            {
                wakeKernel: async () => {},
            },
        );

        assert.equal(result.planningSummary, 'PROPOSAL_REVIEW | TRACE-CLI | {R=2 A=1} | Proposal ready for review.');
        closeDb();
    });
});
