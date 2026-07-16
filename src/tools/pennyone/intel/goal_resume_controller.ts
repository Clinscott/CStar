import { createHash } from 'node:crypto';

import type { HallCoordinationEventRecord } from '../../../types/hall.js';
import type { VerifiedOperatorIntentAttestation } from '../../cstar-kernel-mcp/tools/operator_intent_attestation.js';
import {
    insertImmutableHallCoordinationEvent,
    listHallCoordinationEvents,
    withImmediateHallCoordinationTransaction,
} from './agent_coordination_controller.js';
import { database } from './database.js';
const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL_BEAD_STATUSES = new Set(['RESOLVED', 'ARCHIVED', 'SUPERSEDED']);
const GOAL_RESUME_SCHEMA = 'cstar.host_goal_resume.v1';
const MAX_GOAL_RESUME_HISTORY = 1_000;
const RATIONALE = 'Operator explicitly resumed a blocked host goal while the host exposes no resume transition.';
const SUMMARY = 'Continuity-only host goal resume overlay recorded; host goal status remains blocked.';
const PAYLOAD_KEYS = [
    'authority_effect',
    'continued_bead_id',
    'decision_id',
    'goal_ref',
    'host_goal_objective_sha256',
    'host_goal_snapshot_sha256',
    'host_resume_capability',
    'host_status_mutated',
    'observed_host_status',
    'operator_attestation_sha256',
    'operator_message_sha256',
    'operator_record_count',
    'operator_record_first_timestamp',
    'operator_record_set_sha256',
    'operator_record_sha256',
    'operator_resume_ref',
    'operator_thread_id',
    'operator_timestamp',
    'operator_turn_id',
    'previous_resume_id',
    'repair_bead_id',
    'resume_generation',
    'resume_id',
    'schema',
].sort();
export interface GoalResumeInput {
    repair_bead_id: string;
    continued_bead_id?: string;
    decision_id?: string;
    host_goal_objective_sha256: string;
    host_goal_snapshot_sha256: string;
    observed_host_status: 'blocked';
    host_resume_capability: 'unavailable';
}
export interface GoalResumeRecordResult {
    status: 'recorded' | 'replayed';
    resume_id: string;
    goal_ref: string;
    resume_generation: number;
    previous_resume_id?: string;
    event: HallCoordinationEventRecord;
}
function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function requireHash(value: string, name: string): string {
    const normalized = value.trim().toLowerCase();
    if (!SHA256.test(normalized)) throw new Error(`goal_resume_${name}_invalid`);
    return normalized;
}
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}
function eventPayload(event: HallCoordinationEventRecord): Record<string, unknown> {
    return event.payload ?? {};
}

function nullableString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function buildGoalRef(threadId: string, objectiveSha256: string): string {
    return `codex-goal:${sha256(JSON.stringify({
        schema: 'cstar.host_goal_ref.v1',
        thread_id: threadId,
        objective_sha256: objectiveSha256,
    }))}`;
}
function buildOperatorResumeRef(
    threadId: string,
    turnId: string,
    recordSetSha256: string,
): string {
    return `codex-thread:${threadId}:turn:${turnId}:record-set-sha256:${recordSetSha256}`;
}
function buildOperatorAttestationSha256(values: {
    threadId: string;
    turnId: string;
    operatorResumeRef: string;
    messageSha256: string;
    recordSha256: string;
    recordSetSha256: string;
    recordCount: number;
    recordFirstTimestamp: string;
    recordTimestamp: string;
}): string {
    return sha256(JSON.stringify({
        schema: 'cstar.operator_goal_resume_attestation.v1',
        intent: 'goal_resume',
        thread_id: values.threadId,
        turn_id: values.turnId,
        operator_resume_ref: values.operatorResumeRef,
        message_sha256: values.messageSha256,
        session_record_sha256: values.recordSha256,
        session_record_set_sha256: values.recordSetSha256,
        session_record_count: values.recordCount,
        session_record_first_timestamp: values.recordFirstTimestamp,
        session_record_timestamp: values.recordTimestamp,
    }));
}

