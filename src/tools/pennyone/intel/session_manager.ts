import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId } from '../../../types/hall.js';
import {
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
    HallSkillProposalRecord,
    HallSkillObservation,
} from '../../../types/hall.js';
import { AgentPing } from '../types.js';
import { registry } from '../pathRegistry.js';
import path from 'node:path';

export function saveHallSkillObservation(record: HallSkillObservation): void {
    const db = database.getDb('.');
    db.prepare(`
        INSERT INTO hall_skill_observations (
            observation_id, repo_id, skill_id, outcome, observation, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(observation_id) DO UPDATE SET
            outcome = excluded.outcome,
            observation = excluded.observation,
            metadata_json = excluded.metadata_json
    `).run(
        record.observation_id,
        record.repo_id,
        record.skill_id,
        record.outcome,
        record.observation,
        record.created_at,
        stringifyJson(record.metadata),
    );
}

export function saveHallPlanningSession(record: HallPlanningSessionRecord): void {
    const db = database.getDb('.');
    db.prepare(`
        INSERT INTO hall_planning_sessions (
            session_id, repo_id, skill_id, status, user_intent, normalized_intent,
            summary, latest_question, architect_opinion, current_bead_id, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            status = excluded.status,
            user_intent = excluded.user_intent,
            normalized_intent = excluded.normalized_intent,
            summary = excluded.summary,
            latest_question = excluded.latest_question,
            architect_opinion = excluded.architect_opinion,
            current_bead_id = excluded.current_bead_id,
            updated_at = excluded.updated_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.session_id,
        record.repo_id,
        record.skill_id,
        record.status,
        record.user_intent,
        record.normalized_intent,
        record.summary ?? null,
        record.latest_question ?? null,
        record.architect_opinion ?? null,
        record.current_bead_id ?? null,
        record.created_at,
        record.updated_at,
        stringifyJson(record.metadata),
    );
}

export function saveHallSkillProposal(record: HallSkillProposalRecord): void {
    const db = database.getDb('.');
    db.prepare(`
        INSERT INTO hall_skill_proposals (
            proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
            proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
            created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
            skill_id = excluded.skill_id,
            bead_id = excluded.bead_id,
            validation_id = excluded.validation_id,
            target_path = excluded.target_path,
            contract_path = excluded.contract_path,
            proposal_path = excluded.proposal_path,
            status = excluded.status,
            summary = excluded.summary,
            promotion_note = excluded.promotion_note,
            promoted_at = excluded.promoted_at,
            promoted_by = excluded.promoted_by,
            updated_at = excluded.updated_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.proposal_id,
        record.repo_id,
        record.skill_id,
        record.bead_id ?? null,
        record.validation_id ?? null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        record.contract_path ? normalizeHallPath(record.contract_path) : null,
        record.proposal_path ? normalizeHallPath(record.proposal_path) : null,
        record.status,
        record.summary ?? null,
        record.promotion_note ?? null,
        record.promoted_at ?? null,
        record.promoted_by ?? null,
        record.created_at,
        record.updated_at,
        stringifyJson(record.metadata),
    );
}

export function getHallSkillProposal(proposalId: string): HallSkillProposalRecord | null {
    const db = database.getDb('.');
    const row = db.prepare(`
        SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
               proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
               created_at, updated_at, metadata_json
        FROM hall_skill_proposals
        WHERE proposal_id = ?
        LIMIT 1
    `).get(proposalId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        proposal_id: String(row.proposal_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallSkillProposalRecord['status'],
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        validation_id: row.validation_id ? String(row.validation_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        contract_path: row.contract_path ? String(row.contract_path) : undefined,
        proposal_path: row.proposal_path ? String(row.proposal_path) : undefined,
        summary: row.summary ? String(row.summary) : undefined,
        promotion_note: row.promotion_note ? String(row.promotion_note) : undefined,
        promoted_at: row.promoted_at ? Number(row.promoted_at) : undefined,
        promoted_by: row.promoted_by ? String(row.promoted_by) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    };
}

export function getHallPlanningSession(sessionId: string): HallPlanningSessionRecord | null {
    const db = database.getDb('.');
    const row = db.prepare(`
        SELECT session_id, repo_id, skill_id, status, user_intent, normalized_intent,
               summary, latest_question, architect_opinion, current_bead_id, created_at, updated_at, metadata_json
        FROM hall_planning_sessions
        WHERE session_id = ?
        LIMIT 1
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        session_id: String(row.session_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallPlanningSessionStatus,
        user_intent: String(row.user_intent),
        normalized_intent: String(row.normalized_intent),
        summary: row.summary ? String(row.summary) : undefined,
        latest_question: row.latest_question ? String(row.latest_question) : undefined,
        architect_opinion: row.architect_opinion ? String(row.architect_opinion) : undefined,
        current_bead_id: row.current_bead_id ? String(row.current_bead_id) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    };
}

export function listHallSkillProposals(
    rootPath: string = registry.getRoot(),
    options: {
        skill_id?: string;
        statuses?: HallSkillProposalRecord['status'][];
    } = {},
): HallSkillProposalRecord[] {
    const db = database.getDb('.');
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
               proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
               created_at, updated_at, metadata_json
        FROM hall_skill_proposals
        WHERE repo_id = ?
    `;

    if (options.skill_id) {
        sql += ' AND skill_id = ?';
        params.push(options.skill_id);
    }
    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }
    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        proposal_id: String(row.proposal_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallSkillProposalRecord['status'],
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        validation_id: row.validation_id ? String(row.validation_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        contract_path: row.contract_path ? String(row.contract_path) : undefined,
        proposal_path: row.proposal_path ? String(row.proposal_path) : undefined,
        summary: row.summary ? String(row.summary) : undefined,
        promotion_note: row.promotion_note ? String(row.promotion_note) : undefined,
        promoted_at: row.promoted_at ? Number(row.promoted_at) : undefined,
        promoted_by: row.promoted_by ? String(row.promoted_by) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    }));
}

export function listHallPlanningSessions(
    rootPath: string = registry.getRoot(),
    options: {
        statuses?: HallPlanningSessionStatus[];
    } = {},
): HallPlanningSessionRecord[] {
    const db = database.getDb('.');
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT session_id, repo_id, skill_id, status, user_intent, normalized_intent,
               summary, latest_question, created_at, updated_at, metadata_json
        FROM hall_planning_sessions
        WHERE repo_id = ?
    `;

    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }

    sql += ' ORDER BY updated_at DESC';
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        session_id: String(row.session_id),
        repo_id: String(row.repo_id),
        skill_id: String(row.skill_id),
        status: row.status as HallPlanningSessionStatus,
        user_intent: String(row.user_intent),
        normalized_intent: String(row.normalized_intent),
        summary: row.summary ? String(row.summary) : undefined,
        latest_question: row.latest_question ? String(row.latest_question) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    }));
}

export function registerSpoke(targetRepo: string): number {
    const db = database.getDb('.');
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');
    const spokeName = path.basename(normalizedRepo);

    const spoke = db.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?').get(normalizedRepo, spokeName) as { id: number } | undefined;

    if (!spoke) {
        const stmt = db.prepare('INSERT OR IGNORE INTO spokes (name, root_path) VALUES (?, ?)');
        const result = stmt.run(spokeName, normalizedRepo);
        
        if (result.changes === 0) {
            const existing = db.prepare('SELECT id FROM spokes WHERE root_path = ? OR name = ?').get(normalizedRepo, spokeName) as { id: number };
            return existing.id;
        }
        return result.lastInsertRowid as number;
    }
    return spoke.id;
}

export async function savePing(ping: AgentPing, targetRepo: string) {
    const sanitizedAgentId = ping.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const validActions = ['SEARCH', 'READ', 'EDIT', 'EVALUATE', 'THINK'];
    const sanitizedAction = validActions.includes(ping.action) ? ping.action : 'THINK';

    const spokeId = registerSpoke(targetRepo);
    const db = database.getDb('.');
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    let session = db.prepare('SELECT id FROM sessions WHERE agent_id = ? AND spoke_id = ? AND start_timestamp > ? ORDER BY id DESC LIMIT 1')
        .get(sanitizedAgentId, spokeId, oneHourAgo) as { id: number } | undefined;

    if (!session) {
        const stmt = db.prepare('INSERT INTO sessions (agent_id, spoke_id, start_timestamp) VALUES (?, ?, ?)');
        const result = stmt.run(sanitizedAgentId, spokeId, ping.timestamp);
        session = { id: result.lastInsertRowid as number };
    }

    const insertPing = db.prepare('INSERT INTO pings (session_id, agent_id, action, target_path, timestamp) VALUES (?, ?, ?, ?, ?)');
    insertPing.run(session.id, sanitizedAgentId, sanitizedAction, ping.target_path, ping.timestamp);

    db.prepare('UPDATE sessions SET total_pings = total_pings + 1, end_timestamp = ? WHERE id = ?')
        .run(ping.timestamp, session.id);
}

export function getSessionsWithSummaries(targetRepo: string): Record<string, unknown>[] {
    const db = database.getDb('.');
    const normalizedRepo = path.resolve(targetRepo).replace(/\\/g, '/');

    const sessions = db.prepare(`
        SELECT s.*, sp.name as spoke_name,
        (SELECT target_path FROM pings WHERE session_id = s.id GROUP BY target_path ORDER BY COUNT(*) DESC LIMIT 1) as primary_target
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        WHERE sp.root_path = ?
        ORDER BY s.start_timestamp DESC
    `).all(normalizedRepo) as Record<string, unknown>[];

    return sessions.map(s => {
        const start = s.start_timestamp as number;
        const end = s.end_timestamp as number | null;
        const duration = end ? Math.round((end - start) / 1000) : 0;
        const primaryTarget = s.primary_target as string | undefined;
        const targetFile = primaryTarget ? path.basename(primaryTarget) : 'unknown';

        return {
            ...s,
            summary: `Agent ${s.agent_id} performed ${s.total_pings} actions over ${duration}s. Primary focus: ${targetFile}.`
        };
    });
}

export function getSessionPings(sessionId: number, _targetRepo: string): AgentPing[] {
    const db = database.getDb('.');
    return db.prepare('SELECT agent_id, action, target_path, timestamp FROM pings WHERE session_id = ? ORDER BY timestamp ASC')
        .all(sessionId) as AgentPing[];
}

export function getRecentSessions(limit: number = 20): any[] {
    const db = database.getDb('.');
    return db.prepare(`
        SELECT s.*, sp.name as spoke_name, sp.root_path as spoke_path
        FROM sessions s
        JOIN spokes sp ON s.spoke_id = sp.id
        ORDER BY s.start_timestamp DESC
        LIMIT ?
    `).all(limit);
}

export function getPingsForSession(sessionId: number): any[] {
    const db = database.getDb('.');
    return db.prepare(`
        SELECT * FROM pings 
        WHERE session_id = ? 
        ORDER BY timestamp ASC
    `).all(sessionId);
}
