import { database } from '../../pennyone/intel/database.js';
import {
    scoreEngramIfArbitrated,
    registerContest as warGameRegisterContest,
    tallyContest,
    tallyAllContests,
    recentScores,
    byScenario,
    getScoreByShot,
    type RecordedEngram as WarGameRecordedEngram,
} from '../../war_game/score_trigger.js';
import {
    mcpMutation,
    textResponse,
} from '../contracts/responses.js';
import {
    requireString,
    resolveActiveRepo,
    resolveSpokeAnchor,
} from './shared.js';

export interface EngramRecordArgs {
    intent: string;
    bead_id: string;
    spoke?: string;
    metadata?: Record<string, unknown>;
    memory_id?: string;
}

export async function handleEngramRecord(args: EngramRecordArgs) {
    try {
        const intent = requireString(args.intent, 'intent');
        const beadId = requireString(args.bead_id, 'bead_id');
        const metadata = args.metadata ?? {};

        let anchor;
        if (args.spoke) {
            anchor = resolveSpokeAnchor(args.spoke);
        } else {
            const { repoId } = resolveActiveRepo();
            anchor = { repoId, spoke: null, metadata: null };
        }

        const now = Date.now();
        const memoryId = args.memory_id?.trim()
            || `engram_${intent.replace(/[^a-zA-Z0-9_-]/g, '_')}_${now}_${Math.random().toString(36).substring(2, 8)}`;

        database.getDb().prepare(
            `INSERT INTO hall_episodic_memory (
                memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                successes_json, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            memoryId,
            beadId,
            anchor.repoId,
            intent,
            '[]',
            '[]',
            JSON.stringify(metadata),
            now,
            now,
        );

        const recorded: WarGameRecordedEngram = {
            memory_id: memoryId,
            bead_id: beadId,
            repo_id: anchor.repoId,
            intent,
            metadata,
            created_at: now,
        };

        let scoreResults: ReturnType<typeof scoreEngramIfArbitrated> = [];
        if (!intent.startsWith('cstar/war-game/scored/')) {
            scoreResults = scoreEngramIfArbitrated(database.getDb(), recorded);
        }

        return textResponse({
            status: 'recorded',
            memory_id: memoryId,
            intent,
            bead_id: beadId,
            repo_id: anchor.repoId,
            mutation: mcpMutation('engram_record', memoryId, 'Engram was persisted through the MCP write surface.'),
            score_results: scoreResults.length > 0 ? scoreResults : undefined,
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

export interface WarGameScoreArgs {
    action: 'register_contest' | 'tally' | 'recent' | 'by_scenario' | 'get_score' | 'list_contests';
    contest_id?: string;
    shot_id?: string;
    limit?: number;
    contest_name?: string;
    attacker_label?: string;
    defender_label?: string;
    attacker_bead_id?: string;
    defender_bead_id?: string;
    attacker_intent_prefix?: string;
    defender_intent_prefix?: string;
    shot_id_path?: string;
    expected_path?: string;
    terminal_event_path?: string;
    terminal_event_class_map?: { block: string[]; complete: string[]; inconclusive: string[] };
    scenario_compatibility_map?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}

export async function handleWarGameScore(args: WarGameScoreArgs) {
    try {
        const db = database.getDb();
        switch (args.action) {
            case 'register_contest': {
                const contestId = requireString(args.contest_id, 'contest_id');
                const contestName = requireString(args.contest_name, 'contest_name');
                const attackerLabel = requireString(args.attacker_label, 'attacker_label');
                const defenderLabel = requireString(args.defender_label, 'defender_label');
                const attackerPrefix = requireString(args.attacker_intent_prefix, 'attacker_intent_prefix');
                const defenderPrefix = requireString(args.defender_intent_prefix, 'defender_intent_prefix');
                if (!args.terminal_event_class_map) {
                    return textResponse({ error: 'terminal_event_class_map is required' }, true);
                }
                if (!args.scenario_compatibility_map) {
                    return textResponse({ error: 'scenario_compatibility_map is required' }, true);
                }
                const { repoId } = resolveActiveRepo();
                warGameRegisterContest(db, {
                    contest_id: contestId,
                    repo_id: repoId,
                    contest_name: contestName,
                    attacker_label: attackerLabel,
                    defender_label: defenderLabel,
                    attacker_bead_id: args.attacker_bead_id ?? null,
                    defender_bead_id: args.defender_bead_id ?? null,
                    attacker_intent_prefix: attackerPrefix,
                    defender_intent_prefix: defenderPrefix,
                    shot_id_path: args.shot_id_path,
                    expected_path: args.expected_path,
                    terminal_event_path: args.terminal_event_path,
                    terminal_event_class_map: args.terminal_event_class_map,
                    scenario_compatibility_map: args.scenario_compatibility_map,
                    metadata: args.metadata,
                });
                return textResponse({
                    status: 'registered',
                    contest_id: contestId,
                    mutation: mcpMutation('war_game_contest_register', contestId, 'War-game contest was persisted through the MCP write surface.'),
                });
            }
            case 'tally': {
                if (args.contest_id) {
                    const tally = tallyContest(db, args.contest_id);
                    if (!tally) return textResponse({ error: `contest '${args.contest_id}' not found` }, true);
                    return textResponse({ status: 'ok', action: 'tally', tally });
                }
                const tallies = tallyAllContests(db);
                return textResponse({ status: 'ok', action: 'tally', tallies });
            }
            case 'recent': {
                const limit = args.limit ?? 10;
                const rows = recentScores(db, args.contest_id ?? null, limit);
                return textResponse({ status: 'ok', action: 'recent', scores: rows });
            }
            case 'by_scenario': {
                const contestId = requireString(args.contest_id, 'contest_id');
                const buckets = byScenario(db, contestId);
                return textResponse({ status: 'ok', action: 'by_scenario', contest_id: contestId, buckets });
            }
            case 'get_score': {
                const shotId = requireString(args.shot_id, 'shot_id');
                const row = getScoreByShot(db, shotId, args.contest_id);
                return textResponse({ status: 'ok', action: 'get_score', score: row });
            }
            case 'list_contests': {
                const rows = db.prepare(
                    `SELECT contest_id, contest_name, attacker_label, defender_label,
                            attacker_bead_id, defender_bead_id, created_at
                     FROM war_game_contests ORDER BY created_at DESC`,
                ).all();
                return textResponse({ status: 'ok', action: 'list_contests', contests: rows });
            }
            default:
                return textResponse({ error: `Unsupported war_game_score action: ${args.action}` }, true);
        }
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
