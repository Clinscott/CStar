import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeContext, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';
import { ArchitectWeave } from '../../src/node/core/runtime/weaves/architect.ts';
import { CompressWeave } from '../../src/node/core/runtime/weaves/compress.ts';
import { CritiqueWeave } from '../../src/node/core/runtime/weaves/critique.ts';
import { ResearchWeave } from '../../src/node/core/runtime/weaves/research.ts';
import { closeDb, getHallEpisodicMemory, upsertHallBead, upsertHallRepository } from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId } from '../../src/types/hall.ts';

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
    });

    it('lets research execute through the Codex host session', async () => {
        const weave = new ResearchWeave(new NoopDispatchPort(), async () =>
            JSON.stringify({
                summary: 'Codex summarized the intent and identified the next planning step.',
                research_artifacts: ['repo:local'],
            }),
        );

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

    it('lets research execute through a non-Codex host provider when the runtime host bridge is configured', async () => {
        const weave = new ResearchWeave(new NoopDispatchPort(), async () =>
            JSON.stringify({
                summary: 'Claude summarized the intent and identified the next planning step.',
                research_artifacts: ['repo:claude'],
            }),
        );

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
        const weave = new CritiqueWeave(new NoopDispatchPort(), async () =>
            JSON.stringify({
                needs_revision: true,
                critique: 'The bead should narrow the acceptance criteria.',
                evidence_source: 'repo:local',
                proposed_path: 'src/node/core/runtime/weaves/chant.ts',
            }),
        );

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
        assert.equal((result.metadata?.critique_payload as { proposed_path?: string }).proposed_path, 'src/node/core/runtime/weaves/chant.ts');
    });

    it('lets architect execute through the Codex host session', async () => {
        const weave = new ArchitectWeave(new NoopDispatchPort(), async () =>
            JSON.stringify({
                is_approved: false,
                architect_opinion: 'Adopt the narrower path and keep the worker brief bounded.',
                final_proposed_path: 'src/node/core/runtime/weaves/chant.ts',
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
        const weave = new ArchitectWeave(new NoopDispatchPort(), async (request) => {
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

    it('lets compress execute through the Codex host session and persist memory', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.8,
            intent_integrity: 95,
            metadata: { source: 'unit-test' },
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallBead({
            bead_id: 'bead-codex',
            repo_id: repoId,
            rationale: 'Capture the tactical thread summary.',
            status: 'RESOLVED',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });

        const weave = new CompressWeave(async () =>
            JSON.stringify({
                tactical_summary: 'Codex compressed the successful tactical changes.',
                files_touched: ['src/node/core/runtime/weaves/chant.ts'],
                successes: ['Bounded the worker brief'],
                bead_id: 'bead-codex',
            }),
        );

        const result = await weave.execute(
            {
                weave_id: 'weave:compress',
                payload: {
                    bead_id: 'bead-codex',
                    bead_intent: 'Capture the tactical summary.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    git_diff: 'diff --git a/file b/file\n+change\n',
                    source: 'runtime',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.persisted, true);

        const memory = getHallEpisodicMemory(String(result.metadata?.memory_id), tmpRoot);
        assert.ok(memory);
        assert.equal(memory?.tactical_summary, 'Codex compressed the successful tactical changes.');
        assert.deepStrictEqual(memory?.files_touched, ['src/node/core/runtime/weaves/chant.ts']);
        assert.deepStrictEqual(memory?.successes, ['Bounded the worker brief']);
        assert.equal(memory?.metadata?.provider, 'codex');
    });
});
