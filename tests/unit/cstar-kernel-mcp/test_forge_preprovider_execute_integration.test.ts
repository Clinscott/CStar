import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    writeCountingAdapter,
    writeSingleInputSession,
} from './forge_durable_execution_test_support.js';

const originalRoot = registry.getRoot();
const savedEnv = Object.fromEntries([
    'CODEX_HOME', 'CSTAR_MCP_CALLER_THREAD_ID', 'CSTAR_MCP_CALLER_TRANSPORT',
    'NODE_TEST_CONTEXT', 'CSTAR_FORGE_TEST_MODE', 'CSTAR_FORGE_RUNTIME_TEST_BYPASS',
    'CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT',
].map((key) => [key, process.env[key]]));
const roots: string[] = [];

function context(session: { threadId: string; turnId: string }) {
    return {
        requestId: 17,
        _meta: {
            threadId: session.threadId,
            'x-codex-turn-metadata': {
                session_id: session.threadId, thread_id: session.threadId,
                turn_id: session.turnId, thread_source: 'user',
                parent_thread_id: null, forked_from_thread_id: null, subagent_kind: null,
            },
        },
    };
}

function restoreEnv(): void {
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv();
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge current-v3 Codex-host handoff compatibility', () => {
    it('queues and replays one exact host handoff without legacy adapter fallback', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-continuation-e2e-'));
        roots.push(root);
        fs.chmodSync(root, 0o700);
        fs.mkdirSync(path.join(root, 'docs', 'operations'), { recursive: true });
        fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md'), '# Forge\n');
        fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-pipeline-playbook.md'), '# Forge\n');
        const target = path.join(root, 'target.ts');
        const adapter = writeCountingAdapter(root, true);
        fs.writeFileSync(target, 'export const unchanged = true;\n');
        const codexHome = path.join(root, 'codex-home');
        fs.mkdirSync(codexHome, { recursive: true });
        const beadId = 'bead:test:preprovider-execute-integration';
        const decisionId = 'decision:test:preprovider-execute-integration';
        const original = writeSingleInputSession(
            codexHome, `Build the repair for ${beadId} and ${decisionId}.`,
        );
        registry.setRoot(root);
        process.env.CODEX_HOME = codexHome;
        process.env.CSTAR_MCP_CALLER_THREAD_ID = original.threadId;
        process.env.CSTAR_MCP_CALLER_TRANSPORT = 'direct-stdio';
        process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
        process.env.CSTAR_FORGE_TEST_MODE = '1';
        process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = adapter;
        const db = database.getWritableDb(root);
        const now = Date.now();
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'WORKFLOW', ?, 'Continuation integration', 'IN_PROGRESS', ?, ?)
        `).run(
            beadId, buildHallRepositoryId(normalizeHallPath(root)), target, now, now,
        );
        const base = {
            bead_id: beadId, decision_id: decisionId,
            source_callback_thread_id: original.threadId,
            objective: 'Produce the exact continued synthetic delivery.',
            prompt: 'Return only CONTINUATION_TEST.',
            target_paths: [target], scope: 'synthetic continuation integration',
            authority_lane: 'yellow' as const,
            required_metrics: [{ name: 'continuation', threshold: '= 1' }],
            artifact_expectations: ['CONTINUATION_TEST'],
            prohibited_actions: ['git_push', 'deploy', 'authorized_source_collection'],
            requested_actions: ['response_only'],
            spend_policy: {
                mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false,
            },
            live_source_policy: 'none', fixture_policy: 'synthetic_only' as const,
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: { expected_packet: 'CONTINUATION_TEST', callback_required: true },
            package_locks: [],
        };
        const requested = JSON.parse((await handleForgeRequest(base, context(original))).content[0]!.text);
        assert.equal(requested.status, 'pending_authorization_recorded');
        const storedRequest = db.prepare(
            'SELECT request_summary_json FROM hall_forge_requests WHERE request_id = ?',
        ).get(requested.receipt_id) as { request_summary_json: string };
        assert.equal(JSON.parse(storedRequest.request_summary_json).schema, 'cstar.forge_request.v3');
        const authorized = JSON.parse((await handleForgeAuthorize({
            forge_request_receipt_id: requested.receipt_id,
            request_sha256: requested.request_sha256,
        }, context(original))).content[0]!.text);
        assert.equal(authorized.status, 'authorized');
        const executeBase = {
            ...base, forge_request_receipt_id: requested.receipt_id,
            forge_request_decision_id: decisionId, forge_request_bead_id: beadId,
            execution_mode: 'live_authorized' as const,
            operator_authorization_ref: authorized.operator_authorization_ref,
            project_root: root,
            idempotency_key: 'mechanical-parent',
        };
        const first = JSON.parse((await handleForgeExecute(
            executeBase, context(original),
        )).content[0]!.text);
        assert.equal(first.status, 'host_handoff_queued', JSON.stringify(first));
        assert.equal(first.attempt_status, 'STARTED');
        assert.equal(first.request_status, 'AUTHORIZED');
        assert.equal(first.worker_job.schema, 'cstar.codex_host_worker_job.v2');
        assert.equal(first.worker_job.runner_owner, 'codex-host');
        assert.equal(first.worker_job.requested_model, 'gpt-5.6-luna');
        assert.equal(first.worker_job.requested_reasoning, 'max');
        assert.equal(first.worker_job.actual_identity, null);
        assert.equal(first.worker_job.transport, 'codex-host');
        assert.equal(first.worker_job.provider_requests_started, 0);
        assert.equal(first.worker_job.spend_uncertain, false);
        assert.equal(first.worker_job.known_spend_observed, false);
        assert.equal(first.worker_job.cstar_launch, false);
        assert.equal(first.worker_job.project_root, root);
        assert.equal(first.host_handoff.provider_attempted, false);
        assert.equal(first.forge_execution.provider_attempted, false);
        assert.equal(first.forge_execution.adapter_invoked, false);
        assert.equal(first.forge_execution.codex_worker_fallback_allowed, false);

        const binding = first.worker_job.validation_ticket_binding;
        assert.deepEqual(binding, {
            schema: 'cstar.validation_ticket_binding.v1',
            repository_id: buildHallRepositoryId(normalizeHallPath(root)),
            bead_id: beadId,
            execution_receipt_id: first.execution_receipt_id,
            attempt_id: first.attempt_id,
            scope_sha256: requested.target_paths_sha256,
            one_use: true,
        });
        const ticketRequest = first.worker_job.validation_ticket_request;
        assert.equal(ticketRequest.schema, 'cstar.validation_ticket_request.v1');
        assert.equal(ticketRequest.repository_id, binding.repository_id);
        assert.equal(ticketRequest.bead_id, binding.bead_id);
        assert.equal(ticketRequest.execution_receipt_id, binding.execution_receipt_id);
        assert.equal(ticketRequest.attempt_id, binding.attempt_id);
        assert.equal(ticketRequest.scope_sha256, binding.scope_sha256);
        assert.equal(ticketRequest.one_use, true);
        assert.ok(ticketRequest.expires_at <= authorized.expires_at);

        const handoffPath = first.host_handoff.handoff_path;
        const handoffBytes = fs.readFileSync(handoffPath, 'utf8');
        assert.deepEqual(JSON.parse(handoffBytes), first.host_handoff);
        const durableAttempt = db.prepare(`
            SELECT status, provider, requested_model, provider_requests_started,
                provider_requests_completed, provider_requests_ambiguous, live_spend,
                known_spend_observed
            FROM hall_forge_attempts WHERE request_id = ? AND idempotency_key = ?
        `).get(requested.receipt_id, 'mechanical-parent') as Record<string, unknown>;
        assert.equal(durableAttempt.status, 'STARTED');
        assert.equal(durableAttempt.provider, 'codex-host');
        assert.equal(durableAttempt.requested_model, 'gpt-5.6-luna');
        assert.equal(Number(durableAttempt.provider_requests_started ?? 0), 0);
        assert.equal(Number(durableAttempt.provider_requests_completed ?? 0), 0);
        assert.equal(Number(durableAttempt.provider_requests_ambiguous ?? 0), 0);
        assert.equal(durableAttempt.live_spend, null);
        assert.equal(durableAttempt.known_spend_observed, 0);
        assert.equal(fs.existsSync(path.join(root, 'forge-adapter-invoked')), false);

        const replay = JSON.parse((await handleForgeExecute(
            executeBase, context(original),
        )).content[0]!.text);
        assert.equal(replay.status, 'host_handoff_replayed', JSON.stringify(replay));
        assert.equal(replay.replayed, true);
        assert.equal(replay.attempt_id, first.attempt_id);
        assert.equal(replay.execution_receipt_id, first.execution_receipt_id);
        assert.equal(replay.worker_job.job_id, first.worker_job.job_id);
        assert.deepEqual(replay.worker_job.validation_ticket_binding, binding);
        assert.equal(replay.forge_execution.provider_attempted, false);
        assert.equal(replay.forge_execution.adapter_invoked, false);
        assert.equal(db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(requested.receipt_id), 1);
        assert.equal(fs.existsSync(path.join(root, 'forge-adapter-invoked')), false);

        const changedProjectRoot = JSON.parse((await handleForgeExecute(
            { ...executeBase, project_root: path.dirname(root) }, context(original),
        )).content[0]!.text);
        assert.equal(changedProjectRoot.status, 'host_handoff_terminal_replay');
        assert.equal(
            changedProjectRoot.forge_execution.fail_closed_reason,
            'forge_codex_host_handoff_replay_input_conflict',
        );

        const changedValidationTicket = JSON.parse((await handleForgeExecute(
            {
                ...executeBase,
                validation_ticket_request: {
                    scope_sha256: requested.target_paths_sha256,
                    validator_thread_id: randomUUID(),
                    validator_turn_id: randomUUID(),
                },
            }, context(original),
        )).content[0]!.text);
        assert.equal(changedValidationTicket.status, 'host_handoff_terminal_replay');
        assert.equal(
            changedValidationTicket.forge_execution.fail_closed_reason,
            'forge_codex_host_handoff_replay_input_conflict',
        );
        assert.equal(fs.readFileSync(handoffPath, 'utf8'), handoffBytes);

        fs.rmSync(handoffPath);
        db.prepare('UPDATE hall_forge_attempts SET status = \'RESERVED\' WHERE attempt_id = ?')
            .run(first.attempt_id);
        const missingHandoffReplay = JSON.parse((await handleForgeExecute(
            executeBase, context(original),
        )).content[0]!.text);
        assert.equal(missingHandoffReplay.status, 'host_handoff_terminal_replay');
        assert.equal(
            missingHandoffReplay.forge_execution.fail_closed_reason,
            'forge_codex_host_handoff_missing',
        );
        assert.equal(db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(requested.receipt_id), 1);
    });
});
