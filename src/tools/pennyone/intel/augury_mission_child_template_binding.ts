import type {
    AnyAuguryMissionPlanItem,
    AnyAuguryMissionReceipt,
    AuguryMissionPlanItemV2,
    AuguryMissionReceiptV2,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';

export function bindAuguryMissionChildTemplateMetadata(
    metadata: Record<string, unknown>,
    receipt: AnyAuguryMissionReceipt,
    item: AnyAuguryMissionPlanItem,
): Record<string, unknown> {
    if (receipt.schema !== 'cstar.augury_mission_receipt.v2') return metadata;
    const v2Receipt = receipt as AuguryMissionReceiptV2;
    const v2Item = item as AuguryMissionPlanItemV2;
    return {
        ...metadata,
        schema: 'cstar.augury_mission_child.v2',
        forge_child_request_template_binding: v2Item.forge_child_request_template === null
            ? null
            : {
                template: v2Item.forge_child_request_template,
                sha256: v2Item.forge_child_request_template_sha256,
                bytes: v2Item.forge_child_request_template_bytes,
            },
        augury_mission_receipt: {
            ...(metadata.augury_mission_receipt as Record<string, unknown>),
            forge_request_template_count: v2Receipt.forge_request_template_count,
            ordered_forge_request_templates_sha256:
                v2Receipt.ordered_forge_request_templates_sha256,
        },
    };
}
