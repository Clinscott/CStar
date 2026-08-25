import type Database from 'better-sqlite3';

import {
    type AuguryMissionPlanItemV2,
    type AuguryMissionReceiptV2,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';
import type { ForgeChildRequestTemplateV1 } from
    '../../cstar-kernel-mcp/contracts/forge_child_request_template.js';
import type { ForgeRequestArgs } from '../../cstar-kernel-mcp/tools/forge_request.js';
import { assertForgeRequiredOutputsContained } from
    '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { gateSterlingResolution, type SterlingMandateAuditEntry } from
    '../../cstar-kernel-mcp/tools/sterling_resolution.js';
import type { HallBeadRecord } from '../../../types/hall.js';
import type {
    HallForgeMissionGrantRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    assertForgeMissionGrantActive,
    getForgeMissionGrantByRequest,
} from './forge_mission_grant_controller.js';
import {
    assertForgeMissionGrantScope,
} from './forge_mission_grant_scope.js';
import {
    assertAuguryV2Dependencies,
    assertAuguryV2ForgeRequestFrontier,
    assertAuguryV2PositiveValidation,
    isV2AuguryForgeChild,
    parseAuguryV2Record,
    type AuguryV2ChildRow,
} from './forge_augury_v2_frontier_guard.js';

export interface ForgeAdvancementProjection {
    receipt: AuguryMissionReceiptV2;
    current_item: AuguryMissionPlanItemV2;
    current_bead: AuguryV2ChildRow;
    next_item: AuguryMissionPlanItemV2 | null;
    outcome: 'successor_authorized' | 'domain_terminal' | 'batch_complete';
    grant: HallForgeMissionGrantRecord;
    request_args: ForgeRequestArgs | null;
    sterling: SterlingMandateAuditEntry;
}

function fail(code: string): never {
    throw new Error(code);
}

function deriveRequestArgs(
    receipt: AuguryMissionReceiptV2,
    item: AuguryMissionPlanItemV2,
    template: ForgeChildRequestTemplateV1,
    grant: HallForgeMissionGrantRecord,
    codeRoot: string,
): ForgeRequestArgs {
    const allowedActions = JSON.parse(grant.allowed_actions_json) as string[];
    if (template.requested_actions[0] !== grant.write_capability
        || template.requested_actions.some((action) => !allowedActions.includes(action))
        || grant.retry_derived_iteration_ceiling < 0
        || grant.total_provider_attempt_ceiling < 1
        || grant.paid_attempt_ceiling < 1) {
        fail('forge_advancement_template_grant_scope_mismatch');
    }
    const prohibitedActions = JSON.parse(grant.prohibited_actions_json) as string[];
    const args: ForgeRequestArgs = {
        bead_id: item.bead_id,
        decision_id: `${receipt.mission_decision_id}:batch-${item.order + 1}`,
        source_callback_thread_id: grant.root_thread_id,
        objective: template.objective,
        prompt: template.prompt ?? undefined,
        target_paths: item.target_paths,
        required_output_paths: template.required_output_paths,
        system_under_test: template.system_under_test ?? undefined,
        scope: receipt.scope.scope_id,
        authority_lane: template.authority_lane,
        required_metrics: template.required_metrics.map((metric) => ({
            name: metric.name,
            threshold: metric.threshold,
            acceptance_rule: metric.acceptance_rule ?? undefined,
            unit: metric.unit ?? undefined,
        })),
        artifact_expectations: template.artifact_expectations,
        prohibited_actions: prohibitedActions,
        requested_actions: template.requested_actions,
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
        },
        live_source_policy: 'synthetic_only; live source collection forbidden',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: template.callback_expected_packet,
            callback_required: true,
            callback_thread_id: grant.root_thread_id,
        },
        package_locks: template.package_locks,
        execution_adapter_ref: grant.adapter_ref,
    };
    if (grant.write_capability === 'project_files') {
        assertForgeRequiredOutputsContained(
            codeRoot, args.target_paths, args.required_output_paths,
        );
    }
    return args;
}

