import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import {
    buildOneMindAgentPresencePayload,
    buildOneMindCoordinationEventsPayload,
    buildOneMindStatusPayload,
} from '../../src/node/core/commands/one-mind.js';
import {
    fulfillNextOneMindRequest,
    fulfillOneMindRequestById,
    getOneMindFulfillmentCapability,
    getOneMindQueueSummary,
    seedHallBrokerIfMissing,
    syncOneMindBrokerFulfillment,
} from '../../src/node/core/one_mind_broker/fulfillment.js';
import {
    ensureOneMindBroker,
    getOneMindBrokerStatus,
    stopOneMindBroker,
} from '../../src/node/core/one_mind_broker/manager.js';
import {
    closeDb,
    getHallOneMindBroker,
    getHallOneMindRequest,
    saveHallAgentPresence,
    saveHallCoordinationEvent,
    saveHallOneMindBroker,
    saveHallOneMindRequest,
} from '../../src/tools/pennyone/intel/database.js';
import {
    buildHallCoordinationThreadId,
    buildHallRepositoryId,
    normalizeHallPath,
} from '../../src/types/hall.js';
import { ensureHealthySynapseDb } from '../../src/core/synapse_db.js';

function makeRoot(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('retired One Mind read-only projection', () => {
    it('always reports fulfillment as retired regardless of host-provider flags', () => {
        assert.deepEqual(getOneMindFulfillmentCapability({
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
            CORVUS_HOST_PROVIDER: 'codex',
        }), {
            ready: false,
            provider: null,
            reason: 'one-mind-retired-read-only',
        });
    });

    it('projects historical broker identity without advertising a live execution lane', async () => {
        const rootPath = makeRoot('corvus-one-mind-retired-status-');
        const now = Date.now();
        saveHallOneMindBroker({
            repo_id: buildHallRepositoryId(normalizeHallPath(rootPath)),
            status: 'READY',
            binding_state: 'BOUND',
            fulfillment_ready: true,
            provider: 'codex',
            session_id: 'historical-thread',
            control_plane: 'hall',
            metadata: { execution_surface: 'host-cli-inference' },
            created_at: now,
            updated_at: now,
        }, rootPath);

        const status = await getOneMindBrokerStatus(rootPath);
        assert.deepEqual(status, {
            running: false,
            responsive: false,
            fulfillmentReady: false,
            fulfillmentReason: 'one-mind-retired-read-only',
            fulfillmentMode: 'read_only',
            executionSurface: 'unavailable',
            provider: 'codex',
            sessionId: 'historical-thread',
            pid: null,
            port: null,
            bindingState: 'OFFLINE',
        });

        const payload = buildOneMindStatusPayload(status, rootPath);
        assert.equal(payload.broker.fulfillment_ready, false);
        assert.equal(payload.broker.execution_surface, 'unavailable');
        closeDb();
    });

    it('keeps start, stop, seed, and sync compatibility functions non-mutating', async () => {
        const rootPath = makeRoot('corvus-one-mind-retired-manager-');
        const before = getHallOneMindBroker(rootPath);

        const ensured = await ensureOneMindBroker(rootPath, {
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
        });
        seedHallBrokerIfMissing(rootPath, { CODEX_SHELL: '1' });
        syncOneMindBrokerFulfillment(rootPath, { CODEX_SHELL: '1' });
        const stopped = await stopOneMindBroker(rootPath, { CODEX_SHELL: '1' });

        assert.equal(ensured.fulfillmentReady, false);
        assert.equal(stopped, false);
        assert.equal(before, null);
        assert.equal(getHallOneMindBroker(rootPath), null);
        closeDb();
    });

    it('fails a specific fulfillment without claiming, spawning, or changing Hall', async () => {
        const rootPath = makeRoot('corvus-one-mind-retired-fulfill-');
        const now = Date.now();
        const synapsePath = path.join(rootPath, '.stats', 'synapse.db');
        ensureHealthySynapseDb(synapsePath);
        const synapse = new Database(synapsePath);
        try {
            synapse.prepare('INSERT INTO synapse (prompt, status) VALUES (?, ?)')
                .run('Do not mutate this row.', 'PENDING');
        } finally {
            synapse.close();
        }
        saveHallOneMindRequest({
            request_id: 'request-retired',
            repo_id: buildHallRepositoryId(normalizeHallPath(rootPath)),
            caller_source: 'test-suite',
            boundary: 'subagent',
            request_status: 'PENDING',
            transport_preference: 'host_session',
            prompt: 'Implement a file through the retired lane.',
            metadata: { task_kind: 'implementation', provider: 'codex' },
            created_at: now,
            updated_at: now,
        }, rootPath);

        let invocationCount = 0;
        const dependency = () => {
            invocationCount += 1;
            throw new Error('must not execute');
        };
        const before = getHallOneMindRequest('request-retired', rootPath);
        const synapseBefore = fs.readFileSync(synapsePath);
        const result = await fulfillOneMindRequestById(
            rootPath,
            'request-retired',
            { CODEX_SHELL: '1' },
            {
                hostTextInvoker: dependency,
                delegatedExecutionInvoker: dependency,
                delegatedExecutionResolver: dependency,
            },
        );
        const after = getHallOneMindRequest('request-retired', rootPath);

        assert.equal(result.outcome, 'failed');
        assert.match(result.error, /retired and read-only/i);
        assert.equal(invocationCount, 0);
        assert.deepEqual(after, before);
        assert.deepEqual(fs.readFileSync(synapsePath), synapseBefore);
        closeDb();
    });

    it('fails fulfill-next without claiming the oldest request', async () => {
        const rootPath = makeRoot('corvus-one-mind-retired-next-');
        const now = Date.now();
        saveHallOneMindRequest({
            request_id: 'request-next-retired',
            repo_id: buildHallRepositoryId(normalizeHallPath(rootPath)),
            caller_source: 'test-suite',
            boundary: 'primary',
            request_status: 'PENDING',
            transport_preference: 'host_session',
            prompt: 'Do not claim this request.',
            created_at: now,
            updated_at: now,
        }, rootPath);

        const result = await fulfillNextOneMindRequest(rootPath, { GEMINI_CLI: '1' });

        assert.equal(result.outcome, 'failed');
        assert.match(result.error, /CStar Forge/i);
        assert.equal(getHallOneMindRequest('request-next-retired', rootPath)?.request_status, 'PENDING');
        assert.deepEqual(getOneMindQueueSummary(rootPath), { PENDING: 1 });
        closeDb();
    });

    it('preserves read-only agent and coordination-event visibility', () => {
        const rootPath = makeRoot('corvus-one-mind-retired-visibility-');
        const now = Date.now();
        const repoId = buildHallRepositoryId(normalizeHallPath(rootPath));
        saveHallAgentPresence({
            repo_id: repoId,
            agent_id: 'codex',
            name: 'Codex',
            agent_kind: 'host',
            status: 'SLEEPING',
            current_task: 'Historical task',
            last_seen_at: now,
            metadata: {},
            created_at: now,
            updated_at: now,
        }, rootPath);
        saveHallCoordinationEvent({
            event_id: 'event-one-mind-history',
            repo_id: repoId,
            thread_id: buildHallCoordinationThreadId({ beadId: 'bead:test' }),
            event_kind: 'INFO',
            scope_kind: 'BEAD',
            scope_ref: 'bead:test',
            from_agent_id: 'codex',
            rationale: 'Preserve historical visibility.',
            summary: 'Historical event',
            payload: {},
            created_at: now,
            updated_at: now,
            metadata: {},
        }, rootPath);

        assert.equal(buildOneMindAgentPresencePayload(rootPath).agents[0]?.agent_id, 'codex');
        assert.equal(buildOneMindCoordinationEventsPayload(rootPath).events[0]?.event_id, 'event-one-mind-history');
        closeDb();
    });
});
