import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    GUNGNIR_SCORE_MAX,
    GUNGNIR_SCORE_MIN,
    createGungnirMatrix,
    isCanonicalGungnirScore,
} from  '../../src/types/gungnir.js';
import { compileMatrixFromHall } from  '../../src/tools/pennyone/intel/compiler.js';
import {
    closeDb,
    getHallFiles,
    recordHallFile,
    recordHallScan,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId } from  '../../src/types/hall.js';

describe('Gungnir matrix contract (CS-P1-04)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-gungnir-'));
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

    it('serializes one canonical matrix object', () => {
        const matrix = createGungnirMatrix({
            logic: 8.25,
            style: 7.5,
            intel: 9,
            gravity: 4,
            vigil: 10,
            evolution: 8.5,
            anomaly: 0.5,
            sovereignty: 8.75,
            overall: 8.1,
            stability: 6.75,
            coupling: 2.5,
            aesthetic: 8.25,
        });

        assert.deepStrictEqual(Object.keys(matrix), [
            'version',
            'logic',
            'style',
            'intel',
            'gravity',
            'vigil',
            'evolution',
            'anomaly',
            'sovereignty',
            'overall',
            'stability',
            'coupling',
            'aesthetic',
        ]);
        assert.strictEqual(matrix.version, '1.0');
        assert.strictEqual(matrix.overall, 8.1);
    });

    it('declares and validates the canonical zero-to-ten score scale', () => {
        assert.strictEqual(GUNGNIR_SCORE_MIN, 0);
        assert.strictEqual(GUNGNIR_SCORE_MAX, 10);
        assert.strictEqual(isCanonicalGungnirScore(0), true);
        assert.strictEqual(isCanonicalGungnirScore(6), true);
        assert.strictEqual(isCanonicalGungnirScore(10), true);
        assert.strictEqual(isCanonicalGungnirScore(-0.1), false);
        assert.strictEqual(isCanonicalGungnirScore(10.1), false);
        assert.strictEqual(isCanonicalGungnirScore(Number.NaN), false);
        assert.strictEqual(isCanonicalGungnirScore(Number.POSITIVE_INFINITY), false);
    });

    it('preserves zero and derives null or non-finite projections deterministically', () => {
        const axes = {
            logic: 8,
            style: 8,
            intel: 8,
            vigil: 8,
            evolution: 8,
            sovereignty: 8,
        };

        assert.strictEqual(createGungnirMatrix({ ...axes, overall: 0 }).overall, 0);
        assert.strictEqual(
            createGungnirMatrix({ ...axes, overall: null } as unknown as Parameters<typeof createGungnirMatrix>[0]).overall,
            8,
        );
        assert.strictEqual(createGungnirMatrix({ ...axes, overall: Number.NaN }).overall, 8);
    });

    it('rejects explicit out-of-range scores but preserves non-negative raw metrics', () => {
        assert.throws(
            () => createGungnirMatrix({ overall: 100 }),
            /outside canonical range 0\.\.10/,
        );
        const matrix = createGungnirMatrix({
            gravity: 100,
            coupling: 25,
            anomaly: 12,
        });
        assert.strictEqual(matrix.gravity, 100);
        assert.strictEqual(matrix.coupling, 25);
        assert.strictEqual(matrix.anomaly, 12);
    });

    it('compiles PennyOne graph payloads from Hall-backed canonical files', () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        const matrix = createGungnirMatrix({
            logic: 8,
            style: 7,
            intel: 9,
            gravity: 3,
            vigil: 10,
            evolution: 8,
            anomaly: 0,
            sovereignty: 8,
            overall: 8,
            stability: 7,
            coupling: 2,
            aesthetic: 8,
        });

        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: matrix.overall,
            intent_integrity: 91,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-hall-1',
            repo_id: repoId,
            scan_kind: 'test_scan',
            status: 'COMPLETED',
            baseline_gungnir_score: matrix.overall,
            started_at: 1700000000000,
            completed_at: 1700000001000,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-hall-1',
            path: path.join(tmpRoot, 'src', 'sample.ts'),
            content_hash: 'abc123',
            language: 'ts',
            matrix,
            intent_summary: 'Test sector',
            interaction_summary: 'Standard',
            created_at: 1700000002000,
        });

        const hallFiles = getHallFiles(tmpRoot, 'scan-hall-1');
        const graph = compileMatrixFromHall(hallFiles, tmpRoot);

        assert.strictEqual(hallFiles.length, 1);
        assert.strictEqual(graph.files.length, 1);
        assert.strictEqual(graph.projection?.authority, 'hall_projection');
        assert.strictEqual(graph.projection?.artifact_role, 'runtime_view');
        assert.strictEqual(graph.files[0]?.matrix.version, '1.0');
        assert.strictEqual(graph.files[0]?.matrix.logic, 8);
        assert.strictEqual(graph.summary.average_score, 8);
    });
});