function validateCurrentOperatorAttestation(
    attestation: VerifiedOperatorIntentAttestation,
): string {
    if (
        attestation.intent !== 'goal_resume'
        || !attestation.thread_id.trim()
        || !attestation.turn_id.trim()
        || requireHash(attestation.message_sha256, 'operator_message_hash') !== attestation.message_sha256
        || requireHash(attestation.session_record_sha256, 'operator_record_hash') !== attestation.session_record_sha256
        || requireHash(attestation.session_record_set_sha256, 'operator_record_set_hash') !== attestation.session_record_set_sha256
        || !Number.isSafeInteger(attestation.session_record_count)
        || attestation.session_record_count < 1
        || !Number.isFinite(Date.parse(attestation.session_record_first_timestamp))
        || !Number.isFinite(Date.parse(attestation.session_record_timestamp))
        || Date.parse(attestation.session_record_first_timestamp) > Date.parse(attestation.session_record_timestamp)
    ) {
        throw new Error('goal_resume_operator_attestation_invalid');
    }
    const expectedRef = buildOperatorResumeRef(
        attestation.thread_id,
        attestation.turn_id,
        attestation.session_record_set_sha256,
    );
    if (attestation.operator_resume_ref !== expectedRef) {
        throw new Error('goal_resume_operator_resume_ref_invalid');
    }
    return buildOperatorAttestationSha256({
        threadId: attestation.thread_id,
        turnId: attestation.turn_id,
        operatorResumeRef: attestation.operator_resume_ref,
        messageSha256: attestation.message_sha256,
        recordSha256: attestation.session_record_sha256,
        recordSetSha256: attestation.session_record_set_sha256,
        recordCount: attestation.session_record_count,
        recordFirstTimestamp: attestation.session_record_first_timestamp,
        recordTimestamp: attestation.session_record_timestamp,
    });
}

function buildResumeId(values: {
    goalRef: string;
    operatorRecordSetSha256: string;
    snapshotSha256: string;
    repairBeadId: string;
    continuedBeadId?: string;
    decisionId?: string;
    operatorAttestationSha256: string;
}): string {
    return `goal-resume:${sha256(JSON.stringify({
        schema: 'cstar.host_goal_resume_id.v1',
        goal_ref: values.goalRef,
        operator_record_set_sha256: values.operatorRecordSetSha256,
        snapshot_sha256: values.snapshotSha256,
        repair_bead_id: values.repairBeadId,
        continued_bead_id: values.continuedBeadId ?? null,
        decision_id: values.decisionId ?? null,
        operator_attestation_sha256: values.operatorAttestationSha256,
    }))}`;
}

function requireActiveBead(
    beadId: string,
    label: string,
    repoId: string,
    root: string,
): void {
    const row = database.getWritableDb(root).prepare(`
        SELECT repo_id, status
        FROM hall_beads
        WHERE bead_id = ?
        LIMIT 1
    `).get(beadId) as { repo_id?: string; status?: string } | undefined;
    if (!row) throw new Error(`goal_resume_${label}_bead_not_found`);
    if (row.repo_id !== repoId) throw new Error(`goal_resume_${label}_bead_cross_repository`);
    if (TERMINAL_BEAD_STATUSES.has(String(row.status))) {
        throw new Error(`goal_resume_${label}_bead_terminal`);
    }
}

