import { createHash } from 'node:crypto';

import type {
    AutomaticMissionConstraints,
    AutomaticMissionDesign,
    AutomaticMissionIdentifiers,
    AutomaticMissionInput,
    AutomaticMissionCompatibilityProfile,
    CanonicalAutomaticMissionConstraints,
    CanonicalAutomaticMissionDesign,
    CanonicalAutomaticMissionRequest,
    RootUserInstructionInput,
    RootUserInstructionRecord,
} from '../../../types/automatic_mission.js';
import {
    AUTOMATIC_MISSION_LEGACY_SINGLETON_SCHEMA,
    AUTOMATIC_MISSION_ROOT_RECORD_SCHEMA,
    AUTOMATIC_MISSION_SCHEMA,
} from '../../../types/automatic_mission.js';

export const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const DEFAULT_THREAD = 'cstar:unbound-root-thread';
const DEFAULT_TURN = 'cstar:unbound-root-turn';
const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (isRecord(value)) {
        return Object.fromEntries(Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function stableAutomaticMissionJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

export const stableJson = stableAutomaticMissionJson;

function boundedText(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim() || CONTROL_TEXT.test(value)) {
        throw new Error(`automatic_mission_${name}_invalid`);
    }
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length > 16_384) throw new Error(`automatic_mission_${name}_too_large`);
    return normalized;
}

/** Validate a root record without rewriting bytes that compatibility hashes cover. */
function rootRecordText(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim() || CONTROL_TEXT.test(value)) {
        throw new Error(`automatic_mission_${name}_invalid`);
    }
    if (value.length > 16_384) throw new Error(`automatic_mission_${name}_too_large`);
    return value;
}

function optionalText(value: unknown, name: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    return boundedText(value, name);
}

function boundedReference(value: unknown, name: string): string {
    const text = boundedText(value, name);
    if (text.length > 512) throw new Error(`automatic_mission_${name}_too_large`);
    return text;
}

function stringArray(value: unknown, name: string): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error(`automatic_mission_${name}_invalid`);
    return [...new Set(value.map((item) => boundedReference(item, name)))].sort();
}

function finiteCeiling(value: unknown, name: string): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > Number.MAX_SAFE_INTEGER) {
        throw new Error(`automatic_mission_${name}_invalid`);
    }
    return Number(value);
}

function firstNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null) {
            return finiteCeiling(source[key], key);
        }
    }
    return null;
}

function metadataObject(value: unknown, name: string): Record<string, unknown> | null {
    if (value === undefined || value === null) return null;
    if (!isRecord(value)) throw new Error(`automatic_mission_${name}_invalid`);
    return value;
}

function normalizeAdapter(value: unknown): CanonicalAutomaticMissionDesign['adapter'] {
    const source = metadataObject(value, 'adapter');
    if (!source) return null;
    return {
        adapter_ref: boundedReference(source.adapter_ref, 'adapter_ref'),
        ...(source.capability !== undefined
            ? { capability: boundedReference(source.capability, 'adapter_capability') }
            : {}),
        ...(source.provider !== undefined
            ? { provider: boundedReference(source.provider, 'adapter_provider') }
            : {}),
        ...(source.requested_model !== undefined
            ? { requested_model: boundedReference(source.requested_model, 'requested_model') }
            : {}),
    };
}

function normalizeCallback(value: unknown): CanonicalAutomaticMissionDesign['callback'] {
    const source = metadataObject(value, 'callback');
    if (!source) return null;
    return {
        ...(source.callback_thread_id !== undefined
            ? { callback_thread_id: boundedReference(source.callback_thread_id, 'callback_thread_id') }
            : {}),
        ...(source.expected_packet !== undefined
            ? { expected_packet: boundedReference(source.expected_packet, 'expected_packet') }
            : {}),
        ...(source.callback_required !== undefined
            ? { callback_required: Boolean(source.callback_required) }
            : {}),
    };
}

function normalizeValidator(value: unknown): CanonicalAutomaticMissionDesign['validator'] {
    const source = metadataObject(value, 'validator');
    if (!source) return null;
    return {
        ...(source.validator_id !== undefined
            ? { validator_id: boundedReference(source.validator_id, 'validator_id') }
            : {}),
        ...(source.ticket_ref !== undefined
            ? { ticket_ref: boundedReference(source.ticket_ref, 'ticket_ref') }
            : {}),
        ...(source.evidence_root !== undefined
            ? { evidence_root: boundedReference(source.evidence_root, 'evidence_root') }
            : {}),
    };
}

export function normalizeAutomaticMissionConstraints(
    value: AutomaticMissionConstraints | null | undefined,
): CanonicalAutomaticMissionConstraints {
    const source = (value ?? {}) as Record<string, unknown>;
    return {
        retry_ceiling: firstNumber(source, 'retry_ceiling', 'max_retries', 'retry_limit'),
        attempt_ceiling: firstNumber(source, 'attempt_ceiling', 'max_attempts', 'attempt_limit'),
        spend_ceiling: firstNumber(source, 'spend_ceiling', 'max_spend', 'spend_limit'),
        expires_at: firstNumber(source, 'expires_at', 'expiry_at'),
    };
}

