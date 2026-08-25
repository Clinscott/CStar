import {
    DEFAULT_COUNCIL_EXPERT_IDS,
    getCouncilExpertProtocol,
    scoreCouncilExpertCandidates,
    type CouncilExpertId,
} from '../../../core/council_experts.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    AUGURY_MISSION_MAX_ITEMS,
    AUGURY_MISSION_RECEIPT_SCHEMA,
    AUGURY_MISSION_RECEIPT_VERSION,
    canonicalAuguryRepositoryRoot,
    canonicalAuguryTargetSet,
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AuguryMissionBoundaryInput,
    type AuguryMissionBoundaryInputV2,
    type AuguryMissionCouncil,
    type AuguryMissionCounts,
    type AuguryMissionPlanItem,
    type AuguryMissionReceipt,
    type AuguryMissionReceiptPayload,
    type AuguryMissionScope,
    type AuguryVerifiedSetIdentity,
    type AnyAuguryMissionReceipt,
} from '../contracts/augury_mission.js';
import { verifyCurrentOrHistoricalForgeSetAuthority } from './forge_set_manifest_signal.js';
import {
    finalizeAuguryMissionBoundaryV2,
    ownsPreparedAuguryMissionBoundaryV2,
    prepareAuguryMissionBoundaryV2,
} from './augury_mission_binding_v2.js';

const SHA256 = /^[a-f0-9]{64}$/;
const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const REPOSITORY_ID = /^repo:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const DECISION_ID = /^decision:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const BEAD_ID = /^bead:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const SPOKE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const TIERS = new Set(['PRIME', 'SKILL', 'WEAVE', 'SPELL']);
const LANES = new Set(['cos', 'forge', 'researcher', 'corvus_eye']);

export interface PreparedAuguryMissionBoundary {
    readonly target_paths: readonly string[];
    readonly scope_id: string;
}

interface CanonicalBoundary {
    setIdentity: AuguryVerifiedSetIdentity;
    repository: AuguryMissionReceiptPayload['repository'];
    missionDecisionId: string;
    parentBeadId: string;
    design: AuguryMissionReceiptPayload['design'];
    scope: AuguryMissionReceiptPayload['scope'];
    targets: string[];
    plan: AuguryMissionPlanItem[];
    orderedPlanSha256: string;
    counts: AuguryMissionCounts;
    replay?: AuguryMissionBoundaryInput['replay'];
}

interface AuguryMissionRouteProjection {
    intent_category?: unknown;
    intent?: unknown;
    selection?: unknown;
    expert?: unknown;
    expert_label?: unknown;
    expert_lens?: unknown;
    expert_signature_question?: unknown;
    expert_guardrails?: unknown;
    council_candidates?: unknown;
    mimir_targets?: unknown;
}

const preparedBoundaries = new WeakMap<object, CanonicalBoundary>();

function fail(code: string): never {
    throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length
        && actual.every((key, index) => key === wanted[index]);
}

function reference(value: unknown, code: string): string {
    if (typeof value !== 'string' || value !== value.trim() || !REFERENCE.test(value)) fail(code);
    return value;
}

function identifier(value: unknown, grammar: RegExp, code: string): string {
    const normalized = reference(value, code);
    if (!grammar.test(normalized)) fail(code);
    return normalized;
}

function hash(value: unknown, code: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
    return value;
}

function strings(
    value: unknown,
    code: string,
    allowEmpty = false,
): string[] {
    if (!Array.isArray(value) || value.length > AUGURY_MISSION_MAX_ITEMS
        || (!allowEmpty && value.length === 0)) fail(code);
    const result = value.map((entry) => reference(entry, code));
    if (new Set(result).size !== result.length) fail(code);
    return result;
}

