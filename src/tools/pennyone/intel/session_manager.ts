import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { normalizeHallPath, buildHallRepositoryId } from '../../../types/hall.js';
import {
    HallContextMetadata,
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
    HallSkillActivationRecord,
    HallSkillProposalRecord,
    HallSkillObservation,
} from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { normalizeProposalMetadata, normalizeSessionMetadata } from './session_metadata.js';

export function saveHallSkillObservation(record: HallSkillObservation): void {
    const db = database.getWritableDb();
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

export function saveHallSkillActivation(record: HallSkillActivationRecord): void {
    const db = database.getWritableDb();
    db.prepare(`
        INSERT INTO hall_skill_activations (
            activation_id, repo_id, bead_id, session_id, skill_id, adapter_id, role, status,
            intent, target_path, payload_json, result_summary, error_text,
            created_at, updated_at, completed_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(activation_id) DO UPDATE SET
            bead_id = excluded.bead_id,
            session_id = excluded.session_id,
            skill_id = excluded.skill_id,
            adapter_id = excluded.adapter_id,
            role = excluded.role,
            status = excluded.status,
            intent = excluded.intent,
            target_path = excluded.target_path,
            payload_json = excluded.payload_json,
            result_summary = excluded.result_summary,
            error_text = excluded.error_text,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at,
            metadata_json = excluded.metadata_json
    `).run(
        record.activation_id,
        record.repo_id,
        record.bead_id ?? null,
        record.session_id ?? null,
        record.skill_id,
        record.adapter_id ?? null,
        record.role ?? null,
        record.status,
        record.intent,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        stringifyJson(record.payload),
        record.result_summary ?? null,
        record.error_text ?? null,
        record.created_at,
        record.updated_at,
        record.completed_at ?? null,
        stringifyJson(record.metadata),
    );
}

export function getHallSkillActivation(
    activationId: string,
    rootPath: string = registry.getRoot(),
): HallSkillActivationRecord | null {
    const db = database.getReadDb(rootPath);
    const row = db.prepare(`
        SELECT activation_id, repo_id, bead_id, session_id, skill_id, adapter_id, role, status,
               intent, target_path, payload_json, result_summary, error_text,
               created_at, updated_at, completed_at, metadata_json
        FROM hall_skill_activations
        WHERE activation_id = ?
        LIMIT 1
    `).get(activationId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        activation_id: String(row.activation_id),
        repo_id: String(row.repo_id),
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        skill_id: String(row.skill_id),
        adapter_id: row.adapter_id ? String(row.adapter_id) : undefined,
        role: row.role ? String(row.role) : undefined,
        status: row.status as HallSkillActivationRecord['status'],
        intent: String(row.intent),
        target_path: row.target_path ? String(row.target_path) : undefined,
        payload: parseJson<Record<string, unknown>>(row.payload_json as string | null, {}),
        result_summary: row.result_summary ? String(row.result_summary) : undefined,
        error_text: row.error_text ? String(row.error_text) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        completed_at: row.completed_at ? Number(row.completed_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    };
}

export function listHallSkillActivations(
    rootPath: string = registry.getRoot(),
    options: {
        bead_id?: string;
        session_id?: string;
        statuses?: HallSkillActivationRecord['status'][];
    } = {},
): HallSkillActivationRecord[] {
    const db = database.getReadDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: Array<string> = [repoId];
    let sql = `
        SELECT activation_id, repo_id, bead_id, session_id, skill_id, adapter_id, role, status,
               intent, target_path, payload_json, result_summary, error_text,
               created_at, updated_at, completed_at, metadata_json
        FROM hall_skill_activations
        WHERE repo_id = ?
    `;

    if (options.bead_id) {
        sql += ' AND bead_id = ?';
        params.push(options.bead_id);
    }
    if (options.session_id) {
        sql += ' AND session_id = ?';
        params.push(options.session_id);
    }
    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }

    sql += ' ORDER BY created_at ASC';
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        activation_id: String(row.activation_id),
        repo_id: String(row.repo_id),
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        skill_id: String(row.skill_id),
        adapter_id: row.adapter_id ? String(row.adapter_id) : undefined,
        role: row.role ? String(row.role) : undefined,
        status: row.status as HallSkillActivationRecord['status'],
        intent: String(row.intent),
        target_path: row.target_path ? String(row.target_path) : undefined,
        payload: parseJson<Record<string, unknown>>(row.payload_json as string | null, {}),
        result_summary: row.result_summary ? String(row.result_summary) : undefined,
        error_text: row.error_text ? String(row.error_text) : undefined,
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
        completed_at: row.completed_at ? Number(row.completed_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
    }));
}

