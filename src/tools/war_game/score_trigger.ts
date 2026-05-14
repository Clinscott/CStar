/**
 * BEAD-CSTAR-WAR-GAME-SCORING-001 — Score trigger.
 *
 * Fires after an Engram is persisted via cstar_engram_record. Looks up
 * registered contests whose defender_intent_prefix matches the inbound
 * Engram's intent. For each match, finds the attacker Engram by shot_id,
 * derives outcome via score_engine, and upserts a row in war_game_scores
 * (with §Q5 severity-aware UPSERT). Also writes a cstar/war-game/scored/<shot_id>
 * Engram so downstream consumers (CorvusEye scoreboard) can subscribe.
 *
 * Fail-soft: ANY error inside the trigger is logged and swallowed. The
 * original Engram write that fired this trigger is never rolled back.
 *
 * See docs/beads/cstar-war-game-scoring-001.md §4 and tests/features/war_game_scoring.feature.
 */

import type Database from 'better-sqlite3';
import {
    deriveOutcome,
    shouldUpgrade,
    extractShotId,
    type ContestConfig,
    type WarGameOutcome,
    type AttackerEngramPayload,
    type DefenderEngramPayload,
    type ScenarioCompatibilityMap,
    type TerminalEventClassMap,
} from './score_engine.js';

export interface RecordedEngram {
    memory_id: string;
    bead_id: string;
    repo_id: string;
    intent: string;           // mirrors tactical_summary on disk
    metadata: Record<string, unknown>;
    created_at: number;
}

export interface ContestRow {
    contest_id: string;
    repo_id: string;
    contest_name: string;
    attacker_label: string;
    defender_label: string;
    attacker_bead_id: string | null;
    defender_bead_id: string | null;
    attacker_intent_prefix: string;
    defender_intent_prefix: string;
    shot_id_path: string;
    expected_path: string;
    terminal_event_path: string;
    terminal_event_class_map_json: string;
    scenario_compatibility_map_json: string;
    metadata_json: string | null;
    created_at: number;
}

function contestRowToConfig(row: ContestRow): ContestConfig {
    return {
        contest_id: row.contest_id,
        shot_id_path: row.shot_id_path,
        expected_path: row.expected_path,
        terminal_event_path: row.terminal_event_path,
        terminal_event_class_map: JSON.parse(row.terminal_event_class_map_json) as TerminalEventClassMap,
        scenario_compatibility_map: JSON.parse(row.scenario_compatibility_map_json) as ScenarioCompatibilityMap,
    };
}

/**
 * Find a contest whose defender_intent_prefix is a prefix of the inbound intent.
 * Returns all matches (multiple contests may share prefix territory).
 */
export function findMatchingContests(
    db: Database.Database,
    intent: string,
): ContestRow[] {
    const rows = db
        .prepare(
            `SELECT * FROM war_game_contests
             WHERE :intent LIKE defender_intent_prefix || '%'`,
        )
        .all({ intent }) as ContestRow[];
    return rows;
}

/**
 * Find the most-recent attacker Engram matching this shot_id.  Uses tactical_summary
 * LIKE for intent-prefix narrowing and a JSON1 read on metadata_json for the join.
 */
export function findAttackerEngram(
    db: Database.Database,
    attackerIntentPrefix: string,
    shotIdPath: string,
    shotId: string,
): RecordedEngram | null {
    // The shot_id_path is e.g. 'metadata.shot_id' — strip the leading 'metadata.'
    // since the JSON column is the metadata blob (not the whole payload).
    const jsonPath = shotIdPath.startsWith('metadata.')
        ? '$.' + shotIdPath.slice('metadata.'.length)
        : '$.' + shotIdPath;

    const row = db
        .prepare(
            `SELECT memory_id, bead_id, repo_id, tactical_summary AS intent,
                    metadata_json, created_at
             FROM hall_episodic_memory
             WHERE tactical_summary LIKE :prefix || '%'
               AND json_extract(metadata_json, :jsonPath) = :shotId
             ORDER BY created_at DESC
             LIMIT 1`,
        )
        .get({ prefix: attackerIntentPrefix, jsonPath, shotId }) as
        | (Omit<RecordedEngram, 'metadata'> & { metadata_json: string })
        | undefined;

    if (!row) return null;
    let metadata: Record<string, unknown> = {};
    try {
        metadata = JSON.parse(row.metadata_json ?? '{}') as Record<string, unknown>;
    } catch {
        metadata = {};
    }
    return {
        memory_id: row.memory_id,
        bead_id: row.bead_id,
        repo_id: row.repo_id,
        intent: row.intent,
        metadata,
        created_at: row.created_at,
    };
}

