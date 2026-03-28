import { 
    HallBeadRecord, 
    HallBeadStatus, 
    HallBeadCritiqueRecord, 
    HallEpisodicMemoryRecord, 
    HallValidationRun 
} from '../../../types/hall.ts';
import { database } from './database.js';
import { SovereignBead, materializeSovereignBead } from  '../../../types/bead.js';
import { registry } from '../pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';

function stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? {});
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function upsertHallBead(record: HallBeadRecord): void {
    const db = database.getDb();
    console.log(`[DEBUG] upsertHallBead: id=${record.bead_id}, status=${record.status}`);
    const sql = `
        INSERT INTO hall_beads (
            bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, 
            rationale, contract_refs_json, baseline_scores_json, acceptance_criteria, 
            checker_shell, status, assigned_agent, source_kind, triage_reason, 
            resolution_note, resolved_validation_id, superseded_by, architect_opinion, critique_payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bead_id) DO UPDATE SET
            target_kind = excluded.target_kind,
            target_ref = excluded.target_ref,
            target_path = excluded.target_path,
            rationale = excluded.rationale,
            contract_refs_json = excluded.contract_refs_json,
            baseline_scores_json = excluded.baseline_scores_json,
            acceptance_criteria = COALESCE(excluded.acceptance_criteria, hall_beads.acceptance_criteria),
            checker_shell = COALESCE(excluded.checker_shell, hall_beads.checker_shell),
            status = excluded.status,
            assigned_agent = excluded.assigned_agent,
            source_kind = excluded.source_kind,
            triage_reason = excluded.triage_reason,
            resolution_note = excluded.resolution_note,
            architect_opinion = excluded.architect_opinion,
            critique_payload_json = excluded.critique_payload_json,
            updated_at = excluded.updated_at
    `;
    try {
        const targetKind = record.target_kind ?? 'FILE';
        const targetRef = record.target_ref ?? record.target_path;
        db.prepare(sql).run(
            record.bead_id,
            record.repo_id,
            record.scan_id,
            record.legacy_id,
            targetKind,
            targetRef,
            record.target_path,
            record.rationale,
            stringifyJson(record.contract_refs),
            stringifyJson(record.baseline_scores),
            record.acceptance_criteria,
            record.checker_shell,
            record.status,
            record.assigned_agent,
            record.source_kind,
            record.triage_reason,
            record.resolution_note,
            record.resolved_validation_id,
            record.superseded_by,
            record.architect_opinion,
            stringifyJson(record.critique_payload),
            record.created_at,
            record.updated_at
        );
        console.log(`[DEBUG] upsertHallBead: SUCCESS for ${record.bead_id}`);
    } catch (err: any) {
        console.error(`[DEBUG] upsertHallBead: FAILURE for ${record.bead_id}: ${err.message}`);
        throw err;
    }
}

export function getHallBead(beadId: string): SovereignBead | null {
    const db = database.getDb();
    const row = db.prepare('SELECT * FROM hall_beads WHERE bead_id = ?').get(beadId) as any;
    if (!row) return null;

    return materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    });
}

export function getBeadCount(rootPath: string): number {
    const db = database.getDb(rootPath);
    const row = db.prepare('SELECT COUNT(*) as count FROM hall_beads').get() as { count: number };
    return row?.count ?? 0;
}

// ... existing HallBead getter stubs or implementations ...
export function getHallBeads(rootOrRepoId: string, statuses?: HallBeadStatus[]): SovereignBead[] {
    const db = database.getDb();
    const repoId = rootOrRepoId.startsWith('repo:')
        ? rootOrRepoId
        : buildHallRepositoryId(normalizeHallPath(rootOrRepoId));
    let rows: any[];
    if (statuses && statuses.length > 0) {
        const placeholders = statuses.map(() => '?').join(', ');
        rows = db.prepare(`SELECT * FROM hall_beads WHERE repo_id = ? AND status IN (${placeholders}) ORDER BY created_at ASC, bead_id ASC`).all(repoId, ...statuses) as any[];
    } else {
        rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? ORDER BY created_at ASC, bead_id ASC').all(repoId) as any[];
    }
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsByStatus(repoId: string, status: HallBeadStatus): SovereignBead[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND status = ? ORDER BY created_at ASC, bead_id ASC').all(repoId, status) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsBySource(repoId: string, sourceKind: string): SovereignBead[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND source_kind = ? ORDER BY created_at ASC, bead_id ASC').all(repoId, sourceKind) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsByEpic(repoId: string, epicId: string): SovereignBead[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND target_ref = ? ORDER BY created_at ASC, bead_id ASC').all(repoId, epicId) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function deleteHallBead(beadId: string): void {
    const db = database.getDb();
    db.prepare('DELETE FROM hall_beads WHERE bead_id = ?').run(beadId);
}

export function upsertBeadCritique(record: HallBeadCritiqueRecord): void {
    const db = database.getDb();
    const sql = `
        INSERT INTO hall_bead_critiques (
            critique_id, bead_id, repo_id, agent_id, agent_expertise, 
            critique, proposed_path, evidence_json, is_architect_approved, 
            architect_feedback, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(critique_id) DO UPDATE SET
            critique = excluded.critique,
            is_architect_approved = excluded.is_architect_approved,
            architect_feedback = excluded.architect_feedback
    `;
    db.prepare(sql).run(
        record.critique_id,
        record.bead_id,
        record.repo_id,
        record.agent_id,
        record.agent_expertise,
        record.critique,
        record.proposed_path,
        stringifyJson(record.evidence),
        record.is_architect_approved ? 1 : 0,
        record.architect_feedback,
        record.created_at
    );
}

export function getBeadCritiques(beadId: string): HallBeadCritiqueRecord[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_bead_critiques WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => ({
        ...row,
        evidence: parseJson(row.evidence_json, []),
        is_architect_approved: row.is_architect_approved === 1
    }));
}

