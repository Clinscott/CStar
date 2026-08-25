import test, { after, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let isolatedRoot = '';
let previousProjectRoot: string | undefined;
let databaseApi: typeof import('../../src/tools/pennyone/intel/database.js');

before(async () => {
    isolatedRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cstar-pennyone-database-'));
    previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
    process.env.CSTAR_PROJECT_ROOT = isolatedRoot;
    fs.writeFileSync(path.join(isolatedRoot, 'package.json'), '{"name":"synthetic-pennyone-database"}');
    databaseApi = await import('../../src/tools/pennyone/intel/database.js');
});

after(async () => {
    databaseApi.closeDb();
    if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
    else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
    await fsPromises.rm(isolatedRoot, { recursive: true, force: true });
});

test('Well of Mimir FTS5 Operations', () => {
    const testPath = 'src/core/annex.py';
    const testIntent = 'Handles database connections for the neural matrix.';
    const testProtocol = 'Import getDb()';
    databaseApi.updateFtsIndex(testPath, testIntent, testProtocol);

    const resultsExact = databaseApi.searchIntents('connections neural');
    assert.ok(resultsExact.some(r => r.path === testPath));
    assert.strictEqual(resultsExact[0].interaction_protocol, testProtocol);

    const resultsStem = databaseApi.searchIntents('connect matrix');
    assert.ok(resultsStem.some(r => r.path === testPath));

    databaseApi.updateFtsIndex('XO/docs/planning/XO_SCOPE_MATRIX.md', 'XO bead charter scope operating modes foundation', 'Open scope matrix');
    assert.ok(Array.isArray(databaseApi.searchIntents('pb-xo-foundation xo-bead-01 scope non-goals')));

    databaseApi.updateFtsIndex(
        'src/tools/pennyone/personaRegistry.ts',
        'persona active config behavior planning investigation operating policy',
        'Open active persona registry',
    );
    const resultsNatural = databaseApi.searchIntents('persona active persona config agent behavior investigation');
    assert.ok(resultsNatural.some(r => r.path === 'src/tools/pennyone/personaRegistry.ts'));
    assert.ok(resultsNatural.length <= 30);

    databaseApi.updateFtsIndex(testPath, 'Updated intent.', testProtocol);
    const db = databaseApi.getWritableDb();
    const count = db.prepare('SELECT count(*) as count FROM intents_fts WHERE path = ?').get(testPath) as { count: number };
    assert.strictEqual(count.count, 1);
});

test('Well of Mimir FTS5 ranking demotes archived lore behind live runtime authority', () => {
    const probe = 'rankprobe-fts-chant-architect-authority';
    databaseApi.updateChronicleIndex(
        'docs/legacy_archive/root_docs/tasks.qmd',
        `Archived architect doctrine ${probe}`,
        `Architect owns proposal synthesis ${probe}.`,
    );
    databaseApi.updateFtsIndex(
        'src/node/core/runtime/host_workflows/chant_planner.ts',
        `Live chant planning authority ${probe}`,
        'Open chant planner',
    );

    const results = databaseApi.searchIntents(probe);
    const liveIndex = results.findIndex(result => result.path === 'src/node/core/runtime/host_workflows/chant_planner.ts');
    const archivedIndex = results.findIndex(result => result.path === 'docs/legacy_archive/root_docs/tasks.qmd');
    assert.notStrictEqual(liveIndex, -1);
    assert.notStrictEqual(archivedIndex, -1);
    assert.ok(liveIndex < archivedIndex);
});

test('Session Query Operations', () => {
    const db = databaseApi.getWritableDb();
    db.prepare('INSERT OR IGNORE INTO spokes (id, name, root_path) VALUES (?, ?, ?)').run(999, 'Test Spoke', 'test/path');
    const sessionId = 99999;
    db.prepare('INSERT OR REPLACE INTO sessions (id, spoke_id, agent_id, start_timestamp, total_pings) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, 999, 'MUNINN', Date.now(), 2);
    db.prepare('DELETE FROM pings WHERE session_id = ?').run(sessionId);
    db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, 'MUNINN', 'TEST', 'test.py', Date.now());
    db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, 'MUNINN', 'TEST', 'test2.py', Date.now() + 100);

    const sessions = databaseApi.getRecentSessions(5);
    assert.ok(sessions.some(session => session.id === sessionId));
    const pings = databaseApi.getPingsForSession(sessionId);
    assert.strictEqual(pings.length, 2);
    assert.strictEqual(pings[0].target_path, 'test.py');
});
