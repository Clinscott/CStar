import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildEstateTopology, readProjectedMatrixGraph } from '../../src/tools/pennyone/intel/compiler.ts';
import { importRepositoryIntoEstate } from '../../src/tools/pennyone/intel/importer.ts';
import {
    closeDb,
    recordHallFile,
    recordHallScan,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { createGungnirMatrix } from '../../src/types/gungnir.ts';
import { buildHallRepositoryId } from '../../src/types/hall.ts';
import { StateRegistry } from '../../src/node/core/state.ts';

describe('PennyOne estate topology runtime (CS-P7-06)', () => {
    let tmpRoot: string;
    let sourceRepo: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-topology-'));
        sourceRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-source-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(sourceRepo, 'src'), { recursive: true });
        fs.writeFileSync(path.join(sourceRepo, 'src', 'widget.ts'), 'export const widget = true;\n', 'utf-8');
        registry.setRoot(tmpRoot);
        closeDb();
        StateRegistry.save(StateRegistry.get());
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 8.3,
            intent_integrity: 95,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
    });

    afterEach(() => {
        closeDb();
    });

    it('imports a repository into the estate gallery and projects topology', async () => {
        const mounted = await importRepositoryIntoEstate(sourceRepo, {
            workspaceRoot: tmpRoot,
            cloneRunner: async (_source, targetPath) => {
                fs.cpSync(sourceRepo, targetPath, { recursive: true });
            },
            scanRunner: async (targetPath) => {
                const repoId = buildHallRepositoryId(targetPath.replace(/\\/g, '/'));
                upsertHallRepository({
                    root_path: targetPath,
                    name: path.basename(targetPath),
                    status: 'AWAKE',
                    active_persona: 'ALFRED',
                    baseline_gungnir_score: 7.9,
                    intent_integrity: 93,
                    created_at: 1700000001000,
                    updated_at: 1700000001000,
                });
                recordHallScan({
                    scan_id: 'scan-import-1',
                    repo_id: repoId,
                    scan_kind: 'estate_import_test',
                    status: 'COMPLETED',
                    baseline_gungnir_score: 7.9,
                    started_at: 1700000001000,
                    completed_at: 1700000001100,
                    metadata: { source: 'unit-test' },
                });
                recordHallFile({
                    repo_id: repoId,
                    scan_id: 'scan-import-1',
                    path: path.join(targetPath, 'src', 'widget.ts'),
                    content_hash: 'import123',
                    language: 'ts',
                    matrix: createGungnirMatrix({ overall: 7.9, sovereignty: 0.84 }),
                    intent_summary: 'Imported estate widget',
                    interaction_summary: 'Standard',
                    created_at: 1700000001200,
                });
            },
        });

        assert.equal(mounted.slug, path.basename(sourceRepo).toLowerCase());
        assert.equal(mounted.projection_status, 'current');

        const topology = buildEstateTopology(tmpRoot);
        assert.equal(topology.nodes.length, 2);
        assert.equal(topology.edges.length, 1);
        assert.equal(topology.edges[0]?.relation, 'mounted_spoke');

        const graph = readProjectedMatrixGraph(mounted.root_path, 'scan-import-1');
        assert.equal(graph.files.length, 1);
        assert.equal(graph.files[0]?.intent, 'Imported estate widget');
    });
});
