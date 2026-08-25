import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeContext, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import { ArchitectCompatibilityAdapter } from  '../../src/node/core/runtime/compat/architect.js';
import { CritiqueWeave, deps as critiqueDeps } from  '../../src/node/core/runtime/host_workflows/critique.js';
import { ResearchWeave, deps as researchDeps } from  '../../src/node/core/runtime/host_workflows/research.js';
import { closeDb } from  '../../src/tools/pennyone/intel/database.js';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

class NoopDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
        };
    }
}

function createContext(workspaceRoot: string, env: Record<string, string | undefined> = {}): RuntimeContext {
    return {
        mission_id: 'MISSION-HOST-WEAVES',
        trace_id: 'TRACE-HOST-WEAVES',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env,
        timestamp: Date.now(),
    };
}

describe('Host-session runtime weaves', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-weaves-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        mock.reset();
    });

    it('lets research execute through the Codex host session', async () => {
        const weave = new ResearchWeave(new NoopDispatchPort());
        mock.method(researchDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: 'delegate-1',
            provider: 'codex',
            status: 'completed',
            raw_text: JSON.stringify({
                summary: 'Codex summarized the intent and identified the next planning step.',
                research_artifacts: ['repo:local'],
            }),
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

        const result = await weave.execute(
            {
                weave_id: 'weave:research',
                payload: {
                    intent: 'hello world',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /Codex summarized/);
        assert.equal(result.metadata?.provider, 'codex');
        assert.deepStrictEqual(result.metadata?.research_artifacts, ['repo:local']);
    });

    it('lets research fan out bounded subquestions through parallel Codex host inference', async () => {
        const responses = [
            JSON.stringify({
                summary: 'Codex answered the repository-layout question.',
                research_artifacts: ['repo:layout'],
            }),
            JSON.stringify({
                summary: 'Codex answered the testing-surface question.',
                research_artifacts: ['repo:tests', 'repo:layout'],
            }),
        ];
        let index = 0;
        const weave = new ResearchWeave(new NoopDispatchPort());
        mock.method(researchDeps, 'requestHostDelegatedExecution', async () => ({
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
                weave_id: 'weave:research',
                payload: {
                    intent: 'understand the current runtime',
                    subquestions: ['layout', 'tests'],
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.parallel, true);
        assert.equal(result.metadata?.branch_count, 2);
        assert.deepStrictEqual(result.metadata?.research_artifacts, ['repo:layout', 'repo:tests']);
        assert.match(result.output, /repository-layout question/i);
        assert.match(result.output, /testing-surface question/i);
    });

    it('lets research execute through a non-Codex host provider when the runtime host bridge is configured', async () => {
        const weave = new ResearchWeave(new NoopDispatchPort());
        mock.method(researchDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: 'delegate-claude',
            provider: 'claude',
            status: 'completed',
            raw_text: JSON.stringify({
                summary: 'Claude summarized the intent and identified the next planning step.',
                research_artifacts: ['repo:claude'],
            }),
            metadata: {
                execution_surface: 'host-cli-inference',
                delegation_mode: 'provider-native',
            },
        }));

        const result = await weave.execute(
            {
                weave_id: 'weave:research',
                payload: {
                    intent: 'hello world',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
            },
            createContext(tmpRoot, { CORVUS_HOST_PROVIDER: 'claude' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /Claude summarized/);
        assert.equal(result.metadata?.provider, 'claude');
        assert.deepStrictEqual(result.metadata?.research_artifacts, ['repo:claude']);
    });

    it('lets critique execute through the Codex host session', async () => {
        const weave = new CritiqueWeave(new NoopDispatchPort());
        mock.method(critiqueDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: 'delegate-critique-1',
            provider: 'codex',
            status: 'completed',
            raw_text: JSON.stringify({
                needs_revision: true,
                critique: 'The bead should narrow the acceptance criteria.',
                evidence_source: 'repo:local',
                proposed_path: 'src/node/core/runtime/host_workflows/chant.ts',
            }),
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
                    cwd: tmpRoot,
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /narrow the acceptance criteria/i);
        assert.equal(result.metadata?.provider, 'codex');
        assert.equal((result.metadata?.critique_payload as { proposed_path?: string }).proposed_path, 'src/node/core/runtime/host_workflows/chant.ts');
    });

    it('lets critique fan out bounded focus areas through parallel Codex host inference', async () => {
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
        const weave = new CritiqueWeave(new NoopDispatchPort());
        mock.method(critiqueDeps, 'requestHostDelegatedExecution', async () => ({
            handle_id: `delegate-critique-${index}`,
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
                    cwd: tmpRoot,
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.parallel, true);
        assert.equal(result.metadata?.branch_count, 2);
        assert.match(result.output, /\[contracts\]/i);
        assert.match(result.output, /\[validation\]/i);
    });

    it('lets architect execute through the Codex host session', async () => {
        const weave = new ArchitectCompatibilityAdapter(new NoopDispatchPort(), async () =>
            JSON.stringify({
                is_approved: false,
                architect_opinion: 'Adopt the narrower path and keep the worker brief bounded.',
                final_proposed_path: 'src/node/core/runtime/host_workflows/chant.ts',
            }),
        );

        const result = await weave.execute(
            {
                weave_id: 'weave:architect',
                payload: {
                    bead: { title: 'Current bead' },
                    critique_payload: { critique: 'Tighten the path' },
                    cwd: tmpRoot,
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.match(result.output, /keep the worker brief bounded/i);
        assert.equal(result.metadata?.provider, 'codex');
    });

    it('tells architect to emit host-governable beads with repo-native checker shells', async () => {
        let capturedPrompt = '';
        const weave = new ArchitectCompatibilityAdapter(new NoopDispatchPort(), async (request) => {
            capturedPrompt = request.prompt;
            return JSON.stringify({
                proposal_summary: 'Emit one bounded bead.',
                beads: [
                    {
                        id: 'bead-governable',
                        title: 'Add a bounded command improvement',
                        rationale: 'Keep the bead governable.',
                        targets: ['src/node/core/commands/oracle.ts', 'tests/unit/test_oracle_command.test.ts'],
                        depends_on: [],
                        acceptance_criteria: ['A focused command improvement exists.'],
                        checker_shell: 'node scripts/run-tsx.mjs --test tests/unit/test_oracle_command.test.ts',
                    },
                ],
            });
        });

        const result = await weave.execute(
            {
                weave_id: 'weave:architect',
                payload: {
                    action: 'build_proposal',
                    intent: 'Add a bounded command improvement.',
                    research: {
                        summary: 'The work fits inside one command spoke plus tests.',
                        research_artifacts: ['src/node/core/commands/oracle.ts'],
                    },
                    cwd: tmpRoot,
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.match(capturedPrompt, /Host-governable beads must stay bounded/i);
        assert.match(capturedPrompt, /checker_shell must be executable in this repository without pnpm assumptions/i);
        assert.match(capturedPrompt, /node scripts\/run-tsx\.mjs --test/i);
        assert.match(capturedPrompt, /emit multiple smaller beads/i);
    });

});
