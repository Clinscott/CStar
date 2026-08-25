import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ForgeChildRequestTemplateV1 } from './forge_child_request_template.js';

export const AUGURY_MISSION_RECEIPT_SCHEMA = 'cstar.augury_mission_receipt.v1' as const;
export const AUGURY_MISSION_RECEIPT_VERSION = 1 as const;
export const AUGURY_MISSION_RECEIPT_SCHEMA_V2 = 'cstar.augury_mission_receipt.v2' as const;
export const AUGURY_MISSION_RECEIPT_VERSION_V2 = 2 as const;
export const AUGURY_MISSION_MAX_ITEMS = 64;

const TARGET_REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;

function targetFail(code: string): never {
    throw new Error(code);
}

function targetReference(value: unknown, code: string): string {
    if (typeof value !== 'string' || value !== value.trim()
        || !TARGET_REFERENCE.test(value)) targetFail(code);
    return value;
}

function isContained(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!path.isAbsolute(relative)
        && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function canonicalAuguryRepositoryRoot(
    expectedRoot: string,
    suppliedRoot: unknown,
): string {
    const supplied = targetReference(
        suppliedRoot, 'augury_mission_repository_identity_invalid',
    );
    if (!path.isAbsolute(supplied) || path.resolve(supplied) !== supplied) {
        targetFail('augury_mission_repository_identity_invalid');
    }
    let expectedReal: string;
    let suppliedReal: string;
    try {
        expectedReal = fs.realpathSync.native(path.resolve(expectedRoot));
        suppliedReal = fs.realpathSync.native(supplied);
    } catch {
        targetFail('augury_mission_repository_root_uninspectable');
    }
    if (supplied !== suppliedReal) {
        targetFail('augury_mission_repository_root_noncanonical');
    }
    if (suppliedReal !== expectedReal) targetFail('augury_mission_root_mismatch');
    return suppliedReal;
}

function exactChild(parent: string, segment: string): string | null {
    let names: string[];
    try {
        names = fs.readdirSync(parent);
    } catch {
        targetFail('augury_mission_target_ancestor_uninspectable');
    }
    if (names.includes(segment)) return path.join(parent, segment);
    const folded = segment.toLocaleLowerCase('en-US');
    if (names.some((name) => name.toLocaleLowerCase('en-US') === folded)) {
        targetFail('augury_mission_target_case_drift');
    }
    return null;
}

function canonicalAuguryTarget(root: string, value: unknown): string {
    const supplied = targetReference(value, 'augury_mission_target_paths_invalid');
    if (supplied.includes('\\')) targetFail('augury_mission_target_paths_invalid');
    const lexical = path.resolve(path.isAbsolute(supplied) ? supplied : path.join(root, supplied));
    if (lexical === root || !isContained(lexical, root)) {
        targetFail('augury_mission_target_outside_root');
    }
    const segments = path.relative(root, lexical).split(path.sep);
    let current = root;
    let finalPath = root;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index]!;
        if (!segment || segment === '.' || segment === '..') {
            targetFail('augury_mission_target_paths_invalid');
        }
        const child = exactChild(current, segment);
        if (!child) {
            finalPath = path.join(current, ...segments.slice(index));
            break;
        }
        let realChild: string;
        try {
            realChild = fs.realpathSync.native(child);
        } catch {
            targetFail('augury_mission_target_ancestor_uninspectable');
        }
        if (!isContained(realChild, root)) {
            targetFail('augury_mission_target_symlink_escape');
        }
        if (index < segments.length - 1) {
            let stat: fs.Stats;
            try {
                stat = fs.statSync(realChild);
            } catch {
                targetFail('augury_mission_target_ancestor_uninspectable');
            }
            if (!stat.isDirectory()) {
                targetFail('augury_mission_target_ancestor_not_directory');
            }
        }
        current = realChild;
        finalPath = realChild;
    }
    const relative = path.relative(root, finalPath).split(path.sep).join('/');
    if (!relative || relative === '..' || relative.startsWith('../')) {
        targetFail('augury_mission_target_outside_root');
    }
    return relative;
}

export function canonicalAuguryTargetSet(
    root: string,
    value: unknown,
    code = 'augury_mission_target_paths_invalid',
): string[] {
    if (!Array.isArray(value) || value.length === 0
        || value.length > AUGURY_MISSION_MAX_ITEMS) targetFail(code);
    const targets = value.map((entry) => canonicalAuguryTarget(root, entry))
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    if (new Set(targets).size !== targets.length) targetFail(code);
    return targets;
}

export type AuguryMissionScope =
    | { schema: 'cstar.mission_scope.v1'; domain: 'brain'; subject: 'CStar' }
    | { schema: 'cstar.mission_scope.v1'; domain: 'estate'; subject: 'Corvus' }
    | { schema: 'cstar.mission_scope.v1'; domain: 'spoke'; subject: string };

export type AuguryMissionLane = 'cos' | 'forge' | 'researcher' | 'corvus_eye';

export interface AuguryRepositoryIdentityInput {
    schema: 'cstar.repository_root_identity.v1';
    repository_id: string;
    root_path: string;
}

export interface AuguryDesignIdentity {
    revision: number;
    sha256: string;
}

export interface AuguryMissionPlanItemInput {
    bead_id: string;
    dependencies: string[];
    lane: AuguryMissionLane;
    target_paths: string[];
    acceptance_obligations: string[];
    checker_obligations: string[];
}

