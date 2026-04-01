import test from 'node:test';
import assert from 'node:assert';
import {
    updateChronicleIndex,
    updateFtsIndex,
    searchIntents,
    getRecentSessions,
    getPingsForSession,
    getDb,
} from  '../../src/tools/pennyone/intel/database.js';

test('Well of Mimir FTS5 Operations', async () => {
    const testPath = 'src/core/annex.py';
    const testIntent = 'Handles database connections for the neural matrix.';
    const testProtocol = 'Import getDb()';

    // 1. Update Index
    updateFtsIndex(testPath, testIntent, testProtocol);

    // 2. Search Index (Exact match)
    const resultsExact = searchIntents('connections neural');
    assert.ok(resultsExact.some(r => r.path === testPath), 'Should find the exact intent');
    assert.strictEqual(resultsExact[0].interaction_protocol, testProtocol, 'Should store the protocol');

    // 3. Search Index (Partial/stemming match - FTS5 porter stemming)
    const resultsStem = searchIntents('connect matrix');
    assert.ok(resultsStem.some(r => r.path === testPath), 'Should find stemmed intent');

    // 3b. Search Index (Hyphenated bead-style query should not break FTS parsing)
    updateFtsIndex('XO/docs/planning/XO_SCOPE_MATRIX.md', 'XO bead charter scope operating modes foundation', 'Open scope matrix');
    const resultsHyphen = searchIntents('pb-xo-foundation xo-bead-01 scope non-goals');
    assert.ok(Array.isArray(resultsHyphen), 'Should return a result array for bead-style queries');

    // 4. Update existing path
    const updatedIntent = 'Updated intent.';
    updateFtsIndex(testPath, updatedIntent, testProtocol);
    
    // Check it replaced rather than duplicated
    const db = getDb();
    const count = db.prepare('SELECT count(*) as count FROM intents_fts WHERE path = ?').get(testPath) as any;
    assert.strictEqual(count.count, 1, 'Should UPSERT, not duplicate');
});

test('Well of Mimir FTS5 ranking demotes archived lore behind live runtime authority', async () => {
    const probe = 'rankprobe-fts-chant-architect-authority';
    updateChronicleIndex(
        'docs/legacy_archive/root_docs/tasks.qmd',
        `Archived architect doctrine ${probe}`,
        `Architect owns proposal synthesis ${probe}.`,
    );
    updateFtsIndex(
        'src/node/core/runtime/host_workflows/chant_planner.ts',
        `Live chant planning authority ${probe}`,
        'Open chant planner',
    );

    const results = searchIntents(probe);
    const liveIndex = results.findIndex((result) => result.path === 'src/node/core/runtime/host_workflows/chant_planner.ts');
    const archivedIndex = results.findIndex((result) => result.path === 'docs/legacy_archive/root_docs/tasks.qmd');

    assert.notStrictEqual(liveIndex, -1, 'Should return the live runtime authority result');
    assert.notStrictEqual(archivedIndex, -1, 'Should return the archived lore result');
    assert.ok(liveIndex < archivedIndex, 'Live runtime authority should outrank archived lore');
});

test('Session Query Operations', async () => {
    // 1. Add mock session to DB
    const db = getDb();
    
    // Create a spoke
    db.prepare('INSERT OR IGNORE INTO spokes (id, name, root_path) VALUES (?, ?, ?)').run(999, 'Test Spoke', 'test/path');
    
    // Create a session
    const sessionId = 99999;
    db.prepare('INSERT OR REPLACE INTO sessions (id, spoke_id, agent_id, start_timestamp, total_pings) VALUES (?, ?, ?, ?, ?)').run(sessionId, 999, 'MUNINN', Date.now(), 2);
    
    // Clear old pings for idempotency
    db.prepare('DELETE FROM pings WHERE session_id = ?').run(sessionId);
    
    // Add pings
    db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)').run(sessionId, 'MUNINN', 'TEST', 'test.py', Date.now());
    db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)').run(sessionId, 'MUNINN', 'TEST', 'test2.py', Date.now() + 100);

    // 2. Test getRecentSessions
    const sessions = getRecentSessions(5);
    assert.ok(sessions.some(s => s.id === sessionId), 'Should retrieve recent sessions with spoke joins');

    // 3. Test getPingsForSession
    const pings = getPingsForSession(sessionId);
    assert.strictEqual(pings.length, 2, 'Should retrieve all pings for the session');
    assert.strictEqual(pings[0].target_path, 'test.py', 'Pings should be ordered by timestamp ASC');
});
