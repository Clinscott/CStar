import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import {
    buildHallRepositoryId,
    normalizeHallPath,
    type HallAgentPresenceRecord,
    type HallAgentPresenceStatus,
    type HallCoordinationEventKind,
    type HallCoordinationEventRecord,
    type HallCoordinationScopeKind,
} from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';

function mapPresenceRow(row: Record<string, unknown>): HallAgentPresenceRecord {
    return {
        repo_id: String(row.repo_id),
        agent_id: String(row.agent_id),
        name: String(row.name),
        status: row.status as HallAgentPresenceStatus,
        current_task: row.current_task ? String(row.current_task) : undefined,
        active_bead_id: row.active_bead_id ? String(row.active_bead_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        trace_id: row.trace_id ? String(row.trace_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        watch_paths: parseJson<string[]>(row.watch_paths_json as string | null, []),
        pid: row.pid ? Number(row.pid) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

function mapCoordinationEventRow(row: Record<string, unknown>): HallCoordinationEventRecord {
    return {
        event_id: String(row.event_id),
        repo_id: String(row.repo_id),
        thread_id: String(row.thread_id),
        scope_kind: row.scope_kind as HallCoordinationScopeKind,
        scope_ref: String(row.scope_ref),
        event_kind: row.event_kind as HallCoordinationEventKind,
        from_agent_id: String(row.from_agent_id),
        to_agent_id: row.to_agent_id ? String(row.to_agent_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        trace_id: row.trace_id ? String(row.trace_id) : undefined,
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        rationale: String(row.rationale),
        summary: String(row.summary),
        payload: parseJson<Record<string, unknown>>(row.payload_json as string | null, {}),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function saveHallAgentPresence(
    record: HallAgentPresenceRecord,
    rootPath: string = registry.getRoot(),
): void {
    const db = database.getDb(rootPath);
    db.prepare(`
        INSERT INTO hall_agent_presence (
            repo_id, agent_id, name, status, current_task, active_bead_id, session_id,
            trace_id, target_path, watch_paths_json, pid, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_id, agent_id) DO UPDATE SET
            name = excluded.name,
            status = excluded.status,
            current_task = excluded.current_task,
            active_bead_id = excluded.active_bead_id,
            session_id = excluded.session_id,
            trace_id = excluded.trace_id,
            target_path = excluded.target_path,
            watch_paths_json = excluded.watch_paths_json,
            pid = excluded.pid,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.repo_id,
        record.agent_id,
        record.name,
        record.status,
        record.current_task ?? null,
        record.active_bead_id ?? null,
        record.session_id ?? null,
        record.trace_id ?? null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        stringifyJson(record.watch_paths ?? []),
        record.pid ?? null,
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function getHallAgentPresence(
    agentId: string,
    rootPath: string = registry.getRoot(),
): HallAgentPresenceRecord | null {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = db.prepare(`
        SELECT repo_id, agent_id, name, status, current_task, active_bead_id, session_id,
               trace_id, target_path, watch_paths_json, pid, metadata_json, created_at, updated_at
        FROM hall_agent_presence
        WHERE repo_id = ? AND agent_id = ?
        LIMIT 1
    `).get(repoId, agentId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return mapPresenceRow(row);
}

export function listHallAgentPresence(
    rootPath: string = registry.getRoot(),
    options: {
        statuses?: HallAgentPresenceStatus[];
        beadId?: string;
        sessionId?: string;
        traceId?: string;
    } = {},
): HallAgentPresenceRecord[] {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: unknown[] = [repoId];
    let sql = `
        SELECT repo_id, agent_id, name, status, current_task, active_bead_id, session_id,
               trace_id, target_path, watch_paths_json, pid, metadata_json, created_at, updated_at
        FROM hall_agent_presence
        WHERE repo_id = ?
    `;

    if (options.statuses && options.statuses.length > 0) {
        sql += ` AND status IN (${options.statuses.map(() => '?').join(', ')})`;
        params.push(...options.statuses);
    }
    if (options.beadId) {
        sql += ' AND active_bead_id = ?';
        params.push(options.beadId);
    }
    if (options.sessionId) {
        sql += ' AND session_id = ?';
        params.push(options.sessionId);
    }
    if (options.traceId) {
        sql += ' AND trace_id = ?';
        params.push(options.traceId);
    }

    sql += ' ORDER BY updated_at DESC, agent_id ASC';
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapPresenceRow);
}

export function saveHallCoordinationEvent(
    record: HallCoordinationEventRecord,
    rootPath: string = registry.getRoot(),
): void {
    const db = database.getDb(rootPath);
    db.prepare(`
        INSERT INTO hall_coordination_events (
            event_id, repo_id, thread_id, scope_kind, scope_ref, event_kind, from_agent_id,
            to_agent_id, session_id, trace_id, bead_id, target_path, rationale, summary,
            payload_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
            thread_id = excluded.thread_id,
            scope_kind = excluded.scope_kind,
            scope_ref = excluded.scope_ref,
            event_kind = excluded.event_kind,
            from_agent_id = excluded.from_agent_id,
            to_agent_id = excluded.to_agent_id,
            session_id = excluded.session_id,
            trace_id = excluded.trace_id,
            bead_id = excluded.bead_id,
            target_path = excluded.target_path,
            rationale = excluded.rationale,
            summary = excluded.summary,
            payload_json = excluded.payload_json,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.event_id,
        record.repo_id,
        record.thread_id,
        record.scope_kind,
        record.scope_ref,
        record.event_kind,
        record.from_agent_id,
        record.to_agent_id ?? null,
        record.session_id ?? null,
        record.trace_id ?? null,
        record.bead_id ?? null,
        record.target_path ? normalizeHallPath(record.target_path) : null,
        record.rationale,
        record.summary,
        stringifyJson(record.payload),
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function listHallCoordinationEvents(
    rootPath: string = registry.getRoot(),
    options: {
        threadId?: string;
        scopeKind?: HallCoordinationScopeKind;
        scopeRef?: string;
        eventKinds?: HallCoordinationEventKind[];
        beadId?: string;
        sessionId?: string;
        traceId?: string;
        fromAgentId?: string;
        toAgentId?: string;
        limit?: number;
    } = {},
): HallCoordinationEventRecord[] {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: unknown[] = [repoId];
    let sql = `
        SELECT event_id, repo_id, thread_id, scope_kind, scope_ref, event_kind, from_agent_id,
               to_agent_id, session_id, trace_id, bead_id, target_path, rationale, summary,
               payload_json, metadata_json, created_at, updated_at
        FROM hall_coordination_events
        WHERE repo_id = ?
    `;

    if (options.threadId) {
        sql += ' AND thread_id = ?';
        params.push(options.threadId);
    }
    if (options.scopeKind) {
        sql += ' AND scope_kind = ?';
        params.push(options.scopeKind);
    }
    if (options.scopeRef) {
        sql += ' AND scope_ref = ?';
        params.push(options.scopeRef);
    }
    if (options.eventKinds && options.eventKinds.length > 0) {
        sql += ` AND event_kind IN (${options.eventKinds.map(() => '?').join(', ')})`;
        params.push(...options.eventKinds);
    }
    if (options.beadId) {
        sql += ' AND bead_id = ?';
        params.push(options.beadId);
    }
    if (options.sessionId) {
        sql += ' AND session_id = ?';
        params.push(options.sessionId);
    }
    if (options.traceId) {
        sql += ' AND trace_id = ?';
        params.push(options.traceId);
    }
    if (options.fromAgentId) {
        sql += ' AND from_agent_id = ?';
        params.push(options.fromAgentId);
    }
    if (options.toAgentId) {
        sql += ' AND to_agent_id = ?';
        params.push(options.toAgentId);
    }

    sql += ' ORDER BY created_at DESC, event_id DESC';

    const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : undefined;
    if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
    }

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapCoordinationEventRow);
}
