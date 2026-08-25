import type Database from 'better-sqlite3';

const MAX_ERROR_CODE_BYTES = 160;
const MAX_TRIAGE_REASON_BYTES = 256;
const MAX_RESOLUTION_NOTE_BYTES = 512;

export interface ForgeTerminalBeadTransition {
    bead_id: string | null;
    status: 'blocked' | 'already_blocked' | 'not_applied' | 'missing';
    changed: boolean;
    current_bead_status?: string;
    triage_reason?: string;
}

function bounded(value: string, maxBytes: number): string {
    return value.slice(0, maxBytes);
}

/**
 * Close the Hall work item behind an ambiguous external attempt without
 * exposing a generic mutation escape hatch. This is deliberately owned by
 * the Forge receipt transition: the request and attempt are the authority
 * binding, while the bead tool continues to refuse autonomous-policy edits.
 */
export function blockForgeOwningBeadForAmbiguity(
    db: Database.Database,
    input: {
        request_id: string;
        attempt_id: string;
        error_code?: string;
        now?: number;
    },
): ForgeTerminalBeadTransition {
    const request = db.prepare(
        'SELECT bead_id FROM hall_forge_requests WHERE request_id = ? LIMIT 1',
    ).get(input.request_id) as { bead_id?: string } | undefined;
    const beadId = typeof request?.bead_id === 'string' ? request.bead_id : null;
    if (!beadId) return { bead_id: null, status: 'missing', changed: false };

    const bead = db.prepare(`
        SELECT status, triage_reason
        FROM hall_beads WHERE bead_id = ? LIMIT 1
    `).get(beadId) as {
        status?: string;
        triage_reason?: string | null;
    } | undefined;
    if (!bead) return { bead_id: beadId, status: 'missing', changed: false };

    const errorCode = bounded(
        typeof input.error_code === 'string' && input.error_code.trim()
            ? input.error_code.trim() : 'forge_attempt_spend_ambiguous',
        MAX_ERROR_CODE_BYTES,
    );
    const triageReason = bounded(
        `forge_external_ambiguity:${errorCode}`,
        MAX_TRIAGE_REASON_BYTES,
    );
    if (bead.status !== 'IN_PROGRESS') {
        return {
            bead_id: beadId,
            status: bead.status === 'BLOCKED' && bead.triage_reason === triageReason
                ? 'already_blocked' : 'not_applied',
            changed: false,
            current_bead_status: bead.status,
            triage_reason: bead.triage_reason ?? undefined,
        };
    }

    const resolutionNote = bounded(
        `Forge request ${input.request_id} attempt ${input.attempt_id} is UNKNOWN/AMBIGUOUS; no retry or promotion is permitted.`,
        MAX_RESOLUTION_NOTE_BYTES,
    );
    const changed = db.prepare(`
        UPDATE hall_beads
        SET status = 'BLOCKED', triage_reason = ?, resolution_note = ?, updated_at = ?
        WHERE bead_id = ? AND status = 'IN_PROGRESS'
    `).run(triageReason, resolutionNote, input.now ?? Date.now(), beadId);
    if (Number(changed.changes) !== 1) {
        const current = db.prepare(
            'SELECT status, triage_reason FROM hall_beads WHERE bead_id = ? LIMIT 1',
        ).get(beadId) as { status?: string; triage_reason?: string | null } | undefined;
        return {
            bead_id: beadId,
            status: current?.status === 'BLOCKED' && current.triage_reason === triageReason
                ? 'already_blocked' : 'not_applied',
            changed: false,
            current_bead_status: current?.status,
            triage_reason: current?.triage_reason ?? undefined,
        };
    }

    return {
        bead_id: beadId,
        status: 'blocked',
        changed: true,
        current_bead_status: 'BLOCKED',
        triage_reason: triageReason,
    };
}
