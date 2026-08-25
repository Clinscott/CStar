import type Database from 'better-sqlite3';

import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AnyAuguryMissionPlanItem,
} from '../../cstar-kernel-mcp/contracts/augury_mission.js';
import { bindAuguryMissionChildTemplateMetadata } from
    './augury_mission_child_template_binding.js';
import { ensureAuguryMissionReceiptSchema } from './augury_mission_receipt_schema.js';
import {
    validateAuguryMissionReceipt,
    type ValidatedAuguryMissionReceipt,
} from './augury_mission_receipt_validation.js';

interface ParentRow {
    bead_id: string;
    repo_id: string;
    target_ref: string | null;
    status: string;
    metadata_json: string | null;
}

interface MembershipRow {
    receipt_id: string;
    bead_id: string;
    plan_order: number;
    plan_item_sha256: string;
    plan_item_json: string;
    bead_metadata_sha256: string;
    bead_metadata_json: string;
    bead_row_sha256: string;
    bead_row_json: string;
    created_at: number;
}

export interface MaterializeAuguryMissionReceiptInput {
    db: Database.Database;
    expected_code_root: string;
    expected_control_root: string;
    receipt: unknown;
    now?: number;
    materialization_mode?: 'initial' | 'replay';
}

export interface MaterializeAuguryMissionReceiptResult {
    receipt_id: string;
    parent_bead_id: string;
    ordered_bead_ids: string[];
    replayed: boolean;
}

const LANE_OWNER: Record<AnyAuguryMissionPlanItem['lane'], string> = {
    cos: 'CoS',
    forge: 'Forge',
    researcher: 'Researcher',
    corvus_eye: 'CorvusEye',
};

function fail(code: string): never {
    throw new Error(code);
}

function parseRecord(value: string | null, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value)) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(code);
        return parsed as Record<string, unknown>;
    } catch {
        fail(code);
    }
}

function stableEqual(left: unknown, right: unknown): boolean {
    return stableAuguryMissionJson(left) === stableAuguryMissionJson(right);
}

function assertRepository(db: Database.Database, validated: ValidatedAuguryMissionReceipt): void {
    const row = db.prepare(
        'SELECT root_path FROM hall_repositories WHERE repo_id = ?',
    ).get(validated.hall_repo_id) as { root_path?: unknown } | undefined;
    if (!row || row.root_path !== validated.control_root) {
        fail('augury_mission_materialization_repository_missing');
    }
}

function assertParent(db: Database.Database, validated: ValidatedAuguryMissionReceipt): ParentRow {
    const receipt = validated.receipt;
    const row = db.prepare(`
        SELECT bead_id, repo_id, target_ref, status, metadata_json
        FROM hall_beads WHERE bead_id = ?
    `).get(receipt.proposed_parent_bead_id) as ParentRow | undefined;
    if (!row) fail('augury_mission_materialization_parent_missing');
    if (row.repo_id !== validated.hall_repo_id) {
        fail('augury_mission_materialization_parent_repository_mismatch');
    }
    const metadata = parseRecord(
        row.metadata_json, 'augury_mission_materialization_parent_metadata_invalid',
    );
    const identity = metadata.mutation_request_identity;
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
        fail('augury_mission_materialization_parent_set_identity_mismatch');
    }
    const mutation = identity as Record<string, unknown>;
    const set = receipt.set_identity;
    if (row.status !== 'IN_PROGRESS'
        || row.target_ref !== receipt.mission_decision_id
        || metadata.schema !== 'cstar.set_manifest.v1'
        || metadata.operator_set !== true
        || metadata.decision_id !== receipt.mission_decision_id
        || metadata.design_revision !== receipt.design.revision
        || metadata.design_sha256 !== receipt.design.sha256
        || !stableEqual(metadata.batch_order, validated.ordered_bead_ids)
        || !stableEqual(Object.keys(mutation).sort(), [
            'source', 'thread_id', 'turn_id', 'turn_record_set_sha256',
        ].sort())
        || mutation.source !== 'codex_request_meta'
        || mutation.thread_id !== set.root_thread_id
        || mutation.turn_id !== set.set_turn_id
        || mutation.turn_record_set_sha256 !== set.set_record_set_sha256) {
        fail('augury_mission_materialization_parent_stale');
    }
    return row;
}