function canonicalScope(value: unknown): AuguryMissionReceiptPayload['scope'] {
    if (!isRecord(value) || !exactKeys(value, ['schema', 'domain', 'subject'])
        || value.schema !== 'cstar.mission_scope.v1') fail('augury_mission_scope_invalid');
    const domain = value.domain;
    const subject = value.subject;
    if (domain === 'brain' && subject === 'CStar') {
        return { schema: 'cstar.mission_scope.v1', domain, subject, scope_id: 'brain:CStar' };
    }
    if (domain === 'estate' && subject === 'Corvus') {
        return { schema: 'cstar.mission_scope.v1', domain, subject, scope_id: 'estate:Corvus' };
    }
    if (domain === 'spoke' && typeof subject === 'string' && SPOKE_ID.test(subject)) {
        return { schema: 'cstar.mission_scope.v1', domain, subject, scope_id: `spoke:${subject}` };
    }
    fail('augury_mission_scope_invalid');
}

function canonicalPlan(
    value: unknown,
    root: string,
    missionTargets: string[],
    parentBeadId: string,
): {
    plan: AuguryMissionPlanItem[];
    orderedPlanSha256: string;
    counts: Omit<AuguryMissionCounts, 'target_count'>;
} {
    if (!Array.isArray(value) || value.length === 0) fail('augury_mission_plan_invalid');
    if (value.length > AUGURY_MISSION_MAX_ITEMS) fail('augury_mission_plan_limit_exceeded');
    const priorIds = new Set<string>();
    const targetOwners = new Map<string, string>();
    let dependencyCount = 0;
    let acceptanceCount = 0;
    let checkerCount = 0;
    const plan = value.map((entry, order) => {
        if (!isRecord(entry) || !exactKeys(entry, [
            'bead_id', 'dependencies', 'lane', 'target_paths',
            'acceptance_obligations', 'checker_obligations',
        ])) fail('augury_mission_plan_invalid');
        const beadId = identifier(entry.bead_id, BEAD_ID, 'augury_mission_plan_id_invalid');
        if (beadId === parentBeadId) fail('augury_mission_plan_id_invalid');
        if (priorIds.has(beadId)) fail('augury_mission_plan_id_duplicate');
        const dependencies = strings(entry.dependencies, 'augury_mission_plan_dependency_invalid', true);
        dependencies.forEach((dependency) => {
            identifier(dependency, BEAD_ID, 'augury_mission_plan_dependency_invalid');
            if (dependency !== parentBeadId && !priorIds.has(dependency)) {
                fail('augury_mission_plan_dependency_invalid');
            }
        });
        if (!LANES.has(String(entry.lane))) fail('augury_mission_plan_lane_invalid');
        const targets = canonicalAuguryTargetSet(
            root, entry.target_paths, 'augury_mission_plan_target_invalid',
        );
        targets.forEach((target) => {
            if (!missionTargets.includes(target)) fail('augury_mission_plan_target_invalid');
            if (targetOwners.has(target)) fail('augury_mission_plan_target_owner_duplicate');
            targetOwners.set(target, beadId);
        });
        const acceptance = strings(
            entry.acceptance_obligations, 'augury_mission_plan_acceptance_invalid',
        );
        const checkers = strings(
            entry.checker_obligations, 'augury_mission_plan_checker_invalid',
        );
        dependencyCount += dependencies.length;
        acceptanceCount += acceptance.length;
        checkerCount += checkers.length;
        if ([dependencyCount, acceptanceCount, checkerCount]
            .some((count) => count > AUGURY_MISSION_MAX_ITEMS)) {
            fail('augury_mission_plan_limit_exceeded');
        }
        priorIds.add(beadId);
        return {
            order,
            bead_id: beadId,
            dependencies,
            lane: entry.lane as AuguryMissionPlanItem['lane'],
            target_paths: targets,
            acceptance_obligations: acceptance,
            checker_obligations: checkers,
        };
    });
    if (missionTargets.some((target) => !targetOwners.has(target))) {
        fail('augury_mission_plan_incomplete');
    }
    return {
        plan,
        orderedPlanSha256: hashAuguryMissionValue({
            schema: 'cstar.augury_ordered_bead_plan.v1',
            ordered_plan_count: plan.length,
            bead_plan: plan,
        }),
        counts: {
            bead_count: plan.length,
            dependency_count: dependencyCount,
            acceptance_obligation_count: acceptanceCount,
            checker_obligation_count: checkerCount,
        },
    };
}

