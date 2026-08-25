import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    AutomaticMissionDispatchStore,
    buildAutomaticMissionDispatchRepositoryId,
    type EnqueueAutomaticMissionDispatchInput,
} from '../../../src/tools/pennyone/intel/automatic_mission_dispatch_store.js';
import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';

const NOW = 2_100_000;
const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function root(label: string): string {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), `cstar-dispatch-${label}-`));
    roots.push(value);
    return value;
}

function store(codeRoot: string, controlRoot = codeRoot): AutomaticMissionDispatchStore {
    registry.setRoot(controlRoot);
    return new AutomaticMissionDispatchStore({
        code_root: codeRoot,
        control_root: controlRoot,
        default_deadline_ms: 10_000,
        max_deadline_ms: 30_000,
    });
}

function intent(overrides: Partial<EnqueueAutomaticMissionDispatchInput> = {})
    : EnqueueAutomaticMissionDispatchInput {
    return {
        source_kind: 'automatic_mission',
        mission_id: 'mission:cstar:durable-a1',
        decision_id: 'decision:cstar:durable-a1',
        bead_id: 'bead:cstar:durable-a1',
        idempotency_key: 'automatic-mission:durable-a1',
        intent_binding: { request_sha256: 'a'.repeat(64), spend_ceiling: 0 },
        deadline_at: NOW + 10_000,
        now: NOW,
        ...overrides,
    };
}

function insertSpoke(controlRoot: string, spokeRoot: string, status: string): void {
    const db = database.getWritableDb(controlRoot);
    const hallId = buildHallRepositoryId(normalizeHallPath(controlRoot));
    db.prepare(`
        INSERT INTO hall_mounted_spokes (
            spoke_id, repo_id, slug, kind, root_path, mount_status, trust_level,
            write_policy, projection_status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'local', ?, ?, 'trusted', 'read_write', 'current', '{}', ?, ?)
    `).run(`spoke:test:${path.basename(spokeRoot)}`, hallId, path.basename(spokeRoot),
        spokeRoot, status, NOW, NOW);
}