function childMetadata(
    validated: ValidatedAuguryMissionReceipt,
    item: AnyAuguryMissionPlanItem,
): Record<string, unknown> {
    const receipt = validated.receipt;
    return bindAuguryMissionChildTemplateMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.augury_mission_child.v1',
        parent_bead_id: receipt.proposed_parent_bead_id,
        order: item.order + 1,
        depends_on: item.dependencies,
        lane: item.lane,
        owning_lane: LANE_OWNER[item.lane],
        design_sha256: receipt.design.sha256,
        target_paths: item.target_paths,
        acceptance_obligations: item.acceptance_obligations,
        checker_obligations: item.checker_obligations,
        augury_mission_receipt: {
            schema: receipt.schema,
            receipt_id: receipt.receipt_id,
            canonical_payload_sha256: receipt.canonical_payload_sha256,
            ordered_plan_sha256: receipt.ordered_plan_sha256,
            logical_repository_id: validated.logical_repository_id,
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

function beadProjection(
    validated: ValidatedAuguryMissionReceipt,
    item: AnyAuguryMissionPlanItem,
    metadataJson: string,
    createdAt: number,
): Record<string, unknown> {
    const receipt = validated.receipt;
    return {
        bead_id: item.bead_id,
        repo_id: validated.hall_repo_id,
        scan_id: null,
        legacy_id: null,
        target_kind: 'WORKFLOW',
        target_ref: `${receipt.mission_decision_id}:batch-${item.order + 1}`,
        target_path: item.target_paths[0],
        rationale: `Augury mission receipt ${receipt.receipt_id} plan item ${item.order + 1}.`,
        contract_refs_json: stableAuguryMissionJson([
            receipt.receipt_id, receipt.ordered_plan_sha256,
        ]),
        baseline_scores_json: '{}',
        acceptance_criteria: item.acceptance_obligations.join('\n'),
        checker_shell: item.checker_obligations.join('\n'),
        status: 'IN_PROGRESS',
        assigned_agent: item.lane,
        source_kind: 'augury_mission_receipt',
        triage_reason: null,
        resolution_note: null,
        resolved_validation_id: null,
        superseded_by: null,
        architect_opinion: null,
        critique_payload_json: null,
        metadata_json: metadataJson,
        created_at: createdAt,
        updated_at: createdAt,
    };
}

function insertReceipt(
    db: Database.Database,
    validated: ValidatedAuguryMissionReceipt,
    now: number,
): void {
    const receipt = validated.receipt;
    db.prepare(`
        INSERT INTO hall_augury_mission_receipts (
            receipt_id, repo_id, logical_repository_id, repository_root,
            repository_identity_sha256, parent_bead_id, mission_decision_id,
            design_revision, design_sha256, root_thread_id, set_turn_id,
            set_record_sha256, set_record_set_sha256, canonical_payload_sha256,
            canonical_receipt_sha256, canonical_receipt_json, ordered_plan_count,
            ordered_plan_sha256, target_count, dependency_count,
            acceptance_obligation_count, checker_obligation_count, created_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `).run(
        receipt.receipt_id, validated.hall_repo_id, validated.logical_repository_id,
        validated.repository_root, receipt.repository.identity_sha256,
        receipt.proposed_parent_bead_id, receipt.mission_decision_id,
        receipt.design.revision, receipt.design.sha256,
        receipt.set_identity.root_thread_id, receipt.set_identity.set_turn_id,
        receipt.set_identity.set_record_sha256, receipt.set_identity.set_record_set_sha256,
        receipt.canonical_payload_sha256, validated.canonical_receipt_sha256,
        validated.canonical_receipt_json, receipt.ordered_plan_count,
        receipt.ordered_plan_sha256, receipt.counts.target_count,
        receipt.counts.dependency_count, receipt.counts.acceptance_obligation_count,
        receipt.counts.checker_obligation_count, now,
    );
}

function insertChild(
    db: Database.Database,
    validated: ValidatedAuguryMissionReceipt,
    item: AnyAuguryMissionPlanItem,
    now: number,
): void {
    const metadataJson = stableAuguryMissionJson(childMetadata(validated, item));
    const projection = beadProjection(validated, item, metadataJson, now);
    const columns = Object.keys(projection);
    db.prepare(`
        INSERT INTO hall_beads (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
    `).run(...Object.values(projection));
    const planJson = stableAuguryMissionJson(item);
    const beadRowJson = stableAuguryMissionJson(projection);
    db.prepare(`
        INSERT INTO hall_augury_mission_receipt_membership (
            receipt_id, bead_id, plan_order, plan_item_sha256, plan_item_json,
            bead_metadata_sha256, bead_metadata_json, bead_row_sha256,
            bead_row_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        validated.receipt.receipt_id, item.bead_id, item.order + 1,
        hashAuguryMissionValue(item), planJson,
        hashAuguryMissionValue(childMetadata(validated, item)), metadataJson,
        hashAuguryMissionValue(projection), beadRowJson, now,
    );
}

function edgeProjection(
    receiptId: string,
    parentBeadId: string,
    item: AnyAuguryMissionPlanItem,
    dependency: string,
    dependencyIndex: number,
): Record<string, unknown> {
    const parent = dependency === parentBeadId;
    return {
        receipt_id: receiptId,
        child_bead_id: item.bead_id,
        dependency_order: dependencyIndex + 1,
        dependency_bead_id: dependency,
        dependency_kind: parent ? 'parent_root' : 'receipt_child',
        parent_dependency_bead_id: parent ? dependency : null,
        child_dependency_bead_id: parent ? null : dependency,
    };
}

function insertEdges(
    db: Database.Database,
    validated: ValidatedAuguryMissionReceipt,
    item: AnyAuguryMissionPlanItem,
    now: number,
): void {
    for (const [index, dependency] of item.dependencies.entries()) {
        const edge = edgeProjection(
            validated.receipt.receipt_id,
            validated.receipt.proposed_parent_bead_id,
            item,
            dependency,
            index,
        );
        const edgeJson = stableAuguryMissionJson(edge);
        db.prepare(`
            INSERT INTO hall_augury_mission_dependency_edges (
                receipt_id, child_bead_id, dependency_order, dependency_bead_id,
                dependency_kind, parent_dependency_bead_id,
                child_dependency_bead_id, edge_sha256, edge_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ...Object.values(edge), hashAuguryMissionValue(edge), edgeJson, now,
        );
    }
}

function assertReceiptRow(
    db: Database.Database,
    validated: ValidatedAuguryMissionReceipt,
): number | null {
    const row = db.prepare(`
        SELECT * FROM hall_augury_mission_receipts WHERE receipt_id = ?
    `).get(validated.receipt.receipt_id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const receipt = validated.receipt;
    const expected: Record<string, unknown> = {
        receipt_id: receipt.receipt_id,
        repo_id: validated.hall_repo_id,
        logical_repository_id: validated.logical_repository_id,
        repository_root: validated.repository_root,
        repository_identity_sha256: receipt.repository.identity_sha256,
        parent_bead_id: receipt.proposed_parent_bead_id,
        mission_decision_id: receipt.mission_decision_id,
        design_revision: receipt.design.revision,
        design_sha256: receipt.design.sha256,
        root_thread_id: receipt.set_identity.root_thread_id,
        set_turn_id: receipt.set_identity.set_turn_id,
        set_record_sha256: receipt.set_identity.set_record_sha256,
        set_record_set_sha256: receipt.set_identity.set_record_set_sha256,
        canonical_payload_sha256: receipt.canonical_payload_sha256,
        canonical_receipt_sha256: validated.canonical_receipt_sha256,
        canonical_receipt_json: validated.canonical_receipt_json,
        ordered_plan_count: receipt.ordered_plan_count,
        ordered_plan_sha256: receipt.ordered_plan_sha256,
        target_count: receipt.counts.target_count,
        dependency_count: receipt.counts.dependency_count,
        acceptance_obligation_count: receipt.counts.acceptance_obligation_count,
        checker_obligation_count: receipt.counts.checker_obligation_count,
    };
    if (Object.entries(expected).some(([key, value]) => row[key] !== value)
        || !Number.isSafeInteger(row.created_at) || Number(row.created_at) < 1) {
        fail('augury_mission_materialization_receipt_conflict');
    }
    return Number(row.created_at);
}

function readBeadProjection(db: Database.Database, beadId: string): Record<string, unknown> {
    const row = db.prepare(`
        SELECT bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref,
               target_path, rationale, contract_refs_json, baseline_scores_json,
               acceptance_criteria, checker_shell, status, assigned_agent,
               source_kind, triage_reason, resolution_note, resolved_validation_id,
               superseded_by, architect_opinion, critique_payload_json,
               metadata_json, created_at, updated_at
        FROM hall_beads WHERE bead_id = ?
    `).get(beadId) as Record<string, unknown> | undefined;
    if (!row) fail('augury_mission_materialization_replay_drift');
    return row;
}

function assertReplay(
    db: Database.Database,
    validated: ValidatedAuguryMissionReceipt,
    materializedAt: number,
): void {
    const members = db.prepare(`
        SELECT * FROM hall_augury_mission_receipt_membership
        WHERE receipt_id = ? ORDER BY plan_order
    `).all(validated.receipt.receipt_id) as MembershipRow[];
    if (members.length !== validated.receipt.bead_plan.length) {
        fail('augury_mission_materialization_replay_drift');
    }
    for (const [index, item] of validated.receipt.bead_plan.entries()) {
        const member = members[index];
        if (!member || member.bead_id !== item.bead_id
            || member.plan_order !== item.order + 1
            || member.created_at !== materializedAt) {
            fail('augury_mission_materialization_replay_drift');
        }
        const metadata = childMetadata(validated, item);
        const metadataJson = stableAuguryMissionJson(metadata);
        const planJson = stableAuguryMissionJson(item);
        const projection = beadProjection(validated, item, metadataJson, materializedAt);
        const projectionJson = stableAuguryMissionJson(projection);
        if (member.plan_item_json !== planJson
            || member.plan_item_sha256 !== hashAuguryMissionValue(item)
            || member.bead_metadata_json !== metadataJson
            || member.bead_metadata_sha256 !== hashAuguryMissionValue(metadata)
            || member.bead_row_json !== projectionJson
            || member.bead_row_sha256 !== hashAuguryMissionValue(projection)
            || stableAuguryMissionJson(readBeadProjection(db, item.bead_id)) !== projectionJson) {
            fail('augury_mission_materialization_replay_drift');
        }
    }
    const edges = db.prepare(`
        SELECT receipt_id, child_bead_id, dependency_order, dependency_bead_id,
               dependency_kind, parent_dependency_bead_id,
               child_dependency_bead_id, edge_sha256, edge_json, created_at
        FROM hall_augury_mission_dependency_edges
        WHERE receipt_id = ? ORDER BY child_bead_id, dependency_order
    `).all(validated.receipt.receipt_id) as Array<Record<string, unknown>>;
    const expected = validated.receipt.bead_plan.flatMap((item) =>
        item.dependencies.map((dependency, index) => edgeProjection(
            validated.receipt.receipt_id,
            validated.receipt.proposed_parent_bead_id,
            item,
            dependency,
            index,
        ))).sort((left, right) =>
        String(left.child_bead_id).localeCompare(String(right.child_bead_id))
        || Number(left.dependency_order) - Number(right.dependency_order));
    if (edges.length !== expected.length) {
        fail('augury_mission_materialization_replay_drift');
    }
    expected.forEach((edge, index) => {
        const actual = edges[index]!;
        const edgeJson = stableAuguryMissionJson(edge);
        if (Object.entries(edge).some(([key, value]) => actual[key] !== value)
            || actual.edge_json !== edgeJson
            || actual.edge_sha256 !== hashAuguryMissionValue(edge)
            || actual.created_at !== materializedAt) {
            fail('augury_mission_materialization_replay_drift');
        }
    });
}

export function materializeAuguryMissionReceipt(
    input: MaterializeAuguryMissionReceiptInput,
): MaterializeAuguryMissionReceiptResult {
    const validated = validateAuguryMissionReceipt(
        input.receipt, input.expected_code_root, input.expected_control_root,
    );
    const materializedAt = input.now ?? Date.now();
    if (!Number.isSafeInteger(materializedAt) || materializedAt < 1) {
        fail('augury_mission_materialization_timestamp_invalid');
    }
    ensureAuguryMissionReceiptSchema(input.db);
    const operation = input.db.transaction(() => {
        assertRepository(input.db, validated);
        assertParent(input.db, validated);
        const existingCreatedAt = assertReceiptRow(input.db, validated);
        if (existingCreatedAt !== null) {
            if (input.materialization_mode === 'initial') {
                fail('augury_mission_materialization_replay_binding_required');
            }
            assertReplay(input.db, validated, existingCreatedAt);
            return true;
        }
        const conflict = input.db.prepare(`
            SELECT receipt_id FROM hall_augury_mission_receipts
            WHERE repo_id = ? AND mission_decision_id = ? AND parent_bead_id = ?
        `).get(
            validated.hall_repo_id,
            validated.receipt.mission_decision_id,
            validated.receipt.proposed_parent_bead_id,
        );
        if (conflict) fail('augury_mission_materialization_receipt_conflict');
        if (input.materialization_mode === 'replay') {
            fail('augury_mission_materialization_replay_not_found');
        }
        insertReceipt(input.db, validated, materializedAt);
        for (const item of validated.receipt.bead_plan) {
            insertChild(input.db, validated, item, materializedAt);
        }
        for (const item of validated.receipt.bead_plan) {
            insertEdges(input.db, validated, item, materializedAt);
        }
        return false;
    });
    try {
        const replayed = operation.immediate();
        return {
            receipt_id: validated.receipt.receipt_id,
            parent_bead_id: validated.receipt.proposed_parent_bead_id,
            ordered_bead_ids: [...validated.ordered_bead_ids],
            replayed,
        };
    } catch (error) {
        if (error instanceof Error
            && error.message.startsWith('augury_mission_')) throw error;
        throw new Error('augury_mission_materialization_atomic_failure', { cause: error });
    }
}
