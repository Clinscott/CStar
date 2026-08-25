import { createHash } from 'node:crypto';

import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
    type CanonicalCodexUserTurn,
} from './codex_request_identity.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
    type FixedCodexSessionRecord,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import { tryGetReadDb } from '../../pennyone/intel/database.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import { isForgeAuthorityRevocation } from './forge_revocation.js';
import { isForgeSetIdentityConsumed } from './forge_set_manifest_consumption.js';

export const FORGE_SET_AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1_000;

export interface VerifiedForgeSetSignal {
    record_sha256: string;
    content: Array<{ type: 'input_text'; text: string }>;
}

export interface PersistedForgeSetAuthorityFields {
    thread_id: string;
    turn_id: string;
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
}

export interface ForgeSetMutationIdentityFields {
    thread_id: string;
    turn_id: string;
    record_set_sha256: string;
}

interface SetRecord extends VerifiedForgeSetSignal {
    text: string;
    timestamp: string;
}

export interface AuguryMissionV2SetBinding {
    schema: 'cstar.augury_mission_binding.v2';
    version: 2;
    scope_id: 'brain:CStar';
    mission_decision_id: string;
    proposed_parent_bead_id: string;
    design_sha256: string;
    target_set_sha256: string;
}

export interface VerifiedForgeNaturalSetTranslation {
    schema: 'cstar.forge_set_manifest_natural_translation.v1';
    instruction: 'do_it';
    normalized_text: 'do it';
    authority_effect: 'deterministic_translation_only';
    scope_id: 'brain:CStar';
    mission_decision_id: string;
    proposed_parent_bead_id: string;
    design_sha256: string;
    target_set_sha256: string;
    thread_id: string;
    turn_id: string;
    turn_record_set_sha256: string;
    turn_record_count: number;
    selected_record_sha256: string;
    selected_record_index: number;
    selected_content: Array<{ type: 'input_text'; text: string }>;
    consumption: {
        mode: 'one_use';
        status: 'unspent';
        key_sha256: string;
    };
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isExactSet(text: string): boolean {
    if (/[^A-Za-z. \t\r\n]/u.test(text)) return false;
    const normalized = text.replace(/[ \t\r\n]+/g, ' ').trim();
    const candidate = normalized.endsWith('.')
        ? normalized.slice(0, -1).trimEnd() : normalized;
    return candidate.toLocaleLowerCase('en-US') === 'set';
}

function normalizedExactDirective(text: string): string {
    if (/[^A-Za-z. \t\r\n]/u.test(text)) return '';
    const normalized = text.replace(/[ \t\r\n]+/g, ' ').trim();
    const candidate = normalized.endsWith('.')
        ? normalized.slice(0, -1).trimEnd() : normalized;
    if (candidate.endsWith('.')) return '';
    return candidate.toLocaleLowerCase('en-US');
}

function isExactCoSDoIt(text: string): boolean {
    return normalizedExactDirective(text) === 'do it';
}

/**
 * Non-operative records are allowed only when they are plainly informational.
 * Authority-shaped prose is never interpreted; it makes the turn ambiguous.
 */
function isAuthorityShapedNaturalSetContext(text: string): boolean {
    if (isForgeSetAuthorityRevocation(text)) return true;
    return /[?"'`“”‘’]/u.test(text)
        || /\b(?:if|maybe|could|would|should|whether|recommend|recommended|discussion|discuss|report|reported|example|mention|mentioned|without|no)\b/iu.test(text)
        || /\b(?:authorize|authorization|approve|approval|allow|permission|permit|execute|implement|build|continue|resume|proceed|dispatch|forge|set|do\s+it)\b/iu.test(text);
}

function assertAuguryMissionV2SetBinding(binding: AuguryMissionV2SetBinding): void {
    const boundedReference = /^(?:decision|bead):[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/u;
    const hash = /^[a-f0-9]{64}$/u;
    if (!isRecord(binding)
        || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify([
            'design_sha256', 'mission_decision_id', 'proposed_parent_bead_id',
            'schema', 'scope_id', 'target_set_sha256', 'version',
        ])
        || binding.schema !== 'cstar.augury_mission_binding.v2'
        || binding.version !== 2
        || binding.scope_id !== 'brain:CStar'
        || typeof binding.mission_decision_id !== 'string'
        || !boundedReference.test(binding.mission_decision_id)
        || typeof binding.proposed_parent_bead_id !== 'string'
        || !boundedReference.test(binding.proposed_parent_bead_id)
        || typeof binding.design_sha256 !== 'string'
        || !hash.test(binding.design_sha256)
        || typeof binding.target_set_sha256 !== 'string'
        || !hash.test(binding.target_set_sha256)) {
        throw new Error('forge_set_manifest_natural_binding_invalid');
    }
}

function mentionsSetInstruction(text: string): boolean {
    return /(?:^|[^\p{L}\p{N}_])set(?:$|[^\p{L}\p{N}_])/iu.test(text);
}

function isForgeSetAuthorityRevocation(text: string): boolean {
    return isForgeAuthorityRevocation(text)
        || /^\s*(?:(?:cancel|revoke|withdraw)(?:\s+(?:it|this|that))?|never\s+mind)[.!]?\s*$/i
            .test(text);
}

function hashCanonicalTurnRecordSet(
    threadId: string,
    turnId: string,
    records: Array<Pick<SetRecord, 'timestamp' | 'record_sha256'>>,
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: threadId,
        turn_id: turnId,
        records: records.map((record, index) => ({
            index,
            timestamp: record.timestamp,
            record_sha256: record.record_sha256,
        })),
    }));
}

