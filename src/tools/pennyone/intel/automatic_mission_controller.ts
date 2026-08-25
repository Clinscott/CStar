import type {
    AutomaticMissionAction,
    AutomaticMissionInput,
    AutomaticMissionOutcome,
    AutomaticMissionRecord,
    AutomaticMissionSetGrant,
    AutomaticMissionState,
} from '../../../types/automatic_mission.js';
import {
    AUTOMATIC_MISSION_STATES,
} from '../../../types/automatic_mission.js';
import {
    bindAutomaticMissionAuthority,
    verifyAutomaticMissionSetGrant,
} from './automatic_mission_authority.js';
import {
    canonicalizeAutomaticMissionRequest,
    deriveAutomaticMissionIdentifiers,
    hashAutomaticMissionRootRecordSet,
    normalizeAutomaticMissionConstraints,
} from './automatic_mission_schema.js';
import {
    AutomaticMissionDispatchStore,
    type AutomaticMissionDispatchReceipt,
    type AutomaticMissionDispatchStoreOptions,
} from './automatic_mission_dispatch_store.js';

export interface AutomaticMissionControllerOptions {
    now?: number;
    action?: AutomaticMissionAction;
    queue_dispatch?: boolean;
}

export interface AutomaticMissionControllerPersistenceOptions
    extends AutomaticMissionDispatchStoreOptions {
    store?: AutomaticMissionDispatchStore;
}

export type AutomaticMissionControllerOutcome = AutomaticMissionOutcome & {
    dispatch_intent_receipt?: AutomaticMissionDispatchReceipt;
};

function outcome<T extends AutomaticMissionRecord>(
    kind: AutomaticMissionOutcome<T>['outcome'],
    mission: T,
    extra: Partial<AutomaticMissionOutcome<T>> = {},
): AutomaticMissionOutcome<T> {
    return {
        outcome: kind,
        kind,
        status: kind,
        state: mission.state,
        mission,
        ...extra,
    };
}

function errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return /^[a-z][a-z0-9_]{2,127}/.exec(message)?.[0] ?? 'automatic_mission_internal_error';
}

function errorKind(code: string): AutomaticMissionOutcome<'never'>['outcome'] {
    if (code.includes('hash_input_forbidden') || code.includes('text_content_mismatch')
        || code.includes('record_duplicate')) {
        return 'guardrail_block';
    }
    if (code.includes('design') || code.includes('root_user_record') || code.includes('grant_missing')) {
        return 'needs_input';
    }
    if (code.includes('transport')) return 'transport_error';
    if (code.includes('authority') || code.includes('grant_') || code.includes('nonoperative')
        || code.includes('revok') || code.includes('ceiling') || code.includes('expiry')
        || code.includes('replay') || code.includes('scope') || code.includes('repository')
        || code.includes('deadline') || code.includes('idempotency')) {
        return 'guardrail_block';
    }
    return 'internal_error';
}

function missingDesignFields(mission: AutomaticMissionRecord): string[] {
    const design = mission.design;
    if (!design) return ['design'];
    const missing: string[] = [];
    if (!design.root_task) missing.push('root_task');
    if (design.expires_at === null && mission.constraints.expires_at === null) missing.push('expires_at');
    return missing;
}

export function createAutomaticMissionRecord(
    input: AutomaticMissionInput,
    now = Date.now(),
): AutomaticMissionRecord {
    const canonical = canonicalizeAutomaticMissionRequest(input);
    const identifiers = deriveAutomaticMissionIdentifiers(canonical);
    return {
        schema: 'cstar.mission.v1',
        ...identifiers,
        objective: canonical.objective,
        design: canonical.design,
        constraints: normalizeAutomaticMissionConstraints(input.constraints),
        compatibility_profile: canonical.compatibility_profile,
        state: 'DRAFT',
        created_at: now,
        updated_at: now,
        root_user_records: canonical.root_user_records,
        root_user_record_set_sha256: hashAutomaticMissionRootRecordSet(canonical.root_user_records),
        root_user_instruction_sha256: canonical.root_user_records[0]?.message_sha256 ?? null,
        set_grant: null,
        adapter: null,
        callback: null,
        validator: null,
    };
}

export const createMissionRecord = createAutomaticMissionRecord;

function cloneWithState(
    mission: AutomaticMissionRecord,
    state: AutomaticMissionState,
    now: number,
    patch: Partial<AutomaticMissionRecord> = {},
): AutomaticMissionRecord {
    return { ...mission, ...patch, state, updated_at: now };
}