export function saveHallPlanningSession(record: HallPlanningSessionRecord): void {
    const db = database.getWritableDb();
    const metadata = normalizeSessionMetadata(record);
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
        stringifyJson(metadata),
    );
}

export function saveHallSkillProposal(record: HallSkillProposalRecord): void {
    const db = database.getWritableDb();
    const metadata = normalizeProposalMetadata(record);
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
        stringifyJson(metadata),
    );
}

export function getHallSkillProposal(proposalId: string): HallSkillProposalRecord | null {
    const db = database.getReadDb();
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
        metadata: parseJson<HallContextMetadata>(row.metadata_json as string | null, {}),
    };
}

export function getHallPlanningSession(
    sessionId: string,
    rootPath: string = registry.getRoot(),
): HallPlanningSessionRecord | null {
    const db = database.tryGetReadDb(rootPath);
    if (!db) return null;
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
        metadata: parseJson<HallContextMetadata>(row.metadata_json as string | null, {}),
    };
}

export function listHallSkillProposals(
    rootPath: string = registry.getRoot(),
    options: {
        skill_id?: string;
        statuses?: HallSkillProposalRecord['status'][];
    } = {},
): HallSkillProposalRecord[] {
    const db = database.getReadDb();
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
        metadata: parseJson<HallContextMetadata>(row.metadata_json as string | null, {}),
    }));
}

export function listHallPlanningSessions(
    rootPath: string = registry.getRoot(),
    options: {
        statuses?: HallPlanningSessionStatus[];
    } = {},
): HallPlanningSessionRecord[] {
    const db = database.tryGetReadDb(rootPath);
    if (!db) return [];
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
        metadata: parseJson<HallContextMetadata>(row.metadata_json as string | null, {}),
    }));
}

export function backfillHallPlanningSessionMetadata(rootPath: string = registry.getRoot()): number {
    const db = database.getWritableDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = db.prepare(`
        SELECT session_id, metadata_json
        FROM hall_planning_sessions
        WHERE repo_id = ?
    `).all(repoId) as Array<Record<string, unknown>>;

    let updated = 0;
    for (const row of rows) {
        const existing = parseJson<HallContextMetadata>(row.metadata_json as string | null, {});
        if (existing.authority_tier && typeof existing.archived === 'boolean') {
            continue;
        }
        const metadata: HallContextMetadata = {
            ...existing,
            authority_tier: existing.authority_tier ?? 'live_authority',
            archived: typeof existing.archived === 'boolean' ? existing.archived : false,
        };
        db.prepare('UPDATE hall_planning_sessions SET metadata_json = ? WHERE session_id = ?').run(
            stringifyJson(metadata),
            String(row.session_id),
        );
        updated += 1;
    }

    return updated;
}

export function backfillHallSkillProposalMetadata(rootPath: string = registry.getRoot()): number {
    const db = database.getWritableDb();
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const rows = db.prepare(`
        SELECT proposal_id, status, target_path, contract_path, proposal_path, metadata_json
        FROM hall_skill_proposals
        WHERE repo_id = ?
    `).all(repoId) as Array<Record<string, unknown>>;

    let updated = 0;
    for (const row of rows) {
        const existing = parseJson<HallContextMetadata>(row.metadata_json as string | null, {});
        if (existing.authority_tier && typeof existing.archived === 'boolean') {
            continue;
        }
        const metadata = normalizeProposalMetadata({
            proposal_id: String(row.proposal_id),
            repo_id: repoId,
            skill_id: '',
            status: row.status as HallSkillProposalRecord['status'],
            created_at: 0,
            updated_at: 0,
            target_path: row.target_path ? String(row.target_path) : undefined,
            contract_path: row.contract_path ? String(row.contract_path) : undefined,
            proposal_path: row.proposal_path ? String(row.proposal_path) : undefined,
            metadata: existing,
        });
        db.prepare('UPDATE hall_skill_proposals SET metadata_json = ? WHERE proposal_id = ?').run(
            stringifyJson(metadata),
            String(row.proposal_id),
        );
        updated += 1;
    }

    return updated;
}

export {
    getPingsForSession,
    getRecentSessions,
    getSessionPings,
    getSessionsWithSummaries,
    registerSpoke,
    savePing,
} from './session_activity_controller.js';
