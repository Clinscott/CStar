import { createHash } from 'node:crypto';

import { parseCanonicalPersona, type CanonicalPersona } from '../../../core/persona_contract.js';
import { database } from './database.js';

export const PERSONA_EFFECTIVE_BOUNDARY = 'next_workflow_boundary' as const;
export const PERSONA_AUTHORITY_EFFECT = 'process_only' as const;
export const PERSONA_STATE_SCHEMA = 'cstar.persona_state.v1' as const;

const PERSONA_STATE_KEY = 'active_persona';
const PERSONA_RECEIPT_SCHEMA = 'cstar.persona_set.receipt.v1';
const PERSONA_STATE_TABLE = 'hall_persona_state';

export interface CanonicalPersonaState {
    active_persona: CanonicalPersona;
    revision: number;
    receipt_id: string;
    effective_boundary: typeof PERSONA_EFFECTIVE_BOUNDARY;
    authority_effect: typeof PERSONA_AUTHORITY_EFFECT;
}

export interface PersonaStateRead {
    active_persona: CanonicalPersona | null;
    status: 'projected' | 'absent' | 'invalid' | 'unavailable';
    revision?: number;
    receipt_id?: string;
}

export interface PersonaStateMutation {
    outcome: 'changed' | 'noop' | 'blocked';
    previous: CanonicalPersona | null;
    current: CanonicalPersona | null;
    receipt_id: string;
    effective_boundary: typeof PERSONA_EFFECTIVE_BOUNDARY;
    authority_effect: typeof PERSONA_AUTHORITY_EFFECT;
}

interface PersonaStateRow {
    state_schema?: unknown;
    state_key?: unknown;
    active_persona?: unknown;
    revision?: unknown;
    receipt_id?: unknown;
    effective_boundary?: unknown;
    authority_effect?: unknown;
    value_sha256?: unknown;
}

function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function personaDigest(persona: CanonicalPersona): string {
    return digest(persona);
}

function isMissingPersonaStateTable(error: unknown): boolean {
    return error instanceof Error
        && error.message.includes(`no such table: ${PERSONA_STATE_TABLE}`);
}

function isReceiptId(value: unknown): value is string {
    return typeof value === 'string' && /^persona-set-[a-f0-9]{64}$/.test(value);
}

function parseStateRow(row: PersonaStateRow): CanonicalPersonaState | null {
    const persona = parseCanonicalPersona(row.active_persona);
    const revision = typeof row.revision === 'number' ? row.revision : Number(row.revision);
    if (row.state_schema !== PERSONA_STATE_SCHEMA
        || row.state_key !== PERSONA_STATE_KEY
        || !persona
        || !Number.isSafeInteger(revision)
        || revision < 1
        || !isReceiptId(row.receipt_id)
        || row.effective_boundary !== PERSONA_EFFECTIVE_BOUNDARY
        || row.authority_effect !== PERSONA_AUTHORITY_EFFECT
        || row.value_sha256 !== personaDigest(persona)) {
        return null;
    }
    return {
        active_persona: persona,
        revision,
        receipt_id: row.receipt_id,
        effective_boundary: PERSONA_EFFECTIVE_BOUNDARY,
        authority_effect: PERSONA_AUTHORITY_EFFECT,
    };
}

function projectedState(state: CanonicalPersonaState): PersonaStateRead {
    return {
        active_persona: state.active_persona,
        status: 'projected',
        revision: state.revision,
        receipt_id: state.receipt_id,
    };
}

export function readCanonicalPersonaState(rootPath: string): PersonaStateRead {
    try {
        const db = database.tryGetReadDb(rootPath);
        if (!db) return { active_persona: null, status: 'absent' };
        const row = db.prepare(`
            SELECT state_schema, state_key, active_persona, revision, receipt_id,
                   effective_boundary, authority_effect, value_sha256
            FROM ${PERSONA_STATE_TABLE}
            WHERE state_key = ?
            LIMIT 1
        `).get(PERSONA_STATE_KEY) as PersonaStateRow | undefined;
        if (!row) return { active_persona: null, status: 'absent' };
        const state = parseStateRow(row);
        return state ? projectedState(state) : { active_persona: null, status: 'invalid' };
    } catch (error) {
        if (isMissingPersonaStateTable(error)) return { active_persona: null, status: 'absent' };
        return { active_persona: null, status: 'unavailable' };
    }
}