export function getEpisodicMemory(beadId: string): HallEpisodicMemoryRecord[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_episodic_memory WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => ({
        ...row,
        files_touched: parseJson(row.files_touched_json, []),
        successes: parseJson(row.successes_json, []),
        metadata: parseJson(row.metadata_json, {})
    }));
}

export function getEpisodicMemoryById(memoryId: string): HallEpisodicMemoryRecord | null {
    const db = database.getDb();
    const row = db.prepare('SELECT * FROM hall_episodic_memory WHERE memory_id = ?').get(memoryId) as any;
    if (!row) return null;
    return {
        ...row,
        files_touched: parseJson(row.files_touched_json, []),
        successes: parseJson(row.successes_json, []),
        metadata: parseJson(row.metadata_json, {})
    };
}

export function saveEpisodicMemory(record: HallEpisodicMemoryRecord): void {
    const db = database.getDb();
    const sql = `
        INSERT INTO hall_episodic_memory (
            memory_id, bead_id, repo_id, tactical_summary, files_touched_json, 
            successes_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
            tactical_summary = excluded.tactical_summary,
            updated_at = excluded.updated_at
    `;
    db.prepare(sql).run(
        record.memory_id,
        record.bead_id,
        record.repo_id,
        record.tactical_summary,
        stringifyJson(record.files_touched),
        stringifyJson(record.successes),
        stringifyJson(record.metadata),
        record.created_at,
        record.updated_at
    );
}

export function getValidationRuns(beadId: string): HallValidationRun[] {
    const db = database.getDb();
    const rows = db.prepare('SELECT * FROM hall_validation_runs WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => {
        const preScores = parseJson(row.pre_scores_json, {} as Record<string, number>);
        const postScores = parseJson(row.post_scores_json, {} as Record<string, number>);
        return {
            ...row,
            pre_scores: preScores,
            post_scores: postScores,
            benchmark: parseJson(row.benchmark_json, {}),
            // Legacy aliases
            mission_id: row.validation_id,
            file_path: row.target_path,
            status: row.verdict,
            timestamp: row.created_at,
            initial_score: preScores.overall ?? (Object.values(preScores)[0] as number | undefined),
            final_score: postScores.overall ?? (Object.values(postScores)[0] as number | undefined),
            justification: row.notes
        } as any;
    });
}

export function getTracesForFile(filePath: string): HallValidationRun[] {
    const db = database.getDb();
    const normalizedPath = normalizeHallPath(filePath);
    const rows = db.prepare('SELECT * FROM hall_validation_runs WHERE target_path LIKE ?').all(`%${normalizedPath}%`) as any[];
    return rows.map(row => {
        const preScores = parseJson(row.pre_scores_json, {} as Record<string, number>);
        const postScores = parseJson(row.post_scores_json, {} as Record<string, number>);
        return {
            ...row,
            pre_scores: preScores,
            post_scores: postScores,
            benchmark: parseJson(row.benchmark_json, {}),
            // Legacy aliases
            mission_id: row.validation_id,
            file_path: row.target_path,
            status: row.verdict,
            timestamp: row.created_at,
            initial_score: preScores.overall ?? (Object.values(preScores)[0] as number | undefined),
            final_score: postScores.overall ?? (Object.values(postScores)[0] as number | undefined),
            justification: row.notes
        } as any;
    });
}

export function saveValidationRun(record: HallValidationRun): void {
    const db = database.getDb();
    const sql = `
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, scan_id, bead_id, target_path, verdict, 
            sprt_verdict, pre_scores_json, post_scores_json, benchmark_json, notes, created_at, legacy_trace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(validation_id) DO UPDATE SET
            verdict = excluded.verdict,
            sprt_verdict = excluded.sprt_verdict,
            notes = excluded.notes,
            post_scores_json = excluded.post_scores_json
    `;
    db.prepare(sql).run(
        record.validation_id,
        record.repo_id,
        record.scan_id ?? null,
        record.bead_id ?? null,
        record.target_path ?? null,
        record.verdict,
        record.sprt_verdict ?? null,
        stringifyJson(record.pre_scores),
        stringifyJson(record.post_scores),
        stringifyJson(record.benchmark),
        record.notes ?? null,
        record.created_at,
        record.legacy_trace_id ?? null
    );
}

export function saveTrace(legacyRecord: any): void {
    const repoId = buildHallRepositoryId(normalizeHallPath(registry.getRoot()));
    const record: HallValidationRun = {
        validation_id: legacyRecord.validation_id ?? legacyRecord.mission_id ?? `trace-${Date.now()}`,
        repo_id: legacyRecord.repo_id ?? repoId,
        scan_id: legacyRecord.scan_id,
        bead_id: legacyRecord.bead_id,
        target_path: normalizeHallPath(legacyRecord.target_path ?? legacyRecord.file_path),
        verdict: legacyRecord.verdict ?? legacyRecord.status ?? 'INCONCLUSIVE',
        sprt_verdict: legacyRecord.sprt_verdict ?? 'legacy_trace',
        pre_scores: legacyRecord.pre_scores ?? { overall: legacyRecord.initial_score ?? 0 },
        post_scores: legacyRecord.post_scores ?? { overall: legacyRecord.final_score ?? 0 },
        benchmark: legacyRecord.benchmark ?? { target_metric: legacyRecord.target_metric ?? 'UNKNOWN' },
        notes: legacyRecord.notes ?? legacyRecord.justification,
        created_at: legacyRecord.created_at ?? legacyRecord.timestamp ?? Date.now(),
        legacy_trace_id: legacyRecord.legacy_trace_id
    };
    saveValidationRun(record);
}