export function normalizeAutomaticMissionDesign(
    value: AutomaticMissionDesign | string | null | undefined,
    _constraints?: AutomaticMissionConstraints | null,
): CanonicalAutomaticMissionDesign | null {
    if (value === undefined || value === null) return null;
    const source = typeof value === 'string' ? { description: value } : value as Record<string, unknown>;
    return {
        description: optionalText(source.description, 'design_description'),
        root_task: optionalText(source.root_task ?? source.rootTask, 'root_task'),
        targets: stringArray(source.targets ?? source.target_paths, 'targets'),
        outputs: stringArray(source.outputs ?? source.required_output_paths, 'outputs'),
        prohibitions: stringArray(
            source.prohibitions ?? source.prohibited_actions,
            'prohibitions',
        ),
        retry_ceiling: firstNumber(source, 'retry_ceiling', 'max_retries', 'retry_limit'),
        attempt_ceiling: firstNumber(source, 'attempt_ceiling', 'max_attempts', 'attempt_limit'),
        spend_ceiling: firstNumber(source, 'spend_ceiling', 'max_spend', 'spend_limit'),
        expires_at: firstNumber(source, 'expires_at', 'expiry_at'),
        adapter: normalizeAdapter(source.adapter),
        callback: normalizeCallback(source.callback),
        validator: normalizeValidator(source.validator),
    };
}

function inputRecord(value: RootUserInstructionInput): Record<string, unknown> {
    if (typeof value === 'string') return { text: value };
    return value as Record<string, unknown>;
}

function contentFor(source: Record<string, unknown>, text: string): Array<{ type: 'input_text'; text: string }> {
    const raw = source.content;
    if (raw === undefined) return [{ type: 'input_text', text }];
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) {
        throw new Error('automatic_mission_root_record_content_invalid');
    }
    return raw.map((entry) => {
        if (!isRecord(entry) || entry.type !== 'input_text') {
            throw new Error('automatic_mission_root_record_content_invalid');
        }
        return { type: 'input_text', text: rootRecordText(entry.text, 'root_record_text') };
    });
}

export function legacySingletonV1RecordSetSha256(input: {
    thread_id: string;
    turn_id: string;
    timestamp: string;
    record_sha256: string;
}): string {
    if (!SHA256.test(input.record_sha256)) throw new Error('automatic_mission_legacy_record_hash_invalid');
    return sha256(JSON.stringify({
        schema: AUTOMATIC_MISSION_LEGACY_SINGLETON_SCHEMA,
        thread_id: input.thread_id,
        turn_id: input.turn_id,
        records: [{ index: 0, timestamp: input.timestamp, record_sha256: input.record_sha256 }],
    }));
}

export const hashLegacySingletonRecordSetV1 = legacySingletonV1RecordSetSha256;
export const singletonRecordSetSha256 = legacySingletonV1RecordSetSha256;

export function legacySingletonV1MessageBytes(record: Pick<RootUserInstructionRecord,
    'thread_id' | 'turn_id' | 'record_sha256' | 'text' | 'content'>): string {
    return JSON.stringify({
        schema: 'cstar.forge_operator_intent_message.v1',
        thread_id: record.thread_id,
        turn_id: record.turn_id,
        records: [{
            index: 0,
            record_sha256: record.record_sha256,
            content: record.content ?? [{ type: 'input_text', text: record.text }],
        }],
    });
}

export function hashLegacySingletonV1Message(
    record: Pick<RootUserInstructionRecord, 'thread_id' | 'turn_id' | 'record_sha256' | 'text' | 'content'>,
): string {
    return sha256(legacySingletonV1MessageBytes(record));
}

