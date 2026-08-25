import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    hashAuguryMissionValue,
    type AuguryMissionReceipt,
    type AuguryMissionReceiptPayload,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import type {
    HallForgeMissionGrantRecord,
    HallForgeRequestRecord,
} from '../../../src/types/forge.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { materializeAuguryMissionReceipt } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_controller.js';
import { ensureAuguryMissionReceiptSchema } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_schema.js';
import { bindForgeMissionGrantEnvelopeMetadata } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { canonicalForgeMissionGrantEnvelope } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { assertForgeMissionGrantLineage } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_scope.js';
import { ensureHallSchema } from '../../../src/tools/pennyone/intel/schema.js';

const PARENT = 'bead:cstar:receipt-materialization:parent';
const CHILDREN = [
    'bead:cstar:receipt-materialization:01',
    'bead:cstar:receipt-materialization:02',
    'bead:cstar:receipt-materialization:03',
] as const;
const DECISION = 'decision:cstar:receipt-materialization';
const DESIGN = '8'.repeat(64);
const ROOT_THREAD = '11111111-1111-4111-8111-111111111111';
const SET_TURN = '22222222-2222-4222-8222-222222222222';
const SET_RECORD = '3'.repeat(64);
const SET_RECORD_SET = '4'.repeat(64);
const SESSION_RECORD_SET = '5'.repeat(64);
const NOW = 1_785_451_200_000;
const roots: string[] = [];
const databases: Database.Database[] = [];

interface Fixture {
    root: string;
    repoId: string;
    db: Database.Database;
    receipt: AuguryMissionReceipt;
}

afterEach(() => {
    while (databases.length > 0) databases.pop()!.close();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function envelope(root: string) {
    const targets = ['src/one.ts', 'src/two.ts', 'tests/three.test.ts'];
    return {
        schema: 'cstar.forge_mission_grant_envelope.v1' as const,
        allowed_targets: targets,
        allowed_outputs: targets,
        allowed_actions: ['response_only', 'validation_artifacts'],
        prohibited_actions: [
            ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
            'project_files',
            'authorized_source_collection',
        ],
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        write_capability: 'response_only' as const,
        total_provider_attempt_ceiling: 3,
        retry_derived_iteration_ceiling: 0,
        paid_attempt_ceiling: 3,
    };
}

function parentMetadata(root: string, overrides: Record<string, unknown> = {}) {
    return bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        operator_set: true,
        decision_id: DECISION,
        design_revision: 2,
        design_sha256: DESIGN,
        batch_order: [...CHILDREN],
        mission_grant_envelope: envelope(root),
        mutation_request_identity: {
            source: 'codex_request_meta',
            thread_id: ROOT_THREAD,
            turn_id: SET_TURN,
            turn_record_set_sha256: SET_RECORD_SET,
        },
        ...overrides,
    });
}

