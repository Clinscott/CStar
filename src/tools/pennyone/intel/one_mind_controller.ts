import { database } from './database.js';
import { parseJson, stringifyJson } from './schema.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import {
    HallOneMindBranchDigest,
    HallOneMindBranchRecord,
    HallOneMindBrokerRecord,
    HallOneMindRequestRecord,
    HallOneMindRequestStatus,
} from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';

export function saveHallOneMindBroker(
    record: HallOneMindBrokerRecord,
    rootPath: string = registry.getRoot(),
): void {
    const db = database.getDb(rootPath);
    db.prepare(`
        INSERT INTO hall_one_mind_broker (
            repo_id, status, binding_state, fulfillment_ready, provider, session_id,
            control_plane, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_id) DO UPDATE SET
            status = excluded.status,
            binding_state = excluded.binding_state,
            fulfillment_ready = excluded.fulfillment_ready,
            provider = excluded.provider,
            session_id = excluded.session_id,
            control_plane = excluded.control_plane,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.repo_id,
        record.status,
        record.binding_state,
        record.fulfillment_ready ? 1 : 0,
        record.provider ?? null,
        record.session_id ?? null,
        record.control_plane,
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function getHallOneMindBroker(rootPath: string = registry.getRoot()): HallOneMindBrokerRecord | null {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const row = db.prepare(`
        SELECT repo_id, status, binding_state, fulfillment_ready, provider, session_id,
               control_plane, metadata_json, created_at, updated_at
        FROM hall_one_mind_broker
        WHERE repo_id = ?
        LIMIT 1
    `).get(repoId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        repo_id: String(row.repo_id),
        status: row.status as HallOneMindBrokerRecord['status'],
        binding_state: row.binding_state as HallOneMindBrokerRecord['binding_state'],
        fulfillment_ready: Number(row.fulfillment_ready ?? 0) === 1,
        provider: row.provider ? String(row.provider) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        control_plane: String(row.control_plane),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function getHallOneMindRequest(
    requestId: string,
    rootPath: string = registry.getRoot(),
): HallOneMindRequestRecord | null {
    const db = database.getDb(rootPath);
    const row = db.prepare(`
        SELECT request_id, repo_id, caller_source, boundary, request_status, transport_preference,
               prompt, system_prompt, response_text, error_text, lease_owner, claimed_at,
               completed_at, metadata_json, created_at, updated_at
        FROM hall_one_mind_requests
        WHERE request_id = ?
        LIMIT 1
    `).get(requestId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        request_id: String(row.request_id),
        repo_id: String(row.repo_id),
        caller_source: String(row.caller_source),
        boundary: row.boundary as HallOneMindRequestRecord['boundary'],
        request_status: row.request_status as HallOneMindRequestStatus,
        transport_preference: row.transport_preference as HallOneMindRequestRecord['transport_preference'],
        prompt: String(row.prompt),
        system_prompt: row.system_prompt ? String(row.system_prompt) : undefined,
        response_text: row.response_text ? String(row.response_text) : undefined,
        error_text: row.error_text ? String(row.error_text) : undefined,
        lease_owner: row.lease_owner ? String(row.lease_owner) : undefined,
        claimed_at: row.claimed_at ? Number(row.claimed_at) : undefined,
        completed_at: row.completed_at ? Number(row.completed_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    };
}

export function saveHallOneMindRequest(
    record: HallOneMindRequestRecord,
    rootPath: string = registry.getRoot(),
): void {
    const db = database.getDb(rootPath);
    db.prepare(`
        INSERT INTO hall_one_mind_requests (
            request_id, repo_id, caller_source, boundary, request_status, transport_preference,
            prompt, system_prompt, response_text, error_text, lease_owner, claimed_at,
            completed_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
            request_status = excluded.request_status,
            transport_preference = excluded.transport_preference,
            response_text = excluded.response_text,
            error_text = excluded.error_text,
            lease_owner = excluded.lease_owner,
            claimed_at = excluded.claimed_at,
            completed_at = excluded.completed_at,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.request_id,
        record.repo_id,
        record.caller_source,
        record.boundary,
        record.request_status,
        record.transport_preference ?? null,
        record.prompt,
        record.system_prompt ?? null,
        record.response_text ?? null,
        record.error_text ?? null,
        record.lease_owner ?? null,
        record.claimed_at ?? null,
        record.completed_at ?? null,
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function saveHallOneMindBranch(
    record: HallOneMindBranchRecord,
    rootPath: string = registry.getRoot(),
): void {
    const db = database.getDb(rootPath);
    db.prepare(`
        INSERT INTO hall_one_mind_branches (
            branch_id, repo_id, source_weave, branch_group_id, branch_kind, branch_label, branch_index,
            status, provider, session_id, trace_id, parent_request_id, summary, error_text,
            artifacts_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(branch_id) DO UPDATE SET
            status = excluded.status,
            provider = excluded.provider,
            session_id = excluded.session_id,
            trace_id = excluded.trace_id,
            parent_request_id = excluded.parent_request_id,
            summary = excluded.summary,
            error_text = excluded.error_text,
            artifacts_json = excluded.artifacts_json,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `).run(
        record.branch_id,
        record.repo_id,
        record.source_weave,
        record.branch_group_id,
        record.branch_kind,
        record.branch_label,
        record.branch_index,
        record.status,
        record.provider ?? null,
        record.session_id ?? null,
        record.trace_id ?? null,
        record.parent_request_id ?? null,
        record.summary ?? null,
        record.error_text ?? null,
        stringifyJson(record.artifacts),
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at,
    );
}

export function listHallOneMindBranches(
    rootPath: string = registry.getRoot(),
    options: {
        branchGroupId?: string;
        sessionId?: string;
        traceId?: string;
    } = {},
): HallOneMindBranchRecord[] {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: unknown[] = [repoId];
    let sql = `
        SELECT branch_id, repo_id, source_weave, branch_group_id, branch_kind, branch_label, branch_index,
               status, provider, session_id, trace_id, parent_request_id, summary, error_text,
               artifacts_json, metadata_json, created_at, updated_at
        FROM hall_one_mind_branches
        WHERE repo_id = ?
    `;

    if (options.branchGroupId) {
        sql += ' AND branch_group_id = ?';
        params.push(options.branchGroupId);
    }
    if (options.sessionId) {
        sql += ' AND session_id = ?';
        params.push(options.sessionId);
    }
    if (options.traceId) {
        sql += ' AND trace_id = ?';
        params.push(options.traceId);
    }

    sql += ' ORDER BY branch_group_id ASC, branch_index ASC, created_at ASC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        branch_id: String(row.branch_id),
        repo_id: String(row.repo_id),
        source_weave: String(row.source_weave),
        branch_group_id: String(row.branch_group_id),
        branch_kind: row.branch_kind as HallOneMindBranchRecord['branch_kind'],
        branch_label: String(row.branch_label),
        branch_index: Number(row.branch_index ?? 0),
        status: row.status as HallOneMindBranchRecord['status'],
        provider: row.provider ? String(row.provider) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        trace_id: row.trace_id ? String(row.trace_id) : undefined,
        parent_request_id: row.parent_request_id ? String(row.parent_request_id) : undefined,
        summary: row.summary ? String(row.summary) : undefined,
        error_text: row.error_text ? String(row.error_text) : undefined,
        artifacts: parseJson<string[]>(row.artifacts_json as string | null, []),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}

function compactBranchDigestText(value: string | undefined, limit: number = 240): string {
    if (!value) return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

export function summarizeHallOneMindBranches(
    rootPath: string = registry.getRoot(),
    options: {
        branchGroupId?: string;
        sessionId?: string;
        traceId?: string;
        maxArtifacts?: number;
        maxGroups?: number;
        maxSummaryLength?: number;
    } = {},
): HallOneMindBranchDigest | null {
    const branches = listHallOneMindBranches(rootPath, options);
    if (branches.length === 0) {
        return null;
    }

    const maxArtifacts = Math.max(1, options.maxArtifacts ?? 8);
    const maxGroups = Math.max(1, options.maxGroups ?? 6);
    const maxSummaryLength = Math.max(80, options.maxSummaryLength ?? 240);
    const branchKinds = Array.from(new Set(branches.map((branch) => branch.branch_kind)));
    const allArtifacts = Array.from(new Set(
        branches.flatMap((branch) => Array.isArray(branch.artifacts) ? branch.artifacts : []).map((artifact) => artifact.trim()).filter(Boolean),
    )).slice(0, maxArtifacts);

    const groups = Array.from(
        branches.reduce((map, branch) => {
            const existing = map.get(branch.branch_group_id) ?? [];
            existing.push(branch);
            map.set(branch.branch_group_id, existing);
            return map;
        }, new Map<string, HallOneMindBranchRecord[]>()),
    )
        .slice(0, maxGroups)
        .map(([branchGroupId, groupBranches]) => {
            const head = groupBranches[0];
            const branchLabels = Array.from(new Set(groupBranches.map((branch) => branch.branch_label.trim()).filter(Boolean)));
            const summary = compactBranchDigestText(
                groupBranches
                    .map((branch) => branch.summary?.trim() ?? '')
                    .filter(Boolean)
                    .join(' '),
                maxSummaryLength,
            );
            const artifacts = Array.from(new Set(
                groupBranches.flatMap((branch) => Array.isArray(branch.artifacts) ? branch.artifacts : []).map((artifact) => artifact.trim()).filter(Boolean),
            )).slice(0, maxArtifacts);
            const evidenceSources = Array.from(new Set(
                groupBranches
                    .map((branch) => typeof branch.metadata?.evidence_source === 'string' ? branch.metadata.evidence_source.trim() : '')
                    .filter(Boolean),
            ));
            const proposedPaths = Array.from(new Set(
                groupBranches
                    .map((branch) => typeof branch.metadata?.proposed_path === 'string' ? branch.metadata.proposed_path.trim() : '')
                    .filter(Boolean),
            ));

            return {
                branch_group_id: branchGroupId,
                source_weave: head.source_weave,
                branch_kind: head.branch_kind,
                provider: head.provider,
                branch_count: groupBranches.length,
                branch_labels: branchLabels,
                summary,
                artifacts,
                needs_revision: groupBranches.some((branch) => branch.metadata?.needs_revision === true),
                evidence_sources: evidenceSources,
                proposed_paths: proposedPaths,
            };
        });

    return {
        trace_id: options.traceId ?? branches.find((branch) => typeof branch.trace_id === 'string' && branch.trace_id.trim())?.trace_id,
        session_id: options.sessionId ?? branches.find((branch) => typeof branch.session_id === 'string' && branch.session_id.trim())?.session_id,
        total_branches: branches.length,
        group_count: groups.length,
        branch_kinds: branchKinds,
        artifacts: allArtifacts,
        groups,
    };
}

export function claimNextHallOneMindRequest(
    rootPath: string = registry.getRoot(),
    leaseOwner: string,
    statuses: HallOneMindRequestStatus[] = ['PENDING'],
): HallOneMindRequestRecord | null {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const now = Date.now();
    const findSql = `
        SELECT request_id
        FROM hall_one_mind_requests
        WHERE repo_id = ?
          AND boundary = 'primary'
          AND request_status IN (${statuses.map(() => '?').join(', ')})
        ORDER BY created_at ASC
        LIMIT 1
    `;

    const claim = db.transaction(() => {
        const row = db.prepare(findSql).get(repoId, ...statuses) as { request_id?: string } | undefined;
        if (!row?.request_id) {
            return null;
        }

        const result = db.prepare(`
            UPDATE hall_one_mind_requests
            SET request_status = 'CLAIMED',
                lease_owner = ?,
                claimed_at = ?,
                updated_at = ?
            WHERE request_id = ?
              AND request_status IN (${statuses.map(() => '?').join(', ')})
        `).run(leaseOwner, now, now, row.request_id, ...statuses);

        if (Number(result.changes ?? 0) === 0) {
            return null;
        }

        return String(row.request_id);
    });

    const requestId = claim();
    if (!requestId) {
        return null;
    }

    return getHallOneMindRequest(requestId, rootPath);
}

export function claimHallOneMindRequest(
    requestId: string,
    rootPath: string = registry.getRoot(),
    leaseOwner: string,
    statuses: HallOneMindRequestStatus[] = ['PENDING'],
): HallOneMindRequestRecord | null {
    const db = database.getDb(rootPath);
    const now = Date.now();
    const result = db.prepare(`
        UPDATE hall_one_mind_requests
        SET request_status = 'CLAIMED',
            lease_owner = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE request_id = ?
          AND boundary = 'primary'
          AND request_status IN (${statuses.map(() => '?').join(', ')})
    `).run(leaseOwner, now, now, requestId, ...statuses);

    if (Number(result.changes ?? 0) === 0) {
        return null;
    }

    return getHallOneMindRequest(requestId, rootPath);
}

export function listHallOneMindRequests(
    rootPath: string = registry.getRoot(),
    statuses?: HallOneMindRequestStatus[],
): HallOneMindRequestRecord[] {
    const db = database.getDb(rootPath);
    const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
    const params: unknown[] = [repoId];
    let sql = `
        SELECT request_id, repo_id, caller_source, boundary, request_status, transport_preference,
               prompt, system_prompt, response_text, error_text, lease_owner, claimed_at,
               completed_at, metadata_json, created_at, updated_at
        FROM hall_one_mind_requests
        WHERE repo_id = ?
    `;

    if (statuses && statuses.length > 0) {
        sql += ` AND request_status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        request_id: String(row.request_id),
        repo_id: String(row.repo_id),
        caller_source: String(row.caller_source),
        boundary: row.boundary as HallOneMindRequestRecord['boundary'],
        request_status: row.request_status as HallOneMindRequestStatus,
        transport_preference: row.transport_preference as HallOneMindRequestRecord['transport_preference'],
        prompt: String(row.prompt),
        system_prompt: row.system_prompt ? String(row.system_prompt) : undefined,
        response_text: row.response_text ? String(row.response_text) : undefined,
        error_text: row.error_text ? String(row.error_text) : undefined,
        lease_owner: row.lease_owner ? String(row.lease_owner) : undefined,
        claimed_at: row.claimed_at ? Number(row.claimed_at) : undefined,
        completed_at: row.completed_at ? Number(row.completed_at) : undefined,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null, {}),
        created_at: Number(row.created_at ?? 0),
        updated_at: Number(row.updated_at ?? 0),
    }));
}