function validateStoredEvent(
    event: HallCoordinationEventRecord,
    repoId: string,
    goalRef: string,
): { generation: number; previousId?: string; operatorRecordSetSha256: string } {
    const payload = eventPayload(event);
    const metadata = event.metadata ?? {};
    if (!exactKeys(payload, PAYLOAD_KEYS)) throw new Error('goal_resume_history_payload_shape_invalid');
    if (!exactKeys(metadata, ['immutable', 'source'])) throw new Error('goal_resume_history_metadata_shape_invalid');
    if (metadata.immutable !== true || metadata.source !== 'cstar-kernel-mcp') {
        throw new Error('goal_resume_history_immutable_marker_invalid');
    }
    const objectiveSha256 = requireHash(String(payload.host_goal_objective_sha256 ?? ''), 'history_objective_hash');
    const snapshotSha256 = requireHash(String(payload.host_goal_snapshot_sha256 ?? ''), 'history_snapshot_hash');
    const operatorRecordSetSha256 = requireHash(
        String(payload.operator_record_set_sha256 ?? ''),
        'history_record_set_hash',
    );
    const operatorMessageSha256 = requireHash(
        String(payload.operator_message_sha256 ?? ''),
        'history_message_hash',
    );
    const operatorRecordSha256 = requireHash(
        String(payload.operator_record_sha256 ?? ''),
        'history_record_hash',
    );
    const operatorAttestationSha256 = requireHash(
        String(payload.operator_attestation_sha256 ?? ''),
        'history_operator_attestation_hash',
    );
    const repairBeadId = nullableString(payload.repair_bead_id);
    const operatorThreadId = nullableString(payload.operator_thread_id);
    const operatorTurnId = nullableString(payload.operator_turn_id);
    const operatorResumeRef = nullableString(payload.operator_resume_ref);
    const operatorFirstTimestamp = nullableString(payload.operator_record_first_timestamp);
    const operatorTimestamp = nullableString(payload.operator_timestamp);
    if (!repairBeadId || !operatorThreadId || !operatorTurnId || !operatorResumeRef
        || !operatorFirstTimestamp || !operatorTimestamp) {
        throw new Error('goal_resume_history_operator_lineage_invalid');
    }
    const generation = Number(payload.resume_generation);
    const operatorRecordCount = Number(payload.operator_record_count);
    if (!Number.isSafeInteger(generation) || generation < 1) {
        throw new Error('goal_resume_history_generation_invalid');
    }
    if (!Number.isSafeInteger(operatorRecordCount) || operatorRecordCount < 1) {
        throw new Error('goal_resume_history_record_count_invalid');
    }
    const firstTimestampMs = Date.parse(operatorFirstTimestamp);
    const timestampMs = Date.parse(operatorTimestamp);
    if (
        !Number.isFinite(firstTimestampMs)
        || !Number.isFinite(timestampMs)
        || firstTimestampMs > timestampMs
    ) {
        throw new Error('goal_resume_history_operator_timestamps_invalid');
    }
    const previousId = nullableString(payload.previous_resume_id);
    const continuedBeadId = nullableString(payload.continued_bead_id);
    const decisionId = nullableString(payload.decision_id);
    const expectedGoalRef = buildGoalRef(operatorThreadId, objectiveSha256);
    const expectedOperatorResumeRef = buildOperatorResumeRef(
        operatorThreadId,
        operatorTurnId,
        operatorRecordSetSha256,
    );
    const expectedOperatorAttestationSha256 = buildOperatorAttestationSha256({
        threadId: operatorThreadId,
        turnId: operatorTurnId,
        operatorResumeRef,
        messageSha256: operatorMessageSha256,
        recordSha256: operatorRecordSha256,
        recordSetSha256: operatorRecordSetSha256,
        recordCount: operatorRecordCount,
        recordFirstTimestamp: operatorFirstTimestamp,
        recordTimestamp: operatorTimestamp,
    });
    const expectedResumeId = buildResumeId({
        goalRef: expectedGoalRef,
        operatorRecordSetSha256,
        snapshotSha256,
        repairBeadId,
        continuedBeadId,
        decisionId,
        operatorAttestationSha256,
    });
    if (operatorResumeRef !== expectedOperatorResumeRef) {
        throw new Error('goal_resume_history_operator_resume_ref_invalid');
    }
    if (operatorAttestationSha256 !== expectedOperatorAttestationSha256) {
        throw new Error('goal_resume_history_operator_attestation_invalid');
    }
    if (
        payload.schema !== GOAL_RESUME_SCHEMA
        || payload.resume_id !== event.event_id
        || expectedResumeId !== event.event_id
        || payload.goal_ref !== expectedGoalRef
        || expectedGoalRef !== goalRef
        || payload.observed_host_status !== 'blocked'
        || payload.host_resume_capability !== 'unavailable'
        || payload.host_status_mutated !== false
        || payload.authority_effect !== 'continuity_only'
        || event.repo_id !== repoId
        || event.thread_id !== operatorThreadId
        || event.scope_kind !== 'TARGET'
        || event.scope_ref !== goalRef
        || event.event_kind !== 'DECISION'
        || event.from_agent_id !== `operator:${operatorThreadId}`
        || event.to_agent_id !== 'cstar:cos'
        || event.session_id !== operatorThreadId
        || event.trace_id !== operatorTurnId
        || event.bead_id !== repairBeadId
        || event.target_path !== undefined
        || event.rationale !== RATIONALE
        || event.summary !== SUMMARY
        || event.created_at !== event.updated_at
    ) {
        throw new Error('goal_resume_history_envelope_invalid');
    }
    return { generation, previousId, operatorRecordSetSha256 };
}

