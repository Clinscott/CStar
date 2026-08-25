import {
    AUGURY_MISSION_MAX_ITEMS,
    AUGURY_MISSION_RECEIPT_SCHEMA,
    AUGURY_MISSION_RECEIPT_VERSION,
    canonicalAuguryMissionReceiptJson,
    canonicalAuguryRepositoryRoot,
    canonicalAuguryTargetSet,
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AuguryMissionCounts,
    type AuguryMissionPlanItem,
    type AuguryMissionReceipt,
    type AuguryMissionReceiptPayload,
    type AnyAuguryMissionReceipt,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { validateAuguryMissionReceiptV2 } from './augury_mission_receipt_validation_v2.js';

const SHA256 = /^[a-f0-9]{64}$/;
const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const REPOSITORY_ID = /^repo:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const DECISION_ID = /^decision:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const BEAD_ID = /^bead:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const SPOKE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const LANES = new Set(['cos', 'forge', 'researcher', 'corvus_eye']);
const TIERS = new Set(['PRIME', 'SKILL', 'WEAVE', 'SPELL']);

export interface ValidatedAuguryMissionReceipt {
    readonly receipt: AnyAuguryMissionReceipt;
    readonly canonical_receipt_json: string;
    readonly canonical_receipt_sha256: string;
    readonly repository_root: string;
    readonly control_root: string;
    readonly hall_repo_id: string;
    readonly logical_repository_id: string;
    readonly ordered_bead_ids: readonly string[];
}

function fail(code: string): never {
    throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail('augury_mission_receipt_shape_invalid');
    }
}

function reference(value: unknown, code = 'augury_mission_receipt_shape_invalid'): string {
    if (typeof value !== 'string' || value !== value.trim() || !REFERENCE.test(value)) {
        fail(code);
    }
    return value;
}

function identifier(value: unknown, grammar: RegExp): string {
    const result = reference(value);
    if (!grammar.test(result)) fail('augury_mission_receipt_shape_invalid');
    return result;
}

function hash(value: unknown): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        fail('augury_mission_receipt_hash_invalid');
    }
    return value;
}

function positiveInteger(value: unknown, maximum?: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1
        || (maximum !== undefined && Number(value) > maximum)) {
        fail('augury_mission_receipt_shape_invalid');
    }
    return Number(value);
}

function nonnegativeInteger(value: unknown, maximum?: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0
        || (maximum !== undefined && Number(value) > maximum)) {
        fail('augury_mission_receipt_shape_invalid');
    }
    return Number(value);
}

function strings(value: unknown, allowEmpty = false): string[] {
    if (!Array.isArray(value) || value.length > AUGURY_MISSION_MAX_ITEMS
        || (!allowEmpty && value.length === 0)) {
        fail('augury_mission_receipt_shape_invalid');
    }
    const result = value.map((entry) => reference(entry));
    if (new Set(result).size !== result.length) {
        fail('augury_mission_receipt_shape_invalid');
    }
    return result;
}

function validateSetIdentity(value: unknown): void {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, [
        'schema', 'source', 'root_thread_id', 'set_turn_id', 'set_record_sha256',
        'set_record_set_sha256', 'set_record_count', 'set_first_timestamp',
        'set_timestamp', 'session_record_set_sha256', 'session_record_count',
    ]);
    if (value.schema !== 'cstar.verified_current_exact_root_set.v1'
        || value.source !== 'verified_codex_request_identity') {
        fail('augury_mission_receipt_shape_invalid');
    }
    reference(value.root_thread_id);
    reference(value.set_turn_id);
    hash(value.set_record_sha256);
    hash(value.set_record_set_sha256);
    positiveInteger(value.set_record_count);
    hash(value.session_record_set_sha256);
    positiveInteger(value.session_record_count);
    const first = Date.parse(reference(value.set_first_timestamp));
    const last = Date.parse(reference(value.set_timestamp));
    if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) {
        fail('augury_mission_receipt_shape_invalid');
    }
}

function validateRepository(
    value: unknown,
    expectedRoot: string,
): { root: string; logicalId: string } {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, ['schema', 'repository_id', 'root_path', 'identity_sha256']);
    if (value.schema !== 'cstar.repository_root_identity.v1') {
        fail('augury_mission_receipt_shape_invalid');
    }
    const logicalId = identifier(value.repository_id, REPOSITORY_ID);
    const root = canonicalAuguryRepositoryRoot(expectedRoot, value.root_path);
    const base = {
        schema: 'cstar.repository_root_identity.v1',
        repository_id: logicalId,
        root_path: root,
    };
    if (hash(value.identity_sha256) !== hashAuguryMissionValue(base)) {
        fail('augury_mission_receipt_repository_identity_mismatch');
    }
    return { root, logicalId };
}