export interface ScoreInsertResult {
    contest_id: string;
    shot_id: string;
    outcome: WarGameOutcome;
    inserted: boolean;
    upgraded: boolean;
    inconclusive_reason: string | null;
    score_id: string;
}

function generateScoreId(contestId: string, shotId: string): string {
    return `score-${contestId}-${shotId}`;
}

function generateScoredEngramId(shotId: string, ts: number): string {
    // Suffix random to avoid UNIQUE collisions on same-millisecond scoring
    // events (e.g. severity-upgrade upserts that fire within the same tick).
    const suffix = Math.random().toString(36).substring(2, 8);
    return `engram_war_game_scored_${shotId}_${ts}_${suffix}`;
}

/**
 * UPSERT a score row honoring §Q5 severity. Returns the resulting outcome and whether
 * this call inserted a new row, upgraded an existing one, or was a no-op.
 */
export function upsertScore(
    db: Database.Database,
    contestId: string,
    shotId: string,
    scenarioId: string,
    outcome: WarGameOutcome,
    expectedSummary: string,
    observedTerminalEvent: string,
    inconclusiveReason: string | null,
    attackerIntent: string,
    defenderIntent: string,
    now: number,
): { inserted: boolean; upgraded: boolean; final_outcome: WarGameOutcome } {
    const existing = db
        .prepare(`SELECT outcome FROM war_game_scores WHERE contest_id = ? AND shot_id = ?`)
        .get(contestId, shotId) as { outcome: WarGameOutcome } | undefined;

    if (!existing) {
        db.prepare(
            `INSERT INTO war_game_scores (
                score_id, contest_id, shot_id, scenario_id, outcome,
                expected_summary, observed_terminal_event, inconclusive_reason,
                attacker_engram_intent, defender_engram_intent, scored_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            generateScoreId(contestId, shotId),
            contestId,
            shotId,
            scenarioId,
            outcome,
            expectedSummary,
            observedTerminalEvent,
            inconclusiveReason,
            attackerIntent,
            defenderIntent,
            now,
        );
        return { inserted: true, upgraded: false, final_outcome: outcome };
    }

    if (shouldUpgrade(existing.outcome, outcome)) {
        db.prepare(
            `UPDATE war_game_scores
             SET outcome = ?, observed_terminal_event = ?,
                 inconclusive_reason = ?, defender_engram_intent = ?, scored_at = ?
             WHERE contest_id = ? AND shot_id = ?`,
        ).run(
            outcome,
            observedTerminalEvent,
            inconclusiveReason,
            defenderIntent,
            now,
            contestId,
            shotId,
        );
        return { inserted: false, upgraded: true, final_outcome: outcome };
    }

    return { inserted: false, upgraded: false, final_outcome: existing.outcome };
}

/**
 * Insert the cstar/war-game/scored/<shot_id> Engram so downstream consumers
 * (CorvusEye scoreboard) can subscribe. Bypasses cstar_engram_record to avoid
 * trigger recursion.
 */
export function emitScoredEngram(
    db: Database.Database,
    contest: ContestRow,
    shotId: string,
    scenarioId: string,
    outcome: WarGameOutcome,
    expectedSummary: string,
    observedTerminalEvent: string,
    inconclusiveReason: string | null,
    attackerIntent: string,
    defenderIntent: string,
    now: number,
): string {
    const memoryId = generateScoredEngramId(shotId, now);
    // Anchor to the contest's defender bead if present, else attacker bead, else
    // the contest_id as a synthetic anchor in the metadata.
    const anchorBead = contest.defender_bead_id || contest.attacker_bead_id || 'BEAD-CSTAR-WAR-GAME-SCORING-001';
    const intent = `cstar/war-game/scored/${shotId}`;
    const metadata = {
        contest_id: contest.contest_id,
        contest_name: contest.contest_name,
        attacker_label: contest.attacker_label,
        defender_label: contest.defender_label,
        shot_id: shotId,
        scenario_id: scenarioId,
        outcome,
        expected_summary: expectedSummary,
        observed_terminal_event: observedTerminalEvent,
        inconclusive_reason: inconclusiveReason,
        attacker_engram_intent: attackerIntent,
        defender_engram_intent: defenderIntent,
        scored_at: now,
    };

    db.prepare(
        `INSERT INTO hall_episodic_memory (
            memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
            successes_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        memoryId,
        anchorBead,
        contest.repo_id,
        intent,
        '[]',
        '[]',
        JSON.stringify(metadata),
        now,
        now,
    );

    return memoryId;
}

/**
 * Fail-soft entry point: examine a just-recorded Engram, and if it matches any
 * registered contest's defender_intent_prefix, score it. Errors are logged and
 * swallowed. The caller's transaction is unaffected by any failure here.
 */
export function scoreEngramIfArbitrated(
    db: Database.Database,
    engram: RecordedEngram,
    logger: (msg: string) => void = (msg) => console.warn(`[war_game] ${msg}`),
): ScoreInsertResult[] {
    const results: ScoreInsertResult[] = [];
    try {
        const contests = findMatchingContests(db, engram.intent);
        if (contests.length === 0) return results;

        for (const contestRow of contests) {
            try {
                const contest = contestRowToConfig(contestRow);
                // Defender Engram payload-shaped object for score_engine.
                const defenderPayload: DefenderEngramPayload = {
                    metadata: {
                        shot_id: '',
                        terminal_event: '',
                        ...(engram.metadata as any),
                    },
                };
                const shotId = extractShotId({ metadata: engram.metadata }, contest);
                if (!shotId) {
                    logger(`engram ${engram.memory_id} matched contest ${contest.contest_id} but has no shot_id; skipping`);
                    continue;
                }
                defenderPayload.metadata.shot_id = shotId;
                defenderPayload.metadata.terminal_event =
                    (engram.metadata as any).terminal_event ?? '';

                const attackerEngram = findAttackerEngram(
                    db,
                    contestRow.attacker_intent_prefix,
                    contest.shot_id_path,
                    shotId,
                );

                if (!attackerEngram) {
                    // No attacker Engram on file for this shot_id — record as inconclusive
                    // so the operator sees the orphan verdict and can investigate.
                    const now = Date.now();
                    const r = upsertScore(
                        db,
                        contestRow.contest_id,
                        shotId,
                        (engram.metadata as any).scenario_id ?? 'UNKNOWN',
                        'inconclusive',
                        '(no attacker engram)',
                        defenderPayload.metadata.terminal_event,
                        'no_attacker_engram',
                        '(missing)',
                        engram.intent,
                        now,
                    );
                    emitScoredEngram(
                        db,
                        contestRow,
                        shotId,
                        (engram.metadata as any).scenario_id ?? 'UNKNOWN',
                        r.final_outcome,
                        '(no attacker engram)',
                        defenderPayload.metadata.terminal_event,
                        'no_attacker_engram',
                        '(missing)',
                        engram.intent,
                        now,
                    );
                    results.push({
                        contest_id: contestRow.contest_id,
                        shot_id: shotId,
                        outcome: r.final_outcome,
                        inserted: r.inserted,
                        upgraded: r.upgraded,
                        inconclusive_reason: 'no_attacker_engram',
                        score_id: generateScoreId(contestRow.contest_id, shotId),
                    });
                    continue;
                }

                const attackerPayload: AttackerEngramPayload = {
                    metadata: {
                        shot_id: shotId,
                        scenario_id: (attackerEngram.metadata as any).scenario_id ?? 'UNKNOWN',
                        expected: (attackerEngram.metadata as any).expected ?? { outcome: 'unknown' },
                        ...(attackerEngram.metadata as any),
                    },
                };

                const derived = deriveOutcome(attackerPayload, defenderPayload, contest);
                const now = Date.now();
                const r = upsertScore(
                    db,
                    contestRow.contest_id,
                    shotId,
                    attackerPayload.metadata.scenario_id,
                    derived.outcome,
                    JSON.stringify(attackerPayload.metadata.expected),
                    defenderPayload.metadata.terminal_event,
                    derived.inconclusive_reason,
                    attackerEngram.intent,
                    engram.intent,
                    now,
                );

                emitScoredEngram(
                    db,
                    contestRow,
                    shotId,
                    attackerPayload.metadata.scenario_id,
                    r.final_outcome,
                    JSON.stringify(attackerPayload.metadata.expected),
                    defenderPayload.metadata.terminal_event,
                    derived.inconclusive_reason,
                    attackerEngram.intent,
                    engram.intent,
                    now,
                );

                results.push({
                    contest_id: contestRow.contest_id,
                    shot_id: shotId,
                    outcome: r.final_outcome,
                    inserted: r.inserted,
                    upgraded: r.upgraded,
                    inconclusive_reason: derived.inconclusive_reason,
                    score_id: generateScoreId(contestRow.contest_id, shotId),
                });
            } catch (perContestError) {
                logger(
                    `contest ${contestRow.contest_id} scoring failed for engram ${engram.memory_id}: ${perContestError instanceof Error ? perContestError.message : String(perContestError)}`,
                );
            }
        }
    } catch (outerError) {
        logger(`scoreEngramIfArbitrated outer error: ${outerError instanceof Error ? outerError.message : String(outerError)}`);
    }
    return results;
}

/**
 * Register or update a contest. Idempotent — uses INSERT OR REPLACE so the
 * configured class/compatibility maps can evolve without bead churn.
 */
export interface RegisterContestArgs {
    contest_id: string;
    repo_id: string;
    contest_name: string;
    attacker_label: string;
    defender_label: string;
    attacker_bead_id?: string | null;
    defender_bead_id?: string | null;
    attacker_intent_prefix: string;
    defender_intent_prefix: string;
    shot_id_path?: string;
    expected_path?: string;
    terminal_event_path?: string;
    terminal_event_class_map: TerminalEventClassMap;
    scenario_compatibility_map: ScenarioCompatibilityMap;
    metadata?: Record<string, unknown>;
}

export function registerContest(db: Database.Database, args: RegisterContestArgs): void {
    db.prepare(
        `INSERT INTO war_game_contests (
            contest_id, repo_id, contest_name, attacker_label, defender_label,
            attacker_bead_id, defender_bead_id, attacker_intent_prefix, defender_intent_prefix,
            shot_id_path, expected_path, terminal_event_path,
            terminal_event_class_map_json, scenario_compatibility_map_json,
            metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(contest_id) DO UPDATE SET
            contest_name = excluded.contest_name,
            attacker_label = excluded.attacker_label,
            defender_label = excluded.defender_label,
            attacker_bead_id = excluded.attacker_bead_id,
            defender_bead_id = excluded.defender_bead_id,
            attacker_intent_prefix = excluded.attacker_intent_prefix,
            defender_intent_prefix = excluded.defender_intent_prefix,
            shot_id_path = excluded.shot_id_path,
            expected_path = excluded.expected_path,
            terminal_event_path = excluded.terminal_event_path,
            terminal_event_class_map_json = excluded.terminal_event_class_map_json,
            scenario_compatibility_map_json = excluded.scenario_compatibility_map_json,
            metadata_json = excluded.metadata_json`,
    ).run(
        args.contest_id,
        args.repo_id,
        args.contest_name,
        args.attacker_label,
        args.defender_label,
        args.attacker_bead_id ?? null,
        args.defender_bead_id ?? null,
        args.attacker_intent_prefix,
        args.defender_intent_prefix,
        args.shot_id_path ?? 'metadata.shot_id',
        args.expected_path ?? 'metadata.expected',
        args.terminal_event_path ?? 'metadata.terminal_event',
        JSON.stringify(args.terminal_event_class_map),
        JSON.stringify(args.scenario_compatibility_map),
        args.metadata ? JSON.stringify(args.metadata) : null,
        Date.now(),
    );
}

export interface TallyResult {
    contest_id: string;
    contest_name: string;
    attacker_label: string;
    defender_label: string;
    scores: Record<WarGameOutcome, number>;
    attacker_points: number;     // attacker_bypassed + false_positive
    defender_points: number;     // defender_blocked
    inconclusive_count: number;
    protocol_violation_count: number;
    total_shots: number;
}

export function tallyContest(db: Database.Database, contestId: string): TallyResult | null {
    const contest = db
        .prepare(`SELECT * FROM war_game_contests WHERE contest_id = ?`)
        .get(contestId) as ContestRow | undefined;
    if (!contest) return null;

    const rows = db
        .prepare(`SELECT outcome, COUNT(*) AS n FROM war_game_scores WHERE contest_id = ? GROUP BY outcome`)
        .all(contestId) as Array<{ outcome: WarGameOutcome; n: number }>;

    const scores: Record<WarGameOutcome, number> = {
        defender_blocked: 0,
        attacker_bypassed: 0,
        false_positive: 0,
        baseline_pass: 0,
        inconclusive: 0,
        protocol_violation: 0,
    };
    for (const r of rows) scores[r.outcome] = r.n;

    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    return {
        contest_id: contest.contest_id,
        contest_name: contest.contest_name,
        attacker_label: contest.attacker_label,
        defender_label: contest.defender_label,
        scores,
        attacker_points: scores.attacker_bypassed + scores.false_positive,
        defender_points: scores.defender_blocked,
        inconclusive_count: scores.inconclusive,
        protocol_violation_count: scores.protocol_violation,
        total_shots: total,
    };
}

export function tallyAllContests(db: Database.Database): TallyResult[] {
    const contests = db
        .prepare(`SELECT contest_id FROM war_game_contests`)
        .all() as Array<{ contest_id: string }>;
    return contests
        .map((c) => tallyContest(db, c.contest_id))
        .filter((t): t is TallyResult => t !== null);
}

export interface RecentScoreRow {
    score_id: string;
    contest_id: string;
    shot_id: string;
    scenario_id: string;
    outcome: WarGameOutcome;
    observed_terminal_event: string | null;
    inconclusive_reason: string | null;
    scored_at: number;
}

export function recentScores(
    db: Database.Database,
    contestId: string | null,
    limit: number,
): RecentScoreRow[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    if (contestId) {
        return db
            .prepare(
                `SELECT score_id, contest_id, shot_id, scenario_id, outcome,
                        observed_terminal_event, inconclusive_reason, scored_at
                 FROM war_game_scores
                 WHERE contest_id = ?
                 ORDER BY scored_at DESC
                 LIMIT ?`,
            )
            .all(contestId, safeLimit) as RecentScoreRow[];
    }
    return db
        .prepare(
            `SELECT score_id, contest_id, shot_id, scenario_id, outcome,
                    observed_terminal_event, inconclusive_reason, scored_at
             FROM war_game_scores
             ORDER BY scored_at DESC
             LIMIT ?`,
        )
        .all(safeLimit) as RecentScoreRow[];
}

export interface ByScenarioBucket {
    scenario_id: string;
    scores: Record<WarGameOutcome, number>;
    total: number;
}

export function byScenario(db: Database.Database, contestId: string): ByScenarioBucket[] {
    const rows = db
        .prepare(
            `SELECT scenario_id, outcome, COUNT(*) AS n
             FROM war_game_scores
             WHERE contest_id = ?
             GROUP BY scenario_id, outcome
             ORDER BY scenario_id`,
        )
        .all(contestId) as Array<{ scenario_id: string; outcome: WarGameOutcome; n: number }>;

    const buckets = new Map<string, ByScenarioBucket>();
    for (const r of rows) {
        if (!buckets.has(r.scenario_id)) {
            buckets.set(r.scenario_id, {
                scenario_id: r.scenario_id,
                scores: {
                    defender_blocked: 0,
                    attacker_bypassed: 0,
                    false_positive: 0,
                    baseline_pass: 0,
                    inconclusive: 0,
                    protocol_violation: 0,
                },
                total: 0,
            });
        }
        const b = buckets.get(r.scenario_id)!;
        b.scores[r.outcome] = r.n;
        b.total += r.n;
    }
    return Array.from(buckets.values());
}

export function getScoreByShot(
    db: Database.Database,
    shotId: string,
    contestId?: string,
): RecentScoreRow | null {
    if (contestId) {
        const row = db
            .prepare(
                `SELECT score_id, contest_id, shot_id, scenario_id, outcome,
                        observed_terminal_event, inconclusive_reason, scored_at
                 FROM war_game_scores
                 WHERE contest_id = ? AND shot_id = ?`,
            )
            .get(contestId, shotId) as RecentScoreRow | undefined;
        return row ?? null;
    }
    const row = db
        .prepare(
            `SELECT score_id, contest_id, shot_id, scenario_id, outcome,
                    observed_terminal_event, inconclusive_reason, scored_at
             FROM war_game_scores
             WHERE shot_id = ?
             ORDER BY scored_at DESC
             LIMIT 1`,
        )
        .get(shotId) as RecentScoreRow | undefined;
    return row ?? null;
}
