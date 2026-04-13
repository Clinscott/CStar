import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildHostSubagentPrompt,
    getHostSubagentSpec,
    resolveHostSubagentProfile,
} from '../../src/core/host_subagents.js';

describe('Host subagent routing', () => {
    it('routes workflow and architecture beads to the architect profile', () => {
        const profile = resolveHostSubagentProfile({
            target_kind: 'WORKFLOW',
            target_path: 'src/node/core/runtime/weaves/orchestrate.ts',
            rationale: 'Architectural decomposition and provider-fit planning.',
        } as any);

        assert.equal(profile, 'architect');
        assert.equal(getHostSubagentSpec(profile).title, 'Architecture Orchestrator');
    });

    it('routes UI beads to the frontend profile', () => {
        const profile = resolveHostSubagentProfile({
            target_kind: 'FILE',
            target_path: 'src/ui/components/SchedulerPanel.tsx',
            rationale: 'Implement the released panel.',
        } as any);

        assert.equal(profile, 'frontend');
    });

    it('builds a profile-aware prompt envelope', () => {
        const prompt = buildHostSubagentPrompt(
            'reviewer',
            'Inspect the bead for regressions.',
            {
                boundary: 'subagent',
                task_kind: 'critique',
                target_paths: ['src/core/runtime.ts'],
                acceptance_criteria: ['List findings first.'],
                checker_shell: null,
            },
        );

        assert.match(prompt, /SPECIALIST ROLE: Review Specialist \(reviewer\)/);
        assert.match(prompt, /TASK KIND: critique/);
        assert.match(prompt, /Inspect the bead for regressions\./);
    });

    it('exposes named council expert profiles', () => {
        assert.equal(getHostSubagentSpec('torvalds').title, 'Torvalds Protocol');
        assert.equal(getHostSubagentSpec('karpathy').title, 'Karpathy Protocol');

        const prompt = buildHostSubagentPrompt(
            'karpathy',
            'Inspect the bead for model/runtime boundary failures.',
            {
                boundary: 'subagent',
                task_kind: 'research',
                target_paths: ['src/node/core/runtime/host_workflows/research.ts'],
                acceptance_criteria: ['Surface deterministic interface gaps.'],
                checker_shell: null,
            },
        );

        assert.match(prompt, /SPECIALIST ROLE: Karpathy Protocol \(karpathy\)/);
        assert.match(prompt, /AI-systems critique/);
    });
});