function currentRequestMatches(
    event: HallCoordinationEventRecord,
    input: GoalResumeInput,
    attestation: VerifiedOperatorIntentAttestation,
): boolean {
    const payload = eventPayload(event);
    const operatorAttestationSha256 = validateCurrentOperatorAttestation(attestation);
    return payload.repair_bead_id === input.repair_bead_id
        && (payload.continued_bead_id ?? undefined) === input.continued_bead_id
        && (payload.decision_id ?? undefined) === input.decision_id
        && payload.host_goal_objective_sha256 === input.host_goal_objective_sha256
        && payload.host_goal_snapshot_sha256 === input.host_goal_snapshot_sha256
        && payload.operator_thread_id === attestation.thread_id
        && payload.operator_turn_id === attestation.turn_id
        && payload.operator_resume_ref === attestation.operator_resume_ref
        && payload.operator_attestation_sha256 === operatorAttestationSha256
        && payload.operator_message_sha256 === attestation.message_sha256
        && payload.operator_record_sha256 === attestation.session_record_sha256
        && payload.operator_record_set_sha256 === attestation.session_record_set_sha256
        && payload.operator_record_count === attestation.session_record_count
        && payload.operator_record_first_timestamp === attestation.session_record_first_timestamp
        && payload.operator_timestamp === attestation.session_record_timestamp;
}

