import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    getHallRepositoryRecord,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import {
    buildPersonaProjectionMetadata,
    readHallPersonaProjection,
    readHallPersonaProjectionState,
    resolveHallPersonaProjectionForWrite,
    resolveHallPersonaForWrite,
} from '../../src/tools/pennyone/persona_projection.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';

describe('PennyOne Hall persona projection', () => {
    let root: string;
    let target: string;
    let originalRoot: string;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-control-'));
        target = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-target-'));
        registry.setRoot(root);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(target, { recursive: true, force: true });
    });

    function save(rootPath: string, persona: string): void {
        upsertHallRepository({
            root_path: rootPath,
            name: path.basename(rootPath),
            status: 'AWAKE',
            active_persona: persona,
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: {
                source: 'synthetic-persona-projection-test',
                ...buildPersonaProjectionMetadata(persona),
            },
            created_at: 1,
            updated_at: 1,
        });
    }

    it('preserves the target repository persona when one already exists', () => {
        save(root, 'A.L.F.R.E.D.');
        save(target, 'O.D.I.N.');
        assert.equal(resolveHallPersonaForWrite(target, root), 'O.D.I.N.');
        assert.equal(fs.existsSync(path.join(target, '.stats')), false);
    });

    it('inherits the control-plane projection for a new target repository', () => {
        save(root, 'O.D.I.N.');
        assert.equal(resolveHallPersonaForWrite(target, root), 'O.D.I.N.');
        const projection = resolveHallPersonaProjectionForWrite(target, root);
        assert.equal(projection.active_persona, 'O.D.I.N.');
        assert.ok(projection.metadata.persona_projection);
    });

    it('preserves a self-consistent unchanged marker across a routine repository write', () => {
        save(target, 'O.D.I.N.');
        upsertHallRepository({
            root_path: target,
            name: path.basename(target),
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 1,
            intent_integrity: 100,
            metadata: { source: 'synthetic-routine-write' },
            created_at: 2,
            updated_at: 2,
        });
        assert.equal(readHallPersonaProjection(target), 'O.D.I.N.');
    });

    it('does not preserve a marker when the scalar changes', () => {
        save(target, 'O.D.I.N.');
        upsertHallRepository({
            root_path: target,
            name: path.basename(target),
            status: 'AWAKE',
            active_persona: 'A.L.F.R.E.D.',
            baseline_gungnir_score: 1,
            intent_integrity: 100,
            metadata: { source: 'synthetic-changed-scalar' },
            created_at: 2,
            updated_at: 2,
        });
        assert.equal(readHallPersonaProjection(target), null);
    });

    it('fails closed instead of persisting an inert compatibility default', () => {
        assert.throws(
            () => resolveHallPersonaForWrite(target, root),
            /active_persona_projection_unavailable/,
        );
    });

    for (const source of [
        'legacy-sovereign-projection',
        'migration',
        'hall-doc-ingest',
        'profile',
        'profile-digest',
        'session-profile',
        'ingest_xo_doctrine_to_hall',
        'arbitrary-untrusted-source',
    ]) {
        it(`rejects ${source} provenance regardless of a positive timestamp`, () => {
            upsertHallRepository({
                root_path: target,
                name: path.basename(target),
                status: 'AWAKE',
                active_persona: 'O.D.I.N.',
                baseline_gungnir_score: 0,
                intent_integrity: 0,
                metadata: { source },
                created_at: 1_700_000_000_000,
                updated_at: 1_700_000_000_001,
            });
            assert.equal(readHallPersonaProjection(target), null);
        });
    }

    it('rejects an explicit marker whose digest does not match the scalar', () => {
        upsertHallRepository({
            root_path: target,
            name: path.basename(target),
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: buildPersonaProjectionMetadata('A.L.F.R.E.D.'),
            created_at: 1,
            updated_at: 1,
        });
        assert.equal(readHallPersonaProjection(target), null);
    });

    it('labels a matching legacy v1 marker unverified without upgrading it', () => {
        const valueSha256 = createHash('sha256').update('O.D.I.N.', 'utf8').digest('hex');
        upsertHallRepository({
            root_path: target,
            name: path.basename(target),
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: { persona_projection: {
                schema: 'cstar.persona_projection.v1',
                authority: 'cstar_status',
                verification: 'kernel_projection',
                value_sha256: valueSha256,
            } },
            created_at: 1,
            updated_at: 1,
        });
        assert.deepEqual(readHallPersonaProjectionState(target), {
            active_persona: 'O.D.I.N.',
            projection_status: 'legacy_self_consistent_unverified',
        });
        const record = getHallRepositoryRecord(target);
        assert.equal(
            (record?.metadata?.persona_projection as Record<string, unknown>)?.schema,
            'cstar.persona_projection.v1',
        );
    });

    it('rejects aliases, padding, substring payloads, Unicode lookalikes, and canaries', () => {
        for (const invalid of [
            'ODIN', 'ALFRED', ' O.D.I.N.', 'A.L.F.R.E.D. ', 'NOT-ODIN-ADMIN',
            'ALFRED-OVERRIDE', 'O.D.İ.N.', 'O.D.I.N.\0CANARY', `O.D.I.N.${'X'.repeat(4_096)}`,
        ]) {
            assert.throws(
                () => buildPersonaProjectionMetadata(invalid),
                /persona_projection_canonical_value_required/,
            );
        }
    });
});
