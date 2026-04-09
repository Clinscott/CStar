import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeContext } from  '../../src/node/core/runtime/contracts.js';
import { DistillWeave } from  '../../src/node/core/runtime/weaves/distill.js';
import {
    closeDb,
    getEpisodicMemory,
    getEpisodicMemoryById,
    upsertHallBead,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId } from  '../../src/types/hall.js';

function createContext(workspaceRoot: string, env: Record<string, string | undefined> = {}): RuntimeContext {
    return {
        mission_id: 'MISSION-COMPRESS',
        trace_id: 'TRACE-COMPRESS',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env,
        timestamp: Date.now(),
    };
}

describe('Context compressor runtime weave (CS-THREADS-P2)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-compress-'));
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

    it('persists host-distilled episodic memory when the Codex host returns strict JSON', async () => {
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
            bead_id: 'bead-host',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/node/core/runtime/weaves/distill.ts',
            rationale: 'Capture a host-distilled tactical summary.',
            status: 'RESOLVED',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });

        const weave = new DistillWeave(async () => JSON.stringify({
            tactical_summary: 'Compressed the successful tactical path.',
            files_touched: ['src/node/core/runtime/weaves/distill.ts'],
            successes: ['Persisted episodic memory'],
            bead_id: 'bead-host',
        }));

        const result = await weave.execute(
            {
                weave_id: 'weave:distill',
                payload: {
                    bead_id: 'bead-host',
                    bead_intent: 'Summarize the tactical changes from a bead diff.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    git_diff: 'diff --git a/src/a.ts b/src/a.ts\n+export const x = 1;\n',
                    source: 'runtime',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.persisted, true);

        const memoryId = String(result.metadata?.memory_id);
        const memory = getEpisodicMemoryById(memoryId);
        assert.ok(memory);
        assert.equal(memory?.bead_id, 'bead-host');
        assert.equal(memory?.tactical_summary, 'Compressed the successful tactical path.');
        assert.deepEqual(memory?.files_touched, ['src/node/core/runtime/weaves/distill.ts']);
        assert.deepEqual(memory?.successes, ['Persisted episodic memory']);
    });

    it('fails when host-distill JSON provides malformed files_touched', async () => {
        const weave = new DistillWeave(async () => JSON.stringify({
            tactical_summary: 'Compressed the successful tactical path.',
            files_touched: 'src/node/core/runtime/weaves/distill.ts',
            bead_id: 'bead-1',
        }));

        const result = await weave.execute(
            {
                weave_id: 'weave:distill',
                payload: {
                    bead_id: 'bead-1',
                    bead_intent: 'Summarize the tactical changes from a bead diff.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    git_diff: 'diff --git a/src/a.ts b/src/a.ts\n+export const x = 1;\n',
                    source: 'runtime',
                },
            },
            createContext(tmpRoot, { CODEX_SHELL: '1' }),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /files_touched must be an array of strings/i);
    });

    it('persists an episodic memory row when a tactical summary is provided', async () => {
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
            bead_id: 'bead-1',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/node/core/runtime/weaves/distill.ts',
            rationale: 'Capture the tactical thread summary.',
            status: 'RESOLVED',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });

        const weave = new DistillWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:distill',
                payload: {
                    bead_id: 'bead-1',
                    bead_intent: 'Capture the tactical summary.',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    tactical_summary: 'Persisted the Hall-backed tactical summary for the completed bead.',
                    files_touched: ['src/node/core/runtime/weaves/distill.ts'],
                    successes: ['Wrote episodic memory'],
                    proposal_id: 'proposal-1',
                    validation_id: 'validation-1',
                    metadata: { source: 'unit-test', iteration: 1 },
                    source: 'runtime',
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.persisted, true);

        const memoryId = String(result.metadata?.memory_id);
        const memory = getEpisodicMemoryById(memoryId);
        const beadMemories = getEpisodicMemory('bead-1');

        assert.ok(memory);
        assert.equal(memory?.bead_id, 'bead-1');
        assert.equal(memory?.tactical_summary, 'Persisted the Hall-backed tactical summary for the completed bead.');
        assert.deepStrictEqual(memory?.files_touched, ['src/node/core/runtime/weaves/distill.ts']);
        assert.deepStrictEqual(memory?.successes, ['Wrote episodic memory']);
        assert.deepStrictEqual(memory?.metadata, {
            bead_intent: 'Capture the tactical summary.',
            proposal_id: 'proposal-1',
            validation_id: 'validation-1',
            source: 'unit-test',
            iteration: 1,
        });
        assert.equal(beadMemories.length, 1);
        assert.equal(beadMemories[0]?.memory_id, memoryId);
    });

    it('fails fast when the bead intent is missing', async () => {
        const weave = new DistillWeave();

        const result = await weave.execute(
            {
                weave_id: 'weave:distill',
                payload: {
                    bead_id: 'bead-1',
                    bead_intent: '   ',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
            },
            createContext(tmpRoot, { GEMINI_CLI_ACTIVE: 'true' }),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires a bead_intent/i);
    });
});
