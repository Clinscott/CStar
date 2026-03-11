import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProjectedMatrixGraph, writeProjectedMatrixGraph } from '../../src/tools/pennyone/intel/compiler.ts';
import {
    closeDb,
    getHallFileByPath,
    recordHallFile,
    recordHallScan,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { searchMatrix } from '../../src/tools/pennyone/live/search.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId } from '../../src/types/hall.ts';

describe('PennyOne projection boundary (CS-P1-08)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-projection-'));
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

    it('rebuilds matrix-graph.json from Hall-backed file records', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.8,
            intent_integrity: 92,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-projection-1',
            repo_id: repoId,
            scan_kind: 'projection_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.8,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-projection-1',
            path: path.join(tmpRoot, 'src', 'sample.ts'),
            content_hash: 'abc123',
            language: 'ts',
            matrix: { logic: 8, style: 7, intel: 8, sovereignty: 8, overall: 7.8 },
            intent_summary: 'Projected intent',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });

        const graphPath = await writeProjectedMatrixGraph(tmpRoot, 'scan-projection-1');
        const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as {
            projection?: { authority: string; artifact_role: string; scan_id?: string };
            files: Array<{ path: string; intent: string; matrix: { overall: number } }>;
        };

        assert.equal(graph.files.length, 1);
        assert.equal(graph.projection?.authority, 'hall_projection');
        assert.equal(graph.projection?.artifact_role, 'compatibility_export');
        assert.equal(graph.projection?.scan_id, 'scan-projection-1');
        assert.equal(graph.files[0]?.intent, 'Projected intent');
        assert.equal(graph.files[0]?.matrix.overall, 7.8);
    });

    it('serves PennyOne search from Hall-backed projections without raw graph authority', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-projection-2',
            repo_id: repoId,
            scan_kind: 'projection_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.4,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        const filePath = path.join(tmpRoot, 'src', 'projection.ts');
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-projection-2',
            path: filePath,
            content_hash: 'def456',
            language: 'ts',
            matrix: { logic: 7.5, style: 7.4, intel: 7.6, sovereignty: 7.5, overall: 7.4 },
            intent_summary: 'Projection boundary smoke test',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });

        const record = getHallFileByPath(filePath, tmpRoot, 'scan-projection-2');
        assert.ok(record);
        assert.equal(record?.intent_summary, 'Projection boundary smoke test');

        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (() => true) as typeof process.stdout.write;
        try {
            await searchMatrix('projection boundary', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }
    });

    it('materializes the live matrix view from Hall even if a stale graph artifact exists', () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.1,
            intent_integrity: 88,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-projection-3',
            repo_id: repoId,
            scan_kind: 'projection_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.1,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-projection-3',
            path: path.join(tmpRoot, 'src', 'live.ts'),
            content_hash: 'live123',
            language: 'ts',
            matrix: { logic: 7.1, style: 7.2, intel: 7.3, sovereignty: 7.4, overall: 7.1 },
            intent_summary: 'Live Hall projection',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });

        fs.mkdirSync(path.join(tmpRoot, '.stats'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.stats', 'matrix-graph.json'),
            JSON.stringify({
                version: 'stale',
                files: [{ path: 'ghost.ts', intent: 'STALE', matrix: { overall: 1 } }],
                summary: { total_files: 1, total_loc: 0, average_score: 1 },
            }),
            'utf-8',
        );

        const projection = readProjectedMatrixGraph(tmpRoot, 'scan-projection-3');

        assert.equal(projection.projection?.authority, 'hall_projection');
        assert.equal(projection.projection?.artifact_role, 'runtime_view');
        assert.equal(projection.files.length, 1);
        assert.equal(projection.files[0]?.intent, 'Live Hall projection');
        assert.equal(projection.files[0]?.path, path.join(tmpRoot, 'src', 'live.ts').replace(/\\/g, '/'));
    });
});
