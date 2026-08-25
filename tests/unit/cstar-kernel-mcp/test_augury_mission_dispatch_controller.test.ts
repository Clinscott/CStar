import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CODE_ROOT } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import { ensureAuguryMissionReceiptSchema } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_schema.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    parse,
} from './forge_natural_authorization_test_support.js';
import {
    bindReplay,
    callBoundaryAugury,
    cloneBoundary,
    createDispatchFixture,
    parentMetadataBytes,
    requestFirstChild,
    tableCount,
} from './augury_mission_dispatch_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('Augury SET mission dispatch and materialization', () => {
    it('commits against the control Hall while validating the live code root', async () => {
        const fixture = await createDispatchFixture('split-roots');
        assert.notEqual(fixture.value.root, CODE_ROOT);
        const { response, payload } = await callBoundaryAugury(fixture);
        assert.equal(response.isError, undefined);
        assert.equal(payload.mission_boundary_receipt.repository.root_path, CODE_ROOT);
        assert.deepEqual(payload.mission_boundary_plan,
            payload.mission_boundary_receipt.bead_plan);
        assert.deepEqual(payload.ordered_bead_ids, fixture.child_bead_ids);
        assert.deepEqual(payload.materialization, { replayed: false });
        const stored = fixture.value.db.prepare(`
            SELECT repo_id, repository_root FROM hall_augury_mission_receipts
        `).get() as Record<string, unknown>;
        assert.equal(stored.repo_id,
            buildHallRepositoryId(normalizeHallPath(fixture.value.root)));
        assert.equal(stored.repository_root, CODE_ROOT);
        assert.equal(parentMetadataBytes(fixture), fixture.parent_metadata_bytes);
    });

    it('allows one initial call and only an explicitly bound exact replay', async () => {
        const fixture = await createDispatchFixture('exact-replay');
        const first = await callBoundaryAugury(fixture);
        assert.equal(first.payload.materialization.replayed, false);
        const unbound = await callBoundaryAugury(fixture);
        assert.equal(unbound.response.isError, true);
        assert.equal(unbound.payload.error_code,
            'augury_mission_materialization_replay_binding_required');
        assert.equal(unbound.payload.mission_boundary_receipt, undefined);
        const replay = cloneBoundary(fixture);
        bindReplay(replay, first.payload.mission_boundary_receipt);
        const second = await callBoundaryAugury(fixture, replay);
        assert.equal(second.response.isError, undefined);
        assert.equal(second.payload.materialization.replayed, true);
        assert.deepEqual(second.payload.mission_boundary_receipt,
            first.payload.mission_boundary_receipt);
        assert.equal(tableCount(fixture, 'hall_augury_mission_receipts'), 1);
    });

    it('rejects a different receipt at the same decision and parent boundary', async () => {
        const fixture = await createDispatchFixture('receipt-conflict');
        await callBoundaryAugury(fixture);
        const drifted = cloneBoundary(fixture);
        drifted.bead_plan[0]!.acceptance_obligations[0] = 'Different accepted bytes.';
        const { response, payload } = await callBoundaryAugury(fixture, drifted);
        assert.equal(response.isError, true);
        assert.equal(payload.error_code,
            'augury_mission_materialization_receipt_conflict');
        assert.equal(payload.mission_boundary_receipt, undefined);
        assert.equal(tableCount(fixture, 'hall_augury_mission_receipts'), 1);
    });

    it('hides receipt and plan when parent lineage is stale', async () => {
        const fixture = await createDispatchFixture('parent-stale');
        fixture.value.db.prepare(`
            UPDATE hall_beads
            SET metadata_json = json_set(metadata_json, '$.design_sha256', ?)
            WHERE bead_id = ?
        `).run('8'.repeat(64), fixture.parent_bead_id);
        const { response, payload } = await callBoundaryAugury(fixture);
        assert.equal(response.isError, true);
        assert.equal(payload.error_code,
            'augury_mission_materialization_parent_stale');
        assert.equal(payload.mission_boundary_receipt, undefined);
        assert.equal(payload.mission_boundary_plan, undefined);
        assert.equal(payload.ordered_bead_ids, undefined);
        assert.equal(tableCount(fixture, 'hall_augury_mission_receipts'), 0);
    });

    it('rolls back collision and injected failures without a visible partial batch', async () => {
        const collision = await createDispatchFixture('collision');
        const now = Date.now();
        collision.value.db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, rationale, status, metadata_json, created_at, updated_at
            ) VALUES (?, ?, 'collision', 'OPEN', '{}', ?, ?)
        `).run(
            collision.child_bead_ids[1],
            buildHallRepositoryId(normalizeHallPath(collision.value.root)),
            now,
            now,
        );
        const collided = await callBoundaryAugury(collision);
        assert.equal(collided.payload.error_code,
            'augury_mission_materialization_atomic_failure');
        assert.equal(collided.payload.mission_boundary_receipt, undefined);
        assert.equal(tableCount(collision, 'hall_augury_mission_receipts'), 0);
        assert.equal(tableCount(collision, 'hall_augury_mission_receipt_membership'), 0);

        cleanupNaturalAuthorizationTest();
        beginNaturalAuthorizationTest();
        const injected = await createDispatchFixture('injected');
        ensureAuguryMissionReceiptSchema(injected.value.db);
        injected.value.db.exec(`
            CREATE TRIGGER inject_phase3_failure
            BEFORE INSERT ON hall_augury_mission_receipt_membership
            WHEN NEW.plan_order = 2
            BEGIN SELECT RAISE(ABORT, 'injected_phase3_failure'); END;
        `);
        const failed = await callBoundaryAugury(injected);
        assert.equal(failed.payload.error_code,
            'augury_mission_materialization_atomic_failure');
        assert.equal(failed.payload.mission_boundary_plan, undefined);
        assert.equal(tableCount(injected, 'hall_augury_mission_receipts'), 0);
        assert.equal(tableCount(injected, 'hall_augury_mission_receipt_membership'), 0);
        assert.equal(tableCount(injected, 'hall_augury_mission_dependency_edges'), 0);
    });

    it('returns all 64 ordered children without relying on capped bead listing', async () => {
        const fixture = await createDispatchFixture('sixty-four', 64);
        const { payload } = await callBoundaryAugury(fixture);
        assert.equal(payload.mission_boundary_plan.length, 64);
        assert.equal(payload.ordered_bead_ids.length, 64);
        assert.deepEqual(payload.ordered_bead_ids, fixture.child_bead_ids);
        assert.equal(tableCount(fixture, 'hall_augury_mission_receipt_membership'), 64);
        assert.equal(fixture.value.db.prepare(`
            SELECT COUNT(*) FROM hall_beads
            WHERE source_kind = 'augury_mission_receipt'
        `).pluck().get(), 64);
    });

    it('leaves ordinary advisory Augury byte-stable and read-only', async () => {
        const fixture = await createDispatchFixture('ordinary-advisory');
        const before = fixture.value.db.serialize();
        const first = await handleAugury({ prompt: 'Explain the current build route.' });
        const second = await handleAugury({ prompt: 'Explain the current build route.' });
        assert.equal(first.content[0]!.text, second.content[0]!.text);
        assert.equal(first.isError, undefined);
        assert.equal(parse(first).mission_boundary_receipt, undefined);
        assert.deepEqual(fixture.value.db.serialize(), before);
    });

    it('does not request, authorize, or attempt Forge during Augury', async () => {
        const fixture = await createDispatchFixture('no-forge-during-augury');
        await callBoundaryAugury(fixture);
        assert.equal(tableCount(fixture, 'hall_forge_requests'), 0);
        assert.equal(tableCount(fixture, 'hall_forge_authorizations'), 0);
        assert.equal(tableCount(fixture, 'hall_forge_attempts'), 0);
    });

    it('lets the subsequent first-child request derive AUTHORIZED with zero attempts', async () => {
        const fixture = await createDispatchFixture('first-child-authorized');
        const augury = await callBoundaryAugury(fixture);
        assert.equal(augury.payload.materialization.replayed, false);
        const request = await requestFirstChild(fixture);
        assert.equal(request.status, 'AUTHORIZED');
        assert.equal(request.request_status, 'AUTHORIZED');
        assert.equal(request.mission_grant_status, 'ACTIVE');
        assert.equal(request.dispatch_execution.attempted, false);
        assert.equal(tableCount(fixture, 'hall_forge_attempts'), 0);
    });
});
