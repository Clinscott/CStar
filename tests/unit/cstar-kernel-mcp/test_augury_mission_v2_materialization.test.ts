import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';

import type {
    AuguryMissionBoundaryInputV2,
    AuguryMissionReceiptV2,
} from
    '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import { materializeAuguryMissionReceipt } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_controller.js';
import { ensureAuguryMissionReceiptSchema } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_schema.js';
import { ensureHallSchema } from '../../../src/tools/pennyone/intel/schema.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { cleanupOperatorAuthorizationFixtures } from
    './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    parse,
} from './forge_natural_authorization_test_support.js';
import {
    createDispatchFixture,
    tableCount,
} from './augury_mission_dispatch_test_support.js';
import {
    cleanupV2Roots,
    cloneV2,
    createV2Receipt,
    createV2Root,
    responseOnlyTemplate,
    templateBinding,
    v2Boundary,
} from './augury_mission_v2_test_support.js';

const NOW = 1_785_458_400_000;
const databases: Database.Database[] = [];
const controlRoots: string[] = [];

interface Fixture {
    codeRoot: string;
    controlRoot: string;
    db: Database.Database;
    receipt: AuguryMissionReceiptV2;
}

afterEach(() => {
    while (databases.length > 0) databases.pop()!.close();
    while (controlRoots.length > 0) {
        fs.rmSync(controlRoots.pop()!, { recursive: true, force: true });
    }
    cleanupV2Roots();
    cleanupOperatorAuthorizationFixtures();
    cleanupNaturalAuthorizationTest();
});

async function fixture(label: string): Promise<Fixture> {
    const codeRoot = createV2Root(`cstar-v2-materialize-code-${label}-`);
    const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cstar-v2-control-${label}-`));
    controlRoots.push(controlRoot);
    const receipt = await createV2Receipt(v2Boundary(codeRoot), codeRoot);
    const db = new Database(':memory:');
    databases.push(db);
    ensureHallSchema(db, controlRoot);
    ensureAuguryMissionReceiptSchema(db);
    const repoId = buildHallRepositoryId(normalizeHallPath(controlRoot));
    const metadata = {
        schema: 'cstar.set_manifest.v1',
        operator_set: true,
        decision_id: receipt.mission_decision_id,
        design_revision: receipt.design.revision,
        design_sha256: receipt.design.sha256,
        batch_order: receipt.bead_plan.map((item) => item.bead_id),
        mutation_request_identity: {
            source: 'codex_request_meta',
            thread_id: receipt.set_identity.root_thread_id,
            turn_id: receipt.set_identity.set_turn_id,
            turn_record_set_sha256: receipt.set_identity.set_record_set_sha256,
        },
    };
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, rationale, status,
            source_kind, metadata_json, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'v2 parent', 'IN_PROGRESS',
                  'set_manifest', ?, ?, ?)
    `).run(
        receipt.proposed_parent_bead_id,
        repoId,
        receipt.mission_decision_id,
        JSON.stringify(metadata),
        NOW - 1_000,
        NOW - 1_000,
    );
    return { codeRoot, controlRoot, db, receipt };
}

function materialize(value: Fixture, options: {
    receipt?: unknown;
    replay?: boolean;
} = {}) {
    return materializeAuguryMissionReceipt({
        db: value.db,
        expected_code_root: value.codeRoot,
        expected_control_root: value.controlRoot,
        receipt: options.receipt ?? value.receipt,
        now: NOW,
        materialization_mode: options.replay ? 'replay' : 'initial',
    });
}

