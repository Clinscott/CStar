import type { HallBeadRecord, HallBeadStatus, HallBeadTargetKind, HallContextMetadata } from  './hall.js';

export interface SovereignBead {
    id: string;
    repo_id: string;
    scan_id: string;
    target_kind: HallBeadTargetKind;
    target_ref?: string;
    target_path?: string;
    rationale: string;
    contract_refs: string[];
    baseline_scores: Record<string, unknown>;
    acceptance_criteria?: string;
    checker_shell?: string;
    status: HallBeadStatus;
    assigned_agent?: string;
    source_kind?: string;
    triage_reason?: string;
    resolution_note?: string;
    resolved_validation_id?: string;
    superseded_by?: string;
    architect_opinion?: string;
    critique_payload?: Record<string, unknown>;
    metadata?: HallContextMetadata;
    created_at: number;
    updated_at: number;
}

export function materializeSovereignBead(record: HallBeadRecord): SovereignBead {
    return {
        id: record.bead_id,
        repo_id: record.repo_id,
        scan_id: record.scan_id ?? '',
        target_kind: record.target_kind ?? (record.target_path ? 'FILE' : 'OTHER'),
        target_ref: record.target_ref ?? record.target_path,
        target_path: record.target_path,
        rationale: record.rationale,
        contract_refs: Array.isArray(record.contract_refs) ? [...record.contract_refs] : [],
        baseline_scores: { ...(record.baseline_scores ?? {}) },
        acceptance_criteria: record.acceptance_criteria,
        checker_shell: record.checker_shell,
        status: record.status,
        assigned_agent: record.assigned_agent,
        source_kind: record.source_kind,
        triage_reason: record.triage_reason,
        resolution_note: record.resolution_note,
        resolved_validation_id: record.resolved_validation_id,
        superseded_by: record.superseded_by,
        architect_opinion: record.architect_opinion,
        critique_payload: record.critique_payload ? { ...record.critique_payload } : undefined,
        metadata: record.metadata ? { ...record.metadata } : undefined,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

export function getSovereignBeadOverallScore(bead: Pick<SovereignBead, 'baseline_scores'>): number {
    const baseline = bead.baseline_scores ?? {};
    const value = baseline.overall ?? baseline.scan_baseline ?? baseline.repository_baseline ?? 0;
    const score = Number(value);
    return Number.isFinite(score) ? score : 0;
}

export interface ParsedBeadId {
    sessionId: string;
    fragment: string;
}

export function validateBeadId(id: string): boolean {
    const pattern = /^bead:[^:]+:[^:]+$/;
    return pattern.test(id);
}

export function parseBeadId(id: string): ParsedBeadId | null {
    if (!id || !id.startsWith('bead:')) {
        return null;
    }

    const parts = id.split(':');
    if (parts.length < 3) {
        return null;
    }

    if ((parts[1] === 'chant-session' || parts[1] === 'evolve') && parts.length >= 4) {
        return {
            sessionId: `${parts[1]}:${parts[2]}`,
            fragment: parts.slice(3).join(':'),
        };
    }

    if (parts[1] === 'chant-session' || parts[1] === 'evolve') {
        return null;
    }

    return {
        sessionId: parts[1],
        fragment: parts.slice(2).join(':'),
    };
}