function mapSetVerificationError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (/revoked/.test(message)) fail('augury_mission_set_signal_revoked');
    if (/duplicate|ambiguous|match_count:2/.test(message)) {
        fail('augury_mission_set_signal_ambiguous');
    }
    if (/identity_drift|not_latest|noncontiguous/.test(message)) {
        fail('augury_mission_set_identity_drift');
    }
    if (/codex_request_identity|canonical_root_user|root_user_thread/.test(message)) {
        fail('augury_mission_request_identity_invalid');
    }
    fail('augury_mission_set_signal_invalid');
}

async function verifiedSetIdentity(
    requestContext: McpRequestContext | undefined,
    now: number,
): Promise<AuguryVerifiedSetIdentity> {
    try {
        const authority = await verifyCurrentOrHistoricalForgeSetAuthority(requestContext, now);
        if (!authority) fail('augury_mission_set_signal_missing');
        const { identity, signal } = authority;
        return {
            schema: 'cstar.verified_current_exact_root_set.v1',
            source: 'verified_codex_request_identity',
            root_thread_id: identity.thread_id,
            set_turn_id: identity.turn_id,
            set_record_sha256: signal.record_sha256,
            set_record_set_sha256: identity.turn_record_set_sha256,
            set_record_count: identity.turn_record_count,
            set_first_timestamp: identity.turn_first_timestamp,
            set_timestamp: identity.turn_timestamp,
            session_record_set_sha256: signal.root_session_record_set_sha256,
            session_record_count: signal.root_session_record_count,
        };
    } catch (error) {
        if ((error as Error)?.message === 'augury_mission_set_signal_missing') throw error;
        mapSetVerificationError(error);
    }
}

