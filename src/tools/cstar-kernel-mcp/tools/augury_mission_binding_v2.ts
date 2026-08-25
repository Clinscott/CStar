import {
    AUGURY_MISSION_RECEIPT_SCHEMA_V2,
    AUGURY_MISSION_RECEIPT_VERSION_V2,
    canonicalAuguryRepositoryRoot,
    canonicalAuguryTargetSet,
    hashAuguryMissionValue,
    type AuguryMissionBoundaryInput,
    type AuguryMissionBoundaryInputV2,
    type AuguryMissionPlanItemInput,
    type AuguryMissionPlanItemV2,
    type AuguryMissionReceipt,
    type AuguryMissionReceiptPayloadV2,
    type AuguryMissionReceiptV2,
} from '../contracts/augury_mission.js';
import {
    bindForgeChildRequestTemplate,
    hashOrderedForgeChildRequestTemplates,
    type ForgeChildRequestTemplateBinding,
} from '../contracts/forge_child_request_template.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import type { PreparedAuguryMissionBoundary } from './augury_mission_binding.js';
import type { AuguryMissionV2SetBinding } from './forge_set_manifest_signal.js';

interface V1PrepareInput {
    boundary: AuguryMissionBoundaryInput;
    expected_root: string;
    request_context?: McpRequestContext;
    top_level_target_paths?: string[];
    top_level_scope?: string;
    now?: number;
    natural_binding?: AuguryMissionV2SetBinding;
}

type PrepareV1 = (input: V1PrepareInput) => Promise<PreparedAuguryMissionBoundary>;
type FinalizeV1 = (input: {
    prepared: PreparedAuguryMissionBoundary;
    route: AuguryMissionRouteProjection;
}) => AuguryMissionReceipt;

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

interface PreparedV2State {
    readonly v1_prepared: PreparedAuguryMissionBoundary;
    readonly plan_bindings: readonly (ForgeChildRequestTemplateBinding | null)[];
    readonly replay?: AuguryMissionBoundaryInputV2['replay'];
}

const preparedV2 = new WeakMap<object, PreparedV2State>();

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

function v1PlanItem(value: AuguryMissionBoundaryInputV2['bead_plan'][number]):
AuguryMissionPlanItemInput {
    return {
        bead_id: value.bead_id,
        dependencies: value.dependencies,
        lane: value.lane,
        target_paths: value.target_paths,
        acceptance_obligations: value.acceptance_obligations,
        checker_obligations: value.checker_obligations,
    };
}

function v1Projection(boundary: AuguryMissionBoundaryInputV2): AuguryMissionBoundaryInput {
    return {
        schema: 'cstar.augury_mission_boundary.v1',
        repository: boundary.repository,
        mission_decision_id: boundary.mission_decision_id,
        proposed_parent_bead_id: boundary.proposed_parent_bead_id,
        design: boundary.design,
        scope: boundary.scope,
        contained_target_paths: boundary.contained_target_paths,
        bead_plan: boundary.bead_plan.map(v1PlanItem),
    };
}

function validateReplay(value: unknown): AuguryMissionBoundaryInputV2['replay'] {
    if (!isRecord(value) || !exactKeys(value, [
        'canonical_payload_sha256', 'receipt_id',
        'ordered_plan_count', 'ordered_plan_sha256',
        'forge_request_template_count', 'ordered_forge_request_templates_sha256',
    ])) fail('augury_mission_replay_invalid');
    const sha256 = /^[a-f0-9]{64}$/;
    if (!sha256.test(String(value.canonical_payload_sha256))
        || !sha256.test(String(value.ordered_plan_sha256))
        || !sha256.test(String(value.ordered_forge_request_templates_sha256))
        || !Number.isSafeInteger(value.ordered_plan_count)
        || !Number.isSafeInteger(value.forge_request_template_count)) {
        fail('augury_mission_replay_invalid');
    }
    return value as unknown as AuguryMissionBoundaryInputV2['replay'];
}

