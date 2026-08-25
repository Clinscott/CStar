import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    codexHostWorkerJobContractSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';
import {
    findForgeExecutionValidationError,
    type ForgeExecutionArgs,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_contract.js';
import {
    forgeRequestAuthorityMatches,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_request_authority.js';
import {
    classifyBoundForgeIntent,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_operator_intent_attestation.js';
import {
    isForgeAuthorityRevocation,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_revocation.js';
import {
    hasDuplicatePackageLockMismatch,
    verifyDispatchPackageLocks,
} from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_request.js';
import {
    parseLegacyCanonicalForgeRequestV2,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_legacy_v2_compatibility.js';
import {
    forgeCodexHostWorkerHandoffPath,
    isCurrentForgeV3Request,
    parseForgeCodexHostWorkerHandoff,
    persistForgeCodexHostWorkerHandoff,
} from '../../../src/tools/pennyone/intel/forge_host_worker_dispatch.js';
import { captureForgeHostPathIdentities } from '../../../src/tools/pennyone/intel/forge_host_path_identity.js';
import type {
    HallForgeRequestRecord,
} from '../../../src/types/forge.js';
import type {
    CodexHostWorkerJobContract,
} from '../../../src/types/worker_job.js';

const roots: string[] = [];

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]));
    }
    return value;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function digest(value: unknown): string {
    return sha256(JSON.stringify(stable(value)));
}

function makeJob(overrides: Record<string, unknown> = {}): CodexHostWorkerJobContract {
    const targetPaths = (overrides.target_paths as string[] | undefined)
        ?? ['/tmp/cstar-host-project/src/worker.ts'];
    const base = {
        schema: 'cstar.codex_host_worker_job.v2',
        worker_kind: 'forge',
        workflow_surface: 'forge',
        bead_id: 'bead:test:host-isolation',
        decision_id: 'decision:test:host-isolation',
        canonical_request_id: 'dispatch-forge-host-isolation',
        canonical_request_sha256: 'a'.repeat(64),
        authorization_id: 'authorization:test:host-isolation',
        authorization_expires_at: 2_000,
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: null,
        transport: 'codex-host',
        cognition_launch: false,
        cstar_launch: false,
        provider_requests_started: 0,
        spend_uncertain: false,
        known_spend_observed: false,
        network_accessed: false,
        idempotency_key: 'host-isolation-key',
        execution_deadline_at: 1_900,
        attempt_id: 'attempt:test:host-isolation',
        objective: 'Persist one host-owned handoff.',
        expected_artifacts: [{ name: 'handoff', artifact_kind: 'other', required: true }],
        job_id: 'job:test:host-isolation',
        host_launch_required: true,
        project_root: '/tmp/cstar-host-project',
        target_paths: targetPaths,
        output_paths: [],
        target_paths_sha256: digest(targetPaths),
        path_identity_bindings: captureForgeHostPathIdentities(targetPaths, []),
        validation_ticket_binding: {
            schema: 'cstar.validation_ticket_binding.v1',
            repository_id: 'repo:test:host-isolation',
            bead_id: 'bead:test:host-isolation',
            execution_receipt_id: 'forge-execute-host-isolation',
            attempt_id: 'attempt:test:host-isolation',
            scope_sha256: digest(targetPaths),
            one_use: true,
        },
        validation_ticket_request: {
            schema: 'cstar.validation_ticket_request.v1',
            repository_id: 'repo:test:host-isolation',
            bead_id: 'bead:test:host-isolation',
            execution_receipt_id: 'forge-execute-host-isolation',
            attempt_id: 'attempt:test:host-isolation',
            scope_sha256: digest(targetPaths),
            one_use: true,
            expires_at: 1_900,
        },
        ...overrides,
    };
    return {
        ...base,
        dispatch_receipt_sha256: digest(base),
    } as CodexHostWorkerJobContract;
}

function makeHandoff(job: CodexHostWorkerJobContract, handoffPath = '/tmp/cstar-host-handoff.json') {
    const unsigned = { schema: 'cstar.forge_codex_host_worker_handoff.v1', job };
    return {
        ...unsigned,
        status: 'queued',
        handoff_sha256: digest(unsigned),
        handoff_path: handoffPath,
        host_launch_required: true,
        cstar_launch: false,
        provider_attempted: false,
    };
}

function makeRequest(overrides: Record<string, unknown> = {}): HallForgeRequestRecord {
    return {
        request_id: 'dispatch-forge-host-isolation',
        repo_id: 'repo:test:host-isolation',
        bead_id: 'bead:test:host-isolation',
        decision_id: 'decision:test:host-isolation',
        status: 'AUTHORIZED',
        authorization_profile: 'exact_request_challenge_v1',
        authorization_binding_sha256: 'c'.repeat(64),
        authorization_challenge_sha256: 'c'.repeat(64),
        operator_authorization_ref: 'forge-auth:test:host-isolation',
        operator_thread_id: 'thread:test:host-isolation',
        operator_turn_id: 'turn:test:host-isolation',
        operator_message_sha256: 'd'.repeat(64),
        operator_record_sha256: 'e'.repeat(64),
        operator_record_set_sha256: 'f'.repeat(64),
        operator_record_count: 1,
        requester_thread_id: 'thread:test:requester',
        requester_turn_id: 'turn:test:requester',
        requester_record_set_sha256: '1'.repeat(64),
        request_sha256: 'a'.repeat(64),
        request_summary_json: JSON.stringify({ schema: 'cstar.forge_request.v3' }),
        adapter_ref: null,
        write_capability: 'project_files',
        target_paths_sha256: '2'.repeat(64),
        live_source_allowed: 0,
        max_attempts: 1,
        authorized_at: 100,
        expires_at: 2_000,
        created_at: 50,
        ...overrides,
    } as unknown as HallForgeRequestRecord;
}

function validExecuteArgs(): ForgeExecutionArgs {
    return {
        bead_id: 'bead:test:host-isolation',
        decision_id: 'decision:test:host-isolation',
        source_callback_thread_id: 'thread:test:host-isolation',
        objective: 'Persist one bounded synthetic host handoff.',
        scope: 'Host handoff isolation only.',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'handoff', threshold: '= queued' }],
        artifact_expectations: ['handoff'],
        prohibited_actions: ['git_push'],
        requested_actions: ['project_files'],
        target_paths: ['/tmp/cstar-host-project/src'],
        required_output_paths: ['/tmp/cstar-host-project/src/output.ts'],
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: 'HOST_HANDOFF',
            callback_required: true,
            callback_thread_id: 'thread:test:host-isolation',
        },
        forge_request_receipt_id: 'dispatch-forge-host-isolation',
        forge_request_decision_id: 'decision:test:host-isolation',
        execution_mode: 'live_authorized',
        operator_authorization_ref: 'forge-auth:test:host-isolation',
        idempotency_key: 'host-isolation-key',
    };
}

