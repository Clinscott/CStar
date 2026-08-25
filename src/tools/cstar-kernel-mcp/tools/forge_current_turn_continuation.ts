import { createHash } from 'node:crypto';

import type { ForgeOperatorIntentAction } from '../../pennyone/intel/forge_authorization_policy.js';

const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const RESERVED_NOTIFICATION = /^<subagent_notification>\n([^\r\n]+)\n<\/subagent_notification>$/;
const TERMINAL_STATUS_KEYS = new Set(['completed', 'errored']);
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const TIMEZONE = /^(?:UTC|[A-Za-z][A-Za-z0-9._+-]{0,31}(?:\/[A-Za-z0-9][A-Za-z0-9._+-]{0,31}){1,3})$/;
const SAFE_ABSOLUTE_PATH = /^\/[A-Za-z0-9._~+@%=-]+(?:\/[A-Za-z0-9._~+@%=-]+)*$/;
const RESERVED_FILESYSTEM = /^  <filesystem><workspace_roots>((?:<root>[^<>\s]+<\/root>)+)<\/workspace_roots><permission_profile type="([A-Za-z][A-Za-z0-9_-]{0,63})"><file_system type="([A-Za-z][A-Za-z0-9_-]{0,63})" \/><\/permission_profile><\/filesystem>$/;
const ROOT = /<root>([^<>\s]+)<\/root>/g;
const RESERVED_SUBAGENT = /^    - ([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}): ([A-Za-z][A-Za-z0-9_-]{0,63})$/i;
const EXACT_CURRENT_TURN_CONTINUATION = [
    'honestly. I am very tired of this. i am tired of the cstar mcp not working properly.',
    'i am tired of it all. if things do not start working. if cstar is so broken we cannot fix it I may start it all from scratch.',
    'so. the option I give you. this is one last chance to get it right. I don\'t want to answer any questions.',
    'I have already answered so many for CStar and corvus. my answers exist in the hall, they exist in the code base, they exist in everything under Corvus.',
    'the spoke architecture, augury, council, augury token path, taliesin, everything I have built. the answers are in there.',
    'the answers exist with OS in that I want the new framework. they exist. I answer nothing more.',
    'You do. You get one go at it. one full major run.',
    'if it doesnt work I need a go no go from you on building cstar and the corvus framework from the ground up again.',
].join(' ');

export interface CurrentTurnContinuationBinding {
    request_id: string;
    request_sha256: string;
    bead_id: string;
    decision_id: string;
}

export type ReservedSubagentNotificationClassification =
    | 'reserved_terminal'
    | 'malformed_wrapper'
    | 'ordinary';

export type ReservedCurrentTurnRecordClassification =
    | ReservedSubagentNotificationClassification
    | 'reserved_environment';

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function normalizedCandidate(text: string): string {
    const normalized = text.trim().replace(/\s+/g, ' ');
    return normalized.endsWith('.') ? normalized.slice(0, -1).trimEnd() : normalized;
}

export function classifyCurrentTurnContinuation(
    text: string,
    binding: CurrentTurnContinuationBinding,
): { action: ForgeOperatorIntentAction; normalizedText: string; workReferenceText: string } {
    if (UNSAFE_TEXT.test(text)) throw new Error('forge_operator_intent_unsafe_text');
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    if (normalizedCandidate(normalizedText).toLocaleLowerCase('en-US')
        !== normalizedCandidate(EXACT_CURRENT_TURN_CONTINUATION).toLocaleLowerCase('en-US')) {
        throw new Error('forge_operator_intent_nonoperative_text');
    }
    return {
        action: 'route_to_forge',
        normalizedText,
        workReferenceText: binding.bead_id,
    };
}

export function classifyReservedSubagentNotification(
    text: string,
): ReservedSubagentNotificationClassification {
    const wrapperLike = text.includes('<subagent_notification')
        || text.includes('</subagent_notification');
    if (!wrapperLike) return 'ordinary';
    const match = RESERVED_NOTIFICATION.exec(text);
    if (!match) return 'malformed_wrapper';
    let payload: unknown;
    try {
        payload = JSON.parse(match[1]!);
    } catch {
        return 'malformed_wrapper';
    }
    if (!isRecord(payload) || !exactKeys(payload, ['agent_path', 'status'])
        || typeof payload.agent_path !== 'string' || !UUID.test(payload.agent_path)
        || !isRecord(payload.status) || Object.keys(payload.status).length !== 1) {
        return 'malformed_wrapper';
    }
    const [statusKey] = Object.keys(payload.status);
    return statusKey && TERMINAL_STATUS_KEYS.has(statusKey)
        && typeof payload.status[statusKey] === 'string'
        ? 'reserved_terminal'
        : 'malformed_wrapper';
}

function isExactCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeWorkspaceRoot(value: string): boolean {
    return Buffer.byteLength(value, 'utf-8') <= 4_096
        && SAFE_ABSOLUTE_PATH.test(value)
        && value.split('/').every((part) => part !== '.' && part !== '..');
}

function isExactReservedEnvironmentContext(text: string): boolean {
    if (Buffer.byteLength(text, 'utf-8') > 32 * 1_024) return false;
    const lines = text.split('\n');
    if (lines[0] !== '<environment_context>' || lines.at(-1) !== '</environment_context>') {
        return false;
    }
    const date = /^  <current_date>([^<>]+)<\/current_date>$/.exec(lines[1] ?? '')?.[1];
    const timezone = /^  <timezone>([^<>]+)<\/timezone>$/.exec(lines[2] ?? '')?.[1];
    const filesystem = RESERVED_FILESYSTEM.exec(lines[3] ?? '');
    if (!date || !isExactCalendarDate(date) || !timezone || !TIMEZONE.test(timezone)
        || !filesystem || !IDENTIFIER.test(filesystem[2]!) || !IDENTIFIER.test(filesystem[3]!)) {
        return false;
    }
    const rootMarkup = filesystem[1]!;
    const roots = [...rootMarkup.matchAll(ROOT)];
    const rootValues = roots.map((match) => match[1]!);
    if (roots.length === 0 || roots.length > 32
        || roots.map((match) => match[0]).join('') !== rootMarkup
        || new Set(rootValues).size !== rootValues.length
        || rootValues.some((value) => !isSafeWorkspaceRoot(value))) return false;
    if (lines.length === 5) return lines[4] === '</environment_context>';
    if (lines.length < 7 || lines[4] !== '  <subagents>'
        || lines.at(-2) !== '  </subagents>') return false;
    const subagentLines = lines.slice(5, -2);
    if (subagentLines.length === 0 || subagentLines.length > 64) return false;
    const seen = new Set<string>();
    return subagentLines.every((line) => {
        const match = RESERVED_SUBAGENT.exec(line);
        if (!match || seen.has(match[1]!.toLowerCase())) return false;
        seen.add(match[1]!.toLowerCase());
        return true;
    });
}

export function classifyReservedCurrentTurnRecord(
    text: string,
): ReservedCurrentTurnRecordClassification {
    const notificationLike = text.includes('<subagent_notification')
        || text.includes('</subagent_notification');
    const environmentLike = text.includes('<environment_context')
        || text.includes('</environment_context');
    if (notificationLike) return classifyReservedSubagentNotification(text);
    if (!environmentLike) return 'ordinary';
    return isExactReservedEnvironmentContext(text)
        ? 'reserved_environment' : 'malformed_wrapper';
}

export function selectCurrentTurnRequesterPrefix(input: {
    thread_id: string;
    turn_id: string;
    requester_record_set_sha256?: string;
    operative_record_sha256: string;
    records: Array<{ timestamp: string; record_sha256: string }>;
}): string {
    const expected = input.requester_record_set_sha256;
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
        throw new Error('forge_operator_intent_current_turn_requester_record_set_invalid');
    }
    let matchedLength: number | undefined;
    for (let length = 1; length <= input.records.length; length += 1) {
        const candidate = sha256(JSON.stringify({
            schema: 'cstar.codex_root_user_turn_record_set.v1',
            thread_id: input.thread_id,
            turn_id: input.turn_id,
            records: input.records.slice(0, length).map((record, index) => ({
                index,
                timestamp: record.timestamp,
                record_sha256: record.record_sha256,
            })),
        }));
        if (candidate !== expected) continue;
        if (matchedLength !== undefined) {
            throw new Error('forge_operator_intent_current_turn_requester_prefix_ambiguous');
        }
        matchedLength = length;
    }
    if (matchedLength === undefined) {
        throw new Error('forge_operator_intent_current_turn_requester_prefix_missing');
    }
    if (!input.records.slice(0, matchedLength).some(
        (record) => record.record_sha256 === input.operative_record_sha256,
    )) {
        throw new Error('forge_operator_intent_current_turn_operative_record_not_in_requester_prefix');
    }
    return expected;
}
