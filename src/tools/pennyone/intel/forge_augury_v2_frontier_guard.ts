import type Database from 'better-sqlite3';

import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AuguryMissionPlanItemV2,
    type AuguryMissionReceiptV2,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';
import { gateSterlingResolution } from
    '../../cstar-kernel-mcp/tools/sterling_resolution.js';
import type { HallBeadRecord } from '../../../types/hall.js';
import {
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    isValidationEvidenceManifestV3StructurallyValid,
    type HallValidationEvidenceManifest,
} from '../../../types/validation_evidence.js';
import { validateAuguryMissionReceipt } from './augury_mission_receipt_validation.js';
import { bindAuguryMissionChildTemplateMetadata } from
    './augury_mission_child_template_binding.js';
import { readForgeMissionGrantEnvelope } from './forge_mission_grant_envelope.js';
import { assertForgeValidationManifestCurrent } from './forge_validation_controller.js';

export interface AuguryV2ChildRow extends Record<string, unknown> {
    bead_id: string;
    repo_id: string;
    target_ref: string;
    target_path: string;
    rationale: string;
    status: string;
    metadata_json: string;
    resolved_validation_id: string | null;
    created_at: number;
}

export interface AuguryV2ForgeFrontier {
    receipt: AuguryMissionReceiptV2;
    item: AuguryMissionPlanItemV2;
    child: AuguryV2ChildRow;
    children: Map<string, AuguryV2ChildRow>;
}

function fail(code: string): never {
    throw new Error(code);
}

export function parseAuguryV2Record(
    value: unknown,
    code: string,
): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value)) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(code);
        return parsed as Record<string, unknown>;
    } catch {
        fail(code);
    }
}

function tablePresent(db: Database.Database, name: string): boolean {
    return db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).pluck().get(name) === 1;
}

function expectedChildMetadata(
    receipt: AuguryMissionReceiptV2,
    item: AuguryMissionPlanItemV2,
    logicalRepositoryId: string,
): Record<string, unknown> {
    return bindAuguryMissionChildTemplateMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.augury_mission_child.v1',
        parent_bead_id: receipt.proposed_parent_bead_id,
        order: item.order + 1,
        depends_on: item.dependencies,
        lane: item.lane,
        owning_lane: {
            cos: 'CoS', forge: 'Forge', researcher: 'Researcher', corvus_eye: 'CorvusEye',
        }[item.lane],
        design_sha256: receipt.design.sha256,
        target_paths: item.target_paths,
        acceptance_obligations: item.acceptance_obligations,
        checker_obligations: item.checker_obligations,
        augury_mission_receipt: {
            schema: receipt.schema,
            receipt_id: receipt.receipt_id,
            canonical_payload_sha256: receipt.canonical_payload_sha256,
            ordered_plan_sha256: receipt.ordered_plan_sha256,
            logical_repository_id: logicalRepositoryId,
            mission_decision_id: receipt.mission_decision_id,
        },
        mutation_request_identity: {
            source: 'codex_request_meta',
            thread_id: receipt.set_identity.root_thread_id,
            turn_id: receipt.set_identity.set_turn_id,
            turn_record_set_sha256: receipt.set_identity.set_record_set_sha256,
        },
    }, receipt, item);
}

function assertEdges(db: Database.Database, receipt: AuguryMissionReceiptV2): void {
    const rows = db.prepare(`
        SELECT * FROM hall_augury_mission_dependency_edges
        WHERE receipt_id = ? ORDER BY child_bead_id, dependency_order
    `).all(receipt.receipt_id) as Array<Record<string, unknown>>;
    const expected = receipt.bead_plan.flatMap((item) =>
        item.dependencies.map((dependency, index) => {
            const parent = dependency === receipt.proposed_parent_bead_id;
            const edge = {
                receipt_id: receipt.receipt_id,
                child_bead_id: item.bead_id,
                dependency_order: index + 1,
                dependency_bead_id: dependency,
                dependency_kind: parent ? 'parent_root' : 'receipt_child',
                parent_dependency_bead_id: parent ? dependency : null,
                child_dependency_bead_id: parent ? null : dependency,
            };
            return {
                ...edge,
                edge_sha256: hashAuguryMissionValue(edge),
                edge_json: stableAuguryMissionJson(edge),
            };
        })).sort((left, right) =>
        left.child_bead_id.localeCompare(right.child_bead_id)
        || left.dependency_order - right.dependency_order);
    if (rows.length !== expected.length || expected.some((edge, index) =>
        Object.entries(edge).some(([key, value]) => rows[index]?.[key] !== value))) {
        fail('forge_augury_v2_frontier_dependency_edge_drift');
    }
}