function validateScope(value: unknown): void {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, ['schema', 'domain', 'subject', 'scope_id']);
    if (value.schema !== 'cstar.mission_scope.v1') {
        fail('augury_mission_receipt_shape_invalid');
    }
    const domain = value.domain;
    const subject = value.subject;
    const scopeId = value.scope_id;
    const valid = (domain === 'brain' && subject === 'CStar' && scopeId === 'brain:CStar')
        || (domain === 'estate' && subject === 'Corvus' && scopeId === 'estate:Corvus')
        || (domain === 'spoke' && typeof subject === 'string'
            && SPOKE_ID.test(subject) && scopeId === `spoke:${subject}`);
    if (!valid) fail('augury_mission_receipt_shape_invalid');
}

function validateCouncil(value: unknown): void {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, [
        'intent_category', 'selection_tier', 'selection_name',
        'expert', 'candidates', 'guardrails',
    ]);
    reference(value.intent_category);
    if (!TIERS.has(String(value.selection_tier))) fail('augury_mission_receipt_shape_invalid');
    reference(value.selection_name);
    if (!isRecord(value.expert)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value.expert, ['id', 'label', 'lens', 'signature_question']);
    const expertId = reference(value.expert.id);
    reference(value.expert.label);
    reference(value.expert.lens);
    reference(value.expert.signature_question);
    if (!Array.isArray(value.candidates) || value.candidates.length === 0
        || value.candidates.length > 3) fail('augury_mission_receipt_shape_invalid');
    const ids = new Set<string>();
    let priorScore = Number.POSITIVE_INFINITY;
    for (const candidate of value.candidates) {
        if (!isRecord(candidate)) fail('augury_mission_receipt_shape_invalid');
        exactKeys(candidate, ['id', 'label', 'score', 'reason']);
        const id = reference(candidate.id);
        reference(candidate.label);
        reference(candidate.reason);
        if (!Number.isSafeInteger(candidate.score) || Number(candidate.score) < 0
            || Number(candidate.score) > priorScore || ids.has(id)) {
            fail('augury_mission_receipt_shape_invalid');
        }
        ids.add(id);
        priorScore = Number(candidate.score);
    }
    if (value.candidates[0]?.id !== expertId) fail('augury_mission_receipt_shape_invalid');
    strings(value.guardrails);
}

function validatePlanItem(
    value: unknown,
    index: number,
    root: string,
    missionTargets: string[],
    parentBeadId: string,
    priorIds: Set<string>,
    targetOwners: Set<string>,
): AuguryMissionPlanItem {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, [
        'order', 'bead_id', 'dependencies', 'lane', 'target_paths',
        'acceptance_obligations', 'checker_obligations',
    ]);
    if (nonnegativeInteger(value.order, AUGURY_MISSION_MAX_ITEMS - 1) !== index) {
        fail('augury_mission_receipt_plan_order_invalid');
    }
    const beadId = identifier(value.bead_id, BEAD_ID);
    if (beadId === parentBeadId || priorIds.has(beadId)) {
        fail('augury_mission_receipt_topology_invalid');
    }
    const dependencies = strings(value.dependencies, true);
    for (const dependency of dependencies) {
        identifier(dependency, BEAD_ID);
        if (dependency !== parentBeadId && !priorIds.has(dependency)) {
            fail('augury_mission_receipt_topology_invalid');
        }
    }
    if (!LANES.has(String(value.lane))) fail('augury_mission_receipt_shape_invalid');
    const targets = canonicalAuguryTargetSet(
        root, value.target_paths, 'augury_mission_receipt_target_set_invalid',
    );
    if (stableAuguryMissionJson(targets) !== stableAuguryMissionJson(value.target_paths)) {
        fail('augury_mission_receipt_target_set_invalid');
    }
    for (const target of targets) {
        if (!missionTargets.includes(target) || targetOwners.has(target)) {
            fail('augury_mission_receipt_target_set_invalid');
        }
        targetOwners.add(target);
    }
    const acceptance = strings(value.acceptance_obligations);
    const checkers = strings(value.checker_obligations);
    priorIds.add(beadId);
    return {
        order: index,
        bead_id: beadId,
        dependencies,
        lane: value.lane as AuguryMissionPlanItem['lane'],
        target_paths: targets,
        acceptance_obligations: acceptance,
        checker_obligations: checkers,
    };
}

function validateCounts(value: unknown, expected: AuguryMissionCounts): void {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, [
        'target_count', 'bead_count', 'dependency_count',
        'acceptance_obligation_count', 'checker_obligation_count',
    ]);
    for (const [key, count] of Object.entries(expected)) {
        if (nonnegativeInteger(value[key], AUGURY_MISSION_MAX_ITEMS) !== count) {
            fail('augury_mission_receipt_counts_mismatch');
        }
    }
}

