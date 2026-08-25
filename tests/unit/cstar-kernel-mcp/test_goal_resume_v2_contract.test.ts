import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
    GOAL_RESUME_V2_RECEIPT_KEYS,
    HOST_GOAL_PROJECTION_SCHEMA,
    buildGoalResumeV2GoalRef,
    canonicalizeGoalResumeV2Args,
    hashCanonicalGoalProjectionMaterial,
    isGoalResumeV1Id,
    isGoalResumeV2Id,
    sha256Text,
} from '../../../src/tools/pennyone/intel/goal_resume_v2_contract.js';

const REQUEST_ID = `dispatch-forge-${'a'.repeat(32)}`;
const REQUEST_SHA256 = 'b'.repeat(64);
const THREAD_ID = '11111111-1111-4111-8111-111111111111';
const OBJECTIVE = 'Host goal é remains blocked; continue the unchanged request.';

function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

function projection(overrides: Record<string, unknown> = {}) {
    return {
        schema: HOST_GOAL_PROJECTION_SCHEMA,
        threadId: THREAD_ID,
        objective: OBJECTIVE,
        status: 'blocked' as const,
        tokensUsed: 12,
        timeUsedSeconds: 34,
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_001,
        hostResumeCapability: 'unavailable' as const,
        ...overrides,
    };
}

function args(overrides: Record<string, unknown> = {}) {
    return {
        forge_request_receipt_id: REQUEST_ID,
        request_sha256: REQUEST_SHA256,
        host_goal_projection: projection(),
        ...overrides,
    };
}

describe('goal-resume v2 canonical contract', () => {
    it('accepts only request id, request hash, and host projection caller material', () => {
        const canonical = canonicalizeGoalResumeV2Args(args());
        assert.equal(canonical.request_id, REQUEST_ID);
        assert.equal(canonical.request_sha256, REQUEST_SHA256);
        assert.equal(canonical.projection.host_goal_thread_id, THREAD_ID);
        for (const extra of ['bead_id', 'decision_id', 'request_bead_id', 'scope']) {
            assert.throws(
                () => canonicalizeGoalResumeV2Args(args({ [extra]: 'caller-supplied' })),
                /goal_resume_v2_input_shape_invalid/,
            );
        }
    });

    it('hashes exact decomposed UTF-8 objective bytes without trim or normalization', () => {
        const value = projection();
        const canonical = canonicalizeGoalResumeV2Args(args({ host_goal_projection: value }));
        const expected = sha256(Buffer.from(OBJECTIVE, 'utf8'));

        assert.equal(Buffer.from('é', 'utf8').toString('hex'), '65cc81');
        assert.equal(canonical.projection.host_goal_objective_sha256, expected);
        assert.notEqual(expected, sha256(OBJECTIVE.trim().normalize('NFC')));
        assert.equal(sha256Text(OBJECTIVE), expected);
    });

    it('uses stable snapshot material and excludes counters and raw text', () => {
        const canonical = canonicalizeGoalResumeV2Args(args());
        const { host_goal_snapshot_sha256: ignored, ...material } = canonical.projection;
        const expected = JSON.stringify({
            schema: 'cstar.host_goal_snapshot.v1',
            host_goal_thread_id: THREAD_ID,
            host_goal_objective_sha256: canonical.projection.host_goal_objective_sha256,
            host_goal_status: 'blocked',
            host_goal_created_at: 1_700_000_000,
            host_goal_updated_at: 1_700_000_001,
            host_resume_capability: 'unavailable',
        });

        assert.equal(hashCanonicalGoalProjectionMaterial(material), sha256(expected));
        assert.equal(canonical.projection.host_goal_snapshot_sha256, sha256(expected));
        assert.equal(Object.hasOwn(canonical.projection, 'objective'), false);
        assert.equal(Object.hasOwn(canonical.projection, 'tokensUsed'), false);
        assert.equal(Object.hasOwn(canonical.projection, 'timeUsedSeconds'), false);
        assert.equal(ignored, canonical.projection.host_goal_snapshot_sha256);
    });

    it('validates schema, status, capability, timestamps, and hash formats', () => {
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ request_sha256: 'B'.repeat(64) })),
            /goal_resume_v2_request_sha256_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ schema: 'v2' }) })),
            /goal_resume_v2_projection_schema_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ status: 'active' }) })),
            /goal_resume_v2_status_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ hostResumeCapability: 'available' }) })),
            /goal_resume_v2_capability_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ createdAt: 2, updatedAt: 1 }) })),
            /goal_resume_v2_timestamp_order_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ tokensUsed: -1 }) })),
            /goal_resume_v2_tokens_used_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ timeUsedSeconds: 1.5 }) })),
            /goal_resume_v2_time_used_seconds_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ createdAt: 1.5 }) })),
            /goal_resume_v2_created_at_invalid/,
        );
        assert.throws(
            () => canonicalizeGoalResumeV2Args(args({ host_goal_projection: projection({ updatedAt: -1 }) })),
            /goal_resume_v2_updated_at_invalid/,
        );
    });

    it('rejects hash-only host material instead of accepting caller hashes', () => {
        assert.throws(
            () => canonicalizeGoalResumeV2Args({
                forge_request_receipt_id: REQUEST_ID,
                request_sha256: REQUEST_SHA256,
                host_goal_projection: {
                    schema: HOST_GOAL_PROJECTION_SCHEMA,
                    threadId: THREAD_ID,
                    host_goal_objective_sha256: 'c'.repeat(64),
                    host_goal_snapshot_sha256: 'd'.repeat(64),
                },
            }),
            /goal_resume_v2_projection_shape_invalid/,
        );
    });

    it('keeps v1 receipt ids historical-only and v2 ids distinct', () => {
        const v1 = `goal-resume:${'c'.repeat(64)}`;
        const v2 = `goal-resume-v2:${'d'.repeat(64)}`;
        assert.equal(isGoalResumeV1Id(v1), true);
        assert.equal(isGoalResumeV2Id(v1), false);
        assert.equal(isGoalResumeV2Id(v2), true);
        assert.equal(isGoalResumeV1Id(v2), false);
        assert.equal(GOAL_RESUME_V2_RECEIPT_KEYS.includes('objective'), false);
        assert.equal(GOAL_RESUME_V2_RECEIPT_KEYS.includes('tokensUsed'), false);
        assert.equal(GOAL_RESUME_V2_RECEIPT_KEYS.includes('timeUsedSeconds'), false);
        assert.equal(GOAL_RESUME_V2_RECEIPT_KEYS.includes('operator_message'), false);
        assert.match(buildGoalResumeV2GoalRef({
            request_id: REQUEST_ID,
            request_sha256: REQUEST_SHA256,
            projection: canonicalizeGoalResumeV2Args(args()).projection,
        }), /^codex-goal-v2:[a-f0-9]{64}$/);
    });
});
