import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CritiqueWeave, deps } from '../../../../src/node/core/runtime/host_workflows/critique.js';

describe('CritiqueWeave parallel focus-area behavior', () => {
    it('merges bounded focus-area critiques in input order', async () => {
        const responses = [
            JSON.stringify({
                needs_revision: true,
                critique: 'Tighten the acceptance criteria.',
                evidence_source: 'repo:contracts',
                proposed_path: 'src/node/core/runtime/host_workflows/chant.ts',
            }),
            JSON.stringify({
                needs_revision: false,
                critique: 'The checker shell is acceptable.',
                evidence_source: 'repo:validation',
                proposed_path: 'src/node/core/runtime/host_workflows/chant.ts',
            }),
        ];
        let index = 0;
        const weave = new CritiqueWeave({} as any);
        mock.method(deps, 'requestHostDelegatedExecution', async () => ({
            handle_id: `delegate-${index}`,
            provider: 'codex',
            status: 'completed',
            raw_text: responses[index++] ?? responses[responses.length - 1],
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

        const result = await weave.execute(
            {
                weave_id: 'weave:critique',
                payload: {
                    bead: { title: 'Current bead' },
                    research: { summary: 'Local research' },
                    focus_areas: ['contracts', 'validation'],
                    cwd: '.',
                },
            } as any,
            {
                workspace_root: '.',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            } as any,
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.equal(result.metadata?.parallel, true);
        assert.equal(result.metadata?.branch_count, 2);
        assert.match(result.output, /\[contracts\] Tighten the acceptance criteria\./);
        assert.match(result.output, /\[validation\] The checker shell is acceptable\./);
        assert.equal((result.metadata?.critique_payload as { needs_revision?: boolean }).needs_revision, true);
        mock.reset();
    });

    it('fails non-terminal delegated critique instead of enqueueing One Mind work', async () => {
        const savedBranches: Array<Record<string, unknown>> = [];
        const weave = new CritiqueWeave({} as any);
        mock.method(deps, 'requestHostDelegatedExecution', async () => ({
            handle_id: 'retired-async-handle',
            provider: 'codex',
            status: 'running',
        }));
        mock.method(deps, 'saveHallOneMindBranch', (record: Record<string, unknown>) => {
            savedBranches.push(record);
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:critique',
                payload: {
                    bead: { title: 'Current bead' },
                    research: { summary: 'Local research' },
                    focus_areas: ['contracts', 'validation'],
                    cwd: '.',
                    project_root: '.',
                },
            } as any,
            {
                workspace_root: '.',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                bead_id: 'activation:critique:1',
                trace_id: 'trace-critique-queued',
                mission_id: 'mission-critique-queued',
            } as any,
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /non-terminal status 'running'/i);
        assert.equal(savedBranches.length, 2);
        assert.equal(savedBranches[0]?.status, 'FAILED');
        mock.reset();
    });

    it('defaults critique to named council experts', async () => {
        const capturedRequests: Array<Record<string, unknown>> = [];
        const weave = new CritiqueWeave({} as any);
        mock.method(deps, 'requestHostDelegatedExecution', async (request: Record<string, unknown>) => {
            capturedRequests.push(request);
            return {
                handle_id: `delegate-${capturedRequests.length}`,
                provider: 'codex',
                status: 'completed',
                raw_text: JSON.stringify({
                    needs_revision: false,
                    critique: 'Bounded critique.',
                    evidence_source: 'repo:test',
                    proposed_path: 'src/example.ts',
                }),
            };
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:critique',
                payload: {
                    bead: { title: 'Current bead' },
                    research: { summary: 'Local research' },
                    cwd: '.',
                    project_root: '.',
                },
            } as any,
            {
                workspace_root: '.',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                bead_id: 'activation:critique:2',
                trace_id: 'trace-critique-council',
                mission_id: 'mission-critique-council',
            } as any,
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(capturedRequests.length, 5);
        assert.equal(capturedRequests[0]?.subagent_profile, 'torvalds');
        assert.match(String(capturedRequests[1]?.prompt ?? ''), /KARPATHY/);
        assert.match(String(capturedRequests[1]?.prompt ?? ''), /Anti-Behavior:/);
        assert.match(String(capturedRequests[1]?.prompt ?? ''), /Critique Instruction:/);
        assert.doesNotMatch(String(capturedRequests[1]?.prompt ?? ''), /Root Persona Overlay:/);
        mock.reset();
    });
});