export function transitionAutomaticMission(
    mission: AutomaticMissionRecord,
    nextState: AutomaticMissionState,
    now = Date.now(),
    grant?: AutomaticMissionSetGrant,
): AutomaticMissionOutcome {
    if (!AUTOMATIC_MISSION_STATES.includes(nextState)) {
        return outcome('internal_error', mission, {
            error_code: 'automatic_mission_state_invalid',
            message: `Unknown mission state ${nextState}.`,
        });
    }
    const allowed: Record<AutomaticMissionState, AutomaticMissionState[]> = {
        DRAFT: ['NEEDS_DESIGN'],
        NEEDS_DESIGN: ['SET_BOUND'],
        SET_BOUND: ['MATERIALIZED'],
        MATERIALIZED: ['DISPATCH_QUEUED'],
        DISPATCH_QUEUED: [],
    };
    if (!allowed[mission.state].includes(nextState)) {
        return outcome('guardrail_block', mission, {
            error_code: 'automatic_mission_state_transition_invalid',
            message: `Cannot transition ${mission.state} to ${nextState}.`,
        });
    }
    if (nextState === 'SET_BOUND') {
        if (!grant) {
            return outcome('needs_input', mission, {
                error_code: 'automatic_mission_set_grant_required',
                next_action: 'Supply one exact root-user SET grant for this mission.',
            });
        }
        try {
            verifyAutomaticMissionSetGrant(mission, grant, now);
        } catch (error) {
            const code = errorCode(error);
            return outcome(errorKind(code), mission, { error_code: code, message: code });
        }
        return outcome('ok', cloneWithState(mission, nextState, now, { set_grant: grant }));
    }
    if (nextState === 'MATERIALIZED') {
        if (!mission.set_grant) {
            return outcome('needs_input', mission, {
                error_code: 'automatic_mission_set_grant_required',
                next_action: 'Bind the SET grant before materializing the mission.',
            });
        }
        try {
            verifyAutomaticMissionSetGrant(mission, mission.set_grant, now);
        } catch (error) {
            const code = errorCode(error);
            return outcome(errorKind(code), mission, { error_code: code, message: code });
        }
        return outcome('ok', cloneWithState(mission, nextState, now, {
            adapter: mission.set_grant.adapter,
            callback: mission.set_grant.callback,
            validator: mission.set_grant.validator,
        }));
    }
    if (nextState === 'DISPATCH_QUEUED') {
        const queued = cloneWithState(mission, nextState, now, { dispatch_queued_at: now });
        return outcome('ok', queued, {
            dispatch: {
                queued: true,
                launch_required_by_host: true,
                worker_launch_performed: false,
                host_dispatch_id: `host-dispatch:${mission.mission_id}`,
            },
            next_action: 'The host may dispatch the already-materialized bounded mission; CStar does not launch workers.',
        });
    }
    return outcome('ok', cloneWithState(mission, nextState, now));
}

export const advanceAutomaticMission = transitionAutomaticMission;

export function ingestAutomaticMission(
    input: AutomaticMissionInput,
    options: AutomaticMissionControllerOptions = {},
): AutomaticMissionOutcome {
    const now = options.now ?? Date.now();
    let mission: AutomaticMissionRecord;
    try {
        mission = createAutomaticMissionRecord(input, now);
    } catch (error) {
        const code = errorCode(error);
        const fallback = createBareMission(now);
        return outcome(errorKind(code), fallback, { error_code: code, message: code });
    }
    const action = options.action ?? input.action;
    if (action === 'draft') return outcome('ok', mission);
    const missing = missingDesignFields(mission);
    if (missing.length > 0) {
        const waiting = cloneWithState(mission, 'NEEDS_DESIGN', now);
        return outcome('needs_input', waiting, {
            error_code: 'automatic_mission_design_required',
            message: `Design is required before SET binding: ${missing.join(', ')}.`,
            next_action: 'Supply the bounded design, root task, ceilings, and expiry.',
        });
    }
    if (mission.root_user_records.length === 0) {
        const waiting = cloneWithState(mission, 'NEEDS_DESIGN', now);
        return outcome('needs_input', waiting, {
            error_code: 'automatic_mission_root_user_record_required',
            next_action: 'Bind one stable root-user instruction record; latest-turn prose is not authority.',
        });
    }
    let bound: AutomaticMissionOutcome;
    try {
        const authority = bindAutomaticMissionAuthority({
            mission,
            now,
        });
        bound = transitionAutomaticMission(mission, 'NEEDS_DESIGN', now);
        if (bound.outcome !== 'ok') return bound;
        bound = transitionAutomaticMission(bound.mission!, 'SET_BOUND', now, authority.grant);
        if (bound.outcome !== 'ok') return bound;
        mission = bound.mission!;
    } catch (error) {
        const code = errorCode(error);
        return outcome(errorKind(code), cloneWithState(mission, 'NEEDS_DESIGN', now), {
            error_code: code,
            message: code,
        });
    }
    if (action === 'bind') return bound;
    const materialized = transitionAutomaticMission(mission, 'MATERIALIZED', now);
    if (materialized.outcome !== 'ok') return materialized;
    if (action === 'materialize' && !options.queue_dispatch && !input.queue_dispatch) return materialized;
    if (options.queue_dispatch || input.queue_dispatch || action === 'queue_dispatch') {
        return transitionAutomaticMission(materialized.mission!, 'DISPATCH_QUEUED', now);
    }
    return materialized;
}