describe('durable automatic mission dispatch intents', () => {
    it('persists one receipt and returns it unchanged after process-local state is discarded', () => {
        const controlRoot = root('replay');
        const first = store(controlRoot).enqueue(intent({ deadline_at: undefined }));
        assert.equal(first.replayed, false);
        assert.equal(first.receipt.state, 'queued');
        assert.equal(first.receipt.deadline_at, NOW + 10_000);
        assert.equal(first.receipt.worker_launch_performed, false);

        closeDb();
        const replay = store(controlRoot).enqueue(intent({
            deadline_at: undefined,
            now: NOW + 1,
        }));
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.receipt, first.receipt);
        assert.equal(replay.receipt.deadline_at, first.receipt.deadline_at);
        assert.equal(Number(database.getWritableDb(controlRoot).prepare(
            'SELECT COUNT(*) FROM hall_automatic_mission_dispatch_intents',
        ).pluck().get()), 1);
    });

    it('rejects an explicit replay deadline conflict and preserves the original row', () => {
        const controlRoot = root('deadline-conflict');
        const dispatch = store(controlRoot);
        const first = dispatch.enqueue(intent({ deadline_at: undefined }));
        assert.throws(() => dispatch.enqueue(intent({
            now: NOW + 1,
            deadline_at: first.receipt.deadline_at + 1,
        })), /automatic_mission_dispatch_idempotency_conflict/);
        assert.deepEqual(dispatch.getByIdempotencyKey(intent().idempotency_key)?.receipt,
            first.receipt);
        assert.equal(Number(database.getWritableDb(controlRoot).prepare(
            'SELECT COUNT(*) FROM hall_automatic_mission_dispatch_intents',
        ).pluck().get()), 1);
    });

    it('rejects an idempotency-key conflict without replacing the receipt', () => {
        const controlRoot = root('conflict');
        const dispatch = store(controlRoot);
        const first = dispatch.enqueue(intent());
        assert.throws(() => dispatch.enqueue(intent({
            intent_binding: { request_sha256: 'b'.repeat(64), spend_ceiling: 0 },
        })), /automatic_mission_dispatch_idempotency_conflict/);
        assert.deepEqual(dispatch.getByIdempotencyKey(intent().idempotency_key)?.receipt,
            first.receipt);
    });

    it('derives the live root identity and fails mismatches before persistence', () => {
        const controlRoot = root('identity');
        const dispatch = store(controlRoot);
        const expectedId = buildAutomaticMissionDispatchRepositoryId(controlRoot);
        const queued = dispatch.enqueue(intent());
        assert.equal(queued.receipt.repository_id, expectedId);
        assert.equal(queued.receipt.root_path, controlRoot);

        assert.throws(() => dispatch.enqueue(intent({
            idempotency_key: 'automatic-mission:mismatch',
            repository_id: 'repo:cstar:not-the-root',
            root_path: controlRoot,
        })), /automatic_mission_dispatch_repository_id_root_mismatch/);
        assert.equal(Number(database.getWritableDb(controlRoot).prepare(`
            SELECT COUNT(*) FROM hall_automatic_mission_dispatch_intents
            WHERE idempotency_key = 'automatic-mission:mismatch'
        `).pluck().get()), 0);
    });

    it('accepts only active registered mounted spokes', () => {
        const controlRoot = root('hub');
        const inactiveRoot = root('inactive-spoke');
        const unknownRoot = root('unknown-spoke');
        insertSpoke(controlRoot, inactiveRoot, 'pending');
        const dispatch = store(controlRoot);
        const inactiveId = buildAutomaticMissionDispatchRepositoryId(inactiveRoot);
        assert.throws(() => dispatch.enqueue(intent({
            idempotency_key: 'automatic-mission:inactive',
            repository_id: inactiveId,
            root_path: inactiveRoot,
        })), /automatic_mission_dispatch_repository_inactive/);
        assert.throws(() => dispatch.enqueue(intent({
            idempotency_key: 'automatic-mission:unknown',
            repository_id: buildAutomaticMissionDispatchRepositoryId(unknownRoot),
            root_path: unknownRoot,
        })), /automatic_mission_dispatch_repository_unknown/);

        database.getWritableDb(controlRoot).prepare(`
            UPDATE hall_mounted_spokes SET mount_status = 'active' WHERE root_path = ?
        `).run(inactiveRoot);
        const queued = dispatch.enqueue(intent({
            idempotency_key: 'automatic-mission:active',
            repository_id: inactiveId,
            root_path: inactiveRoot,
        }));
        assert.equal(queued.receipt.repository_id, inactiveId);
    });

    it('enforces typed host transitions, bounded cancellation, and deadline expiry', () => {
        const controlRoot = root('states');
        const dispatch = store(controlRoot);
        const queued = dispatch.enqueue(intent()).receipt;
        const claimed = dispatch.transition(queued.dispatch_id, 'claimed', {
            now: NOW + 1, claimed_by: 'luna-host:worker-1',
        });
        assert.equal(claimed.state, 'claimed');
        assert.equal(claimed.worker_launch_performed, false);
        const delivered = dispatch.transition(queued.dispatch_id, 'delivered_unverified', {
            now: NOW + 2, detail: 'Host reported delivery; independent validation remains required.',
        });
        assert.equal(delivered.state, 'delivered_unverified');
        const validated = dispatch.transition(queued.dispatch_id, 'validated', { now: NOW + 3 });
        assert.equal(validated.state, 'validated');
        assert.throws(() => dispatch.transition(queued.dispatch_id, 'failed', { now: NOW + 4 }),
            /automatic_mission_dispatch_transition_invalid/);

        const cancelled = dispatch.enqueue(intent({
            mission_id: 'mission:cstar:cancelled',
            idempotency_key: 'automatic-mission:cancelled',
        })).receipt;
        assert.equal(dispatch.transition(cancelled.dispatch_id, 'cancelled', {
            now: NOW + 1, detail: 'Operator cancelled before host claim.',
        }).state, 'cancelled');
        assert.throws(() => dispatch.transition(cancelled.dispatch_id, 'cancelled', {
            now: NOW + 2, detail: 'x'.repeat(513),
        }), /automatic_mission_dispatch_transition_invalid/);

        const expiring = dispatch.enqueue(intent({
            mission_id: 'mission:cstar:expiring',
            idempotency_key: 'automatic-mission:expiring',
            deadline_at: NOW + 5,
        })).receipt;
        assert.equal(dispatch.transition(expiring.dispatch_id, 'claimed', {
            now: NOW + 5,
        }).state, 'expired');
        assert.throws(() => dispatch.enqueue(intent({
            idempotency_key: 'automatic-mission:unbounded',
            deadline_at: NOW + 30_001,
        })), /automatic_mission_dispatch_deadline_invalid/);
    });
});