function insertParent(
    db: Database.Database,
    repoId: string,
    root: string,
    metadata = parentMetadata(root),
): void {
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, target_path, rationale,
            status, source_kind, metadata_json, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, NULL, ?, 'IN_PROGRESS', ?, ?, ?, ?)
    `).run(
        PARENT, repoId, DECISION, 'Existing SET mission parent.',
        'set_manifest', JSON.stringify(metadata), NOW - 10_000, NOW - 10_000,
    );
}

function payload(root: string): AuguryMissionReceiptPayload {
    const repository = {
        schema: 'cstar.repository_root_identity.v1' as const,
        repository_id: 'repo:cstar:receipt-materialization-logical',
        root_path: root,
    };
    const beadPlan = [
        {
            order: 0,
            bead_id: CHILDREN[0],
            dependencies: [PARENT],
            lane: 'forge' as const,
            target_paths: ['src/one.ts'],
            acceptance_obligations: ['First child is exact.'],
            checker_obligations: ['node --test first'],
        },
        {
            order: 1,
            bead_id: CHILDREN[1],
            dependencies: [CHILDREN[0]],
            lane: 'researcher' as const,
            target_paths: ['src/two.ts'],
            acceptance_obligations: ['Second child follows first.'],
            checker_obligations: ['node --test second'],
        },
        {
            order: 2,
            bead_id: CHILDREN[2],
            dependencies: [PARENT, CHILDREN[1]],
            lane: 'corvus_eye' as const,
            target_paths: ['tests/three.test.ts'],
            acceptance_obligations: ['Third child validates topology.'],
            checker_obligations: ['node --test third'],
        },
    ];
    return {
        schema: 'cstar.augury_mission_receipt.v1',
        version: 1,
        authority_effect: 'read_projection_only',
        boundary_kind: 'new_current_exact_set_design_boundary',
        set_identity: {
            schema: 'cstar.verified_current_exact_root_set.v1',
            source: 'verified_codex_request_identity',
            root_thread_id: ROOT_THREAD,
            set_turn_id: SET_TURN,
            set_record_sha256: SET_RECORD,
            set_record_set_sha256: SET_RECORD_SET,
            set_record_count: 1,
            set_first_timestamp: '2026-07-30T16:00:00.000Z',
            set_timestamp: '2026-07-30T16:00:00.000Z',
            session_record_set_sha256: SESSION_RECORD_SET,
            session_record_count: 2,
        },
        repository: {
            ...repository,
            identity_sha256: hashAuguryMissionValue(repository),
        },
        mission_decision_id: DECISION,
        proposed_parent_bead_id: PARENT,
        design: { revision: 2, sha256: DESIGN },
        scope: {
            schema: 'cstar.mission_scope.v1',
            domain: 'brain',
            subject: 'CStar',
            scope_id: 'brain:CStar',
        },
        contained_target_paths: ['src/one.ts', 'src/two.ts', 'tests/three.test.ts'],
        council: {
            intent_category: 'BUILD',
            selection_tier: 'SKILL',
            selection_name: 'cstar-kernel',
            expert: {
                id: 'brooks',
                label: 'BROOKS',
                lens: 'Structural decomposition.',
                signature_question: 'Is the batch complete?',
            },
            candidates: [
                { id: 'brooks', label: 'BROOKS', score: 8, reason: 'decomposition' },
                { id: 'carmack', label: 'CARMACK', score: 6, reason: 'implementation' },
            ],
            guardrails: ['Do not widen the mission.'],
        },
        bead_plan: beadPlan,
        ordered_plan_count: beadPlan.length,
        ordered_plan_sha256: hashAuguryMissionValue({
            schema: 'cstar.augury_ordered_bead_plan.v1',
            ordered_plan_count: beadPlan.length,
            bead_plan: beadPlan,
        }),
        counts: {
            target_count: 3,
            bead_count: 3,
            dependency_count: 4,
            acceptance_obligation_count: 3,
            checker_obligation_count: 3,
        },
    };
}

function sign(value: AuguryMissionReceiptPayload): AuguryMissionReceipt {
    const canonicalPayloadSha256 = hashAuguryMissionValue(value);
    return {
        ...value,
        canonical_payload_sha256: canonicalPayloadSha256,
        receipt_id: `augury-mission:${hashAuguryMissionValue({
            schema: 'cstar.augury_mission_receipt_id.v1',
            canonical_payload_sha256: canonicalPayloadSha256,
        })}`,
    };
}

function resign(receipt: AuguryMissionReceipt): AuguryMissionReceipt {
    const value = clone(receipt) as unknown as Record<string, unknown>;
    delete value.canonical_payload_sha256;
    delete value.receipt_id;
    const plan = (value.bead_plan as AuguryMissionReceipt['bead_plan']);
    value.ordered_plan_count = plan.length;
    value.ordered_plan_sha256 = hashAuguryMissionValue({
        schema: 'cstar.augury_ordered_bead_plan.v1',
        ordered_plan_count: plan.length,
        bead_plan: plan,
    });
    const counts = value.counts as AuguryMissionReceipt['counts'];
    counts.dependency_count = plan.reduce((sum, item) => sum + item.dependencies.length, 0);
    return sign(value as unknown as AuguryMissionReceiptPayload);
}

function fixture(label: string, withParent = true): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `cstar-receipt-${label}-`));
    roots.push(root);
    for (const target of ['src/one.ts', 'src/two.ts', 'tests/three.test.ts']) {
        fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
        fs.writeFileSync(path.join(root, target), 'export {};\n');
    }
    const db = new Database(':memory:');
    databases.push(db);
    ensureHallSchema(db, root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    if (withParent) insertParent(db, repoId, root);
    return { root, repoId, db, receipt: sign(payload(root)) };
}

function materialize(value: Fixture, receipt: unknown = value.receipt) {
    return materializeAuguryMissionReceipt({
        db: value.db,
        expected_code_root: value.root,
        expected_control_root: value.root,
        receipt,
        now: NOW,
    });
}

function count(db: Database.Database, table: string): number {
    return Number(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}

function assertTimestampDriftRejected(
    label: string,
    table: string,
    column: string,
    where: string,
    params: readonly string[],
): void {
    const value = fixture(label);
    materialize(value);
    value.db.prepare(`UPDATE ${table} SET ${column} = ${column} + 1 WHERE ${where}`)
        .run(...params);
    const read = () => value.db.prepare(
        `SELECT ${column} FROM ${table} WHERE ${where}`,
    ).pluck().get(...params);
    assert.equal(read(), NOW + 1);
    assert.throws(() => materialize(value), /materialization_replay_drift/);
    assert.equal(read(), NOW + 1);
}

const TIMESTAMP_DRIFT_CASES = [
    ['receipt', 'hall_augury_mission_receipts', 'created_at', '1 = 1', []],
    ['membership', 'hall_augury_mission_receipt_membership', 'created_at', 'bead_id = ?', [CHILDREN[0]]],
    ['edge', 'hall_augury_mission_dependency_edges', 'created_at', 'child_bead_id = ? AND dependency_order = 1', [CHILDREN[0]]],
    ['child created_at', 'hall_beads', 'created_at', 'bead_id = ?', [CHILDREN[0]]],
    ['child updated_at', 'hall_beads', 'updated_at', 'bead_id = ?', [CHILDREN[0]]],
] as const;

describe('atomic Augury mission receipt materialization', () => {
    it('creates one visible ordered batch with exact parent and child edge topology', () => {
        const value = fixture('create');
        const result = materialize(value);
        assert.deepEqual(result, {
            receipt_id: value.receipt.receipt_id,
            parent_bead_id: PARENT,
            ordered_bead_ids: [...CHILDREN],
            replayed: false,
        });
        assert.deepEqual(value.db.prepare(`
            SELECT bead_id, status, target_ref,
                   json_extract(metadata_json, '$.order') AS plan_order
            FROM hall_beads WHERE bead_id <> ? ORDER BY plan_order
        `).all(PARENT), CHILDREN.map((beadId, index) => ({
            bead_id: beadId,
            status: 'IN_PROGRESS',
            target_ref: `${DECISION}:batch-${index + 1}`,
            plan_order: index + 1,
        })));
        const edges = value.db.prepare(`
            SELECT child_bead_id, dependency_bead_id, dependency_kind
            FROM hall_augury_mission_dependency_edges
            ORDER BY child_bead_id, dependency_order
        `).all();
        assert.deepEqual(edges, [
            { child_bead_id: CHILDREN[0], dependency_bead_id: PARENT, dependency_kind: 'parent_root' },
            { child_bead_id: CHILDREN[1], dependency_bead_id: CHILDREN[0], dependency_kind: 'receipt_child' },
            { child_bead_id: CHILDREN[2], dependency_bead_id: PARENT, dependency_kind: 'parent_root' },
            { child_bead_id: CHILDREN[2], dependency_bead_id: CHILDREN[1], dependency_kind: 'receipt_child' },
        ]);
    });

    it('returns exact replay only while receipt, membership, edges, and beads remain exact', () => {
        const value = fixture('replay');
        materialize(value);
        assert.equal(materialize(value).replayed, true);
        value.db.prepare(`
            UPDATE hall_beads SET metadata_json = json_set(metadata_json, '$.lane', 'cos')
            WHERE bead_id = ?
        `).run(CHILDREN[0]);
        assert.throws(() => materialize(value), /materialization_replay_drift/);
        assert.equal(count(value.db, 'hall_augury_mission_receipts'), 1);
    });

    for (const [label, table, column, where, params] of TIMESTAMP_DRIFT_CASES) {
        it(`rejects ${label} timestamp drift without repair`, () => {
            assertTimestampDriftRejected(label, table, column, where, params);
        });
    }

    it('rejects canonical receipt tamper and canonical-array reorder', () => {
        const value = fixture('tamper');
        ensureAuguryMissionReceiptSchema(value.db);
        const tampered = clone(value.receipt);
        tampered.design.sha256 = '9'.repeat(64);
        assert.throws(() => materialize(value, tampered), /receipt_payload_mismatch/);
        const reordered = clone(value.receipt);
        reordered.contained_target_paths.reverse();
        assert.throws(() => materialize(value, reordered), /target_set_invalid/);
        assert.equal(count(value.db, 'hall_augury_mission_receipts'), 0);
    });

    it('rejects stale parent design without repairing parent metadata', () => {
        const value = fixture('stale-parent');
        const original = value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(PARENT);
        value.db.prepare(`
            UPDATE hall_beads SET metadata_json = json_set(metadata_json, '$.design_sha256', ?)
            WHERE bead_id = ?
        `).run('a'.repeat(64), PARENT);
        assert.throws(() => materialize(value), /parent_stale/);
        assert.notEqual(value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(PARENT), original);
    });

    it('rolls back the receipt and all new children on a child id collision', () => {
        const value = fixture('collision');
        value.db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, rationale, status, metadata_json, created_at, updated_at
            ) VALUES (?, ?, 'collision', 'OPEN', '{}', ?, ?)
        `).run(CHILDREN[1], value.repoId, NOW, NOW);
        assert.throws(() => materialize(value), /materialization_atomic_failure/);
        assert.equal(count(value.db, 'hall_augury_mission_receipts'), 0);
        assert.equal(count(value.db, 'hall_augury_mission_receipt_membership'), 0);
        assert.equal(count(value.db, 'hall_augury_mission_dependency_edges'), 0);
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) FROM hall_beads WHERE bead_id IN (?, ?)',
        ).pluck().get(CHILDREN[0], CHILDREN[2]), 0);
    });

    it('rejects later and foreign dependencies even when the receipt is re-signed', () => {
        for (const dependency of [CHILDREN[1], 'bead:cstar:foreign:dependency']) {
            const value = fixture(`dependency-${dependency.endsWith('02') ? 'later' : 'foreign'}`);
            ensureAuguryMissionReceiptSchema(value.db);
            const invalid = clone(value.receipt);
            invalid.bead_plan[0]!.dependencies = [dependency];
            assert.throws(() => materialize(value, resign(invalid)), /topology_invalid/);
            assert.equal(count(value.db, 'hall_augury_mission_receipts'), 0);
        }
    });

    it('rolls back a deliberately injected mid-batch failure to zero batch rows', () => {
        const value = fixture('injected');
        ensureAuguryMissionReceiptSchema(value.db);
        value.db.exec(`
            CREATE TRIGGER inject_augury_mid_batch_failure
            BEFORE INSERT ON hall_augury_mission_receipt_membership
            WHEN NEW.plan_order = 2
            BEGIN
                SELECT RAISE(ABORT, 'injected_mid_batch_failure');
            END;
        `);
        assert.throws(() => materialize(value), /materialization_atomic_failure/);
        assert.equal(count(value.db, 'hall_augury_mission_receipts'), 0);
        assert.equal(count(value.db, 'hall_augury_mission_receipt_membership'), 0);
        assert.equal(count(value.db, 'hall_augury_mission_dependency_edges'), 0);
        assert.equal(value.db.prepare(
            `SELECT COUNT(*) FROM hall_beads WHERE bead_id IN (${CHILDREN.map(() => '?')})`,
        ).pluck().get(...CHILDREN), 0);
    });

    it('rejects a missing or foreign parent', () => {
        const missing = fixture('missing-parent', false);
        assert.throws(() => materialize(missing), /parent_missing/);
        const foreign = fixture('foreign-parent');
        const foreignRoot = `${foreign.root}/foreign`;
        foreign.db.prepare(`
            INSERT INTO hall_repositories (
                repo_id, root_path, name, status, active_persona,
                baseline_gungnir_score, intent_integrity, created_at, updated_at
            ) VALUES (?, ?, 'foreign', 'DORMANT', '', 0, 0, ?, ?)
        `).run('repo:/foreign', foreignRoot, NOW, NOW);
        foreign.db.prepare('UPDATE hall_beads SET repo_id = ? WHERE bead_id = ?')
            .run('repo:/foreign', PARENT);
        assert.throws(() => materialize(foreign), /parent_repository_mismatch/);
    });

    it('protects receipt roots and child membership with foreign keys', () => {
        const value = fixture('fk-protection');
        materialize(value);
        assert.throws(
            () => value.db.prepare('DELETE FROM hall_beads WHERE bead_id = ?').run(PARENT),
            /FOREIGN KEY constraint failed/,
        );
        assert.throws(
            () => value.db.prepare('DELETE FROM hall_beads WHERE bead_id = ?').run(CHILDREN[0]),
            /FOREIGN KEY constraint failed/,
        );
    });

    it('remains compatible with downstream Forge mission-grant lineage checks', () => {
        const value = fixture('grant-lineage');
        materialize(value);
        const grantEnvelope = canonicalForgeMissionGrantEnvelope(envelope(value.root));
        const grant = {
            repo_id: value.repoId,
            mission_decision_id: DECISION,
            root_bead_id: PARENT,
            allowed_child_lineage_json: JSON.stringify(CHILDREN),
            root_thread_id: ROOT_THREAD,
            design_sha256: DESIGN,
            allowed_targets_json: JSON.stringify(grantEnvelope.allowed_targets),
            allowed_outputs_json: JSON.stringify(grantEnvelope.allowed_outputs),
            allowed_actions_json: JSON.stringify(grantEnvelope.allowed_actions),
            prohibited_actions_json: JSON.stringify(grantEnvelope.prohibited_actions),
            adapter_ref: grantEnvelope.adapter_ref,
            write_capability: grantEnvelope.write_capability,
            total_provider_attempt_ceiling: 3,
            retry_derived_iteration_ceiling: 0,
            paid_attempt_ceiling: 3,
        } as unknown as HallForgeMissionGrantRecord;
        const request = {
            bead_id: CHILDREN[0],
            requester_thread_id: ROOT_THREAD,
            decision_id: `${DECISION}:batch-1`,
        } as unknown as HallForgeRequestRecord;
        assert.doesNotThrow(() => assertForgeMissionGrantLineage(value.db, grant, request));
    });
});