function parseSetRecord(record: FixedCodexSessionRecord, turnId: string): SetRecord | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user' || classification.turnId !== turnId) {
        return null;
    }
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    if (!classification.rootLineage || !Array.isArray(payload?.content)
        || payload.content.length === 0 || typeof record.row.timestamp !== 'string') return null;
    const content: SetRecord['content'] = [];
    for (const entry of payload.content) {
        if (!isRecord(entry) || entry.type !== 'input_text' || typeof entry.text !== 'string') {
            return null;
        }
        content.push({ type: 'input_text', text: entry.text });
    }
    return {
        record_sha256: sha256(record.rawLine),
        content,
        text: content.map((entry) => entry.text).join(''),
        timestamp: record.row.timestamp,
    };
}

function assertCompleteOrderedTurn(
    identity: Pick<VerifiedCodexRequestIdentity, 'thread_id' | 'turn_id'>,
    turn: CanonicalCodexUserTurn,
    records: SetRecord[],
): void {
    if (records.length !== turn.recordCount
        || records.some((record, index) => record.record_sha256 !== turn.recordSha256s[index])
        || hashCanonicalTurnRecordSet(identity.thread_id, identity.turn_id, records)
            !== turn.recordSetSha256) {
        throw new Error('forge_set_manifest_operator_signal_uninspectable');
    }
}

function isHistoricalSingleSetPrefix(
    identity: VerifiedCodexRequestIdentity,
    records: SetRecord[],
): boolean {
    const first = records[0];
    if (!first) return false;
    return identity.turn_record_count === 1
        && identity.turn_record_sha256 === first.record_sha256
        && identity.turn_first_timestamp === first.timestamp
        && identity.turn_timestamp === first.timestamp
        && identity.turn_record_set_sha256 === hashCanonicalTurnRecordSet(
            identity.thread_id, identity.turn_id, [first],
        );
}

function assertHistoricalSetTail(records: SetRecord[]): void {
    for (const record of records.slice(1)) {
        if (isForgeSetAuthorityRevocation(record.text)) {
            throw new Error('forge_set_manifest_operator_signal_revoked');
        }
        if (mentionsSetInstruction(record.text)) {
            throw new Error('forge_set_manifest_operator_signal_ambiguous');
        }
    }
}