function assertActiveSetParent(
    db: Database.Database,
    receipt: AuguryMissionReceiptV2,
    repositoryId: string,
): void {
    const parent = db.prepare('SELECT * FROM hall_beads WHERE bead_id = ?')
        .get(receipt.proposed_parent_bead_id) as Record<string, unknown> | undefined;
    const metadata = parent
        ? parseAuguryV2Record(
            parent.metadata_json,
            'forge_augury_v2_frontier_parent_drift',
        )
        : null;
    const identity = metadata?.mutation_request_identity as Record<string, unknown> | undefined;
    if (!parent || parent.status !== 'IN_PROGRESS' || parent.repo_id !== repositoryId
        || parent.target_ref !== receipt.mission_decision_id
        || metadata?.schema !== 'cstar.set_manifest.v1'
        || metadata.operator_set !== true
        || metadata.decision_id !== receipt.mission_decision_id
        || metadata.design_sha256 !== receipt.design.sha256
        || stableAuguryMissionJson(metadata.batch_order)
            !== stableAuguryMissionJson(receipt.bead_plan.map((item) => item.bead_id))
        || identity?.source !== 'codex_request_meta'
        || identity.thread_id !== receipt.set_identity.root_thread_id
        || identity.turn_id !== receipt.set_identity.set_turn_id
        || identity.turn_record_set_sha256 !== receipt.set_identity.set_record_set_sha256) {
        fail('forge_augury_v2_frontier_parent_drift');
    }
    readForgeMissionGrantEnvelope(metadata);
}

export function assertAuguryV2PositiveValidation(
    db: Database.Database,
    child: AuguryV2ChildRow,
    validationId: string,
): void {
    const row = db.prepare(`
        SELECT * FROM hall_validation_runs WHERE validation_id = ?
    `).get(validationId) as Record<string, unknown> | undefined;
    if (!row || row.repo_id !== child.repo_id || row.bead_id !== child.bead_id
        || !['ACCEPTED', 'SUCCESS'].includes(String(row.verdict))
        || !['verified_v2', 'verified_v3'].includes(String(row.authority_class))) {
        fail('forge_augury_v2_frontier_validation_not_authoritative');
    }
    const manifest = parseAuguryV2Record(
        row.evidence_manifest_json,
        'forge_augury_v2_frontier_validation_not_authoritative',
    ) as unknown as HallValidationEvidenceManifest;
    if (manifest.schema !== 'cstar.validation-evidence.v2'
        && manifest.schema !== 'cstar.validation-evidence.v3') {
        fail('forge_augury_v2_frontier_validation_not_authoritative');
    }
    if (hashValidationEvidenceManifest(manifest) !== row.evidence_sha256
        || manifest.subject.repository_id !== child.repo_id
        || manifest.subject.bead_id !== child.bead_id) {
        fail('forge_augury_v2_frontier_validation_not_authoritative');
    }
    if (manifest.schema === 'cstar.validation-evidence.v2') {
        if (!isValidationEvidenceManifestV2StructurallyValid(manifest)) {
            fail('forge_augury_v2_frontier_validation_not_authoritative');
        }
        assertForgeValidationManifestCurrent(db, manifest);
    } else if (!isValidationEvidenceManifestV3StructurallyValid(manifest)) {
        fail('forge_augury_v2_frontier_validation_not_authoritative');
    }
}

function assertSterlingResolution(
    db: Database.Database,
    receipt: AuguryMissionReceiptV2,
    item: AuguryMissionPlanItemV2,
    child: AuguryV2ChildRow,
    validationId: string,
    codeRoot: string,
    controlRoot: string,
): void {
    const metadata = parseAuguryV2Record(
        child.metadata_json,
        'forge_augury_v2_frontier_sterling_not_authoritative',
    );
    const sterling = metadata.sterling_mandate as Record<string, unknown> | undefined;
    if (metadata.resolved_validation_id !== validationId
        || sterling?.verdict !== 'ACCEPTED') {
        fail('forge_augury_v2_frontier_sterling_not_authoritative');
    }
    const template = item.forge_child_request_template;
    if (!template) return;
    gateSterlingResolution({
        bead: {
            bead_id: child.bead_id,
            repo_id: child.repo_id,
            rationale: child.rationale,
            status: child.status as HallBeadRecord['status'],
            target_path: child.target_path,
            baseline_scores: {},
            metadata,
            created_at: child.created_at,
            updated_at: Number(child.updated_at),
        } as HallBeadRecord,
        evidence: {
            lore_paths: template.lore_paths,
            isolation_paths: template.isolation_paths,
            audit: { validation_id: validationId },
        },
        resolved_validation_id: validationId,
        hub_root: controlRoot,
        evidence_root: codeRoot,
        actor: 'forge-augury-v2-frontier-guard',
    });
}

