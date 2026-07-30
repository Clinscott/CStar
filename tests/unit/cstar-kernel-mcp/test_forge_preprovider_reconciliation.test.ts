import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reconcileForgePreProviderFailureFromTrace } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_continuation_authority.js';
import {
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

function setup(label: string) {
    const fixture = createForgeReceiptFixture();
    const beadId = `bead:test:reconcile-${label}`;
    const decisionId = `decision:test:reconcile-${label}`;
    insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
    const target = path.join(fixture.root, 'target.ts');
    fs.writeFileSync(target, 'export const before = true;\n');
    const requestArgs = {
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: 'thread',
        objective: 'Resume the exact synthetic build.',
        target_paths: [target],
        required_output_paths: [target],
        scope: 'synthetic reconciliation',
        authority_lane: 'yellow' as const,
        required_metrics: [], artifact_expectations: [],
        prohibited_actions: ['deploy'], requested_actions: ['project_files'],
        spend_policy: {
            mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false,
        },
        live_source_policy: 'none', fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'TEST', callback_required: true },
        package_locks: [],
    };
    const canonical = canonicalizeForgeRequest(
        requestArgs,
        fixture.root,
        decisionId,
        'cstar-forge-hermes-minimax-worker-adapter',
        'project_files',
        1,
    );
    const request = forgeRequestInput(fixture.repoId, beadId, {
        decision_id: decisionId,
        request_sha256: hashCanonicalForgeRequest(canonical),
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
    });
    const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
    const attempt = reserveForgeAttempt(fixture.db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `${label}-parent`,
        execution_receipt_id: `${label}-execution`,
        adapter_ref: request.adapter_ref!,
    }).attempt;
    const trace = {
        schema: 'cstar.forge_adapter_execution.v1',
        status: 'degraded',
        adapter_ref: request.adapter_ref,
        execution_receipt_id: attempt.execution_receipt_id,
        forge_request_receipt_id: request.request_id,
        envelope: {
            schema: 'cstar.forge_delegate_failure.v1',
            status: 'degraded',
            degraded_reason: 'forge_hermes_target_material_too_large',
            provider_evidence_valid: true,
            provider_requests_started: 0, provider_requests_completed: 0,
            provider_requests_ambiguous: 0, provider_request_receipts: [],
            input_tokens: 0, output_tokens: 0,
            live_spend: false, live_spend_unknown: false,
            known_spend_observed: false, live_source_collection: false,
        },
        live_source_collection: false,
        workspace_commit: null,
        response_artifact_exists: false,
    };
    const traceDir = path.join(
        fixture.root, 'work', 'forge-executions', attempt.execution_receipt_id,
    );
    fs.mkdirSync(traceDir, { recursive: true });
    const tracePath = path.join(traceDir, 'adapter-execution-envelope.json');
    const traceText = `${JSON.stringify(trace)}\n`;
    fs.writeFileSync(tracePath, traceText);
    const traceSha256 = createHash('sha256').update(traceText).digest('hex');
    finalizeForgeAttempt(fixture.db, {
        attempt_id: attempt.attempt_id,
        status: 'FAILED_FINAL',
        error_code: 'forge_hermes_target_material_too_large',
        adapter_version: `${request.adapter_ref}@trace:${traceSha256}`,
    });
    return {
        ...fixture, request, authorization, attempt, canonical, tracePath, traceText,
    };
}

describe('legacy pre-provider failure reconciliation', () => {
    it('reopens only the exact trace-bound zero-provider attempt', () => {
        const fixture = setup('exact');
        const continuation = reconcileForgePreProviderFailureFromTrace({
            root: fixture.root, db: fixture.db,
            request: getForgeRequest(fixture.db, fixture.request.request_id)!,
            authorization: fixture.authorization,
            parent_attempt_id: fixture.attempt.attempt_id,
            recorded_canonical: fixture.canonical,
        });
        assert.equal(continuation.reconciled_from_status, 'FAILED_FINAL');
        assert.equal(getForgeAttempt(fixture.db, fixture.attempt.attempt_id)?.status,
            'FAILED_RETRYABLE');
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status,
            'AUTHORIZED');
    });

    it('rejects a trace changed after the terminal receipt was stored', () => {
        const fixture = setup('tampered');
        fs.writeFileSync(fixture.tracePath, `${fixture.traceText} `);
        assert.throws(() => reconcileForgePreProviderFailureFromTrace({
            root: fixture.root, db: fixture.db,
            request: getForgeRequest(fixture.db, fixture.request.request_id)!,
            authorization: fixture.authorization,
            parent_attempt_id: fixture.attempt.attempt_id,
            recorded_canonical: fixture.canonical,
        }), /forge_preprovider_reconciliation_trace_invalid/);
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status,
            'FAILED_FINAL');
    });
});
