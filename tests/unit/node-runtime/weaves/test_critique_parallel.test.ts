import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CritiqueWeave } from '../../../../src/node/core/runtime/host_workflows/critique.js';

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
        const weave = new CritiqueWeave({} as any, async () => responses[index++] ?? responses[responses.length - 1]);

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
    });
});