function assertResolvedItem(
    db: Database.Database,
    receipt: AuguryMissionReceiptV2,
    item: AuguryMissionPlanItemV2,
    child: AuguryV2ChildRow,
    codeRoot: string,
    controlRoot: string,
): void {
    if (child.status !== 'RESOLVED' || !child.resolved_validation_id) {
        fail('forge_augury_v2_frontier_earlier_unresolved');
    }
    assertAuguryV2PositiveValidation(db, child, child.resolved_validation_id);
    assertSterlingResolution(
        db, receipt, item, child, child.resolved_validation_id, codeRoot, controlRoot,
    );
}

export function assertAuguryV2Dependencies(
    input: {
        db: Database.Database;
        receipt: AuguryMissionReceiptV2;
        item: AuguryMissionPlanItemV2;
        children: Map<string, AuguryV2ChildRow>;
        code_root: string;
        control_root: string;
        accepted_current?: string;
    },
): void {
    for (const dependency of input.item.dependencies) {
        if (dependency === input.receipt.proposed_parent_bead_id) continue;
        const child = input.children.get(dependency);
        const item = input.receipt.bead_plan.find((entry) => entry.bead_id === dependency);
        if (!child || !item) fail('forge_augury_v2_frontier_dependency_missing');
        if (dependency === input.accepted_current) continue;
        if (child.status !== 'RESOLVED' || !child.resolved_validation_id) {
            fail('forge_augury_v2_frontier_dependency_unresolved');
        }
        assertAuguryV2PositiveValidation(input.db, child, child.resolved_validation_id);
        assertSterlingResolution(
            input.db, input.receipt, item, child, child.resolved_validation_id,
            input.code_root, input.control_root,
        );
    }
}

function assertReceiptAndGraph(input: {
    db: Database.Database;
    receipt_row: Record<string, unknown>;
    receipt: AuguryMissionReceiptV2;
    code_root: string;
    control_root: string;
}): Map<string, AuguryV2ChildRow> {
    const validated = validateAuguryMissionReceipt(
        input.receipt, input.code_root, input.control_root,
    );
    const row = input.receipt_row;
    const receipt = input.receipt;
    if (validated.receipt.schema !== 'cstar.augury_mission_receipt.v2'
        || row.repo_id !== validated.hall_repo_id
        || row.repository_root !== validated.repository_root
        || row.logical_repository_id !== validated.logical_repository_id
        || row.canonical_receipt_json !== validated.canonical_receipt_json
        || row.canonical_receipt_sha256 !== validated.canonical_receipt_sha256
        || row.canonical_payload_sha256 !== receipt.canonical_payload_sha256
        || row.ordered_plan_sha256 !== receipt.ordered_plan_sha256
        || row.parent_bead_id !== receipt.proposed_parent_bead_id
        || row.mission_decision_id !== receipt.mission_decision_id) {
        fail('forge_augury_v2_frontier_receipt_drift');
    }
    const members = input.db.prepare(`
        SELECT * FROM hall_augury_mission_receipt_membership
        WHERE receipt_id = ? ORDER BY plan_order
    `).all(receipt.receipt_id) as Array<Record<string, unknown>>;
    if (members.length !== receipt.bead_plan.length) {
        fail('forge_augury_v2_frontier_membership_drift');
    }
    const children = new Map<string, AuguryV2ChildRow>();
    for (const [index, item] of receipt.bead_plan.entries()) {
        const member = members[index]!;
        const metadata = expectedChildMetadata(
            receipt, item, validated.logical_repository_id,
        );
        const metadataJson = stableAuguryMissionJson(metadata);
        if (member.bead_id !== item.bead_id || member.plan_order !== item.order + 1
            || member.plan_item_json !== stableAuguryMissionJson(item)
            || member.plan_item_sha256 !== hashAuguryMissionValue(item)
            || member.bead_metadata_json !== metadataJson
            || member.bead_metadata_sha256 !== hashAuguryMissionValue(metadata)) {
            fail('forge_augury_v2_frontier_membership_drift');
        }
        const child = input.db.prepare('SELECT * FROM hall_beads WHERE bead_id = ?')
            .get(item.bead_id) as AuguryV2ChildRow | undefined;
        if (!child || child.repo_id !== validated.hall_repo_id
            || child.target_ref !== `${receipt.mission_decision_id}:batch-${item.order + 1}`
            || child.target_path !== item.target_paths[0]
            || !['IN_PROGRESS', 'RESOLVED'].includes(child.status)) {
            fail('forge_augury_v2_frontier_child_drift');
        }
        const currentMetadata = parseAuguryV2Record(
            child.metadata_json, 'forge_augury_v2_frontier_child_metadata_invalid',
        );
        if (Object.entries(metadata).some(([key, value]) =>
            stableAuguryMissionJson(currentMetadata[key]) !== stableAuguryMissionJson(value))) {
            fail('forge_augury_v2_frontier_child_metadata_drift');
        }
        if (child.status === 'IN_PROGRESS'
            && stableAuguryMissionJson(currentMetadata) !== metadataJson) {
            fail('forge_augury_v2_frontier_child_metadata_drift');
        }
        children.set(item.bead_id, child);
    }
    assertEdges(input.db, receipt);
    assertActiveSetParent(input.db, receipt, validated.hall_repo_id);
    return children;
}

