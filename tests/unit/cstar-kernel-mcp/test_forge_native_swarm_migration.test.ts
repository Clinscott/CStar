import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { FORGE_NATIVE_CONNECTION_ID } from '../../../src/types/forge_native_swarm.js';
import {
    assertForgeNativeSchemaPresent,
    ensureForgeNativeSwarmSchema,
    forgeNativeSchemaDigest,
    rehearseForgeNativeSwarmMigration,
} from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import {
    assertForgeConnectionExecutable,
    listForgeConnectionHistory,
    tombstoneForgeConnection,
} from '../../../src/tools/pennyone/intel/forge_connection_tombstone.js';

function legacyDatabase(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);
        CREATE TABLE hall_beads (bead_id TEXT PRIMARY KEY);
        INSERT INTO hall_forge_requests VALUES ('old-request', '${'a'.repeat(64)}');
    `);
    return db;
}

test('copied-state migration is additive, idempotent, row-preserving, and FK-checked', () => {
    const db = legacyDatabase();
    const receipt = rehearseForgeNativeSwarmMigration(db, { copied_state: true });
    assert.equal(receipt.idempotent_replay, true);
    assert.equal(receipt.copied_state, true);
    assert.deepEqual(receipt.existing_table_counts, { hall_forge_requests: 1, hall_beads: 0 });
    assert.equal(receipt.foreign_key_check.every((entry) => entry.violations.length === 0), true);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_requests').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get().count, 0);
    assertForgeNativeSchemaPresent(db);
    const digest = forgeNativeSchemaDigest(db);
    ensureForgeNativeSwarmSchema(db);
    assert.equal(forgeNativeSchemaDigest(db), digest);
    db.close();
});

test('legacy generations are tombstoned but readable and inactive native generations stay inactive', () => {
    const db = legacyDatabase();
    const input = {
        connection_id: 'forge-v3-codex-host-handoff',
        generation: 3,
        connection_outcome: 'REJECTED_FINAL_CANONICAL_ATTEMPT' as const,
        replacement_request_id: null,
        reason: 'native replacement',
        metadata: { copied_state: true, binding: { z: 2, a: 1 } },
        copied_state: true,
        created_at: 1_700_000_000_000,
    };
    const first = tombstoneForgeConnection(db, input);
    const replay = tombstoneForgeConnection(db, input);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.tombstone.executable, false);
    assert.equal(replay.tombstone.historical, true);
    assert.equal(listForgeConnectionHistory(db).length, 1);
    assert.throws(() => assertForgeConnectionExecutable(db, input.connection_id), /generation_rejected/);
    assert.throws(() => tombstoneForgeConnection(db, { ...input, reason: 'conflict' }), /tombstone_conflict/);

    assert.throws(() => assertForgeConnectionExecutable(db, FORGE_NATIVE_CONNECTION_ID), /generation_unbound/);
    db.prepare(`
        INSERT INTO hall_forge_connection_generations
            (connection_id, generation, status, executable, policy_json, created_at, updated_at)
        VALUES (?, 1, 'RETIRED', 0, '{}', 1, 1)
    `).run(FORGE_NATIVE_CONNECTION_ID);
    assert.throws(() => assertForgeConnectionExecutable(db, FORGE_NATIVE_CONNECTION_ID), /generation_inactive/);
    const stateBefore = db.prepare(
        'SELECT status, executable FROM hall_forge_connection_generations WHERE connection_id = ?',
    ).get(FORGE_NATIVE_CONNECTION_ID);
    assert.deepEqual(stateBefore, { status: 'RETIRED', executable: 0 });
    db.close();
});