export interface AuguryMissionPlanItemInputV2 extends AuguryMissionPlanItemInput {
    forge_child_request_template: ForgeChildRequestTemplateV1 | null;
    forge_child_request_template_sha256: string | null;
    forge_child_request_template_bytes: number | null;
}

export interface AuguryMissionReplayBinding {
    canonical_payload_sha256: string;
    receipt_id: string;
    ordered_plan_count: number;
    ordered_plan_sha256: string;
}

export interface AuguryMissionReplayBindingV2 extends AuguryMissionReplayBinding {
    forge_request_template_count: number;
    ordered_forge_request_templates_sha256: string;
}

export interface AuguryMissionBoundaryInput {
    schema: 'cstar.augury_mission_boundary.v1';
    repository: AuguryRepositoryIdentityInput;
    mission_decision_id: string;
    proposed_parent_bead_id: string;
    design: AuguryDesignIdentity;
    scope: AuguryMissionScope;
    contained_target_paths: string[];
    bead_plan: AuguryMissionPlanItemInput[];
    replay?: AuguryMissionReplayBinding;
}

export interface AuguryMissionBoundaryInputV2 {
    schema: 'cstar.augury_mission_boundary.v2';
    version: 2;
    repository: AuguryRepositoryIdentityInput;
    mission_decision_id: string;
    proposed_parent_bead_id: string;
    design: AuguryDesignIdentity;
    scope: AuguryMissionScope;
    contained_target_paths: string[];
    bead_plan: AuguryMissionPlanItemInputV2[];
    replay?: AuguryMissionReplayBindingV2;
}

export type AnyAuguryMissionBoundaryInput =
    | AuguryMissionBoundaryInput
    | AuguryMissionBoundaryInputV2;

export interface AuguryCouncilCandidate {
    id: string;
    label: string;
    score: number;
    reason: string;
}

export interface AuguryMissionCouncil {
    intent_category: string;
    selection_tier: 'PRIME' | 'SKILL' | 'WEAVE' | 'SPELL';
    selection_name: string;
    expert: {
        id: string;
        label: string;
        lens: string;
        signature_question: string;
    };
    candidates: AuguryCouncilCandidate[];
    guardrails: string[];
}

export interface AuguryVerifiedSetIdentity {
    schema: 'cstar.verified_current_exact_root_set.v1';
    source: 'verified_codex_request_identity';
    root_thread_id: string;
    set_turn_id: string;
    set_record_sha256: string;
    set_record_set_sha256: string;
    set_record_count: number;
    set_first_timestamp: string;
    set_timestamp: string;
    session_record_set_sha256: string;
    session_record_count: number;
}

export interface AuguryMissionPlanItem extends AuguryMissionPlanItemInput {
    order: number;
}

export interface AuguryMissionPlanItemV2 extends AuguryMissionPlanItemInputV2 {
    order: number;
}

export type AnyAuguryMissionPlanItem =
    | AuguryMissionPlanItem
    | AuguryMissionPlanItemV2;

export interface AuguryMissionCounts {
    target_count: number;
    bead_count: number;
    dependency_count: number;
    acceptance_obligation_count: number;
    checker_obligation_count: number;
}

export interface AuguryMissionReceiptPayload {
    schema: typeof AUGURY_MISSION_RECEIPT_SCHEMA;
    version: typeof AUGURY_MISSION_RECEIPT_VERSION;
    authority_effect: 'read_projection_only';
    boundary_kind: 'new_current_exact_set_design_boundary';
    set_identity: AuguryVerifiedSetIdentity;
    repository: AuguryRepositoryIdentityInput & { identity_sha256: string };
    mission_decision_id: string;
    proposed_parent_bead_id: string;
    design: AuguryDesignIdentity;
    scope: AuguryMissionScope & { scope_id: string };
    contained_target_paths: string[];
    council: AuguryMissionCouncil;
    bead_plan: AuguryMissionPlanItem[];
    ordered_plan_count: number;
    ordered_plan_sha256: string;
    counts: AuguryMissionCounts;
}

export interface AuguryMissionReceipt extends AuguryMissionReceiptPayload {
    canonical_payload_sha256: string;
    receipt_id: string;
}

export interface AuguryMissionReceiptPayloadV2 extends Omit<
    AuguryMissionReceiptPayload,
    'schema' | 'version' | 'bead_plan' | 'ordered_plan_sha256'
> {
    schema: typeof AUGURY_MISSION_RECEIPT_SCHEMA_V2;
    version: typeof AUGURY_MISSION_RECEIPT_VERSION_V2;
    bead_plan: AuguryMissionPlanItemV2[];
    ordered_plan_sha256: string;
    forge_request_template_count: number;
    ordered_forge_request_templates_sha256: string;
}

export interface AuguryMissionReceiptV2 extends AuguryMissionReceiptPayloadV2 {
    canonical_payload_sha256: string;
    receipt_id: string;
}

export type AnyAuguryMissionReceipt =
    | AuguryMissionReceipt
    | AuguryMissionReceiptV2;

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function stableAuguryMissionJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

export function hashAuguryMissionValue(value: unknown): string {
    return createHash('sha256')
        .update(stableAuguryMissionJson(value), 'utf-8')
        .digest('hex');
}

export function canonicalAuguryMissionReceiptJson(receipt: AnyAuguryMissionReceipt): string {
    return stableAuguryMissionJson(receipt);
}