/** Bind one exact SET snapshot while inspecting the complete current ordered evidence. */
export function readExactForgeSetSignal(
    identity: VerifiedCodexRequestIdentity,
    now = Date.now(),
    allowHistorical = false,
): VerifiedForgeSetSignal | null {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), identity.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        identity.thread_id,
        identity.turn_id,
        now,
        FORGE_SET_AUTHORIZATION_AGE_MS,
        allowHistorical,
    );
    const records: SetRecord[] = [];
    const projection = createCodexPlatformContextProjection((record) => {
        const parsed = parseSetRecord(record, identity.turn_id);
        if (parsed) records.push(parsed);
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind !== 'canonical-root-user'
            || classification.turnId === identity.turn_id) return;
        const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
        const content = Array.isArray(payload?.content) ? payload.content : [];
        if (content.every((entry) => isRecord(entry)
            && entry.type === 'input_text' && typeof entry.text === 'string')) {
            const text = content.map((entry) => (entry as { text: string }).text).join('');
            if (isForgeSetAuthorityRevocation(text)) {
                throw new Error('forge_set_manifest_operator_signal_revoked');
            }
        }
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        projection.consume(record);
    });
    projection.finish();
    const turn = canonical.finish();
    assertCompleteOrderedTurn(identity, turn, records);
    const exactCurrentTurn = turn.recordSha256 === identity.turn_record_sha256
        && turn.recordSetSha256 === identity.turn_record_set_sha256
        && turn.recordCount === identity.turn_record_count
        && turn.firstTimestamp === identity.turn_first_timestamp
        && turn.timestamp === identity.turn_timestamp;
    if (!exactCurrentTurn && (!allowHistorical || !isHistoricalSingleSetPrefix(identity, records))) {
        throw new Error('forge_set_manifest_request_identity_drift');
    }
    const boundRecords = exactCurrentTurn ? records : records.slice(0, 1);
    const matches = boundRecords.filter((record) => isExactSet(record.text));
    if (matches.length === 0) return null;
    if (boundRecords.length !== 1 || matches.length !== 1
        || matches[0]!.record_sha256 !== identity.turn_record_sha256) {
        throw new Error('forge_set_manifest_operator_signal_ambiguous');
    }
    if (!exactCurrentTurn) assertHistoricalSetTail(records);
    return {
        record_sha256: matches[0]!.record_sha256,
        content: matches[0]!.content,
    };
}

/**
 * Translate one exact CoS direct imperative for an already-bound Augury v2
 * mission. This is not a natural-language authority parser: the operative
 * grammar is one full-string directive and the returned record is one-use,
 * state-only evidence for the v2 caller to consume.
 */
export function readExactForgeNaturalSetTranslation(
    identity: VerifiedCodexRequestIdentity,
    binding: AuguryMissionV2SetBinding,
    now = Date.now(),
): VerifiedForgeNaturalSetTranslation | null {
    assertAuguryMissionV2SetBinding(binding);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), identity.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        identity.thread_id,
        identity.turn_id,
        now,
        FORGE_SET_AUTHORIZATION_AGE_MS,
        false,
    );
    const records: SetRecord[] = [];
    const projection = createCodexPlatformContextProjection((record) => {
        const parsed = parseSetRecord(record, identity.turn_id);
        if (parsed) {
            if (isForgeSetAuthorityRevocation(parsed.text)) {
                throw new Error('forge_set_manifest_natural_signal_revoked');
            }
            records.push(parsed);
        }
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind !== 'canonical-root-user'
            || classification.turnId === identity.turn_id) return;
        const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
        const content = Array.isArray(payload?.content) ? payload.content : [];
        if (content.every((entry) => isRecord(entry)
            && entry.type === 'input_text' && typeof entry.text === 'string')) {
            const text = content.map((entry) => (entry as { text: string }).text).join('');
            if (isForgeSetAuthorityRevocation(text)) {
                throw new Error('forge_set_manifest_natural_signal_revoked');
            }
        }
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        projection.consume(record);
    });
    projection.finish();
    const turn = canonical.finish();
    assertCompleteOrderedTurn(identity, turn, records);
    if (turn.recordSha256 !== identity.turn_record_sha256
        || turn.recordSetSha256 !== identity.turn_record_set_sha256
        || turn.recordCount !== identity.turn_record_count
        || turn.firstTimestamp !== identity.turn_first_timestamp
        || turn.timestamp !== identity.turn_timestamp) {
        throw new Error('forge_set_manifest_request_identity_drift');
    }

    const matches = records.filter((record) => isExactCoSDoIt(record.text));
    if (matches.length === 0) return null;
    if (matches.length !== 1 || records.some((record) => (
        record !== matches[0] && isAuthorityShapedNaturalSetContext(record.text)
    ))) {
        throw new Error('forge_set_manifest_natural_signal_ambiguous');
    }
    const selected = matches[0]!;
    const selectedIndex = records.indexOf(selected);
    const db = tryGetReadDb();
    if (db && isForgeSetIdentityConsumed(db, {
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        record_sha256: selected.record_sha256,
        record_set_sha256: identity.turn_record_set_sha256,
    })) {
        throw new Error('forge_set_manifest_natural_signal_consumed');
    }
    const keySha256 = sha256(JSON.stringify({
        schema: 'cstar.forge_set_manifest_natural_translation_consumption.v1',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
        selected_record_sha256: selected.record_sha256,
        mission_decision_id: binding.mission_decision_id,
        proposed_parent_bead_id: binding.proposed_parent_bead_id,
        design_sha256: binding.design_sha256,
        target_set_sha256: binding.target_set_sha256,
    }));
    return {
        schema: 'cstar.forge_set_manifest_natural_translation.v1',
        instruction: 'do_it',
        normalized_text: 'do it',
        authority_effect: 'deterministic_translation_only',
        scope_id: binding.scope_id,
        mission_decision_id: binding.mission_decision_id,
        proposed_parent_bead_id: binding.proposed_parent_bead_id,
        design_sha256: binding.design_sha256,
        target_set_sha256: binding.target_set_sha256,
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
        turn_record_count: identity.turn_record_count,
        selected_record_sha256: selected.record_sha256,
        selected_record_index: selectedIndex,
        selected_content: selected.content,
        consumption: { mode: 'one_use', status: 'unspent', key_sha256: keySha256 },
    };
}