function createBareMission(now: number): AutomaticMissionRecord {
    return {
        schema: 'cstar.mission.v1',
        mission_id: 'mission:cstar:invalid',
        decision_id: 'decision:cstar:invalid',
        bead_id: 'bead:cstar:invalid',
        request_id: 'request:cstar:invalid',
        request_sha256: '0'.repeat(64),
        idempotency_key: 'cstar-mission:invalid',
        design_sha256: null,
        constraints_sha256: '0'.repeat(64),
        binding_sha256: '0'.repeat(64),
        objective: '',
        design: null,
        constraints: {
            retry_ceiling: null,
            attempt_ceiling: null,
            spend_ceiling: null,
            expires_at: null,
        },
        compatibility_profile: 'cstar_mission_v1',
        state: 'DRAFT',
        created_at: now,
        updated_at: now,
        root_user_records: [],
        root_user_record_set_sha256: null,
        root_user_instruction_sha256: null,
        set_grant: null,
        adapter: null,
        callback: null,
        validator: null,
    };
}

export class AutomaticMissionController {
    private readonly store: AutomaticMissionDispatchStore;

    constructor(options: AutomaticMissionControllerPersistenceOptions = {}) {
        this.store = options.store ?? new AutomaticMissionDispatchStore(options);
    }

    ingest(
        input: AutomaticMissionInput,
        options: AutomaticMissionControllerOptions = {},
    ): AutomaticMissionControllerOutcome {
        const now = options.now ?? Date.now();
        let candidate: AutomaticMissionRecord | undefined;
        try {
            candidate = createAutomaticMissionRecord(input, now);
        } catch {
            // The normal ingress path returns the typed validation outcome below.
        }
        const key = candidate?.idempotency_key;
        if (key) {
            const existing = this.store.getByIdempotencyKey(key);
            if (existing?.mission) {
                if (candidate!.request_sha256 !== existing.mission.request_sha256) {
                    return outcome('guardrail_block', existing.mission, {
                        error_code: 'automatic_mission_idempotency_conflict',
                        message: 'The idempotency key is already bound to a different mission request.',
                    });
                }
                return {
                    ...outcome('ok', existing.mission, {
                        idempotent_replay: true,
                        dispatch: {
                            queued: true,
                            launch_required_by_host: true,
                            worker_launch_performed: false,
                            host_dispatch_id: existing.receipt.dispatch_id,
                        },
                    }),
                    dispatch_intent_receipt: existing.receipt,
                };
            }
        }

        const action = options.action ?? input.action;
        const queueRequested = Boolean(options.queue_dispatch || input.queue_dispatch
            || action === 'queue_dispatch');
        const result = ingestAutomaticMission(
            queueRequested ? { ...input, action: 'materialize', queue_dispatch: false } : input,
            queueRequested
                ? { ...options, action: 'materialize', queue_dispatch: false, now }
                : { ...options, now },
        );
        if (!queueRequested || result.outcome !== 'ok' || result.state !== 'MATERIALIZED'
            || !result.mission) {
            return result;
        }
        const queued = transitionAutomaticMission(result.mission, 'DISPATCH_QUEUED', now);
        if (queued.outcome !== 'ok' || !queued.mission || !queued.mission.set_grant) return queued;
        try {
            const persisted = this.store.enqueue({
                source_kind: 'automatic_mission',
                mission_id: queued.mission.mission_id,
                decision_id: queued.mission.decision_id,
                bead_id: queued.mission.bead_id,
                idempotency_key: queued.mission.idempotency_key,
                intent_binding: {
                    request_sha256: queued.mission.request_sha256,
                    authority_binding_sha256: queued.mission.set_grant.authority_binding_sha256,
                    root_user_record_set_sha256: queued.mission.root_user_record_set_sha256,
                    spend_ceiling: queued.mission.set_grant.spend_ceiling,
                },
                mission: queued.mission,
                deadline_at: queued.mission.set_grant.expires_at,
                now,
            });
            const mission = persisted.mission ?? queued.mission;
            return {
                ...outcome('ok', mission, {
                    idempotent_replay: persisted.replayed || undefined,
                    dispatch: {
                        queued: true,
                        launch_required_by_host: true,
                        worker_launch_performed: false,
                        host_dispatch_id: persisted.receipt.dispatch_id,
                    },
                    next_action: 'The host may claim the durable intent; CStar does not launch workers.',
                }),
                dispatch_intent_receipt: persisted.receipt,
            };
        } catch (error) {
            const code = errorCode(error);
            return outcome(errorKind(code), queued.mission, { error_code: code, message: code });
        }
    }

    get(missionId: string): AutomaticMissionRecord | undefined {
        return this.store.getByMissionId(missionId)?.mission;
    }
}

export function createAutomaticMissionController(
    options: AutomaticMissionControllerPersistenceOptions = {},
): AutomaticMissionController {
    return new AutomaticMissionController(options);
}
