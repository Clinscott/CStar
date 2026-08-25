import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    persistPreparedForgeRequest,
    prepareForgeRequestMaterialization,
} from '../../../src/tools/pennyone/intel/forge_request_materialization.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    parse,
} from './forge_natural_authorization_test_support.js';
import {
    createAdvancementFixture,
    derivedRequestArgs,
    finalizeFixtureWithoutAdvancement,
    laterRootContext,
    recordFixtureResult,
    type AdvancementFixture,
} from './forge_post_validation_advancement_test_support.js';
import {
    appendMissionTurn,
    createMissionFixture,
    requestMissionChild,
} from './forge_mission_grant_test_support.js';

const originalForgeTestMode = process.env.CSTAR_FORGE_TEST_MODE;

function restoreEnv(): void {
    if (originalForgeTestMode === undefined) delete process.env.CSTAR_FORGE_TEST_MODE;
    else process.env.CSTAR_FORGE_TEST_MODE = originalForgeTestMode;
}

afterEach(() => {
    cleanupNaturalAuthorizationTest();
    restoreEnv();
});

function count(
    fixture: AdvancementFixture,
    table: string,
    beadId?: string,
): number {
    const sql = beadId
        ? `SELECT COUNT(*) FROM ${table} WHERE bead_id = ?`
        : `SELECT COUNT(*) FROM ${table}`;
    return Number(fixture.value.db.prepare(sql).pluck().get(...(beadId ? [beadId] : [])));
}

