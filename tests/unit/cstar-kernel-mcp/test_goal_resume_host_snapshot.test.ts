import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
    canonicalizeHostGoalSnapshot,
    hashHostGoalSnapshotMaterial,
    serializeHostGoalSnapshotMaterial,
    verifyCanonicalHostGoalSnapshotMaterial,
    type HostGoalSnapshotInput,
} from '../../../src/tools/pennyone/intel/host_goal_snapshot.js';

const OBJECTIVE = '  é exact UTF-8 objective  ';
const DECOMPOSED_ACCENT = 'é';

function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

function snapshot(overrides: Partial<HostGoalSnapshotInput> = {}): HostGoalSnapshotInput {
    return {
        schema: 'cstar.host_goal_snapshot.v1',
        threadId: 'thread:root-goal',
        objective: OBJECTIVE,
        status: 'blocked',
        hostResumeCapability: 'unavailable',
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_001,
        ...overrides,
    };
}

describe('canonical host-goal snapshot contract', () => {
    it('hashes the exact objective UTF-8 bytes without trim or normalization', () => {
        const input = snapshot();
        const canonical = canonicalizeHostGoalSnapshot(input);

        assert.equal(input.objective.includes(DECOMPOSED_ACCENT), true);
        assert.equal(Buffer.from(DECOMPOSED_ACCENT, 'utf8').toString('hex'), '65cc81');
        assert.equal(canonical.objectiveSha256, sha256(Buffer.from(input.objective, 'utf8')));
        assert.notEqual(canonical.objectiveSha256, sha256(input.objective.trim().normalize('NFC')));
        assert.equal(canonical.material.objective_sha256, canonical.objectiveSha256);
    });

    it('uses stable material serialization and excludes raw objective and volatile counters', () => {
        const canonical = canonicalizeHostGoalSnapshot(snapshot());
        const expected = JSON.stringify({
            schema: 'cstar.host_goal_snapshot.v1',
            host_goal_thread_id: 'thread:root-goal',
            objective_sha256: canonical.objectiveSha256,
            status: 'blocked',
            created_at: 1_700_000_000,
            updated_at: 1_700_000_001,
            host_resume_capability: 'unavailable',
        });

        assert.equal(canonical.serialized, expected);
        assert.equal(serializeHostGoalSnapshotMaterial(canonical.material), expected);
        assert.equal(hashHostGoalSnapshotMaterial(canonical.material), canonical.snapshotSha256);
        assert.equal(Object.hasOwn(canonical.material, 'objective'), false);
        assert.equal(Object.hasOwn(canonical.material, 'tokensUsed'), false);
        assert.equal(Object.hasOwn(canonical.material, 'timeUsedSeconds'), false);
    });

    it('rejects extra counters and raw objective material', () => {
        for (const counter of ['tokensUsed', 'timeUsedSeconds']) {
            assert.throws(
                () => canonicalizeHostGoalSnapshot({ ...snapshot(), [counter]: 1 }),
                /goal_resume_host_goal_snapshot_required/,
            );
        }
        const canonical = canonicalizeHostGoalSnapshot(snapshot());
        assert.throws(
            () => verifyCanonicalHostGoalSnapshotMaterial(
                { ...canonical.material, objective: OBJECTIVE },
                canonical.snapshotSha256,
            ),
            /goal_resume_snapshot_material_shape_invalid/,
        );
    });

    it('fails closed on schema, blocked-status, and unavailable-capability drift', () => {
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), schema: 'cstar.host_goal_snapshot.v2' as never }),
            /goal_resume_snapshot_schema_invalid/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), status: 'active' as never }),
            /goal_resume_host_status_must_remain_blocked/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), hostResumeCapability: 'available' as never }),
            /goal_resume_host_capability_must_be_unavailable/,
        );
    });

    it('validates timestamp values and ordering', () => {
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), createdAt: 2, updatedAt: 1 }),
            /goal_resume_snapshot_timestamp_order_invalid/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), createdAt: 1.5 }),
            /goal_resume_snapshot_created_at_invalid/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot({ ...snapshot(), updatedAt: -1 }),
            /goal_resume_snapshot_updated_at_invalid/,
        );
    });

    it('rejects hash-only input and optional assertion mismatches', () => {
        const canonical = canonicalizeHostGoalSnapshot(snapshot());
        assert.throws(
            () => canonicalizeHostGoalSnapshot(undefined, 'a'.repeat(64), 'b'.repeat(64)),
            /goal_resume_host_goal_snapshot_required/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot(snapshot(), 'not-a-hash', canonical.snapshotSha256),
            /goal_resume_snapshot_objective_hash_invalid/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot(snapshot(), '0'.repeat(64), canonical.snapshotSha256),
            /goal_resume_snapshot_objective_hash_mismatch/,
        );
        assert.throws(
            () => canonicalizeHostGoalSnapshot(snapshot(), canonical.objectiveSha256, '0'.repeat(64)),
            /goal_resume_snapshot_hash_mismatch/,
        );
        assert.throws(
            () => verifyCanonicalHostGoalSnapshotMaterial(
                canonical.material,
                '0'.repeat(64),
                canonical.objectiveSha256,
            ),
            /goal_resume_snapshot_hash_mismatch/,
        );
    });
});