function validateAuguryMissionReceiptV1(
    value: unknown,
    expectedCodeRoot: string,
    expectedControlRoot: string = expectedCodeRoot,
): ValidatedAuguryMissionReceipt {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, [
        'schema', 'version', 'authority_effect', 'boundary_kind', 'set_identity',
        'repository', 'mission_decision_id', 'proposed_parent_bead_id', 'design',
        'scope', 'contained_target_paths', 'council', 'bead_plan',
        'ordered_plan_count', 'ordered_plan_sha256', 'counts',
        'canonical_payload_sha256', 'receipt_id',
    ]);
    if (value.schema !== AUGURY_MISSION_RECEIPT_SCHEMA
        || value.version !== AUGURY_MISSION_RECEIPT_VERSION
        || value.authority_effect !== 'read_projection_only'
        || value.boundary_kind !== 'new_current_exact_set_design_boundary') {
        fail('augury_mission_receipt_shape_invalid');
    }
    validateSetIdentity(value.set_identity);
    const repository = validateRepository(value.repository, expectedCodeRoot);
    const controlRoot = canonicalAuguryRepositoryRoot(
        expectedControlRoot, expectedControlRoot,
    );
    const missionDecisionId = identifier(value.mission_decision_id, DECISION_ID);
    const parentBeadId = identifier(value.proposed_parent_bead_id, BEAD_ID);
    if (!isRecord(value.design)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value.design, ['revision', 'sha256']);
    positiveInteger(value.design.revision, AUGURY_MISSION_MAX_ITEMS);
    hash(value.design.sha256);
    validateScope(value.scope);
    const missionTargets = canonicalAuguryTargetSet(
        repository.root, value.contained_target_paths,
        'augury_mission_receipt_target_set_invalid',
    );
    if (stableAuguryMissionJson(missionTargets)
        !== stableAuguryMissionJson(value.contained_target_paths)) {
        fail('augury_mission_receipt_target_set_invalid');
    }
    validateCouncil(value.council);
    if (!Array.isArray(value.bead_plan) || value.bead_plan.length === 0
        || value.bead_plan.length > AUGURY_MISSION_MAX_ITEMS) {
        fail('augury_mission_receipt_shape_invalid');
    }
    const priorIds = new Set<string>();
    const targetOwners = new Set<string>();
    const plan = value.bead_plan.map((item, index) => validatePlanItem(
        item, index, repository.root, missionTargets, parentBeadId, priorIds, targetOwners,
    ));
    if (targetOwners.size !== missionTargets.length) {
        fail('augury_mission_receipt_target_set_invalid');
    }
    const expectedCounts: AuguryMissionCounts = {
        target_count: missionTargets.length,
        bead_count: plan.length,
        dependency_count: plan.reduce((sum, item) => sum + item.dependencies.length, 0),
        acceptance_obligation_count: plan.reduce(
            (sum, item) => sum + item.acceptance_obligations.length, 0,
        ),
        checker_obligation_count: plan.reduce(
            (sum, item) => sum + item.checker_obligations.length, 0,
        ),
    };
    if (Object.values(expectedCounts).some((count) => count > AUGURY_MISSION_MAX_ITEMS)) {
        fail('augury_mission_receipt_counts_mismatch');
    }
    validateCounts(value.counts, expectedCounts);
    if (positiveInteger(value.ordered_plan_count, AUGURY_MISSION_MAX_ITEMS) !== plan.length) {
        fail('augury_mission_receipt_ordered_plan_mismatch');
    }
    const orderedPlanSha256 = hashAuguryMissionValue({
        schema: 'cstar.augury_ordered_bead_plan.v1',
        ordered_plan_count: plan.length,
        bead_plan: plan,
    });
    if (hash(value.ordered_plan_sha256) !== orderedPlanSha256) {
        fail('augury_mission_receipt_ordered_plan_mismatch');
    }
    const { canonical_payload_sha256: suppliedPayloadHash, receipt_id: suppliedId, ...payload }
        = value;
    const canonicalPayloadSha256 = hashAuguryMissionValue(
        payload as unknown as AuguryMissionReceiptPayload,
    );
    if (hash(suppliedPayloadHash) !== canonicalPayloadSha256) {
        fail('augury_mission_receipt_payload_mismatch');
    }
    const receiptId = `augury-mission:${hashAuguryMissionValue({
        schema: 'cstar.augury_mission_receipt_id.v1',
        canonical_payload_sha256: canonicalPayloadSha256,
    })}`;
    if (reference(suppliedId) !== receiptId) {
        fail('augury_mission_receipt_id_mismatch');
    }
    const receipt = value as unknown as AuguryMissionReceipt;
    const canonicalReceiptJson = canonicalAuguryMissionReceiptJson(receipt);
    return Object.freeze({
        receipt,
        canonical_receipt_json: canonicalReceiptJson,
        canonical_receipt_sha256: hashAuguryMissionValue(receipt),
        repository_root: repository.root,
        control_root: controlRoot,
        hall_repo_id: buildHallRepositoryId(normalizeHallPath(controlRoot)),
        logical_repository_id: repository.logicalId,
        ordered_bead_ids: Object.freeze(plan.map((item) => item.bead_id)),
    });
}

export function validateAuguryMissionReceipt(
    value: unknown,
    expectedCodeRoot: string,
    expectedControlRoot: string = expectedCodeRoot,
): ValidatedAuguryMissionReceipt {
    if (isRecord(value) && value.schema === 'cstar.augury_mission_receipt.v2') {
        return validateAuguryMissionReceiptV2(
            value,
            expectedCodeRoot,
            expectedControlRoot,
            validateAuguryMissionReceiptV1,
        );
    }
    return validateAuguryMissionReceiptV1(
        value, expectedCodeRoot, expectedControlRoot,
    );
}