describe('Augury v2 mission-grant frontier guard', () => {
    it('rejects manual child three, then acceptance authorizes only child two', async () => {
        const fixture = await createAdvancementFixture('manual-child-three-attack', {
            lanes: ['forge', 'forge', 'forge'],
        });
        const context = laterRootContext(fixture);
        const attack = parse(await handleForgeRequest(
            derivedRequestArgs(fixture, 2),
            context,
        ));

        assert.equal(
            attack.error_code,
            'forge_augury_v2_frontier_earlier_unresolved',
            JSON.stringify(attack),
        );
        assert.equal(count(fixture, 'hall_forge_requests'), 1);
        assert.equal(count(
            fixture, 'hall_forge_requests', fixture.child_bead_ids[2],
        ), 0);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 1);

        const accepted = await recordFixtureResult(
            fixture,
            'val-phase4b-manual-child-three-attack',
            'SUCCESS',
            context,
        );
        assert.equal(accepted.status, 'recorded_verified', JSON.stringify(accepted));
        assert.equal(accepted.forge_advancement.status, 'successor_authorized');
        assert.equal(
            accepted.forge_advancement.next_bead_id,
            fixture.child_bead_ids[1],
        );
        assert.equal(count(fixture, 'hall_forge_requests'), 2);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 2);
        assert.equal(count(
            fixture, 'hall_forge_requests', fixture.child_bead_ids[2],
        ), 0);
        assert.equal(Number(fixture.value.db.prepare(`
            SELECT COUNT(*) FROM hall_forge_requests WHERE status = 'AUTHORIZED'
        `).pluck().get()), 1);
    });

    it('permits exact child-two replay and rejects a divergent request race', async () => {
        const fixture = await createAdvancementFixture('frontier-replay-race', {
            lanes: ['forge', 'forge', 'forge'],
        });
        const accepted = await recordFixtureResult(
            fixture,
            'val-phase4b-frontier-replay-race',
        );
        const context = laterRootContext(fixture);
        const exact = parse(await handleForgeRequest(
            derivedRequestArgs(fixture, 1),
            context,
        ));
        assert.equal(exact.status, 'AUTHORIZED', JSON.stringify(exact));
        assert.equal(exact.receipt_id, accepted.forge_advancement.next_request_id);

        const divergentArgs = derivedRequestArgs(fixture, 1);
        divergentArgs.objective = 'Divergent child-two race.';
        const divergent = parse(await handleForgeRequest(divergentArgs, context));
        assert.match(divergent.error_code, /decision_conflict/);
        assert.equal(count(fixture, 'hall_forge_requests'), 2);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 2);
    });

    it('rejects dependency-edge tamper before request persistence', async () => {
        const fixture = await createAdvancementFixture('frontier-edge-tamper', {
            lanes: ['forge', 'forge', 'forge'],
        });
        fixture.value.db.prepare(`
            UPDATE hall_augury_mission_dependency_edges
            SET edge_json = edge_json || ' '
            WHERE receipt_id = ? AND child_bead_id = ?
        `).run(fixture.receipt.receipt_id, fixture.child_bead_ids[1]);
        const result = parse(await handleForgeRequest(
            derivedRequestArgs(fixture, 1),
            laterRootContext(fixture),
        ));
        assert.equal(
            result.error_code,
            'forge_augury_v2_frontier_dependency_edge_drift',
        );
        assert.equal(count(fixture, 'hall_forge_requests'), 1);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 1);
    });

    it('requires authoritative Sterling resolution for a receipt-child dependency', async () => {
        const fixture = await createAdvancementFixture('frontier-sterling-tamper', {
            lanes: ['forge', 'forge', 'forge'],
        });
        const validationId = 'val-phase4b-frontier-sterling-tamper';
        finalizeFixtureWithoutAdvancement(fixture, validationId);
        const raw = fixture.value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(fixture.child_bead_ids[0]) as string;
        const metadata = {
            ...JSON.parse(raw),
            resolved_validation_id: validationId,
        };
        fixture.value.db.prepare(`
            UPDATE hall_beads
            SET status = 'RESOLVED', resolved_validation_id = ?, metadata_json = ?
            WHERE bead_id = ?
        `).run(validationId, JSON.stringify(metadata), fixture.child_bead_ids[0]);

        const result = parse(await handleForgeRequest(
            derivedRequestArgs(fixture, 1),
            laterRootContext(fixture),
        ));
        assert.equal(
            result.error_code,
            'forge_augury_v2_frontier_sterling_not_authoritative',
        );
        assert.equal(count(fixture, 'hall_forge_requests'), 1);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 1);
    });

    it('holds one immediate transaction across frontier guard and request insert', async () => {
        const fixture = await createAdvancementFixture('frontier-two-connection-race', {
            lanes: ['forge', 'forge', 'forge'],
        });
        const requestId = fixture.request.receipt_id as string;
        const clear = fixture.value.db.transaction(() => {
            fixture.value.db.prepare(
                'DELETE FROM hall_forge_attempts WHERE request_id = ?',
            ).run(requestId);
            fixture.value.db.prepare(
                'DELETE FROM hall_forge_mission_grant_requests WHERE request_id = ?',
            ).run(requestId);
            fixture.value.db.prepare(
                'DELETE FROM hall_forge_authorizations WHERE request_id = ?',
            ).run(requestId);
            fixture.value.db.prepare(
                'DELETE FROM hall_forge_requests WHERE request_id = ?',
            ).run(requestId);
        });
        clear.immediate();
        const prepared = await prepareForgeRequestMaterialization({
            args: derivedRequestArgs(fixture, 0),
            code_root: fixture.value.root,
            decision_id: `${fixture.receipt.mission_decision_id}:batch-1`,
        });
        const contender = new Database(fixture.value.db.name, { timeout: 25 });
        let mutationBlocked = false;
        try {
            assert.throws(() => persistPreparedForgeRequest({
                db: fixture.value.db,
                control_root: fixture.value.root,
                code_root: fixture.value.root,
                prepared,
                requester: {
                    thread_id: fixture.receipt.set_identity.root_thread_id,
                    turn_id: fixture.receipt.set_identity.set_turn_id,
                    turn_record_set_sha256:
                        fixture.receipt.set_identity.set_record_set_sha256,
                },
                test_hooks: {
                    after_frontier_guard: () => {
                        assert.throws(() => contender.prepare(`
                            UPDATE hall_beads SET status = 'RESOLVED'
                            WHERE bead_id = ?
                        `).run(fixture.child_bead_ids[0]), /database is locked/);
                        mutationBlocked = true;
                        throw new Error('forge_test_abort_after_frontier_guard');
                    },
                },
            }), /forge_test_abort_after_frontier_guard/);
        } finally {
            contender.close();
        }
        assert.equal(mutationBlocked, true);
        assert.equal(count(fixture, 'hall_forge_requests'), 0);
        assert.equal(count(fixture, 'hall_forge_authorizations'), 0);
        assert.equal(fixture.value.db.prepare(
            'SELECT status FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(fixture.child_bead_ids[0]), 'IN_PROGRESS');
    });

    it('preserves non-Augury mission-grant compatibility behavior', async () => {
        beginNaturalAuthorizationTest();
        const fixture = await createMissionFixture('frontier-non-augury', 3);
        const first = await requestMissionChild(fixture, 0);
        assert.equal(first.status, 'AUTHORIZED', JSON.stringify(first));
        const later = appendMissionTurn(
            fixture,
            'Continue the unchanged non-Augury compatibility mission.',
        );
        const third = await requestMissionChild(fixture, 2, later);
        assert.equal(third.status, 'AUTHORIZED', JSON.stringify(third));
        assert.equal(third.mission_grant_id, first.mission_grant_id);
    });
});