export function recordHostGoalResume(
    input: GoalResumeInput,
    attestation: VerifiedOperatorIntentAttestation,
    root: string,
    repoId: string,
    now = Date.now(),
): GoalResumeRecordResult {
    const normalized: GoalResumeInput = {
        ...input,
        repair_bead_id: input.repair_bead_id.trim(),
        continued_bead_id: input.continued_bead_id?.trim() || undefined,
        decision_id: input.decision_id?.trim() || undefined,
        host_goal_objective_sha256: requireHash(input.host_goal_objective_sha256, 'objective_hash'),
        host_goal_snapshot_sha256: requireHash(input.host_goal_snapshot_sha256, 'snapshot_hash'),
    };
    if (normalized.observed_host_status !== 'blocked') {
        throw new Error('goal_resume_host_status_must_remain_blocked');
    }
    if (normalized.host_resume_capability !== 'unavailable') {
        throw new Error('goal_resume_host_capability_must_be_unavailable');
    }
    const goalRef = buildGoalRef(attestation.thread_id, normalized.host_goal_objective_sha256);
    const operatorAttestationSha256 = validateCurrentOperatorAttestation(attestation);
    const resumeId = buildResumeId({
        goalRef,
        operatorRecordSetSha256: attestation.session_record_set_sha256,
        snapshotSha256: normalized.host_goal_snapshot_sha256,
        repairBeadId: normalized.repair_bead_id,
        continuedBeadId: normalized.continued_bead_id,
        decisionId: normalized.decision_id,
        operatorAttestationSha256,
    });

    return withImmediateHallCoordinationTransaction(root, () => {
        requireActiveBead(normalized.repair_bead_id, 'repair', repoId, root);
        if (normalized.continued_bead_id) {
            requireActiveBead(normalized.continued_bead_id, 'continued', repoId, root);
        }
        const db = database.getWritableDb(root);
        const reused = db.prepare(`
            SELECT event_id
            FROM hall_coordination_events
            WHERE repo_id = ?
              AND json_extract(payload_json, '$.schema') = ?
              AND json_extract(payload_json, '$.operator_record_set_sha256') = ?
            LIMIT 2
        `).all(repoId, GOAL_RESUME_SCHEMA, attestation.session_record_set_sha256) as Array<{ event_id: string }>;
        if (reused.some((row) => row.event_id !== resumeId)) {
            throw new Error('goal_resume_replay_conflict');
        }
        const history = listHallCoordinationEvents(root, {
            scopeKind: 'TARGET',
            scopeRef: goalRef,
            eventKinds: ['DECISION'],
            limit: MAX_GOAL_RESUME_HISTORY + 1,
        });
        if (history.length > MAX_GOAL_RESUME_HISTORY) {
            throw new Error('goal_resume_history_limit_exceeded');
        }
        const validated = history.map((event) => ({
            event,
            ...validateStoredEvent(event, repoId, goalRef),
        })).sort((left, right) => left.generation - right.generation);
        validated.forEach((entry, index) => {
            const expectedGeneration = index + 1;
            const expectedPreviousId = index === 0 ? undefined : validated[index - 1]!.event.event_id;
            if (entry.generation !== expectedGeneration || entry.previousId !== expectedPreviousId) {
                throw new Error('goal_resume_history_chain_invalid');
            }
        });
        const replay = validated.find((entry) => entry.event.event_id === resumeId);
        if (replay) {
            if (!currentRequestMatches(replay.event, normalized, attestation)) {
                throw new Error('goal_resume_replay_conflict');
            }
            return {
                status: 'replayed' as const,
                resume_id: resumeId,
                goal_ref: goalRef,
                resume_generation: replay.generation,
                previous_resume_id: replay.previousId,
                event: replay.event,
            };
        }
        if (validated.length >= MAX_GOAL_RESUME_HISTORY) {
            throw new Error('goal_resume_history_limit_exceeded');
        }
        const previous = validated.at(-1);
        const generation = previous ? previous.generation + 1 : 1;
        const payload: Record<string, unknown> = {
            schema: GOAL_RESUME_SCHEMA,
            resume_id: resumeId,
            resume_generation: generation,
            previous_resume_id: previous?.event.event_id ?? null,
            goal_ref: goalRef,
            host_goal_objective_sha256: normalized.host_goal_objective_sha256,
            host_goal_snapshot_sha256: normalized.host_goal_snapshot_sha256,
            observed_host_status: 'blocked',
            host_resume_capability: 'unavailable',
            host_status_mutated: false,
            authority_effect: 'continuity_only',
            repair_bead_id: normalized.repair_bead_id,
            continued_bead_id: normalized.continued_bead_id ?? null,
            decision_id: normalized.decision_id ?? null,
            operator_thread_id: attestation.thread_id,
            operator_turn_id: attestation.turn_id,
            operator_resume_ref: attestation.operator_resume_ref,
            operator_attestation_sha256: operatorAttestationSha256,
            operator_message_sha256: attestation.message_sha256,
            operator_record_sha256: attestation.session_record_sha256,
            operator_record_set_sha256: attestation.session_record_set_sha256,
            operator_record_count: attestation.session_record_count,
            operator_record_first_timestamp: attestation.session_record_first_timestamp,
            operator_timestamp: attestation.session_record_timestamp,
        };
        const event: HallCoordinationEventRecord = {
            event_id: resumeId,
            repo_id: repoId,
            thread_id: attestation.thread_id,
            scope_kind: 'TARGET',
            scope_ref: goalRef,
            event_kind: 'DECISION',
            from_agent_id: `operator:${attestation.thread_id}`,
            to_agent_id: 'cstar:cos',
            session_id: attestation.thread_id,
            trace_id: attestation.turn_id,
            bead_id: normalized.repair_bead_id,
            rationale: RATIONALE,
            summary: SUMMARY,
            payload,
            metadata: { source: 'cstar-kernel-mcp', immutable: true },
            created_at: now,
            updated_at: now,
        };
        try {
            insertImmutableHallCoordinationEvent(event, root);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/UNIQUE constraint failed: hall_coordination_events\.event_id/i.test(message)) {
                throw new Error('goal_resume_generation_race');
            }
            throw error;
        }
        return {
            status: 'recorded' as const,
            resume_id: resumeId,
            goal_ref: goalRef,
            resume_generation: generation,
            previous_resume_id: previous?.event.event_id,
            event,
        };
    });
}
