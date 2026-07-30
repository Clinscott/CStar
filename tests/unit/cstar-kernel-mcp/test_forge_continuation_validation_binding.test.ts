import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { HallValidationEvidenceManifestV2 } from '../../../src/types/validation_evidence.js';
import { hashValidationEvidenceManifest } from '../../../src/types/validation_evidence.js';
import type { ForgeAdapterRuntimeProof } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_runtime.js';
import type { ForgeHermesRuntimeExpectation } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';
import { verifyForgeContinuationRepairBinding } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_continuation_authority.js';
import type { CanonicalForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import type { ForgeWorkspaceProjection } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_workspace_projection.js';
import {
    finalizeForgePreProviderContinuation,
    getForgeContinuationByAttempt,
} from '../../../src/tools/pennyone/intel/forge_continuation_controller.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    finalizeForgeValidation,
    resolveForgeValidationSubject,
} from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

function digest(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

function canonical(
    target: string,
    runtime: ForgeAdapterRuntimeProof,
    hermesRuntime: ForgeHermesRuntimeExpectation,
): CanonicalForgeRequest {
    return {
        schema: 'cstar.forge_request.v3',
        bead_id: 'bead:test:continuation-validation',
        decision_id: 'decision:test:continuation-validation',
        state_update_thread_id: null,
        source_callback_thread_id: 'thread',
        objective: 'Resume the unchanged build after validated repair.',
        prompt: null,
        target_paths: [target],
        required_output_paths: [target],
        system_under_test: 'forge',
        scope: 'synthetic',
        authority_lane: 'yellow',
        required_metrics: [],
        artifact_expectations: [],
        prohibited_actions: ['deploy'],
        requested_actions: ['project_files'],
        action_authority: {
            schema: 'cstar.dispatch_action_authority.v1',
            action_semantics_source: 'requested_actions',
            primary_action: 'project_files',
            requested_actions: ['project_files'],
            prohibited_actions: ['deploy'],
            context_can_expand_actions: false,
            action_set_sha256: '1'.repeat(64),
            context_sha256: '2'.repeat(64),
            path_scope_sha256: '3'.repeat(64),
            authority_sha256: '4'.repeat(64),
            requested_alias_count: 0,
            prohibited_alias_count: 0,
        },
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'none',
        fixture_policy: 'synthetic_only',
        retry_budget: 0,
        callback_contract: {
            expected_packet: 'TEST', callback_required: true, callback_thread_id: 'thread',
        },
        package_locks: [],
        dispatch_surface_ref: 'docs/forge.md',
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        adapter_runtime: runtime,
        hermes_runtime: hermesRuntime,
        write_capability: 'project_files',
        max_attempts: 1,
    };
}

function runtimeFile(role: string, file: string) {
    const content = fs.readFileSync(file);
    return {
        role, path: file, sha256: digest(content), bytes: content.byteLength,
        mode: fs.statSync(file).mode & 0o777, owner_uid: process.getuid?.() ?? 0,
    };
}

describe('Forge continuation repair validation binding', () => {
    it('binds independent evidence to exact repaired runtime and target bytes', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:continuation-validation';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const requestInput = forgeRequestInput(fixture.repoId, beadId);
        const authorization = saveAndAuthorizeForgeRequest(fixture.db, requestInput).authorization;
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: requestInput.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'parent', execution_receipt_id: 'parent-receipt',
            adapter_ref: requestInput.adapter_ref!,
        }).attempt;
        const target = path.join(fixture.root, 'target.ts');
        const adapter = path.join(fixture.root, 'forge_worker_adapter.py');
        const dependency = path.join(fixture.root, 'hermes_minimax_delegate.mjs');
        const python = path.join(fixture.root, 'python3');
        const node = path.join(fixture.root, 'node');
        const containment = path.join(fixture.root, 'bwrap');
        const hermes = path.join(fixture.root, 'hermes');
        fs.writeFileSync(target, 'export const value = 1;\n');
        fs.writeFileSync(adapter, 'adapter-v2\n');
        fs.writeFileSync(dependency, 'delegate-v2\n');
        fs.writeFileSync(python, 'python-v2\n');
        fs.writeFileSync(node, 'node-v2\n');
        fs.writeFileSync(containment, 'bwrap-v2\n');
        fs.writeFileSync(hermes, 'synthetic-hermes-v2\n');
        for (const file of [target, adapter, dependency, python, node, containment, hermes]) {
            fs.chmodSync(file, 0o600);
        }
        const runtime: ForgeAdapterRuntimeProof = {
            ...runtimeFile('adapter', adapter),
            python_interpreter: runtimeFile('python_interpreter', python),
            node_interpreter: runtimeFile('node_interpreter', node),
            process_containment: runtimeFile('bubblewrap', containment),
            dependencies: [runtimeFile('hermes_minimax_delegate', dependency)],
        };
        const hermesBytes = fs.readFileSync(hermes);
        const hermesRuntime: ForgeHermesRuntimeExpectation = {
            schema: 'cstar.forge_hermes_runtime_expectation.v2',
            locator_path: hermes,
            executable_sha256: digest(hermesBytes),
            runtime_content_sha256: digest(hermesBytes),
            runtime_manifest_sha256: null,
            runtime_schema: 'synthetic_test_executable_v1',
            runtime_owner: 'synthetic_test',
            credential_profile_owner: 'synthetic_test',
            python_sha256: null,
            source_file_count: 1,
            source_bytes: hermesBytes.byteLength,
            bootstrap_mode: 'synthetic_test_executable_v1',
            dependency_mode: 'synthetic_test_executable_v1',
            system_python_path: null,
            runtime_root: fixture.root,
        };
        const runtimeEvidence = path.join(
            fixture.root, 'work', 'forge-executions', attempt.execution_receipt_id,
            'continuation-runtime-evidence.json',
        );
        fs.mkdirSync(path.dirname(runtimeEvidence), { recursive: true });
        fs.writeFileSync(runtimeEvidence, JSON.stringify({
            schema: 'cstar.forge_continuation_runtime_evidence.v1',
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            adapter_runtime: runtime,
            hermes_runtime: hermesRuntime,
        }));
        fs.chmodSync(runtimeEvidence, 0o600);
        const continuation = finalizeForgePreProviderContinuation(fixture.db, {
            attempt_id: attempt.attempt_id,
            failure_code: 'forge_hermes_target_material_too_large',
            execution_trace_sha256: '5'.repeat(64),
            zero_provider_proof: {
                provider_evidence_valid: true,
                provider_requests_started: 0, provider_requests_completed: 0,
                provider_requests_ambiguous: 0, provider_request_receipts: [],
                live_spend: false, live_spend_unknown: false,
                known_spend_observed: false, input_tokens: 0, output_tokens: 0,
            },
            continuation_authority_sha256: '6'.repeat(64),
            prior_runtime_sha256: '7'.repeat(64),
        });
        const subject = resolveForgeValidationSubject(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            repository_id: fixture.repoId,
            bead_id: beadId,
        }).subject;
        const validationId = 'validation:continuation-repair';
        const validatorThread = 'independent-validator-thread';
        const validatorTurn = 'independent-validator-turn';
        const manifest: HallValidationEvidenceManifestV2 = {
            schema: 'cstar.validation-evidence.v2',
            validator_identity: `codex-thread:${validatorThread}:turn:${validatorTurn}`,
            validator_identity_source: 'test_fixture',
            request_thread_id: validatorThread,
            request_turn_id: validatorTurn,
            subject: {
                repository_id: subject.repository_id, bead_id: subject.bead_id,
                work_receipt_kind: 'forge_execution', work_receipt_id: subject.work_receipt_id,
                forge_request_id: subject.forge_request_id,
                forge_request_sha256: subject.forge_request_sha256,
                decision_id: subject.decision_id,
                target_paths_sha256: subject.target_paths_sha256,
                attempt_id: subject.attempt_id,
                result_artifact_sha256: subject.result_artifact_sha256,
                adapter_ref: subject.adapter_ref, adapter_version: subject.adapter_version,
                external_execution_id: subject.external_execution_id,
            },
            independence: {
                policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
                validator_thread_id: validatorThread,
                requester_thread_id: subject.requester_thread_id,
                requester_turn_id: subject.requester_turn_id,
                requester_record_set_sha256: subject.requester_record_set_sha256,
                executor_binding: 'forge_exact_authorizing_turn_v1',
                authorization_id: subject.authorization_id,
                executor_thread_id: subject.executor_thread_id,
                executor_turn_id: subject.executor_turn_id,
                executor_record_sha256: subject.executor_record_sha256,
                executor_record_set_sha256: subject.executor_record_set_sha256,
                executor_record_count: subject.executor_record_count,
            },
            artifacts: [
                target, adapter, dependency, python, node, containment, hermes, runtimeEvidence,
            ].map((file) => ({
                path: file, sha256: digest(fs.readFileSync(file)),
            })),
            checks: [{
                name: 'focused synthetic repair validation', status: 'pass',
                evidence_path: target, sha256: digest(fs.readFileSync(target)),
            }],
        };
        const evidenceSha256 = hashValidationEvidenceManifest(manifest);
        fixture.db.prepare(`
            INSERT INTO hall_validation_runs (
                validation_id, repo_id, bead_id, verdict, notes, authority_class,
                evidence_sha256, validator_identity, validator_identity_source,
                evidence_manifest_json, created_at
            ) VALUES (?, ?, ?, 'SUCCESS', '', 'verified_v2', ?, ?, ?, ?, ?)
        `).run(
            validationId, fixture.repoId, beadId, evidenceSha256,
            manifest.validator_identity, manifest.validator_identity_source,
            JSON.stringify(manifest), continuation.created_at + 1,
        );
        const linked = finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            validation_id: validationId,
        });
        assert.equal(linked.mode, 'continuation_repair_binding');
        const bound = getForgeContinuationByAttempt(fixture.db, attempt.attempt_id)!;
        assert.equal(bound.repair_validation_id, validationId);
        assert.equal(bound.repair_evidence_sha256, evidenceSha256);
        const request = getForgeRequest(fixture.db, requestInput.request_id)!;
        assert.doesNotThrow(() => verifyForgeContinuationRepairBinding({
            root: fixture.root, db: fixture.db, continuation: bound, request,
            authorization: getForgeAuthorizationByRequest(fixture.db, request.request_id)!,
            canonical: canonical(target, runtime, hermesRuntime), adapter_runtime: runtime,
        }));
        const driftedProjection = {
            source_preimages: [{
                path: target, kind: 'file', sha256: digest('unvalidated projected bytes'),
            }],
        } as unknown as ForgeWorkspaceProjection;
        assert.throws(() => verifyForgeContinuationRepairBinding({
            root: fixture.root, db: fixture.db, continuation: bound, request,
            authorization: getForgeAuthorizationByRequest(fixture.db, request.request_id)!,
            canonical: canonical(target, runtime, hermesRuntime), adapter_runtime: runtime,
            prepared_projection: driftedProjection,
        }), /forge_continuation_prepared_target_unvalidated/);
        const driftedRuntime = {
            ...runtime,
            node_interpreter: { ...runtime.node_interpreter!, sha256: '8'.repeat(64) },
        };
        assert.throws(() => verifyForgeContinuationRepairBinding({
            root: fixture.root, db: fixture.db, continuation: bound, request,
            authorization: getForgeAuthorizationByRequest(fixture.db, request.request_id)!,
            canonical: canonical(target, driftedRuntime, hermesRuntime),
            adapter_runtime: driftedRuntime,
        }), /forge_continuation_runtime_evidence_invalid/);
        fs.writeFileSync(target, 'export const value = 2;\n');
        assert.throws(() => verifyForgeContinuationRepairBinding({
            root: fixture.root, db: fixture.db, continuation: bound, request,
            authorization: getForgeAuthorizationByRequest(fixture.db, request.request_id)!,
            canonical: canonical(target, runtime, hermesRuntime), adapter_runtime: runtime,
        }), /forge_continuation_target_unvalidated/);
        fs.writeFileSync(target, Buffer.alloc(512 * 1024 + 1, 0x61));
        assert.throws(() => verifyForgeContinuationRepairBinding({
            root: fixture.root, db: fixture.db, continuation: bound, request,
            authorization: getForgeAuthorizationByRequest(fixture.db, request.request_id)!,
            canonical: canonical(target, runtime, hermesRuntime), adapter_runtime: runtime,
        }), /forge_continuation_target_unsafe/);
    });
});