function legacyV2Request(): Record<string, unknown> {
    return {
        schema: 'cstar.forge_request.v2',
        bead_id: 'bead:test:legacy-v2-isolation',
        decision_id: 'decision:test:legacy-v2-isolation',
        state_update_thread_id: null,
        source_callback_thread_id: 'thread:legacy-v2-isolation',
        objective: 'Preserve one bounded compatibility request.',
        prompt: null,
        target_paths: ['/tmp/cstar-host-project/src/worker.ts'],
        required_output_paths: ['/tmp/cstar-host-project/src/output.ts'],
        system_under_test: null,
        scope: 'Legacy v2 compatibility isolation only.',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'compatibility', threshold: '= pass', acceptance_rule: null, unit: null }],
        artifact_expectations: ['handoff'],
        prohibited_actions: ['git_push'],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source collection.',
        retry_budget: 0,
        callback_contract: {
            expected_packet: 'LEGACY_V2_HANDOFF',
            callback_required: true,
            callback_thread_id: 'thread:legacy-v2-isolation',
        },
        package_locks: [{
            path: '/tmp/cstar-host-project/package-lock.json',
            sha256: 'a'.repeat(64),
        }],
        dispatch_surface_ref: null,
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        adapter_runtime: null,
        write_capability: 'project_files',
        max_attempts: 1,
    };
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Codex-host Forge handoff Lore/Isolation contract', () => {
    it('keeps an interrupted persisted v3 request distinct from legacy v2', () => {
        const v3 = makeRequest({ request_summary_json: JSON.stringify({ schema: 'cstar.forge_request.v3' }) });
        const v2 = makeRequest({ request_summary_json: JSON.stringify({ schema: 'cstar.forge_request.v2' }) });
        assert.equal(isCurrentForgeV3Request(v3), true);
        assert.equal(isCurrentForgeV3Request(v2), false);
        assert.deepEqual(parseLegacyCanonicalForgeRequestV2(legacyV2Request()), legacyV2Request());
        assert.throws(
            () => parseLegacyCanonicalForgeRequestV2({ ...legacyV2Request(), schema: 'cstar.forge_request.v3' }),
            /forge_legacy_v2_request_invalid:schema/,
        );
    });

    it('keeps the generic exact-wording parser fail closed beside durable continuation', () => {
        const binding = {
            request_id: 'dispatch-forge-host-isolation',
            request_sha256: 'a'.repeat(64),
            bead_id: 'bead:test:host-isolation',
            decision_id: 'decision:test:host-isolation',
        } as const;
        const accepted = classifyBoundForgeIntent(
            'Continue and implement decision:test:host-isolation on bead:test:host-isolation now.',
            binding,
            'exact_mission_record',
        );
        assert.equal(accepted.action, 'implement');
        assert.throws(
            () => classifyBoundForgeIntent('Continue.', binding, 'exact_mission_record'),
            /forge_operator_intent_nonoperative_text/,
        );
    });

    it('detects revocation without treating ordinary status text as revocation', () => {
        for (const text of ['Stop the Forge build.', 'I revoke the Forge authorization.', 'Do not proceed with Forge.']) {
            assert.equal(isForgeAuthorityRevocation(text), true, text);
        }
        assert.equal(isForgeAuthorityRevocation('The Forge handoff is queued for review.'), false);
    });

    it('binds request hashes and operator thread/turn lineage exactly', () => {
        const request = makeRequest();
        assert.equal(forgeRequestAuthorityMatches(request, request), true);
        assert.equal(forgeRequestAuthorityMatches(request, {
            ...request,
            request_sha256: 'b'.repeat(64),
        }), false);
        assert.equal(forgeRequestAuthorityMatches(request, {
            ...request,
            target_paths_sha256: '3'.repeat(64),
        }), false);
        assert.equal(forgeRequestAuthorityMatches(request, {
            ...request,
            operator_thread_id: 'thread:test:other',
        }), false);
        assert.equal(forgeRequestAuthorityMatches(request, {
            ...request,
            request_summary_json: JSON.stringify({ schema: 'cstar.forge_request.v3', drift: true }),
        }), false);
    });

    it('rejects handoff hash, request-scope, ticket-scope, and attempt drift', () => {
        const job = makeJob();
        assert.equal(parseForgeCodexHostWorkerHandoff(makeHandoff(job)).job.attempt_id, job.attempt_id);
        assert.throws(
            () => parseForgeCodexHostWorkerHandoff({
                ...makeHandoff(job), handoff_sha256: 'b'.repeat(64),
            }),
            /forge_codex_host_handoff_hash_mismatch/,
        );
        assert.throws(
            () => parseForgeCodexHostWorkerHandoff(makeHandoff({
                ...job, dispatch_receipt_sha256: 'b'.repeat(64),
            })),
            /forge_codex_host_job_invalid/,
        );
        assert.equal(codexHostWorkerJobContractSchema.safeParse({
            ...job, target_paths_sha256: 'b'.repeat(64),
        }).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse({
            ...job,
            validation_ticket_binding: {
                ...job.validation_ticket_binding!, scope_sha256: 'b'.repeat(64),
            },
        }).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse({
            ...job,
            validation_ticket_request: {
                ...job.validation_ticket_request!, attempt_id: 'attempt:test:other',
            },
        }).success, false);
    });

    it('rejects package-lock drift before the host contract can be trusted', () => {
        const root = fs.mkdtempSync(path.join('/tmp', 'cstar-host-lock-isolation-'));
        roots.push(root);
        const lockPath = path.join(root, 'package-lock.json');
        const original = '{"lockfileVersion":3}\n';
        fs.writeFileSync(lockPath, original);
        const hash = sha256(original);
        assert.deepEqual(verifyDispatchPackageLocks([{ path: lockPath, sha256: hash }], root), [{
            path: lockPath, sha256: hash, bytes: Buffer.byteLength(original),
        }]);
        fs.writeFileSync(lockPath, '{"lockfileVersion":3,"drift":true}\n');
        assert.throws(
            () => verifyDispatchPackageLocks([{ path: lockPath, sha256: hash }], root),
            /dispatch_package_lock_hash_mismatch:.*package-lock\.json/,
        );
        assert.equal(hasDuplicatePackageLockMismatch([
            { path: 'package-lock.json', sha256: 'a'.repeat(64) },
            { path: 'package-lock.json', sha256: 'b'.repeat(64) },
        ]), true);
    });

    it('rejects protected gates and missing or legacy authorization fields', () => {
        const valid = validExecuteArgs();
        assert.equal(findForgeExecutionValidationError(valid), null);
        assert.equal(findForgeExecutionValidationError({
            ...valid, operator_authorization_ref: undefined,
        }), 'live Forge execution requires operator_authorization_ref');
        assert.equal(findForgeExecutionValidationError({
            ...valid, execution_adapter_ref: undefined,
        }), null);
        assert.equal(findForgeExecutionValidationError({
            ...valid,
            spend_policy: { ...valid.spend_policy, operator_authorization_ref: 'legacy-inner-ref' },
        }), 'legacy spend_policy.operator_authorization_ref is forbidden; use the exact outer authorization reference');
        assert.equal(findForgeExecutionValidationError({
            ...valid, forge_request_receipt_id: 'not-a-forge-receipt',
        }), 'forge_request_receipt_id must reference a cstar_forge_request receipt');
    });

    it('rejects provider, spend, transport, and protected-launch claims in a new handoff', () => {
        const job = makeJob();
        for (const overrides of [
            { provider_requests_started: 1 },
            { spend_uncertain: true },
            { known_spend_observed: true },
            { network_accessed: true },
            { cognition_launch: true },
            { cstar_launch: true },
            { requested_model: 'MiniMax-M3' },
            { transport: 'hermes:x-grok' },
        ]) {
            assert.equal(codexHostWorkerJobContractSchema.safeParse({ ...job, ...overrides }).success, false);
        }
    });

    it('preserves one idempotent handoff and rejects a conflicting existing attempt', () => {
        const controlRoot = fs.mkdtempSync(path.join('/tmp', 'cstar-host-replay-isolation-'));
        roots.push(controlRoot);
        fs.chmodSync(controlRoot, 0o700);
        const job = makeJob();
        const first = persistForgeCodexHostWorkerHandoff(controlRoot, job);
        const replay = persistForgeCodexHostWorkerHandoff(controlRoot, job);
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.equal(replay.handoff.handoff_sha256, first.handoff.handoff_sha256);
        assert.equal(replay.handoff.job.attempt_id, first.handoff.job.attempt_id);
        const expectedReceipt = `forge-execute-${sha256(`${job.canonical_request_id}\n${job.idempotency_key}`).slice(0, 32)}`;
        assert.equal(
            forgeCodexHostWorkerHandoffPath(controlRoot, expectedReceipt),
            first.handoff.handoff_path,
        );
        assert.throws(
            () => persistForgeCodexHostWorkerHandoff(controlRoot, { ...job, objective: 'different attempt scope' }),
            /forge_codex_host_handoff_duplicate_conflict/,
        );
    });
});
