import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGungnirMatrix } from '../../src/types/gungnir.ts';
import {
    compileMatrix,
    compileMatrixPayload,
    writeProjectedMatrixGraph,
} from '../../src/tools/pennyone/intel/compiler.ts';
import {
    getFileGravity,
    getGravityDb,
    setFileGravity,
    updateFileGravity,
} from '../../src/tools/pennyone/intel/gravity_db.ts';
import { restoreHallDocumentVersion } from '../../src/tools/pennyone/intel/repository_documents.ts';
import { migrateLegacyHallRecords } from '../../src/tools/pennyone/intel/repository_migration.ts';
import { getLegacyState } from '../../src/tools/pennyone/intel/schema.ts';
import { ChronicleIndexer } from '../../src/tools/pennyone/intel/chronicle.ts';
import { SemanticIndexer } from '../../src/tools/pennyone/intel/semantic.ts';
import { Warden } from '../../src/tools/pennyone/intel/warden.ts';
import { writeReport } from '../../src/tools/pennyone/intel/writer.ts';
import { searchMatrix } from '../../src/tools/pennyone/live/search.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';

describe('Retired PennyOne projection effect surfaces', () => {
    let root: string;
    let originalRoot: string;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-pennyone-effects-'));
        registry.setRoot(root);
    });

    afterEach(() => {
        registry.setRoot(originalRoot);
        fs.rmSync(root, { recursive: true, force: true });
    });

    const file = {
        path: 'src/synthetic.ts',
        loc: 1,
        complexity: 1,
        matrix: createGungnirMatrix({ logic: 8, style: 8, intel: 8, overall: 8 }),
        imports: [],
        exports: [],
        hash: 'synthetic',
    };

    it('keeps projection construction pure while rejecting artifact writes', async () => {
        const projection = compileMatrixPayload([file], root);
        assert.equal(projection.files.length, 1);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        await assert.rejects(compileMatrix([file], root), /legacy_matrix_artifact_write_retired/);
        await assert.rejects(writeProjectedMatrixGraph(root), /legacy_matrix_artifact_write_retired/);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('does not create or refresh a detached gravity database', async () => {
        assert.equal(await getFileGravity(file.path), 0);
        assert.throws(() => getGravityDb(), /legacy_gravity_store_retired/);
        assert.throws(() => updateFileGravity(file.path, 1), /legacy_gravity_store_retired/);
        assert.throws(() => setFileGravity(file.path, 1), /legacy_gravity_store_retired/);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('rejects direct search, report, Warden, and document restore effects', async () => {
        const destination = path.join(root, 'restored.md');
        await assert.rejects(searchMatrix('synthetic', root), /legacy_pennyone_direct_search_retired/);
        await assert.rejects(writeReport(file, root, 'const synthetic = true;'), /legacy_pennyone_report_writer_retired/);
        await assert.rejects(new Warden(path.join(root, 'ledger.json')).evaluate(compileMatrixPayload([file], root)), /legacy_node_pennyone_warden_retired/);
        assert.throws(
            () => restoreHallDocumentVersion('synthetic-version', destination),
            /legacy_hall_document_restore_retired_requires_operator_gate/,
        );
        assert.equal(fs.existsSync(destination), false);
        assert.equal(fs.existsSync(path.join(root, 'ledger.json')), false);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('rejects historical indexing and migration before source or Hall effects', async () => {
        await assert.rejects(
            new ChronicleIndexer().index(),
            /legacy_chronicle_indexer_retired_use_cstar_hall_surfaces/,
        );
        const semantic = new SemanticIndexer(root);
        await assert.rejects(
            semantic.index([path.join(root, 'source.ts')]),
            /legacy_semantic_indexer_retired_use_cstar_hall_surfaces/,
        );
        await assert.rejects(
            semantic.focusSymbol(path.join(root, 'source.ts'), 'symbol'),
            /legacy_semantic_indexer_retired_use_cstar_hall_surfaces/,
        );
        assert.throws(
            () => migrateLegacyHallRecords(root),
            /legacy_hall_migration_retired_requires_cstar_lifecycle/,
        );
        assert.throws(
            () => getLegacyState(root),
            /legacy_sovereign_state_reader_retired_use_cstar_hall_surfaces/,
        );
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });
});
