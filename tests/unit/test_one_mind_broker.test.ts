import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { buildOneMindStatusPayload } from '../../src/node/core/commands/one-mind.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';
import { ensureOneMindBroker, getOneMindBrokerStatus, stopOneMindBroker } from '../../src/node/core/one_mind_broker/manager.js';
import { fulfillNextOneMindRequest, fulfillOneMindRequestById } from '../../src/node/core/one_mind_broker/fulfillment.js';
import { closeDb, getHallOneMindBroker, getHallOneMindRequest, listHallOneMindRequests, saveHallOneMindRequest, saveHallPlanningSession } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { ensureHealthySynapseDb } from '../../src/core/synapse_db.js';

describe('One Mind broker scaffold', () => {
    it('persists broker state in the workspace Hall', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-broker-hall-'));
        const status = await ensureOneMindBroker(tmpRoot, {
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
            CORVUS_HOST_PROVIDER: 'codex',
        });

        const record = getHallOneMindBroker(tmpRoot);
        assert.ok(record);
        assert.equal(status.running, true);
        assert.equal(status.bindingState, 'BOUND');
        assert.equal(status.fulfillmentReady, true);
        assert.equal(status.fulfillmentReason, 'codex-host-cli-inference');
        assert.equal(status.fulfillmentMode, 'host_session');
        assert.equal(status.executionSurface, 'host-cli-inference');
        assert.equal(record?.repo_id, buildHallRepositoryId(normalizeHallPath(tmpRoot)));
        assert.equal(record?.control_plane, 'hall');
        assert.equal(record?.provider, 'codex');
        assert.equal(record?.session_id, 'thread-1');

        const stopped = await stopOneMindBroker(tmpRoot, {});
        assert.equal(stopped, true);
        assert.equal(getHallOneMindBroker(tmpRoot)?.status, 'OFFLINE');
        closeDb();
    });

    it('reports offline status when no broker state exists', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-broker-status-'));
        const status = await getOneMindBrokerStatus(tmpRoot);

        assert.equal(status.running, false);
        assert.equal(status.bindingState, 'OFFLINE');
        assert.equal(status.fulfillmentReady, false);
        assert.equal(status.fulfillmentReason, null);
        closeDb();
    });

    it('stores one mind request records in the matching workspace Hall', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-requests-'));
        const now = Date.now();
        saveHallOneMindRequest({
            request_id: 'req-1',
            repo_id: buildHallRepositoryId(normalizeHallPath(tmpRoot)),
            caller_source: 'test-suite',
            boundary: 'primary',
            request_status: 'PENDING',
            transport_preference: 'host_session',
            prompt: 'Explain the hall broker.',
            metadata: { source: 'unit-test' },
            created_at: now,
            updated_at: now,
        }, tmpRoot);

        const requests = listHallOneMindRequests(tmpRoot, ['PENDING']);
        assert.equal(requests.length, 1);
        assert.equal(requests[0]?.request_id, 'req-1');
        assert.equal(requests[0]?.metadata?.source, 'unit-test');
        closeDb();
    });

    it('fulfills a pending Hall request and mirrors completion into Synapse', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-fulfill-'));
        const now = Date.now();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const dbPath = path.join(tmpRoot, '.stats', 'synapse.db');
        ensureHealthySynapseDb(dbPath);
        const synapseDb = new Database(dbPath);
        try {
            synapseDb.prepare('INSERT INTO synapse (id, prompt, status) VALUES (?, ?, ?)').run(11, 'Teach the hall.', 'PENDING');
        } finally {
            synapseDb.close();
        }

        saveHallOneMindRequest({
            request_id: 'req-fulfill',
            repo_id: repoId,
            caller_source: 'test-suite',
            boundary: 'primary',
            request_status: 'PENDING',
            transport_preference: 'synapse_db',
            prompt: 'Teach the hall.',
            metadata: { synapse_id: 11 },
            created_at: now,
            updated_at: now,
        }, tmpRoot);

        const result = await fulfillOneMindRequestById(
            tmpRoot,
            'req-fulfill',
            { GEMINI_CLI: '1' },
            {
                hostTextInvoker: async () => ({
                    provider: 'gemini',
                    text: 'Hall response',
                    response: {
                        status: 'success',
                        raw_text: 'Hall response',
                        trace: {
                            correlation_id: 'req-fulfill',
                            transport_mode: 'host_session',
                        },
                    },
                }),
            },
        );

        assert.equal(result.outcome, 'fulfilled');
        assert.equal(getHallOneMindRequest('req-fulfill', tmpRoot)?.request_status, 'COMPLETED');
        assert.equal(getHallOneMindRequest('req-fulfill', tmpRoot)?.response_text, 'Hall response');

        const verifyDb = new Database(dbPath, { readonly: true });
        try {
            const row = verifyDb.prepare('SELECT response, status FROM synapse WHERE id = ?').get(11) as { response: string; status: string };
            assert.equal(row.response, 'Hall response');
            assert.equal(row.status, 'COMPLETED');
        } finally {
            verifyDb.close();
        }

        closeDb();
    });

    it('allows the current Codex host session to fulfill pending requests through host CLI inference', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-unavailable-'));
        const now = Date.now();
        saveHallOneMindRequest({
            request_id: 'req-pending',
            repo_id: buildHallRepositoryId(normalizeHallPath(tmpRoot)),
            caller_source: 'test-suite',
            boundary: 'primary',
            request_status: 'PENDING',
            transport_preference: 'synapse_db',
            prompt: 'Hold position.',
            created_at: now,
            updated_at: now,
        }, tmpRoot);

        const result = await fulfillNextOneMindRequest(
            tmpRoot,
            {
                CODEX_SHELL: '1',
                CODEX_THREAD_ID: 'thread-1',
            },
            {
                hostTextInvoker: async () => ({
                    provider: 'codex',
                    text: 'Held by Codex host CLI.',
                    response: {
                        status: 'success',
                        raw_text: 'Held by Codex host CLI.',
                        trace: {
                            correlation_id: 'req-pending',
                            transport_mode: 'host_session',
                        },
                    },
                }),
            },
        );

        assert.equal(result.outcome, 'fulfilled');
        assert.equal(getHallOneMindRequest('req-pending', tmpRoot)?.request_status, 'COMPLETED');
        assert.equal(getHallOneMindRequest('req-pending', tmpRoot)?.response_text, 'Held by Codex host CLI.');
        assert.equal(getHallOneMindRequest('req-pending', tmpRoot)?.metadata?.fulfillment_mode, 'host_session');
        assert.equal(getHallOneMindRequest('req-pending', tmpRoot)?.metadata?.execution_surface, 'host-cli-inference');
        closeDb();
    });

    it('treats a declared native Codex bridge contract as host CLI inference when no explicit bridge is bound', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-native-contract-'));
        const status = await ensureOneMindBroker(tmpRoot, {
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
            CORVUS_CODEX_NATIVE_SESSION_BRIDGE: '1',
        });

        assert.equal(status.fulfillmentReady, true);
        assert.equal(status.fulfillmentReason, 'codex-host-cli-inference');
        closeDb();
    });

    it('treats an explicitly configured Codex bridge as fulfillment-ready', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-configured-bridge-'));
        const status = await ensureOneMindBroker(tmpRoot, {
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-1',
            CORVUS_CODEX_NATIVE_SESSION_BRIDGE: '1',
            CORVUS_CODEX_HOST_BRIDGE_CMD: 'python3',
            CORVUS_CODEX_HOST_BRIDGE_ARGS_JSON: JSON.stringify(['bridge.py', '--project-root', '{project_root}', '--prompt', '{prompt}']),
        });

        assert.equal(status.fulfillmentReady, true);
        assert.equal(status.fulfillmentReason, 'configured-codex-host-bridge');
        closeDb();
    });

    it('builds a machine-readable one-mind status payload for host automation', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-one-mind-status-json-'));
        const now = Date.now();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        registry.setRoot(tmpRoot);
        closeDb();
        const status = await ensureOneMindBroker(tmpRoot, {
            CODEX_SHELL: '1',
            CODEX_THREAD_ID: 'thread-json',
            CORVUS_HOST_PROVIDER: 'codex',
        });

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-BROKER',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'show broker trace',
            normalized_intent: 'show broker trace',
            summary: 'Proposal ready for review.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-BROKER',
                branch_ledger_digest: {
                    total_branches: 2,
                    groups: [
                        { branch_kind: 'research', branch_count: 2, needs_revision: false },
                    ],
                    artifacts: ['README.md'],
                },
            },
        });

        saveHallOneMindRequest({
            request_id: 'req-json',
            repo_id: repoId,
            caller_source: 'test-suite',
            boundary: 'primary',
            request_status: 'PENDING',
            transport_preference: 'host_session',
            prompt: 'Show broker JSON.',
            created_at: now,
            updated_at: now,
        }, tmpRoot);

        assert.deepEqual(buildOneMindStatusPayload(status, tmpRoot), {
            broker: {
                running: true,
                responsive: true,
                binding_state: 'BOUND',
                fulfillment_ready: true,
                fulfillment_reason: 'codex-host-cli-inference',
                fulfillment_mode: 'host_session',
                execution_surface: 'host-cli-inference',
                provider: 'codex',
                session_id: 'thread-json',
            },
            planning: 'PROPOSAL_REVIEW | TRACE-BROKER | {R=2 A=1} | Proposal ready for review.',
            queue: {
                pending: 1,
                claimed: 0,
                completed: 0,
                failed: 0,
            },
        });

        closeDb();
    });
});
