import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    upsertHallBead,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { searchMatrix } from '../../src/tools/pennyone/live/search.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId } from '../../src/types/hall.js';

let tmpRoot: string;

beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-pennyone-hall-rank-'));
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

test('searchMatrix demotes archived Hall beads behind live runtime authority matches', async () => {
    const probe = 'rankprobe-chant-architect-authority';
    const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
    upsertHallRepository({
        root_path: tmpRoot,
        name: path.basename(tmpRoot),
        status: 'AWAKE',
        active_persona: 'ALFRED',
        baseline_gungnir_score: 7.6,
        intent_integrity: 91,
        created_at: 1700000000000,
        updated_at: 1700000000000,
    });

    upsertHallBead({
        bead_id: 'bead-chant-shell-archived',
        repo_id: repoId,
        target_kind: 'FILE',
        target_ref: 'notes/architect.txt',
        target_path: 'notes/architect.txt',
        rationale: `Architect owns proposal synthesis for chant shell planning ${probe}.`,
        contract_refs: ['docs/legacy_archive/root_docs/tasks.qmd'],
        baseline_scores: {},
        acceptance_criteria: 'Legacy architect planning note.',
        status: 'READY_FOR_REVIEW',
        source_kind: 'CHANT',
        architect_opinion: `Architect owns proposal synthesis ${probe}.`,
        metadata: {
            archived: true,
            authority_tier: 'archive',
        },
        created_at: 1700000000100,
        updated_at: 1700000000100,
    });

    upsertHallBead({
        bead_id: 'chant-public-host-front',
        repo_id: repoId,
        target_kind: 'FILE',
        target_ref: 'src/node/core/runtime/host_workflows/chant_planner.ts',
        target_path: 'notes/chant-planner.txt',
        rationale: `Chant owns host-native planning authority and internal architect synthesis ${probe}.`,
        contract_refs: ['src/node/core/runtime/host_workflows/chant_planner.ts'],
        baseline_scores: {},
        acceptance_criteria: 'Live chant planner remains the canonical authority.',
        status: 'OPEN',
        source_kind: 'CHANT',
        architect_opinion: `Architect synthesis lives inside chant ${probe}.`,
        metadata: {
            archived: false,
            authority_tier: 'live_authority',
        },
        created_at: 1700000000200,
        updated_at: 1700000000200,
    });

    let output = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += chunk.toString();
        return true;
    }) as typeof process.stdout.write;

    try {
        await searchMatrix(probe, tmpRoot);
    } finally {
        process.stdout.write = originalWrite;
    }

    const liveIndex = output.indexOf('chant-public-host-front');
    const archivedIndex = output.indexOf('bead-chant-shell-archived');

    assert.notEqual(liveIndex, -1);
    assert.notEqual(archivedIndex, -1);
    assert.ok(liveIndex < archivedIndex, 'expected live chant authority bead to rank ahead of archived bead');
  });
