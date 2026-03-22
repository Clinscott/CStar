import { 
    HallBeadRecord, 
    HallBeadStatus, 
    HallBeadCritiqueRecord, 
    HallEpisodicMemoryRecord, 
    HallValidationRun 
} from '../../../types/hall.ts';
import { database } from './database.js';
import { SovereignBead, materializeSovereignBead } from '../../../types/bead.ts';

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
    const db = database.getDb('.');
    const sql = `
        INSERT INTO hall_beads (
            bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, 
            rationale, contract_refs_json, baseline_scores_json, acceptance_criteria, 
            checker_shell, status, assigned_agent, source_kind, triage_reason, 
            resolution_note, resolved_validation_id, superseded_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bead_id) DO UPDATE SET
            status = excluded.status,
            assigned_agent = excluded.assigned_agent,
            triage_reason = excluded.triage_reason,
            resolution_note = excluded.resolution_note,
            updated_at = excluded.updated_at
    `;
    db.prepare(sql).run(
        record.bead_id,
        record.repo_id,
        record.scan_id,
        record.legacy_id,
        record.target_kind,
        record.target_ref,
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
        record.created_at,
        record.updated_at
    );
}

export function getHallBead(beadId: string): SovereignBead | null {
    const db = database.getDb('.');
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
export function getHallBeads(repoId: string): SovereignBead[] {
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ?').all(repoId) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsByStatus(repoId: string, status: HallBeadStatus): SovereignBead[] {
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND status = ?').all(repoId, status) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsBySource(repoId: string, sourceKind: string): SovereignBead[] {
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND source_kind = ?').all(repoId, sourceKind) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function getHallBeadsByEpic(repoId: string, epicId: string): SovereignBead[] {
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_beads WHERE repo_id = ? AND target_ref = ?').all(repoId, epicId) as any[];
    return rows.map(row => materializeSovereignBead({
        ...row,
        contract_refs: parseJson(row.contract_refs_json, []),
        baseline_scores: parseJson(row.baseline_scores_json, {}),
        critique_payload: parseJson(row.critique_payload_json, {})
    }));
}

export function deleteHallBead(beadId: string): void {
    const db = database.getDb('.');
    db.prepare('DELETE FROM hall_beads WHERE bead_id = ?').run(beadId);
}

export function upsertBeadCritique(record: HallBeadCritiqueRecord): void {
    const db = database.getDb('.');
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
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_bead_critiques WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => ({
        ...row,
        evidence: parseJson(row.evidence_json, []),
        is_architect_approved: row.is_architect_approved === 1
    }));
}

export function getEpisodicMemory(beadId: string): HallEpisodicMemoryRecord[] {
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_episodic_memory WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => ({
        ...row,
        files_touched: parseJson(row.files_touched_json, []),
        successes: parseJson(row.successes_json, []),
        metadata: parseJson(row.metadata_json, {})
    }));
}

export function saveEpisodicMemory(record: HallEpisodicMemoryRecord): void {
    const db = database.getDb('.');
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
    const db = database.getDb('.');
    const rows = db.prepare('SELECT * FROM hall_validation_runs WHERE bead_id = ?').all(beadId) as any[];
    return rows.map(row => ({
        ...row,
        pre_scores: parseJson(row.pre_scores_json, {}),
        post_scores: parseJson(row.post_scores_json, {}),
        benchmark: parseJson(row.benchmark_json, {})
    }));
}

export function saveValidationRun(record: HallValidationRun): void {
    const db = database.getDb('.');
    const sql = `
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, scan_id, bead_id, target_path, verdict, 
            sprt_verdict, pre_scores_json, post_scores_json, benchmark_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.prepare(sql).run(
        record.validation_id,
        record.repo_id,
        record.scan_id,
        record.bead_id,
        record.target_path,
        record.verdict,
        record.sprt_verdict,
        stringifyJson(record.pre_scores),
        stringifyJson(record.post_scores),
        stringifyJson(record.benchmark),
        record.created_at
    );
}
