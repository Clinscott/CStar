import test from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { ensureHallSchema } from '../../src/tools/pennyone/intel/schema.js';
import {
    registerContest,
    scoreEngramIfArbitrated,
    tallyContest,
    recentScores,
    byScenario,
    getScoreByShot,
    type RecordedEngram,
} from '../../src/tools/war_game/score_trigger.js';

/**
 * BEAD-CSTAR-WAR-GAME-SCORING-001 — Integration test.
 * Exercises the full scoring round-trip against an in-memory SQLite database:
 *   register contest → record shot-fired Engram → record verdict Engram
 *   → assert score row inserted + cstar/war-game/scored/<shot_id> Engram emitted
 *   → assert tally/recent/by_scenario/get_score return correct results.
 *
 * Does NOT exercise the MCP layer (stdio); the unit-style integration here
 * proves the kernel-side scoring engine end-to-end through its public functions.
 */

function makeDb(): Database.Database {
    const db = new Database(':memory:');
    // ensureHallSchema requires a real-looking root path to derive repo_id;
    // tmpdir is fine — schema creation is path-agnostic.
    const rootPath = '/tmp/test-war-game-' + Math.random().toString(36).substring(2, 8);
    ensureHallSchema(db, rootPath);
    return db;
}

function insertEngram(
    db: Database.Database,
    memoryId: string,
    beadId: string,
    repoId: string,
    intent: string,
    metadata: Record<string, unknown>,
): RecordedEngram {
    const now = Date.now();
    db.prepare(
        `INSERT INTO hall_episodic_memory (
            memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
            successes_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(memoryId, beadId, repoId, intent, '[]', '[]', JSON.stringify(metadata), now, now);
    return {
        memory_id: memoryId,
        bead_id: beadId,
        repo_id: repoId,
        intent,
        metadata,
        created_at: now,
    };
}

function ensureBead(db: Database.Database, beadId: string, repoId: string): void {
    db.prepare(
        `INSERT OR IGNORE INTO hall_beads (
            bead_id, repo_id, target_kind, rationale, status, created_at, updated_at
        ) VALUES (?, ?, 'REPOSITORY', 'test fixture', 'OPEN', ?, ?)`,
    ).run(beadId, repoId, Date.now(), Date.now());
}

const USB_CONTEST = {
    contest_id: 'usb-forge-vs-sentry-v1',
    contest_name: 'USB Forge vs USB Sentry — v1 (Mode A)',
    attacker_label: 'claude:forge',
    defender_label: 'codex:sentry',
    attacker_bead_id: 'BEAD-USB-FORGE-001',
    defender_bead_id: 'BEAD-USB-SENTRY-FORGE-LISTENER-001',
    attacker_intent_prefix: 'usb-forge/shot-fired/',
    defender_intent_prefix: 'usb-sentry/verdict/',
    terminal_event_class_map: {
        block: ['usb-sentry/phase1-hit', 'usb-sentry/device-held-rejected', 'usb-sentry/forge-listener-refused'],
        complete: ['usb-sentry/complete'],
        inconclusive: ['usb-sentry/forge-listener-timeout', 'usb-sentry/forge-listener-panic'],
    },
    scenario_compatibility_map: {
        'FORGE-MS-001': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],     // baseline + false-positive path
        'FORGE-MS-002': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],     // bypass possible
        'FORGE-HID-001': ['usb-sentry/device-held-rejected'],                  // pure HID
    },
};

function repoId(db: Database.Database): string {
    const r = db.prepare(`SELECT repo_id FROM hall_repositories LIMIT 1`).get() as { repo_id: string };
    return r.repo_id;
}

test('war-game scoring integration', (t) => {
    t.test('schema migration creates war_game tables', () => {
        const db = makeDb();
        const tables = db
            .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'war_game_%' ORDER BY name`)
            .all() as Array<{ name: string }>;
        assert.deepStrictEqual(tables.map((t) => t.name), ['war_game_contests', 'war_game_scores']);
        db.close();
    });

    t.test('register_contest persists the contest row', () => {
        const db = makeDb();
        registerContest(db, { ...USB_CONTEST, repo_id: repoId(db) });
        const row = db.prepare(`SELECT * FROM war_game_contests WHERE contest_id = ?`).get(USB_CONTEST.contest_id) as any;
        assert.strictEqual(row.contest_id, USB_CONTEST.contest_id);
        assert.strictEqual(row.attacker_label, 'claude:forge');
        assert.strictEqual(row.defender_label, 'codex:sentry');
        const classMap = JSON.parse(row.terminal_event_class_map_json);
        assert.deepStrictEqual(classMap.block.sort(), [
            'usb-sentry/device-held-rejected',
            'usb-sentry/forge-listener-refused',
            'usb-sentry/phase1-hit',
        ]);
        db.close();
    });

    t.test('register_contest is idempotent — second call upserts', () => {
        const db = makeDb();
        registerContest(db, { ...USB_CONTEST, repo_id: repoId(db) });
        registerContest(db, { ...USB_CONTEST, repo_id: repoId(db), contest_name: 'updated' });
        const row = db.prepare(`SELECT contest_name FROM war_game_contests WHERE contest_id = ?`).get(USB_CONTEST.contest_id) as any;
        assert.strictEqual(row.contest_name, 'updated');
        db.close();
    });

    t.test('shot-fired Engram alone does not produce a score', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);

        const shotFired = insertEngram(
            db,
            'engram_shot_FORGE-MS-002_a',
            'BEAD-USB-FORGE-001',
            r,
            'usb-forge/shot-fired/FORGE-MS-002',
            {
                shot_id: 'SHOT-001',
                scenario_id: 'FORGE-MS-002',
                expected: { outcome: 'deflected' },
            },
        );

        const results = scoreEngramIfArbitrated(db, shotFired);
        assert.strictEqual(results.length, 0, 'attacker Engram should not match defender prefix');

        const count = db.prepare(`SELECT COUNT(*) AS n FROM war_game_scores`).get() as { n: number };
        assert.strictEqual(count.n, 0);
        db.close();
    });

    t.test('verdict Engram with matching shot-fired triggers a score', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        // attacker writes shot-fired first
        insertEngram(
            db,
            'engram_shot_FORGE-MS-002_attacker',
            'BEAD-USB-FORGE-001',
            r,
            'usb-forge/shot-fired/FORGE-MS-002',
            {
                shot_id: 'SHOT-002',
                scenario_id: 'FORGE-MS-002',
                expected: { outcome: 'deflected' },
            },
        );

        // defender writes verdict — this fires the trigger
        const verdict = insertEngram(
            db,
            'engram_verdict_SHOT-002',
            'BEAD-USB-SENTRY-FORGE-LISTENER-001',
            r,
            'usb-sentry/verdict/SHOT-002',
            {
                shot_id: 'SHOT-002',
                terminal_event: 'usb-sentry/phase1-hit',
            },
        );

        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].outcome, 'defender_blocked', 'EICAR hit = Codex point');
        assert.strictEqual(results[0].inserted, true);

        const scoreRow = db
            .prepare(`SELECT * FROM war_game_scores WHERE shot_id = 'SHOT-002'`)
            .get() as any;
        assert.strictEqual(scoreRow.outcome, 'defender_blocked');
        assert.strictEqual(scoreRow.scenario_id, 'FORGE-MS-002');

        // assert a cstar/war-game/scored/* Engram was also written
        const scoredEngram = db
            .prepare(`SELECT * FROM hall_episodic_memory WHERE tactical_summary = 'cstar/war-game/scored/SHOT-002'`)
            .get() as any;
        assert.ok(scoredEngram, 'cstar/war-game/scored/SHOT-002 Engram should be emitted');
        const scoredMeta = JSON.parse(scoredEngram.metadata_json);
        assert.strictEqual(scoredMeta.outcome, 'defender_blocked');
        assert.strictEqual(scoredMeta.shot_id, 'SHOT-002');
        db.close();
    });

    t.test('attacker bypass scores +1 Claude', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-BYPASS', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });

        const verdict = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-BYPASS', {
            shot_id: 'SHOT-BYPASS', terminal_event: 'usb-sentry/complete',
        });

        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results[0].outcome, 'attacker_bypassed');
        db.close();
    });

    t.test('baseline pass does not award a point', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-001', {
            shot_id: 'SHOT-BASE', scenario_id: 'FORGE-MS-001', expected: { outcome: 'captured_clean' },
        });
        const verdict = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-BASE', {
            shot_id: 'SHOT-BASE', terminal_event: 'usb-sentry/complete',
        });
        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results[0].outcome, 'baseline_pass');
        db.close();
    });

    t.test('false positive scores +1 Claude', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-001', {
            shot_id: 'SHOT-FP', scenario_id: 'FORGE-MS-001', expected: { outcome: 'captured_clean' },
        });
        const verdict = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-FP', {
            shot_id: 'SHOT-FP', terminal_event: 'usb-sentry/phase1-hit',
        });
        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results[0].outcome, 'false_positive');
        db.close();
    });

    t.test('protocol violation when terminal_event is impossible for scenario', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        // FORGE-HID-001 is pure-HID — usb-sentry/complete is structurally impossible
        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-HID-001', {
            shot_id: 'SHOT-PV', scenario_id: 'FORGE-HID-001', expected: { outcome: 'deflected' },
        });
        const verdict = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-PV', {
            shot_id: 'SHOT-PV', terminal_event: 'usb-sentry/complete',
        });
        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results[0].outcome, 'protocol_violation');
        assert.ok(results[0].inconclusive_reason?.includes('FORGE-HID-001'));
        db.close();
    });

    t.test('orphan verdict (no attacker engram) scores as inconclusive', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        // no shot-fired Engram — only a verdict
        const verdict = insertEngram(db, 'e1', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-ORPHAN', {
            shot_id: 'SHOT-ORPHAN', terminal_event: 'usb-sentry/complete',
        });
        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].outcome, 'inconclusive');
        assert.strictEqual(results[0].inconclusive_reason, 'no_attacker_engram');
        db.close();
    });

    t.test('listener-timeout terminal scores as inconclusive', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-TO', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });
        const verdict = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-TO', {
            shot_id: 'SHOT-TO', terminal_event: 'usb-sentry/forge-listener-timeout',
        });
        const results = scoreEngramIfArbitrated(db, verdict);
        assert.strictEqual(results[0].outcome, 'inconclusive');
        db.close();
    });

    t.test('double verdict — same outcome is no-op', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-D1', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });

        const v1 = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-D1', {
            shot_id: 'SHOT-D1', terminal_event: 'usb-sentry/phase1-hit',
        });
        const r1 = scoreEngramIfArbitrated(db, v1);
        assert.strictEqual(r1[0].inserted, true);
        assert.strictEqual(r1[0].outcome, 'defender_blocked');

        const v2 = insertEngram(db, 'e3', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-D1', {
            shot_id: 'SHOT-D1', terminal_event: 'usb-sentry/phase1-hit',
        });
        const r2 = scoreEngramIfArbitrated(db, v2);
        assert.strictEqual(r2[0].inserted, false);
        assert.strictEqual(r2[0].upgraded, false);

        const rows = db.prepare(`SELECT * FROM war_game_scores WHERE shot_id = 'SHOT-D1'`).all();
        assert.strictEqual(rows.length, 1);
        db.close();
    });

    t.test('double verdict — more-severe outcome upgrades', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-UP', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });

        const v1 = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-UP', {
            shot_id: 'SHOT-UP', terminal_event: 'usb-sentry/phase1-hit',
        });
        scoreEngramIfArbitrated(db, v1);

        const v2 = insertEngram(db, 'e3', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-UP', {
            shot_id: 'SHOT-UP', terminal_event: 'usb-sentry/complete',
        });
        const r2 = scoreEngramIfArbitrated(db, v2);
        assert.strictEqual(r2[0].upgraded, true);
        assert.strictEqual(r2[0].outcome, 'attacker_bypassed');

        const final = db.prepare(`SELECT outcome FROM war_game_scores WHERE shot_id = 'SHOT-UP'`).get() as any;
        assert.strictEqual(final.outcome, 'attacker_bypassed');
        db.close();
    });

    t.test('double verdict — less-severe outcome does not downgrade', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'e1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-DN', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });

        const v1 = insertEngram(db, 'e2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-DN', {
            shot_id: 'SHOT-DN', terminal_event: 'usb-sentry/complete',
        });
        scoreEngramIfArbitrated(db, v1);

        const v2 = insertEngram(db, 'e3', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-DN', {
            shot_id: 'SHOT-DN', terminal_event: 'usb-sentry/phase1-hit',
        });
        const r2 = scoreEngramIfArbitrated(db, v2);
        assert.strictEqual(r2[0].upgraded, false);

        const final = db.prepare(`SELECT outcome FROM war_game_scores WHERE shot_id = 'SHOT-DN'`).get() as any;
        assert.strictEqual(final.outcome, 'attacker_bypassed', 'attacker_bypassed > defender_blocked, do not downgrade');
        db.close();
    });

    t.test('tally returns running totals', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        const shots: Array<[string, string, 'deflected' | 'captured_clean', string]> = [
            ['T1', 'FORGE-MS-002', 'deflected', 'usb-sentry/phase1-hit'],
            ['T2', 'FORGE-MS-002', 'deflected', 'usb-sentry/phase1-hit'],
            ['T3', 'FORGE-MS-002', 'deflected', 'usb-sentry/complete'],
            ['T4', 'FORGE-MS-001', 'captured_clean', 'usb-sentry/complete'],
            ['T5', 'FORGE-MS-001', 'captured_clean', 'usb-sentry/phase1-hit'],
        ];
        let i = 0;
        for (const [sid, scen, exp, term] of shots) {
            insertEngram(db, `ea${i}`, 'BEAD-USB-FORGE-001', r, `usb-forge/shot-fired/${scen}`, {
                shot_id: sid, scenario_id: scen, expected: { outcome: exp },
            });
            const verdict = insertEngram(db, `ev${i}`, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, `usb-sentry/verdict/${sid}`, {
                shot_id: sid, terminal_event: term,
            });
            scoreEngramIfArbitrated(db, verdict);
            i++;
        }

        const tally = tallyContest(db, USB_CONTEST.contest_id);
        assert.ok(tally);
        assert.strictEqual(tally!.scores.defender_blocked, 2);    // T1, T2
        assert.strictEqual(tally!.scores.attacker_bypassed, 1);   // T3
        assert.strictEqual(tally!.scores.baseline_pass, 1);       // T4
        assert.strictEqual(tally!.scores.false_positive, 1);      // T5
        assert.strictEqual(tally!.attacker_points, 2);            // T3 + T5
        assert.strictEqual(tally!.defender_points, 2);            // T1 + T2
        assert.strictEqual(tally!.total_shots, 5);
        db.close();
    });

    t.test('recent returns scored events in reverse-chronological order', async () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        for (let i = 0; i < 3; i++) {
            insertEngram(db, `ra${i}`, 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
                shot_id: `R${i}`, scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
            });
            const v = insertEngram(db, `rv${i}`, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, `usb-sentry/verdict/R${i}`, {
                shot_id: `R${i}`, terminal_event: 'usb-sentry/phase1-hit',
            });
            scoreEngramIfArbitrated(db, v);
            // ensure distinct timestamps
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        const recent = recentScores(db, USB_CONTEST.contest_id, 10);
        assert.strictEqual(recent.length, 3);
        assert.ok(recent[0].scored_at >= recent[1].scored_at);
        assert.ok(recent[1].scored_at >= recent[2].scored_at);
        db.close();
    });

    t.test('by_scenario groups by scenario_id', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        for (const [sid, scen, exp, term] of [
            ['B1', 'FORGE-MS-002', 'deflected', 'usb-sentry/phase1-hit'],
            ['B2', 'FORGE-MS-002', 'deflected', 'usb-sentry/complete'],
            ['B3', 'FORGE-MS-001', 'captured_clean', 'usb-sentry/complete'],
        ] as const) {
            insertEngram(db, `ba${sid}`, 'BEAD-USB-FORGE-001', r, `usb-forge/shot-fired/${scen}`, {
                shot_id: sid, scenario_id: scen, expected: { outcome: exp },
            });
            const v = insertEngram(db, `bv${sid}`, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, `usb-sentry/verdict/${sid}`, {
                shot_id: sid, terminal_event: term,
            });
            scoreEngramIfArbitrated(db, v);
        }

        const buckets = byScenario(db, USB_CONTEST.contest_id);
        const ms002 = buckets.find((b) => b.scenario_id === 'FORGE-MS-002')!;
        assert.strictEqual(ms002.scores.defender_blocked, 1);
        assert.strictEqual(ms002.scores.attacker_bypassed, 1);
        assert.strictEqual(ms002.total, 2);
        const ms001 = buckets.find((b) => b.scenario_id === 'FORGE-MS-001')!;
        assert.strictEqual(ms001.scores.baseline_pass, 1);
        db.close();
    });

    t.test('get_score returns a single shot lookup', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'g1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'GET-ME', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });
        const v = insertEngram(db, 'g2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/GET-ME', {
            shot_id: 'GET-ME', terminal_event: 'usb-sentry/phase1-hit',
        });
        scoreEngramIfArbitrated(db, v);

        const score = getScoreByShot(db, 'GET-ME');
        assert.ok(score);
        assert.strictEqual(score!.outcome, 'defender_blocked');
        assert.strictEqual(score!.scenario_id, 'FORGE-MS-002');
        db.close();
    });

    t.test('non-contest Engrams pass through untouched (no regression)', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-UNRELATED', r);

        const unrelated = insertEngram(db, 'u1', 'BEAD-UNRELATED', r, 'unrelated-system/event/foo', {
            payload: 'bar',
        });
        const results = scoreEngramIfArbitrated(db, unrelated);
        assert.strictEqual(results.length, 0);

        const count = db.prepare(`SELECT COUNT(*) AS n FROM war_game_scores`).get() as { n: number };
        assert.strictEqual(count.n, 0);
        db.close();
    });

    t.test('trigger is fail-soft — drops the score table mid-run, original Engram remains', () => {
        const db = makeDb();
        const r = repoId(db);
        registerContest(db, { ...USB_CONTEST, repo_id: r });
        ensureBead(db, 'BEAD-USB-FORGE-001', r);
        ensureBead(db, 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r);

        insertEngram(db, 'f1', 'BEAD-USB-FORGE-001', r, 'usb-forge/shot-fired/FORGE-MS-002', {
            shot_id: 'SHOT-FS', scenario_id: 'FORGE-MS-002', expected: { outcome: 'deflected' },
        });

        // Sabotage the score table so the trigger throws.
        db.exec(`DROP TABLE war_game_scores`);

        const verdict = insertEngram(db, 'f2', 'BEAD-USB-SENTRY-FORGE-LISTENER-001', r, 'usb-sentry/verdict/SHOT-FS', {
            shot_id: 'SHOT-FS', terminal_event: 'usb-sentry/phase1-hit',
        });

        // Trigger must NOT throw, even though scoring fails.
        let threw = false;
        try {
            scoreEngramIfArbitrated(db, verdict, () => { /* silence */ });
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, false, 'scoring trigger must be fail-soft');

        // The verdict Engram is still in the Hall.
        const stillThere = db.prepare(`SELECT memory_id FROM hall_episodic_memory WHERE memory_id = 'f2'`).get();
        assert.ok(stillThere);
        db.close();
    });
});