export function projectForgePostValidationAdvancement(input: {
    db: Database.Database;
    control_root: string;
    code_root: string;
    request: HallForgeRequestRecord;
    execution_receipt_id: string;
    validation_id: string;
    now: number;
}): ForgeAdvancementProjection {
    const frontier = assertAuguryV2ForgeRequestFrontier({
        db: input.db,
        code_root: input.code_root,
        control_root: input.control_root,
        bead_id: input.request.bead_id,
        decision_id: input.request.decision_id,
    });
    if (!frontier) fail('forge_advancement_augury_v2_required');
    const {
        receipt,
        item: currentItem,
        child: currentBead,
        children,
    } = frontier;
    const grant = getForgeMissionGrantByRequest(input.db, input.request.request_id);
    if (!grant) fail('forge_advancement_mission_grant_missing');
    const attempt = input.db.prepare(`
        SELECT request_id, status, result_status, validation_id,
               validation_verdict, validation_authority
        FROM hall_forge_attempts WHERE execution_receipt_id = ?
    `).get(input.execution_receipt_id) as Record<string, unknown> | undefined;
    if (!attempt || attempt.request_id !== input.request.request_id
        || attempt.status !== 'SUCCEEDED'
        || attempt.result_status !== 'VALIDATION_ACCEPTED'
        || attempt.validation_id !== input.validation_id
        || attempt.validation_authority !== 'verified_v2'
        || !['ACCEPTED', 'SUCCESS', 'PASS', 'PASSED'].includes(
            String(attempt.validation_verdict).toUpperCase(),
        )
        || input.request.status !== 'SUCCEEDED') {
        fail('forge_advancement_validation_finalization_invalid');
    }
    assertForgeMissionGrantScope(input.db, grant, input.request);
    if (grant.revocation_state !== 'ACTIVE' || grant.status === 'REVOKED') {
        fail('forge_mission_grant_revoked');
    }
    if (grant.expires_at <= input.now || grant.status === 'EXPIRED') {
        fail('forge_mission_grant_expired');
    }
    assertAuguryV2PositiveValidation(input.db, currentBead, input.validation_id);
    const currentTemplate = currentItem.forge_child_request_template;
    if (!currentTemplate) fail('forge_advancement_template_missing');
    const sterling = gateSterlingResolution({
        bead: {
            bead_id: currentBead.bead_id,
            repo_id: currentBead.repo_id,
            rationale: currentBead.rationale,
            status: currentBead.status as HallBeadRecord['status'],
            target_path: currentBead.target_path,
            baseline_scores: {},
            metadata: parseAuguryV2Record(
                currentBead.metadata_json,
                'forge_advancement_child_metadata_invalid',
            ),
            created_at: currentBead.created_at,
            updated_at: Number(currentBead.updated_at),
        } as HallBeadRecord,
        evidence: {
            lore_paths: currentTemplate.lore_paths,
            isolation_paths: currentTemplate.isolation_paths,
            audit: { validation_id: input.validation_id },
        },
        resolved_validation_id: input.validation_id,
        hub_root: input.control_root,
        evidence_root: input.code_root,
        actor: 'forge-post-validation-advancement',
        now: input.now,
    });
    const nextItem = receipt.bead_plan.slice(currentItem.order + 1)
        .find((item) => children.get(item.bead_id)?.status !== 'RESOLVED') ?? null;
    if (!nextItem) {
        return {
            receipt, current_item: currentItem, current_bead: currentBead,
            next_item: null, outcome: 'batch_complete', grant,
            request_args: null, sterling,
        };
    }
    assertAuguryV2Dependencies({
        db: input.db,
        receipt,
        item: nextItem,
        children,
        code_root: input.code_root,
        control_root: input.control_root,
        accepted_current: currentItem.bead_id,
    });
    if (nextItem.lane !== 'forge') {
        return {
            receipt, current_item: currentItem, current_bead: currentBead,
            next_item: nextItem, outcome: 'domain_terminal', grant,
            request_args: null, sterling,
        };
    }
    if (!nextItem.forge_child_request_template) fail('forge_advancement_template_missing');
    assertForgeMissionGrantActive(input.db, grant, input.now);
    return {
        receipt, current_item: currentItem, current_bead: currentBead,
        next_item: nextItem, outcome: 'successor_authorized', grant,
        request_args: deriveRequestArgs(
            receipt, nextItem, nextItem.forge_child_request_template, grant, input.code_root,
        ),
        sterling,
    };
}

export { isV2AuguryForgeChild };