function readHistoricalForgeSetIdentity(
    fields: ForgeSetMutationIdentityFields,
    now = Date.now(),
): VerifiedCodexRequestIdentity {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), fields.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        fields.thread_id,
        fields.turn_id,
        now,
        FORGE_SET_AUTHORIZATION_AGE_MS,
        true,
    );
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, canonical.consume);
    const turn = canonical.finish();
    let recordSha256 = turn.recordSha256;
    let recordSetSha256 = turn.recordSetSha256;
    let recordCount = turn.recordCount;
    let firstTimestamp = turn.firstTimestamp;
    let timestamp = turn.timestamp;
    if (turn.recordSetSha256 !== fields.record_set_sha256) {
        // SET v1 was mintable only from one canonical root record, so its only
        // compatibility-safe historical snapshot is the mechanically derived
        // first-record prefix. Later records remain fully scanned above/below.
        const historicalPrefix = [{
            timestamp: turn.firstTimestamp,
            record_sha256: turn.recordSha256s[0]!,
        }];
        if (hashCanonicalTurnRecordSet(
            fields.thread_id, fields.turn_id, historicalPrefix,
        ) !== fields.record_set_sha256) {
            throw new Error('forge_set_manifest_persisted_record_drift');
        }
        recordSha256 = historicalPrefix[0]!.record_sha256;
        recordSetSha256 = fields.record_set_sha256;
        recordCount = 1;
        firstTimestamp = historicalPrefix[0]!.timestamp;
        timestamp = historicalPrefix[0]!.timestamp;
    }
    if (recordSetSha256 !== fields.record_set_sha256) {
        throw new Error('forge_set_manifest_persisted_record_drift');
    }
    return {
        source: 'codex_request_meta',
        session_id: fields.thread_id,
        thread_id: fields.thread_id,
        turn_id: fields.turn_id,
        thread_source: 'user',
        turn_record_sha256: recordSha256,
        turn_record_set_sha256: recordSetSha256,
        turn_record_count: recordCount,
        turn_first_timestamp: firstTimestamp,
        turn_timestamp: timestamp,
    };
}

export function readForgeSetSignalFromMutationIdentity(
    fields: ForgeSetMutationIdentityFields,
    now = Date.now(),
): { identity: VerifiedCodexRequestIdentity; signal: VerifiedForgeSetSignal } {
    const identity = readHistoricalForgeSetIdentity(fields, now);
    const signal = readExactForgeSetSignal(identity, now, true);
    if (!signal) throw new Error('forge_set_manifest_operator_signal_missing');
    return { identity, signal };
}

export function readPersistedForgeSetSignal(
    fields: PersistedForgeSetAuthorityFields,
    now = Date.now(),
): { identity: VerifiedCodexRequestIdentity; signal: VerifiedForgeSetSignal } {
    const { identity, signal } = readForgeSetSignalFromMutationIdentity(fields, now);
    if (identity.turn_record_sha256 !== fields.record_sha256
        || identity.turn_record_set_sha256 !== fields.record_set_sha256
        || identity.turn_record_count !== fields.record_count) {
        throw new Error('forge_set_manifest_persisted_record_drift');
    }
    return { identity, signal };
}