async function prepareAuguryMissionBoundaryV1(input: {
    boundary: AuguryMissionBoundaryInput;
    expected_root: string;
    request_context?: McpRequestContext;
    top_level_target_paths?: string[];
    top_level_scope?: string;
    now?: number;
}): Promise<PreparedAuguryMissionBoundary> {
    const boundary = input.boundary;
    if (!isRecord(boundary) || !exactKeys(boundary, [
        'schema', 'repository', 'mission_decision_id', 'proposed_parent_bead_id',
        'design', 'scope', 'contained_target_paths', 'bead_plan',
        ...(boundary.replay === undefined ? [] : ['replay']),
    ]) || boundary.schema !== 'cstar.augury_mission_boundary.v1') {
        fail('augury_mission_boundary_incomplete');
    }
    const setIdentity = await verifiedSetIdentity(input.request_context, input.now ?? Date.now());
    if (!isRecord(boundary.repository) || !exactKeys(
        boundary.repository, ['schema', 'repository_id', 'root_path'],
    ) || boundary.repository.schema !== 'cstar.repository_root_identity.v1') {
        fail('augury_mission_repository_identity_invalid');
    }
    const root = canonicalAuguryRepositoryRoot(
        input.expected_root, boundary.repository.root_path,
    );
    const repositoryId = identifier(
        boundary.repository.repository_id,
        REPOSITORY_ID,
        'augury_mission_repository_identity_invalid',
    );
    const repositoryBase = {
        schema: 'cstar.repository_root_identity.v1' as const,
        repository_id: repositoryId,
        root_path: root,
    };
    const targets = canonicalAuguryTargetSet(
        root, boundary.contained_target_paths, 'augury_mission_target_paths_invalid',
    );
    if (input.top_level_target_paths !== undefined) {
        const topTargets = canonicalAuguryTargetSet(
            root, input.top_level_target_paths, 'augury_mission_top_level_targets_invalid',
        );
        if (stableAuguryMissionJson(topTargets) !== stableAuguryMissionJson(targets)) {
            fail('augury_mission_target_set_mismatch');
        }
    }
    const scope = canonicalScope(boundary.scope);
    if (input.top_level_scope !== undefined && input.top_level_scope !== scope.scope_id) {
        fail('augury_mission_scope_mismatch');
    }
    const decisionId = identifier(
        boundary.mission_decision_id, DECISION_ID, 'augury_mission_decision_id_invalid',
    );
    const parentBeadId = identifier(
        boundary.proposed_parent_bead_id, BEAD_ID, 'augury_mission_parent_bead_id_invalid',
    );
    if (!isRecord(boundary.design) || !exactKeys(boundary.design, ['revision', 'sha256'])
        || !Number.isSafeInteger(boundary.design.revision)
        || Number(boundary.design.revision) < 1
        || Number(boundary.design.revision) > AUGURY_MISSION_MAX_ITEMS) {
        fail('augury_mission_design_invalid');
    }
    const design = {
        revision: Number(boundary.design.revision),
        sha256: hash(boundary.design.sha256, 'augury_mission_design_invalid'),
    };
    const canonicalPlanResult = canonicalPlan(
        boundary.bead_plan, root, targets, parentBeadId,
    );
    if (boundary.replay !== undefined && (!isRecord(boundary.replay)
        || !exactKeys(boundary.replay, [
            'canonical_payload_sha256', 'receipt_id',
            'ordered_plan_count', 'ordered_plan_sha256',
        ])
        || !SHA256.test(String(boundary.replay.canonical_payload_sha256))
        || !SHA256.test(String(boundary.replay.ordered_plan_sha256))
        || !Number.isSafeInteger(boundary.replay.ordered_plan_count))) {
        fail('augury_mission_replay_invalid');
    }
    const state: CanonicalBoundary = {
        setIdentity,
        repository: {
            ...repositoryBase,
            identity_sha256: hashAuguryMissionValue(repositoryBase),
        },
        missionDecisionId: decisionId,
        parentBeadId,
        design,
        scope,
        targets,
        plan: canonicalPlanResult.plan,
        orderedPlanSha256: canonicalPlanResult.orderedPlanSha256,
        counts: {
            target_count: targets.length,
            ...canonicalPlanResult.counts,
        },
        replay: boundary.replay,
    };
    const token = Object.freeze({
        target_paths: Object.freeze([...targets]),
        scope_id: scope.scope_id,
    });
    preparedBoundaries.set(token, state);
    return token;
}

export async function prepareAuguryMissionBoundary(input: {
    boundary: AuguryMissionBoundaryInput | AuguryMissionBoundaryInputV2;
    expected_root: string;
    request_context?: McpRequestContext;
    top_level_target_paths?: string[];
    top_level_scope?: string;
    now?: number;
}): Promise<PreparedAuguryMissionBoundary> {
    if (input.boundary.schema === 'cstar.augury_mission_boundary.v2') {
        return prepareAuguryMissionBoundaryV2(
            { ...input, boundary: input.boundary },
            prepareAuguryMissionBoundaryV1,
        );
    }
    return prepareAuguryMissionBoundaryV1({
        ...input,
        boundary: input.boundary,
    });
}