function count(db: Database.Database, table: string): number {
    return Number(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}

function countIfPresent(db: Database.Database, table: string): number {
    const present = db.prepare(`
        SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?
    `).pluck().get(table);
    return Number(present) === 0 ? 0 : count(db, table);
}

describe('Augury mission receipt v2 materialization', () => {
    it('dispatches v2 through Augury without Forge or provider side effects', async () => {
        beginNaturalAuthorizationTest();
        const value = await createDispatchFixture('v2-dispatch');
        const template = responseOnlyTemplate();
        const boundary: AuguryMissionBoundaryInputV2 = {
            ...value.boundary,
            schema: 'cstar.augury_mission_boundary.v2',
            version: 2,
            bead_plan: value.boundary.bead_plan.map((item) => item.lane === 'forge'
                ? { ...item, ...templateBinding(template) }
                : {
                    ...item,
                    forge_child_request_template: null,
                    forge_child_request_template_sha256: null,
                    forge_child_request_template_bytes: null,
                }),
        };
        const response = await handleAugury({
            prompt: 'Build the exact phase 4A mission.',
            mission_boundary: boundary,
        }, value.context);
        const payload = parse(response);
        assert.equal(response.isError, undefined);
        assert.equal(payload.mission_boundary_receipt.schema,
            'cstar.augury_mission_receipt.v2');
        assert.equal(payload.materialization.replayed, false);
        assert.equal(tableCount(value, 'hall_forge_requests'), 0);
        assert.equal(tableCount(value, 'hall_forge_authorizations'), 0);
        assert.equal(tableCount(value, 'hall_forge_attempts'), 0);
    });

    it('materializes split roots with immutable plan and child template bindings', async () => {
        const value = await fixture('split');
        assert.notEqual(value.codeRoot, value.controlRoot);
        const result = materialize(value);
        assert.deepEqual(result.ordered_bead_ids,
            value.receipt.bead_plan.map((item) => item.bead_id));
        const rows = value.db.prepare(`
            SELECT m.plan_item_json, b.metadata_json, b.status
            FROM hall_augury_mission_receipt_membership m
            JOIN hall_beads b ON b.bead_id = m.bead_id
            ORDER BY m.plan_order
        `).all() as Array<Record<string, string>>;
        assert.equal(rows.length, 2);
        const forgePlan = JSON.parse(rows[0]!.plan_item_json);
        const forgeMetadata = JSON.parse(rows[0]!.metadata_json);
        assert.deepEqual(forgePlan.forge_child_request_template,
            value.receipt.bead_plan[0]!.forge_child_request_template);
        assert.deepEqual(forgeMetadata.forge_child_request_template_binding, {
            template: value.receipt.bead_plan[0]!.forge_child_request_template,
            sha256: value.receipt.bead_plan[0]!.forge_child_request_template_sha256,
            bytes: value.receipt.bead_plan[0]!.forge_child_request_template_bytes,
        });
        const validatorMetadata = JSON.parse(rows[1]!.metadata_json);
        assert.equal(validatorMetadata.forge_child_request_template_binding, null);
        assert.equal(forgeMetadata.augury_mission_receipt.forge_request_template_count, 1);
        assert.equal(
            forgeMetadata.augury_mission_receipt.ordered_forge_request_templates_sha256,
            value.receipt.ordered_forge_request_templates_sha256,
        );
        assert.deepEqual(rows.map((row) => row.status), ['IN_PROGRESS', 'IN_PROGRESS']);
    });

    it('permits only exact replay and rejects template mutation, omission, reorder, bytes, or hash drift', async () => {
        for (const [label, mutate] of [
            ['mutation', (item: any) => {
                item.forge_child_request_template.objective = 'mutated';
            }],
            ['omission', (item: any) => {
                delete item.forge_child_request_template;
            }],
            ['reorder', (item: any) => {
                item.order = 1;
            }],
            ['bytes', (item: any) => {
                item.forge_child_request_template_bytes += 1;
            }],
            ['hash', (item: any) => {
                item.forge_child_request_template_sha256 = '0'.repeat(64);
            }],
        ] as const) {
            const value = await fixture(label);
            materialize(value);
            assert.deepEqual(materialize(value, { replay: true }), {
                receipt_id: value.receipt.receipt_id,
                parent_bead_id: value.receipt.proposed_parent_bead_id,
                ordered_bead_ids: value.receipt.bead_plan.map((item) => item.bead_id),
                replayed: true,
            });
            const row = value.db.prepare(`
                SELECT plan_item_json FROM hall_augury_mission_receipt_membership
                WHERE plan_order = 1
            `).pluck().get() as string;
            const item = JSON.parse(row);
            mutate(item);
            value.db.prepare(`
                UPDATE hall_augury_mission_receipt_membership
                SET plan_item_json = ? WHERE plan_order = 1
            `).run(JSON.stringify(item));
            assert.throws(() => materialize(value, { replay: true }),
                /augury_mission_materialization_replay_drift/);
        }
    });

    it('rejects forged aggregate receipt bindings before persistence', async () => {
        const value = await fixture('aggregate-tamper');
        for (const mutate of [
            (receipt: any) => {
                receipt.forge_request_template_count = 0;
            },
            (receipt: any) => {
                receipt.ordered_forge_request_templates_sha256 = '0'.repeat(64);
            },
            (receipt: any) => {
                receipt.ordered_plan_sha256 = '0'.repeat(64);
            },
            (receipt: any) => {
                receipt.provider = 'forbidden';
            },
            (receipt: any) => {
                receipt.bead_plan[0].execution_id = 'forged';
            },
        ]) {
            const tampered = cloneV2(value.receipt);
            mutate(tampered);
            assert.throws(() => materialize(value, { receipt: tampered }));
            assert.equal(count(value.db, 'hall_augury_mission_receipts'), 0);
            assert.equal(count(value.db, 'hall_augury_mission_receipt_membership'), 0);
        }
    });

    it('creates no Forge request, authorization, attempt, grant, or provider side effect', async () => {
        const value = await fixture('no-forge-effects');
        materialize(value);
        for (const table of [
            'hall_forge_requests',
            'hall_forge_authorizations',
            'hall_forge_attempts',
            'hall_forge_mission_grants',
            'hall_forge_mission_grant_requests',
        ]) assert.equal(countIfPresent(value.db, table), 0, table);
        assert.equal(count(value.db, 'hall_augury_mission_receipts'), 1);
    });
});
