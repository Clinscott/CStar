import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    getWritableDb,
    getHallRepositoryRecord,
    migrateLegacyHallRecords,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { setCanonicalPersonaState } from '../../src/tools/pennyone/intel/persona_state.ts';
import {
    buildPersonaProjectionMetadata,
    readHallPersonaProjection,
} from '../../src/tools/pennyone/persona_projection.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';

describe('TypeScript Hall persona bootstrap and migration parity', () => {
    let root: string;
    let originalRoot: string;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-bootstrap-'));
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'sovereign_state.json'), JSON.stringify({
            framework: {
                status: 'AWAKE',
                active_persona: 'O.D.I.N.',
                last_awakening: 1_700_000_000_000,
            },
        }));
        registry.setRoot(root);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('does not bootstrap Hall or ingest a persona from legacy data on read', () => {
        assert.equal(getHallRepositoryRecord(root), null);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        assert.equal(readHallPersonaProjection(root), null);

        getWritableDb(root);
        const record = getHallRepositoryRecord(root);
        assert.equal(record?.active_persona, '');
        assert.equal(record?.metadata?.source, 'hall-schema-bootstrap');
        assert.equal(readHallPersonaProjection(root), null);
    });

    it('projects dedicated persona state while legacy migration is retired', () => {
        setCanonicalPersonaState(root, 'A.L.F.R.E.D.');
        upsertHallRepository({
            root_path: root,
            name: path.basename(root),
            status: 'AWAKE',
            active_persona: 'A.L.F.R.E.D.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: {
                source: 'synthetic-explicit-status-projection',
                ...buildPersonaProjectionMetadata('A.L.F.R.E.D.'),
            },
            created_at: 10,
            updated_at: 10,
        });

        assert.throws(
            () => migrateLegacyHallRecords(root),
            /legacy_hall_migration_retired_requires_cstar_lifecycle/,
        );

        const record = getHallRepositoryRecord(root);
        assert.equal(record?.active_persona, 'A.L.F.R.E.D.');
        assert.equal(record?.metadata?.source, 'synthetic-explicit-status-projection');
        assert.equal(readHallPersonaProjection(root), 'A.L.F.R.E.D.');
    });

    it('never grants authority to an existing migration-sourced persona', () => {
        upsertHallRepository({
            root_path: root,
            name: path.basename(root),
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: { source: 'migration' },
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_001,
        });

        assert.throws(
            () => migrateLegacyHallRecords(root),
            /legacy_hall_migration_retired_requires_cstar_lifecycle/,
        );

        const record = getHallRepositoryRecord(root);
        assert.equal(record?.active_persona, 'O.D.I.N.');
        assert.equal(record?.metadata?.source, 'migration');
        assert.equal(readHallPersonaProjection(root), null);
    });
});