function missionCouncil(route: AuguryMissionRouteProjection): AuguryMissionCouncil {
    const intentCategory = reference(route.intent_category, 'augury_mission_council_invalid');
    const intent = reference(route.intent, 'augury_mission_council_invalid');
    const selection = reference(route.selection, 'augury_mission_council_invalid');
    const separator = selection.indexOf(':');
    if (separator < 1) fail('augury_mission_council_invalid');
    const tier = selection.slice(0, separator).trim();
    const selectionName = selection.slice(separator + 1).trim();
    if (!TIERS.has(tier) || !selectionName) fail('augury_mission_council_invalid');
    const mimirTargets = strings(route.mimir_targets, 'augury_mission_council_invalid');
    const expectedCandidates = scoreCouncilExpertCandidates({
        intent_category: intentCategory,
        intent,
        selection_tier: tier,
        selection_name: selectionName,
        mimirs_well: mimirTargets,
    }).slice(0, 3);
    if (expectedCandidates.length === 0
        || stableAuguryMissionJson(route.council_candidates) !== stableAuguryMissionJson(expectedCandidates)
        || new Set(expectedCandidates.map((candidate) => candidate.id)).size !== expectedCandidates.length) {
        fail('augury_mission_council_order_invalid');
    }
    const expertId = reference(route.expert, 'augury_mission_council_invalid');
    if (!DEFAULT_COUNCIL_EXPERT_IDS.includes(expertId as CouncilExpertId)
        && !expectedCandidates.some((candidate) => candidate.id === expertId)) {
        fail('augury_mission_council_invalid');
    }
    const protocol = getCouncilExpertProtocol(expertId as CouncilExpertId);
    if (expectedCandidates[0]!.id !== expertId
        || route.expert_label !== protocol.label
        || route.expert_lens !== protocol.lens
        || route.expert_signature_question !== protocol.signature_question
        || stableAuguryMissionJson(route.expert_guardrails)
            !== stableAuguryMissionJson(protocol.anti_behavior.slice(0, 3))) {
        fail('augury_mission_council_invalid');
    }
    return {
        intent_category: intentCategory,
        selection_tier: tier as AuguryMissionCouncil['selection_tier'],
        selection_name: selectionName,
        expert: {
            id: protocol.id,
            label: protocol.label,
            lens: protocol.lens,
            signature_question: protocol.signature_question,
        },
        candidates: expectedCandidates,
        guardrails: protocol.anti_behavior.slice(0, 3),
    };
}

function finalizeAuguryMissionBoundaryV1(input: {
    prepared: PreparedAuguryMissionBoundary;
    route: AuguryMissionRouteProjection;
}): AuguryMissionReceipt {
    const state = preparedBoundaries.get(input.prepared);
    if (!state) fail('augury_mission_verified_set_required');
    preparedBoundaries.delete(input.prepared);
    const payload: AuguryMissionReceiptPayload = {
        schema: AUGURY_MISSION_RECEIPT_SCHEMA,
        version: AUGURY_MISSION_RECEIPT_VERSION,
        authority_effect: 'read_projection_only',
        boundary_kind: 'new_current_exact_set_design_boundary',
        set_identity: state.setIdentity,
        repository: state.repository,
        mission_decision_id: state.missionDecisionId,
        proposed_parent_bead_id: state.parentBeadId,
        design: state.design,
        scope: state.scope,
        contained_target_paths: state.targets,
        council: missionCouncil(input.route),
        bead_plan: state.plan,
        ordered_plan_count: state.plan.length,
        ordered_plan_sha256: state.orderedPlanSha256,
        counts: state.counts,
    };
    const canonicalPayloadSha256 = hashAuguryMissionValue(payload);
    const receiptId = `augury-mission:${hashAuguryMissionValue({
        schema: 'cstar.augury_mission_receipt_id.v1',
        canonical_payload_sha256: canonicalPayloadSha256,
    })}`;
    const replay = state.replay;
    if (replay && (
        replay.canonical_payload_sha256 !== canonicalPayloadSha256
        || replay.receipt_id !== receiptId
        || replay.ordered_plan_count !== state.plan.length
        || replay.ordered_plan_sha256 !== state.orderedPlanSha256
    )) fail('augury_mission_replay_mismatch');
    return {
        ...payload,
        canonical_payload_sha256: canonicalPayloadSha256,
        receipt_id: receiptId,
    };
}

export function finalizeAuguryMissionBoundary(input: {
    prepared: PreparedAuguryMissionBoundary;
    route: AuguryMissionRouteProjection;
}): AnyAuguryMissionReceipt {
    if (ownsPreparedAuguryMissionBoundaryV2(input.prepared)) {
        return finalizeAuguryMissionBoundaryV2(input, finalizeAuguryMissionBoundaryV1);
    }
    return finalizeAuguryMissionBoundaryV1(input);
}