export function assertAuguryV2ForgeRequestFrontier(input: {
    db: Database.Database;
    code_root: string;
    control_root: string;
    bead_id: string;
    decision_id: string;
}): AuguryV2ForgeFrontier | null {
    if (!tablePresent(input.db, 'hall_augury_mission_receipts')
        || !tablePresent(input.db, 'hall_augury_mission_receipt_membership')) {
        return null;
    }
    const receiptRow = input.db.prepare(`
        SELECT receipt.* FROM hall_augury_mission_receipts AS receipt
        JOIN hall_augury_mission_receipt_membership AS member
          ON member.receipt_id = receipt.receipt_id
        WHERE member.bead_id = ?
    `).get(input.bead_id) as Record<string, unknown> | undefined;
    if (!receiptRow) return null;
    const receipt = parseAuguryV2Record(
        receiptRow.canonical_receipt_json,
        'forge_augury_v2_frontier_receipt_drift',
    ) as unknown as AuguryMissionReceiptV2;
    if (receipt.schema !== 'cstar.augury_mission_receipt.v2') return null;
    const children = assertReceiptAndGraph({
        db: input.db,
        receipt_row: receiptRow,
        receipt,
        code_root: input.code_root,
        control_root: input.control_root,
    });
    const item = receipt.bead_plan.find((entry) => entry.bead_id === input.bead_id);
    const child = children.get(input.bead_id);
    if (!item || !child || item.lane !== 'forge'
        || !item.forge_child_request_template || child.status !== 'IN_PROGRESS') {
        fail('forge_augury_v2_frontier_current_child_invalid');
    }
    if (input.decision_id !== `${receipt.mission_decision_id}:batch-${item.order + 1}`) {
        fail('forge_augury_v2_frontier_decision_drift');
    }
    for (const earlier of receipt.bead_plan.slice(0, item.order)) {
        assertResolvedItem(
            input.db, receipt, earlier, children.get(earlier.bead_id)!,
            input.code_root, input.control_root,
        );
    }
    assertAuguryV2Dependencies({
        db: input.db,
        receipt,
        item,
        children,
        code_root: input.code_root,
        control_root: input.control_root,
    });
    return { receipt, item, child, children };
}

export function isV2AuguryForgeChild(db: Database.Database, beadId: string): boolean {
    if (!tablePresent(db, 'hall_augury_mission_receipts')
        || !tablePresent(db, 'hall_augury_mission_receipt_membership')) {
        return false;
    }
    const row = db.prepare(`
        SELECT receipt.canonical_receipt_json, member.plan_item_json
        FROM hall_augury_mission_receipt_membership AS member
        JOIN hall_augury_mission_receipts AS receipt
          ON receipt.receipt_id = member.receipt_id
        WHERE member.bead_id = ?
    `).get(beadId) as Record<string, unknown> | undefined;
    if (!row) return false;
    try {
        const receipt = JSON.parse(String(row.canonical_receipt_json)) as Record<string, unknown>;
        const item = JSON.parse(String(row.plan_item_json)) as Record<string, unknown>;
        return receipt.schema === 'cstar.augury_mission_receipt.v2'
            && item.lane === 'forge'
            && item.forge_child_request_template !== null;
    } catch {
        return false;
    }
}