export async function prepareAuguryMissionBoundaryV2(
    input: {
        boundary: AuguryMissionBoundaryInputV2;
        expected_root: string;
        request_context?: McpRequestContext;
        top_level_target_paths?: string[];
        top_level_scope?: string;
        now?: number;
    },
    prepareV1: PrepareV1,
): Promise<PreparedAuguryMissionBoundary> {
    const boundary = input.boundary;
    if (!isRecord(boundary) || !exactKeys(boundary, [
        'schema', 'version', 'repository', 'mission_decision_id',
        'proposed_parent_bead_id', 'design', 'scope', 'contained_target_paths',
        'bead_plan', ...(boundary.replay === undefined ? [] : ['replay']),
    ]) || boundary.schema !== 'cstar.augury_mission_boundary.v2'
        || boundary.version !== 2) fail('augury_mission_boundary_incomplete');
    if (!Array.isArray(boundary.bead_plan)) fail('augury_mission_plan_invalid');
    for (const item of boundary.bead_plan) {
        if (!isRecord(item) || !exactKeys(item, [
            'bead_id', 'dependencies', 'lane', 'target_paths',
            'acceptance_obligations', 'checker_obligations',
            'forge_child_request_template', 'forge_child_request_template_sha256',
            'forge_child_request_template_bytes',
        ])) fail('augury_mission_plan_invalid');
    }
    const naturalBinding = boundary.scope.domain === 'brain'
        && boundary.scope.subject === 'CStar'
        ? {
            schema: 'cstar.augury_mission_binding.v2' as const,
            version: 2 as const,
            scope_id: 'brain:CStar' as const,
            mission_decision_id: boundary.mission_decision_id,
            proposed_parent_bead_id: boundary.proposed_parent_bead_id,
            design_sha256: boundary.design.sha256,
            target_set_sha256: hashAuguryMissionValue({
                schema: 'cstar.augury_target_set.v1',
                target_paths: canonicalAuguryTargetSet(
                    canonicalAuguryRepositoryRoot(
                        input.expected_root, boundary.repository.root_path,
                    ),
                    boundary.contained_target_paths,
                ),
            }),
        } satisfies AuguryMissionV2SetBinding
        : undefined;
    const v1Prepared = await prepareV1({
        ...input,
        boundary: v1Projection(boundary),
        natural_binding: naturalBinding,
    });
    const root = canonicalAuguryRepositoryRoot(
        input.expected_root, boundary.repository.root_path,
    );
    const bindings = boundary.bead_plan.map((item) => {
        const forge = item.lane === 'forge';
        if (!forge) {
            if (item.forge_child_request_template !== null
                || item.forge_child_request_template_sha256 !== null
                || item.forge_child_request_template_bytes !== null) {
                fail('augury_mission_non_forge_template_forbidden');
            }
            return null;
        }
        if (item.forge_child_request_template === null
            || item.forge_child_request_template_sha256 === null
            || item.forge_child_request_template_bytes === null) {
            fail('augury_mission_forge_template_required');
        }
        const targets = canonicalAuguryTargetSet(
            root, item.target_paths, 'augury_mission_plan_target_invalid',
        );
        return bindForgeChildRequestTemplate({
            value: item.forge_child_request_template,
            repository_root: root,
            plan_target_paths: targets,
            supplied_sha256: item.forge_child_request_template_sha256,
            supplied_bytes: item.forge_child_request_template_bytes,
        });
    });
    const replay = boundary.replay === undefined ? undefined : validateReplay(boundary.replay);
    const token = Object.freeze({
        target_paths: v1Prepared.target_paths,
        scope_id: v1Prepared.scope_id,
    });
    preparedV2.set(token, {
        v1_prepared: v1Prepared,
        plan_bindings: Object.freeze(bindings),
        replay,
    });
    return token;
}

export function ownsPreparedAuguryMissionBoundaryV2(
    prepared: PreparedAuguryMissionBoundary,
): boolean {
    return preparedV2.has(prepared);
}

function v2Plan(
    receipt: AuguryMissionReceipt,
    bindings: readonly (ForgeChildRequestTemplateBinding | null)[],
): AuguryMissionPlanItemV2[] {
    return receipt.bead_plan.map((item, index) => {
        const binding = bindings[index];
        return {
            ...item,
            forge_child_request_template: binding?.template ?? null,
            forge_child_request_template_sha256: binding?.sha256 ?? null,
            forge_child_request_template_bytes: binding?.bytes ?? null,
        };
    });
}

export function finalizeAuguryMissionBoundaryV2(
    input: {
        prepared: PreparedAuguryMissionBoundary;
        route: AuguryMissionRouteProjection;
    },
    finalizeV1: FinalizeV1,
): AuguryMissionReceiptV2 {
    const state = preparedV2.get(input.prepared);
    if (!state) fail('augury_mission_verified_set_required');
    preparedV2.delete(input.prepared);
    const v1 = finalizeV1({ prepared: state.v1_prepared, route: input.route });
    const plan = v2Plan(v1, state.plan_bindings);
    const forgeBindings = plan.flatMap((item) => item.forge_child_request_template
        ? [{
            order: item.order,
            bead_id: item.bead_id,
            template: item.forge_child_request_template,
            template_sha256: item.forge_child_request_template_sha256!,
            template_bytes: item.forge_child_request_template_bytes!,
        }] : []);
    const orderedTemplatesSha256 = hashOrderedForgeChildRequestTemplates(forgeBindings);
    const payload: AuguryMissionReceiptPayloadV2 = {
        schema: AUGURY_MISSION_RECEIPT_SCHEMA_V2,
        version: AUGURY_MISSION_RECEIPT_VERSION_V2,
        authority_effect: v1.authority_effect,
        boundary_kind: v1.boundary_kind,
        set_identity: v1.set_identity,
        repository: v1.repository,
        mission_decision_id: v1.mission_decision_id,
        proposed_parent_bead_id: v1.proposed_parent_bead_id,
        design: v1.design,
        scope: v1.scope,
        contained_target_paths: v1.contained_target_paths,
        council: v1.council,
        bead_plan: plan,
        ordered_plan_count: plan.length,
        ordered_plan_sha256: hashAuguryMissionValue({
            schema: 'cstar.augury_ordered_bead_plan.v2',
            ordered_plan_count: plan.length,
            bead_plan: plan,
        }),
        forge_request_template_count: forgeBindings.length,
        ordered_forge_request_templates_sha256: orderedTemplatesSha256,
        counts: v1.counts,
    };
    const canonicalPayloadSha256 = hashAuguryMissionValue(payload);
    const receiptId = `augury-mission:${hashAuguryMissionValue({
        schema: 'cstar.augury_mission_receipt_id.v2',
        canonical_payload_sha256: canonicalPayloadSha256,
    })}`;
    const replay = state.replay;
    if (replay && (
        replay.canonical_payload_sha256 !== canonicalPayloadSha256
        || replay.receipt_id !== receiptId
        || replay.ordered_plan_count !== plan.length
        || replay.ordered_plan_sha256 !== payload.ordered_plan_sha256
        || replay.forge_request_template_count !== forgeBindings.length
        || replay.ordered_forge_request_templates_sha256 !== orderedTemplatesSha256
    )) fail('augury_mission_replay_mismatch');
    return {
        ...payload,
        canonical_payload_sha256: canonicalPayloadSha256,
        receipt_id: receiptId,
    };
}