export function canonicalizeRootUserInstructionRecords(
    values: RootUserInstructionInput[] | undefined,
    compatibilityProfile: AutomaticMissionCompatibilityProfile = 'cstar_mission_v1',
): RootUserInstructionRecord[] {
    const records: RootUserInstructionRecord[] = (values ?? []).map((value, index) => {
        const source = inputRecord(value);
        const text = rootRecordText(source.text, 'root_record_text');
        const content = contentFor(source, text);
        const threadId = boundedReference(source.thread_id ?? DEFAULT_THREAD, 'root_thread_id');
        const turnId = boundedReference(source.turn_id ?? DEFAULT_TURN, 'root_turn_id');
        const timestamp = boundedReference(source.timestamp ?? DEFAULT_TIMESTAMP, 'root_timestamp');
        const messageSha256 = typeof source.message_sha256 === 'string'
            ? source.message_sha256
            : sha256(text);
        if (!SHA256.test(messageSha256)) throw new Error('automatic_mission_root_message_hash_invalid');
        const rawLine = typeof source.raw_line === 'string' ? source.raw_line : undefined;
        const recordSha256 = typeof source.record_sha256 === 'string'
            ? source.record_sha256
            : rawLine !== undefined
                ? sha256(rawLine)
                : sha256(stableAutomaticMissionJson({
                    schema: AUTOMATIC_MISSION_ROOT_RECORD_SCHEMA,
                    record_id: source.record_id ?? null,
                    thread_id: threadId,
                    turn_id: turnId,
                    timestamp,
                    text,
                    content,
                }));
        if (!SHA256.test(recordSha256)) throw new Error('automatic_mission_root_record_hash_invalid');
        const recordId = typeof source.record_id === 'string'
            ? boundedReference(source.record_id, 'root_record_id')
            : `root-record:${recordSha256.slice(0, 32)}`;
        return {
            schema: AUTOMATIC_MISSION_ROOT_RECORD_SCHEMA,
            record_id: recordId,
            thread_id: threadId,
            turn_id: turnId,
            timestamp,
            text,
            content,
            ...(rawLine !== undefined ? { raw_line: rawLine } : {}),
            message_sha256: messageSha256,
            record_sha256: recordSha256,
            index,
        };
    });
    if (records.length === 1 && compatibilityProfile === 'legacy_singleton_v1') {
        records[0]!.record_set_sha256 = legacySingletonV1RecordSetSha256(records[0]!);
        return records;
    }
    if (records.length > 0) {
        const setHash = sha256(stableAutomaticMissionJson({
            schema: 'cstar.mission_root_user_record_set.v2',
            records: records.map((record, index) => ({
                index,
                thread_id: record.thread_id,
                turn_id: record.turn_id,
                timestamp: record.timestamp,
                record_sha256: record.record_sha256,
            })),
        }));
        records.forEach((record) => { record.record_set_sha256 = setHash; });
    }
    return records;
}

export function hashAutomaticMissionRootRecordSet(records: RootUserInstructionRecord[]): string | null {
    return records[0]?.record_set_sha256 ?? null;
}

export function canonicalizeAutomaticMissionRequest(
    input: AutomaticMissionInput,
): CanonicalAutomaticMissionRequest {
    const objective = boundedText(input.objective, 'objective');
    const compatibilityProfile = input.compatibility_profile ?? 'cstar_mission_v1';
    const rawRecords = [
        ...(input.root_user_records ?? []),
        ...(input.root_user_record !== undefined ? [input.root_user_record] : []),
    ];
    const constraints = normalizeAutomaticMissionConstraints(input.constraints);
    const design = normalizeAutomaticMissionDesign(input.design, input.constraints);
    const idempotencyKey = input.idempotency_key === undefined
        ? null
        : boundedReference(input.idempotency_key, 'idempotency_key');
    return {
        schema: AUTOMATIC_MISSION_SCHEMA,
        objective,
        design,
        constraints,
        root_user_records: canonicalizeRootUserInstructionRecords(rawRecords, compatibilityProfile),
        idempotency_key: idempotencyKey,
        compatibility_profile: compatibilityProfile,
    };
}

export function deriveAutomaticMissionIdentifiers(
    canonical: CanonicalAutomaticMissionRequest,
): AutomaticMissionIdentifiers {
    const designSha256 = canonical.design === null
        ? null
        : sha256(stableAutomaticMissionJson(canonical.design));
    const constraintsSha256 = sha256(stableAutomaticMissionJson(canonical.constraints));
    const recordSetSha256 = hashAutomaticMissionRootRecordSet(canonical.root_user_records);
    const requestSha256 = sha256(stableAutomaticMissionJson({
        schema: 'cstar.mission_request.v1',
        objective: canonical.objective,
        design: canonical.design,
        constraints: canonical.constraints,
        idempotency_key: canonical.idempotency_key,
    }));
    const idempotencyKey = canonical.idempotency_key ?? `cstar-mission:${requestSha256.slice(0, 32)}`;
    const stem = requestSha256.slice(0, 32);
    const missionId = `mission:cstar:${stem}`;
    const decisionId = `decision:cstar:mission:${stem}`;
    const beadId = `bead:cstar:mission:${stem}`;
    const requestId = `request:cstar:mission:${stem}`;
    const bindingSha256 = sha256(stableAutomaticMissionJson({
        schema: 'cstar.mission_binding.v1',
        mission_id: missionId,
        decision_id: decisionId,
        bead_id: beadId,
        request_id: requestId,
        request_sha256: requestSha256,
        design_sha256: designSha256,
        constraints_sha256: constraintsSha256,
        root_user_record_set_sha256: recordSetSha256,
        idempotency_key: idempotencyKey,
    }));
    return {
        mission_id: missionId,
        decision_id: decisionId,
        bead_id: beadId,
        request_id: requestId,
        request_sha256: requestSha256,
        idempotency_key: idempotencyKey,
        design_sha256: designSha256,
        constraints_sha256: constraintsSha256,
        binding_sha256: bindingSha256,
    };
}

export const deriveMissionIdentifiers = deriveAutomaticMissionIdentifiers;
export const canonicalizeMissionRequest = canonicalizeAutomaticMissionRequest;
export const hashMission = (value: unknown): string => sha256(stableAutomaticMissionJson(value));
