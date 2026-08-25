import {
    AUGURY_MISSION_MAX_ITEMS,
    AUGURY_MISSION_RECEIPT_SCHEMA,
    AUGURY_MISSION_RECEIPT_SCHEMA_V2,
    AUGURY_MISSION_RECEIPT_VERSION,
    AUGURY_MISSION_RECEIPT_VERSION_V2,
    canonicalAuguryMissionReceiptJson,
    hashAuguryMissionValue,
    type AuguryMissionPlanItem,
    type AuguryMissionPlanItemV2,
    type AuguryMissionReceipt,
    type AuguryMissionReceiptPayload,
    type AuguryMissionReceiptPayloadV2,
    type AuguryMissionReceiptV2,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';
import {
    bindForgeChildRequestTemplate,
    hashOrderedForgeChildRequestTemplates,
} from '../../cstar-kernel-mcp/contracts/forge_child_request_template.js';

export interface V2CommonValidation {
    readonly repository_root: string;
    readonly control_root: string;
    readonly hall_repo_id: string;
    readonly logical_repository_id: string;
    readonly ordered_bead_ids: readonly string[];
}

export interface ValidatedAuguryMissionReceiptV2 extends V2CommonValidation {
    readonly receipt: AuguryMissionReceiptV2;
    readonly canonical_receipt_json: string;
    readonly canonical_receipt_sha256: string;
}

type ValidateV1 = (
    value: unknown,
    expectedCodeRoot: string,
    expectedControlRoot: string,
) => V2CommonValidation;

const SHA256 = /^[a-f0-9]{64}$/;
const V2_RECEIPT_KEYS = [
    'schema', 'version', 'authority_effect', 'boundary_kind', 'set_identity',
    'repository', 'mission_decision_id', 'proposed_parent_bead_id', 'design',
    'scope', 'contained_target_paths', 'council', 'bead_plan',
    'ordered_plan_count', 'ordered_plan_sha256',
    'forge_request_template_count', 'ordered_forge_request_templates_sha256',
    'counts', 'canonical_payload_sha256', 'receipt_id',
] as const;
const V2_PLAN_KEYS = [
    'order', 'bead_id', 'dependencies', 'lane', 'target_paths',
    'acceptance_obligations', 'checker_obligations',
    'forge_child_request_template', 'forge_child_request_template_sha256',
    'forge_child_request_template_bytes',
] as const;

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

function v1PlanItem(value: Record<string, unknown>): AuguryMissionPlanItem {
    return {
        order: value.order as number,
        bead_id: value.bead_id as string,
        dependencies: value.dependencies as string[],
        lane: value.lane as AuguryMissionPlanItem['lane'],
        target_paths: value.target_paths as string[],
        acceptance_obligations: value.acceptance_obligations as string[],
        checker_obligations: value.checker_obligations as string[],
    };
}

function v1ReceiptProjection(value: Record<string, unknown>): AuguryMissionReceipt {
    const plan = (value.bead_plan as Record<string, unknown>[]).map(v1PlanItem);
    const payload: AuguryMissionReceiptPayload = {
        schema: AUGURY_MISSION_RECEIPT_SCHEMA,
        version: AUGURY_MISSION_RECEIPT_VERSION,
        authority_effect: value.authority_effect as AuguryMissionReceiptPayload['authority_effect'],
        boundary_kind: value.boundary_kind as AuguryMissionReceiptPayload['boundary_kind'],
        set_identity: value.set_identity as AuguryMissionReceiptPayload['set_identity'],
        repository: value.repository as AuguryMissionReceiptPayload['repository'],
        mission_decision_id: value.mission_decision_id as string,
        proposed_parent_bead_id: value.proposed_parent_bead_id as string,
        design: value.design as AuguryMissionReceiptPayload['design'],
        scope: value.scope as AuguryMissionReceiptPayload['scope'],
        contained_target_paths: value.contained_target_paths as string[],
        council: value.council as AuguryMissionReceiptPayload['council'],
        bead_plan: plan,
        ordered_plan_count: value.ordered_plan_count as number,
        ordered_plan_sha256: hashAuguryMissionValue({
            schema: 'cstar.augury_ordered_bead_plan.v1',
            ordered_plan_count: plan.length,
            bead_plan: plan,
        }),
        counts: value.counts as AuguryMissionReceiptPayload['counts'],
    };
    const canonicalPayloadSha256 = hashAuguryMissionValue(payload);
    return {
        ...payload,
        canonical_payload_sha256: canonicalPayloadSha256,
        receipt_id: `augury-mission:${hashAuguryMissionValue({
            schema: 'cstar.augury_mission_receipt_id.v1',
            canonical_payload_sha256: canonicalPayloadSha256,
        })}`,
    };
}

function canonicalPlan(
    value: Record<string, unknown>,
    repositoryRoot: string,
): AuguryMissionPlanItemV2[] {
    return (value.bead_plan as Record<string, unknown>[]).map((raw) => {
        const common = v1PlanItem(raw);
        if (common.lane !== 'forge') {
            if (raw.forge_child_request_template !== null
                || raw.forge_child_request_template_sha256 !== null
                || raw.forge_child_request_template_bytes !== null) {
                fail('augury_mission_non_forge_template_forbidden');
            }
            return {
                ...common,
                forge_child_request_template: null,
                forge_child_request_template_sha256: null,
                forge_child_request_template_bytes: null,
            };
        }
        if (raw.forge_child_request_template === null
            || raw.forge_child_request_template_sha256 === null
            || raw.forge_child_request_template_bytes === null) {
            fail('augury_mission_forge_template_required');
        }
        const binding = bindForgeChildRequestTemplate({
            value: raw.forge_child_request_template,
            repository_root: repositoryRoot,
            plan_target_paths: common.target_paths,
            supplied_sha256: raw.forge_child_request_template_sha256,
            supplied_bytes: raw.forge_child_request_template_bytes,
        });
        return {
            ...common,
            forge_child_request_template: binding.template,
            forge_child_request_template_sha256: binding.sha256,
            forge_child_request_template_bytes: binding.bytes,
        };
    });
}

export function validateAuguryMissionReceiptV2(
    value: unknown,
    expectedCodeRoot: string,
    expectedControlRoot: string,
    validateV1: ValidateV1,
): ValidatedAuguryMissionReceiptV2 {
    if (!isRecord(value)) fail('augury_mission_receipt_shape_invalid');
    exactKeys(value, V2_RECEIPT_KEYS);
    if (value.schema !== AUGURY_MISSION_RECEIPT_SCHEMA_V2
        || value.version !== AUGURY_MISSION_RECEIPT_VERSION_V2
        || value.authority_effect !== 'read_projection_only'
        || value.boundary_kind !== 'new_current_exact_set_design_boundary'
        || !Array.isArray(value.bead_plan)
        || value.bead_plan.length === 0
        || value.bead_plan.length > AUGURY_MISSION_MAX_ITEMS) {
        fail('augury_mission_receipt_shape_invalid');
    }
    for (const item of value.bead_plan) {
        if (!isRecord(item)) fail('augury_mission_receipt_shape_invalid');
        exactKeys(item, V2_PLAN_KEYS);
    }
    const common = validateV1(
        v1ReceiptProjection(value), expectedCodeRoot, expectedControlRoot,
    );
    const plan = canonicalPlan(value, common.repository_root);
    const forgeBindings = plan.flatMap((item) => item.forge_child_request_template
        ? [{
            order: item.order,
            bead_id: item.bead_id,
            template: item.forge_child_request_template,
            template_sha256: item.forge_child_request_template_sha256!,
            template_bytes: item.forge_child_request_template_bytes!,
        }] : []);
    if (!Number.isSafeInteger(value.forge_request_template_count)
        || Number(value.forge_request_template_count) < 0
        || Number(value.forge_request_template_count) > AUGURY_MISSION_MAX_ITEMS
        || value.forge_request_template_count !== forgeBindings.length) {
        fail('augury_mission_receipt_template_count_mismatch');
    }
    const orderedTemplatesSha256 = hashOrderedForgeChildRequestTemplates(forgeBindings);
    if (value.ordered_forge_request_templates_sha256 !== orderedTemplatesSha256) {
        fail('augury_mission_receipt_ordered_templates_mismatch');
    }
    const orderedPlanSha256 = hashAuguryMissionValue({
        schema: 'cstar.augury_ordered_bead_plan.v2',
        ordered_plan_count: plan.length,
        bead_plan: plan,
    });
    if (value.ordered_plan_sha256 !== orderedPlanSha256) {
        fail('augury_mission_receipt_ordered_plan_mismatch');
    }
    const { canonical_payload_sha256: suppliedPayload, receipt_id: suppliedId, ...rawPayload }
        = value;
    const payload = rawPayload as unknown as AuguryMissionReceiptPayloadV2;
    const canonicalPayloadSha256 = hashAuguryMissionValue(payload);
    if (typeof suppliedPayload !== 'string' || !SHA256.test(suppliedPayload)
        || suppliedPayload !== canonicalPayloadSha256) {
        fail('augury_mission_receipt_payload_mismatch');
    }
    const receiptId = `augury-mission:${hashAuguryMissionValue({
        schema: 'cstar.augury_mission_receipt_id.v2',
        canonical_payload_sha256: canonicalPayloadSha256,
    })}`;
    if (suppliedId !== receiptId) fail('augury_mission_receipt_id_mismatch');
    const receipt = value as unknown as AuguryMissionReceiptV2;
    const canonicalReceiptJson = canonicalAuguryMissionReceiptJson(receipt);
    return Object.freeze({
        ...common,
        receipt,
        canonical_receipt_json: canonicalReceiptJson,
        canonical_receipt_sha256: hashAuguryMissionValue(receipt),
    });
}
