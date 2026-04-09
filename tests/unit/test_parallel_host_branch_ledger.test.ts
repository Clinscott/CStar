import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ResearchWeave, deps as researchDeps } from '../../src/node/core/runtime/host_workflows/research.js';
import { CritiqueWeave, deps as critiqueDeps } from '../../src/node/core/runtime/host_workflows/critique.js';
import { closeDb, listHallOneMindBranches, summarizeHallOneMindBranches } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

describe('Parallel host branch ledger persistence', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-branch-ledger-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        mock.reset();
    });

    it('persists filtered research and critique branch records into the Hall', async () => {
        const researchResponses = [
            JSON.stringify({ summary: 'Layout branch summary.', research_artifacts: ['repo:layout'] }),
            JSON.stringify({ summary: 'Tests branch summary.', research_artifacts: ['repo:tests'] }),
        ];
        let researchIndex = 0;
        const researchWeave = new ResearchWeave({} as any);
        mock.method(researchDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: `delegate-${researchIndex}`,
            provider: 'codex',
            status: 'completed',
            raw_text: researchResponses[researchIndex++] ?? researchResponses[researchResponses.length - 1],
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

        await researchWeave.execute(
            {
                weave_id: 'weave:research',
                payload: {
                    intent: 'understand runtime',
                    subquestions: ['layout', 'tests'],
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as any,
            {
                mission_id: 'mission-1',
                bead_id: 'bead-1',
                trace_id: 'trace-branch-ledger',
                persona: 'O.D.I.N.',
                workspace_root: tmpRoot,
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                session_id: 'session-1',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                timestamp: Date.now(),
            } as any,
        );

        const critiqueResponses = [
            JSON.stringify({
                needs_revision: true,
                critique: 'Tighten the contract.',
                evidence_source: 'repo:contracts',
                proposed_path: 'src/runtime/example.ts',
            }),
            JSON.stringify({
                needs_revision: false,
                critique: 'Validation path is fine.',
                evidence_source: 'repo:validation',
                proposed_path: 'src/runtime/example.ts',
            }),
        ];
        let critiqueIndex = 0;
        const critiqueWeave = new CritiqueWeave({} as any);
        mock.method(critiqueDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: `delegate-critique-${critiqueIndex}`,
            provider: 'codex',
            status: 'completed',
            raw_text: critiqueResponses[critiqueIndex++] ?? critiqueResponses[critiqueResponses.length - 1],
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

        await critiqueWeave.execute(
            {
                weave_id: 'weave:critique',
                payload: {
                    bead: { title: 'Current bead' },
                    research: { summary: 'Research complete' },
                    focus_areas: ['contracts', 'validation'],
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as any,
            {
                mission_id: 'mission-1',
                bead_id: 'bead-1',
                trace_id: 'trace-branch-ledger',
                persona: 'O.D.I.N.',
                workspace_root: tmpRoot,
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                session_id: 'session-1',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                timestamp: Date.now(),
            } as any,
        );

        const branches = listHallOneMindBranches(tmpRoot, { traceId: 'trace-branch-ledger' });
        assert.equal(branches.length, 4);

        const researchBranch = branches.find((entry) => entry.branch_kind === 'research' && entry.branch_label === 'layout');
        assert.ok(researchBranch);
        assert.equal(researchBranch?.session_id, 'session-1');
        assert.equal(researchBranch?.summary, 'Layout branch summary.');
        assert.deepEqual(researchBranch?.artifacts, ['repo:layout']);
        assert.equal(researchBranch?.metadata?.intent, 'understand runtime');
        assert.equal((researchBranch?.metadata as Record<string, unknown>).prompt, undefined);

        const critiqueBranch = branches.find((entry) => entry.branch_kind === 'critique' && entry.branch_label === 'contracts');
        assert.ok(critiqueBranch);
        assert.equal(critiqueBranch?.summary, 'Tighten the contract.');
        assert.equal(critiqueBranch?.metadata?.needs_revision, true);
        assert.equal(critiqueBranch?.metadata?.evidence_source, 'repo:contracts');
        assert.equal((critiqueBranch?.metadata as Record<string, unknown>).raw_text, undefined);

        const digest = summarizeHallOneMindBranches(tmpRoot, { traceId: 'trace-branch-ledger', sessionId: 'session-1' });
        assert.ok(digest);
        assert.equal(digest?.total_branches, 4);
        assert.equal(digest?.group_count, 2);
        assert.deepEqual(digest?.branch_kinds, ['critique', 'research']);
        assert.ok(digest?.artifacts.includes('repo:layout'));
        assert.ok(digest?.artifacts.includes('repo:tests'));

        const critiqueGroup = digest?.groups.find((entry) => entry.branch_kind === 'critique');
        assert.ok(critiqueGroup);
        assert.equal(critiqueGroup?.needs_revision, true);
        assert.deepEqual(critiqueGroup?.evidence_sources, ['repo:contracts', 'repo:validation']);
        assert.equal((critiqueGroup as Record<string, unknown> | undefined)?.prompt, undefined);
    });
});
