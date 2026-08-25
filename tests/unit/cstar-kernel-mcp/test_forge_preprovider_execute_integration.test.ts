import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import {
    countForgeProviderAttempts,
    getForgeContinuationByAttempt,
} from '../../../src/tools/pennyone/intel/forge_continuation_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { writeSingleInputSession } from './forge_durable_execution_test_support.js';

const originalRoot = registry.getRoot();
const savedEnv = Object.fromEntries([
    'CODEX_HOME', 'CSTAR_MCP_CALLER_THREAD_ID', 'CSTAR_MCP_CALLER_TRANSPORT',
    'CSTAR_FORGE_TEST_MODE', 'CSTAR_FORGE_RUNTIME_TEST_BYPASS',
    'CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT',
].map((key) => [key, process.env[key]]));
const roots: string[] = [];

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

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

function writeAdapter(script: string, mode: 'failure' | 'success'): void {
    const failure = {
        status: 'degraded', degraded_reason: 'forge_hermes_target_material_too_large',
        provider: 'minimax-oauth', requested_model: 'MiniMax-M3', actual_model: null,
        model_source: 'unreported', hermes_profile: 'cstar-hub',
        role_receipts: [], provider_request_receipts: [],
        provider_requests_started: 0, provider_requests_completed: 0,
        provider_requests_ambiguous: 0, input_tokens: 0, output_tokens: 0,
        live_spend: false, live_spend_unknown: false,
        known_spend_observed: false, live_source_collection: false,
    };
    const lines = [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file, encoding="utf-8") as handle:',
        '    intent = json.load(handle)',
    ];
    if (mode === 'failure') {
        lines.push(`print(json.dumps(json.loads(${JSON.stringify(JSON.stringify(failure))})))`);
    } else {
        lines.push(
            'write_to = intent["payload"]["write_to"]',
            'response = {"status":"pass","summary":"continued synthetic delivery",',
            ' "files_changed":[],"artifacts":{},"validation":{"focused":"pass"},',
            ' "metrics":{"continuation":1},"boundaries":{"live_source_collection":False},',
            ' "callback_packet":"CONTINUATION_TEST"}',
            'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
            'with open(write_to, "w", encoding="utf-8") as handle:',
            '    json.dump(response, handle)',
            'print(json.dumps({"status":"ok","intent_id":"continued-synthetic",',
            ' "provider":"minimax-oauth","requested_model":"MiniMax-M3",',
            ' "actual_model":None,"model_source":"unreported",',
            ' "hermes_profile":"cstar-hub","wrote_to":write_to,',
            ' "live_spend":False,"live_spend_unknown":False,',
            ' "known_spend_observed":False,"live_source_collection":False}))',
        );
    }
    fs.writeFileSync(script, `${lines.join('\n')}\n`, { mode: 0o700 });
    fs.chmodSync(script, 0o700);
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

describe('Forge automatic pre-provider continuation', () => {
    it('requires repair binding and resumes in the original authorizing turn', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-continuation-e2e-'));
        roots.push(root);
        fs.chmodSync(root, 0o700);
        fs.mkdirSync(path.join(root, 'docs', 'operations'), { recursive: true });
        fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md'), '# Forge\n');
        fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-pipeline-playbook.md'), '# Forge\n');
        const target = path.join(root, 'target.ts');
        const adapter = path.join(root, 'sealed-forge-adapter.py');
        const check = path.join(root, 'repair-check.txt');
        fs.writeFileSync(target, 'export const unchanged = true;\n');
        writeAdapter(adapter, 'failure');
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
            package_locks: [], execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };
        const requested = JSON.parse((await handleForgeRequest(base, context(original))).content[0]!.text);
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
        };
        const failed = JSON.parse((await handleForgeExecute({
            ...executeBase, idempotency_key: 'mechanical-parent',
        }, context(original))).content[0]!.text);
        assert.equal(failed.status, 'pre_provider_continuation_pending');
        assert.equal(failed.attempt_status, 'FAILED_RETRYABLE');
        assert.equal(failed.request_status, 'AUTHORIZED');
        assert.equal(typeof failed.execution_receipt_id, 'string');
        assert.ok(failed.execution_receipt_id.length > 0);
        assert.equal(failed.forge_execution.provider_attempted, false);

        writeAdapter(adapter, 'success');
        const unvalidatedContinuation = await handleForgeExecute({
            ...executeBase,
            idempotency_key: 'mechanical-child-unvalidated',
            retry_of_attempt_id: failed.attempt_id,
        }, context(original));
        assert.equal(unvalidatedContinuation.isError, true);
        assert.match(
            unvalidatedContinuation.content[0]!.text,
            /forge_continuation_repair_validation_required/,
        );
        assert.equal(countForgeProviderAttempts(db, requested.receipt_id), 0);

        fs.writeFileSync(check, 'repair validation passed\n');
        const runtimeEvidence = path.join(
            root, 'work', 'forge-executions', failed.execution_receipt_id,
            'continuation-runtime-evidence.json',
        );
        assert.equal(fs.existsSync(runtimeEvidence), true);
        const validator = writeSingleInputSession(codexHome, 'Validate the exact continuation repair.');
        process.env.CSTAR_MCP_CALLER_THREAD_ID = validator.threadId;
        const validation = JSON.parse((await handleRecordResult({
            bead_id: beadId, verdict: 'SUCCESS',
            validation_id: 'validation:preprovider-execute-integration',
            forge_execution_receipt_id: failed.execution_receipt_id,
            validation_evidence: {
                artifacts: [target, adapter, runtimeEvidence].map((file) => ({
                    path: file, sha256: sha256(fs.readFileSync(file)),
                })),
                checks: [{
                    name: 'focused continuation repair', status: 'pass',
                    evidence_path: check, sha256: sha256(fs.readFileSync(check)),
                }],
            },
        }, context(validator))).content[0]!.text);
        assert.equal(validation.status, 'recorded_verified', JSON.stringify(validation));
        assert.equal(validation.forge_validation.mode, 'continuation_repair_binding');

        process.env.CSTAR_MCP_CALLER_THREAD_ID = original.threadId;
        const continued = JSON.parse((await handleForgeExecute({
            ...executeBase,
            idempotency_key: 'mechanical-child',
            retry_of_attempt_id: failed.attempt_id,
        }, context(original))).content[0]!.text);
        assert.equal(continued.status, 'delivered_unverified');
        assert.equal(continued.replayed, false);
        assert.equal(continued.forge_execution.provider_attempted, true);
        assert.equal(getForgeContinuationByAttempt(db, failed.attempt_id)?.status, 'RESUMED');
        assert.equal(countForgeProviderAttempts(db, requested.receipt_id), 1);
        assert.equal(db.prepare(
            'SELECT COUNT(*) FROM hall_forge_authorizations WHERE request_id = ?',
        ).pluck().get(requested.receipt_id), 1);
        assert.equal(db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(requested.receipt_id), 2);
    });
});