export function buildPersonaReceiptId(
    outcome: PersonaStateMutation['outcome'],
    requested: CanonicalPersona,
    previous: CanonicalPersona | null,
    current: CanonicalPersona | null,
    revision: number,
    expectedCurrent?: CanonicalPersona,
): string {
    return `persona-set-${digest({
        schema: PERSONA_RECEIPT_SCHEMA,
        outcome,
        requested,
        previous,
        current,
        revision,
        expected_current: expectedCurrent ?? null,
        effective_boundary: PERSONA_EFFECTIVE_BOUNDARY,
        authority_effect: PERSONA_AUTHORITY_EFFECT,
    })}`;
}

function mutation(
    outcome: PersonaStateMutation['outcome'],
    previous: CanonicalPersona | null,
    current: CanonicalPersona | null,
    receiptId: string,
): PersonaStateMutation {
    return {
        outcome,
        previous,
        current,
        receipt_id: receiptId,
        effective_boundary: PERSONA_EFFECTIVE_BOUNDARY,
        authority_effect: PERSONA_AUTHORITY_EFFECT,
    };
}

function parseMutationPersona(value: unknown, errorCode: string): CanonicalPersona {
    const persona = parseCanonicalPersona(value);
    if (!persona) throw new Error(errorCode);
    return persona;
}

export function setCanonicalPersonaState(
    rootPath: string,
    requestedPersona: unknown,
    expectedCurrentValue?: unknown,
    migrationCurrent: CanonicalPersona | null = null,
): PersonaStateMutation {
    const requested = parseMutationPersona(requestedPersona, 'persona_canonical_value_required');
    const expectedCurrent = expectedCurrentValue === undefined
        ? undefined
        : parseMutationPersona(expectedCurrentValue, 'expected_current_canonical_value_required');
    const db = database.getWritableDb(rootPath);
    const apply = db.transaction(() => {
        const row = db.prepare(`
            SELECT state_schema, state_key, active_persona, revision, receipt_id,
                   effective_boundary, authority_effect, value_sha256
            FROM ${PERSONA_STATE_TABLE}
            WHERE state_key = ?
            LIMIT 1
        `).get(PERSONA_STATE_KEY) as PersonaStateRow | undefined;

        const state = row ? parseStateRow(row) : null;
        if (row && !state) throw new Error('persona_state_invalid');

        const previous = state?.active_persona ?? migrationCurrent;
        const revision = state?.revision ?? 0;
        if (expectedCurrent !== undefined && expectedCurrent !== previous) {
            return mutation(
                'blocked',
                previous,
                previous,
                buildPersonaReceiptId(
                    'blocked', requested, previous, previous, revision, expectedCurrent,
                ),
            );
        }
        if (previous === requested && state) {
            return mutation('noop', previous, previous, state.receipt_id);
        }

        const nextRevision = revision + 1;
        const outcome = previous === requested ? 'noop' : 'changed';
        const receiptId = buildPersonaReceiptId(
            outcome, requested, previous, requested, nextRevision, expectedCurrent,
        );
        if (state) {
            const result = db.prepare(`
                UPDATE ${PERSONA_STATE_TABLE}
                SET active_persona = ?, revision = ?, receipt_id = ?,
                    effective_boundary = ?, authority_effect = ?,
                    value_sha256 = ?, updated_at = ?
                WHERE state_key = ? AND revision = ?
            `).run(
                requested,
                nextRevision,
                receiptId,
                PERSONA_EFFECTIVE_BOUNDARY,
                PERSONA_AUTHORITY_EFFECT,
                personaDigest(requested),
                Date.now(),
                PERSONA_STATE_KEY,
                revision,
            );
            if (result.changes !== 1) throw new Error('persona_state_compare_and_set_failed');
        } else {
            db.prepare(`
                INSERT INTO ${PERSONA_STATE_TABLE} (
                    state_schema, state_key, active_persona, revision, receipt_id,
                    effective_boundary, authority_effect, value_sha256, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                PERSONA_STATE_SCHEMA,
                PERSONA_STATE_KEY,
                requested,
                nextRevision,
                receiptId,
                PERSONA_EFFECTIVE_BOUNDARY,
                PERSONA_AUTHORITY_EFFECT,
                personaDigest(requested),
                Date.now(),
            );
        }
        return mutation(outcome, previous, requested, receiptId);
    });
    return apply.immediate();
}
