import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { bindLegacyV2RequesterLineage } from '../../../src/tools/pennyone/intel/forge_legacy_v2_reconciliation_controller.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import type { ForgeAdapterRuntimeProof } from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';
import {
    assertRecordedLegacyV2ExecutionGrant,
    buildLegacyV2ExecutionGrant,
    hashLegacyV2ExecutionGrant,
    parseLegacyCanonicalForgeRequestV2,
    type LegacyCanonicalForgeRequestV2,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_legacy_v2_compatibility.js';
import {
    buildForgeAuthorizationChallenge,
    hashForgeAuthorizationChallenge,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorization_challenge.js';
import {
    buildForgeRequestId,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import type { ForgeHermesRuntimeExpectation } from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';

const roots: string[] = [];
const REQUESTER_THREAD_ID = '019f0000-0000-7000-8000-000000000020';
const REQUESTER_TURN_ID = '019f0000-0000-7000-8000-000000000021';
const REQUESTER_RECORD_SET_SHA256 = '2'.repeat(64);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function currentRuntime(seed = 'a'): ForgeAdapterRuntimeProof {
    const digest = seed.repeat(64).slice(0, 64);
    const file = (role: string, filePath: string) => ({
        role,
        path: filePath,
        sha256: digest,
        bytes: 1,
        mode: 0o500,
        owner_uid: 1000,
    });
    return {
        path: '/synthetic/runtime/forge_worker_adapter.py',
        sha256: digest,
        bytes: 1,
        mode: 0o400,
        owner_uid: 1000,
        python_interpreter: file('python_interpreter', '/synthetic/runtime/python'),
        node_interpreter: file('node_interpreter', '/synthetic/runtime/node'),
        process_containment: file('bubblewrap', '/synthetic/runtime/bwrap'),
        dependencies: [file('hermes_runtime_lineage', '/synthetic/runtime/lineage.mjs')],
    };
}

function hermesRuntime(seed = 'b'): ForgeHermesRuntimeExpectation {
    const digest = seed.repeat(64).slice(0, 64);
    return {
        schema: 'cstar.forge_hermes_runtime_expectation.v2',
        locator_path: '/synthetic/runtime/bin/hermes',
        executable_sha256: digest,
        runtime_content_sha256: digest,
        runtime_manifest_sha256: digest,
        runtime_schema: 'cstar.forge_private_runtime_manifest.v2',
        runtime_owner: 'cstar',
        credential_profile_owner: 'hermes',
        python_sha256: digest,
        source_file_count: 1,
        source_bytes: 1,
        bootstrap_mode: 'cstar_owned_python_system_stdlib_snapshot_v2',
        dependency_mode: 'stdlib_only_no_site_packages_v2',
        system_python_path: '/synthetic/runtime/python',
        runtime_root: '/synthetic/runtime',
    };
}

function createLegacyFixture(suffix: string, bindLineage = true) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-v2-continuity-'));
    roots.push(root);
    const project = path.join(root, 'project');
    const output = path.join(project, 'output.ts');
    const lockPath = path.join(project, 'package-lock.json');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(lockPath, '{"lockfileVersion":3}\n');
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = `bead:test:legacy-v2:${suffix}`;
    const decisionId = `decision:test:legacy-v2:${suffix}`;
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Legacy v2 continuity test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, project, now, now);
    const legacy: LegacyCanonicalForgeRequestV2 = {
        schema: 'cstar.forge_request.v2',
        bead_id: beadId,
        decision_id: decisionId,
        state_update_thread_id: null,
        source_callback_thread_id: '019f0000-0000-7000-8000-000000000001',
        objective: 'Build one bounded synthetic output.',
        prompt: null,
        target_paths: [project],
        required_output_paths: [output],
        system_under_test: null,
        scope: 'Synthetic legacy v2 continuity only.',
        authority_lane: 'yellow',
        required_metrics: [{
            name: 'bounded_output',
            threshold: '= pass',
            acceptance_rule: null,
            unit: null,
        }],
        artifact_expectations: ['bounded synthetic output'],
        prohibited_actions: [
            'collect external sources',
            'write outside the required output',
        ].sort(),
        requested_actions: ['edit exactly the required output'],
        spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source. Execute only after a separately bound exact operator grant.',
        retry_budget: 0,
        callback_contract: {
            expected_packet: 'LEGACY_V2_TEST_PACKET',
            callback_required: true,
            callback_thread_id: '019f0000-0000-7000-8000-000000000001',
        },
        package_locks: [{
            path: lockPath,
            sha256: sha256(fs.readFileSync(lockPath, 'utf-8')),
        }],
        dispatch_surface_ref: 'docs/operations/corvus-forge-skill-spec.md',
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        adapter_runtime: { sha256: 'c'.repeat(64), schema: 'legacy_adapter_runtime' },
        write_capability: 'project_files',
        max_attempts: 1,
    };
    const summary = stableJson(legacy);
    const requestSha256 = sha256(summary);
    const requestId = buildForgeRequestId(requestSha256);
    saveForgeRequest(db, {
        request_id: requestId,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: decisionId,
        request_sha256: requestSha256,
        request_summary_json: summary,
        target_paths_sha256: sha256(stableJson(legacy.target_paths)),
        live_source_allowed: false,
        max_attempts: 1,
        adapter_ref: legacy.adapter_ref!,
        write_capability: 'project_files',
    });
    let request = getForgeRequest(db, requestId)!;
    if (bindLineage) {
        request = bindLegacyV2RequesterLineage(db, {
            request_id: requestId,
            request_sha256: requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        }).request;
    }
    const grant = buildLegacyV2ExecutionGrant(
        request,
        root,
        currentRuntime(),
        hermesRuntime(),
    );
    const grantSha256 = hashLegacyV2ExecutionGrant(grant);
    return { root, db, request, legacy, summary, requestSha256, requestId, grant, grantSha256 };
}

function authorizationInput(fixture: ReturnType<typeof createLegacyFixture>) {
    const now = Date.now();
    return {
        request_id: fixture.requestId,
        request_sha256: fixture.requestSha256,
        authorization_profile: 'exact_request_challenge_v1' as const,
        challenge_sha256: hashForgeAuthorizationChallenge(
            fixture.requestId,
            fixture.requestSha256,
            fixture.grantSha256,
        ),
        operator_authorization_ref: `synthetic:${fixture.requestId}`,
        operator_thread_id: '019f0000-0000-7000-8000-000000000010',
        operator_turn_id: '019f0000-0000-7000-8000-000000000011',
        operator_message_sha256: 'd'.repeat(64),
        operator_record_sha256: 'e'.repeat(64),
        operator_record_set_sha256: 'f'.repeat(64),
        operator_record_count: 1,
        execution_grant_schema: fixture.grant.schema,
        execution_grant_sha256: fixture.grantSha256,
        execution_grant_json: stableJson(fixture.grant),
        authorized_at: now,
        expires_at: now + 60_000,
        now,
    };
}

afterEach(() => {
    database.close();
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('legacy Forge v2 request continuity', () => {
    it('binds a distinct exact compatibility challenge to a narrowed current contract', () => {
        const fixture = createLegacyFixture('challenge', false);
        const challenge = buildForgeAuthorizationChallenge(
            fixture.requestId,
            fixture.requestSha256,
            fixture.grantSha256,
        );

        assert.match(challenge, /^CSTAR_FORGE_AUTHORIZE v2-compat-v1 /);
        assert.match(challenge, new RegExp(`compatibility_manifest_sha256=${fixture.grantSha256}`));
        assert.deepEqual(fixture.grant.effective_request.requested_actions, ['project_files']);
        assert.equal(fixture.grant.effective_request.fixture_policy, 'synthetic_only');
        assert.equal(fixture.grant.effective_request.spend_policy.live_source_allowed, false);
        assert.equal(fixture.grant.effective_request.retry_budget, 0);
        assert.equal(fixture.grant.legacy_requester_lineage.status, 'unrecorded_v2');
    });

    it('binds requester lineage once and rejects partial or malformed stored lineage', () => {
        const fixture = createLegacyFixture('requester-lineage');
        assert.equal(fixture.grant.legacy_requester_lineage.status, 'recorded_v2_extension');
        const replay = bindLegacyV2RequesterLineage(fixture.db, {
            request_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        });
        assert.equal(replay.replayed, true);
        const competingReplay = bindLegacyV2RequesterLineage(fixture.db, {
            request_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
            requester_thread_id: '019f0000-0000-7000-8000-000000000022',
            requester_turn_id: '019f0000-0000-7000-8000-000000000023',
            requester_record_set_sha256: '3'.repeat(64),
        });
        assert.equal(competingReplay.replayed, true);
        assert.equal(competingReplay.request.requester_thread_id, REQUESTER_THREAD_ID);

        database.close();
        const partial = createLegacyFixture('partial-lineage', false);
        partial.db.prepare('UPDATE hall_forge_requests SET requester_thread_id = ? WHERE request_id = ?')
            .run(REQUESTER_THREAD_ID, partial.requestId);
        assert.throws(() => bindLegacyV2RequesterLineage(partial.db, {
            request_id: partial.requestId,
            request_sha256: partial.requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        }), /forge_legacy_v2_requester_lineage_partial/);

        database.close();
        const malformed = createLegacyFixture('malformed-lineage', false);
        malformed.db.prepare(`
            UPDATE hall_forge_requests
            SET requester_thread_id = ?, requester_turn_id = ?, requester_record_set_sha256 = ?
            WHERE request_id = ?
        `).run('not-a-root-thread', REQUESTER_TURN_ID, 'not-a-digest', malformed.requestId);
        assert.throws(() => bindLegacyV2RequesterLineage(malformed.db, {
            request_id: malformed.requestId,
            request_sha256: malformed.requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        }), /forge_legacy_v2_requester_lineage_tampered/);
        assert.throws(() => buildLegacyV2ExecutionGrant(
            getForgeRequest(malformed.db, malformed.requestId)!,
            malformed.root,
            currentRuntime(),
            hermesRuntime(),
        ), /forge_legacy_v2_requester_lineage_invalid/);
    });

    it('rejects lineage backfill after any attempt or authorization evidence exists', () => {
        const attempted = createLegacyFixture('attempted-before-lineage', false);
        const now = Date.now();
        attempted.db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key, execution_receipt_id,
                adapter_ref, status, reserved_at, updated_at
            ) VALUES (?, ?, 1, ?, ?, ?, 'RESERVED', ?, ?)
        `).run('legacy-attempt', attempted.requestId, 'legacy-key', 'legacy-receipt',
            attempted.legacy.adapter_ref, now, now);
        assert.throws(() => bindLegacyV2RequesterLineage(attempted.db, {
            request_id: attempted.requestId,
            request_sha256: attempted.requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        }), /forge_legacy_v2_reconciliation_requires_unspent_unauthorized_request/);

        database.close();
        const authorized = createLegacyFixture('authorized-before-lineage', false);
        authorized.db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                authorization_binding_sha256, challenge_sha256,
                operator_authorization_ref, operator_thread_id,
                operator_turn_id, operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count, authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, 'exact_request_challenge_v1', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run('legacy-auth', authorized.requestId, authorized.requestSha256,
            '4'.repeat(64), '4'.repeat(64),
            'legacy-auth-ref', 'legacy-operator-thread', 'legacy-operator-turn', '5'.repeat(64),
            '6'.repeat(64), '7'.repeat(64), now, now + 60_000, now);
        assert.throws(() => bindLegacyV2RequesterLineage(authorized.db, {
            request_id: authorized.requestId,
            request_sha256: authorized.requestSha256,
            requester_thread_id: REQUESTER_THREAD_ID,
            requester_turn_id: REQUESTER_TURN_ID,
            requester_record_set_sha256: REQUESTER_RECORD_SET_SHA256,
        }), /forge_legacy_v2_reconciliation_requires_unspent_unauthorized_request/);
    });

    it('rejects direct authorization when the compatibility grant lacks requester lineage', () => {
        const fixture = createLegacyFixture('authorize-without-lineage', false);
        assert.throws(
            () => authorizeForgeRequest(fixture.db, authorizationInput(fixture)),
            /forge_authorization_legacy_requester_lineage_invalid/,
        );
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
    });

    it('authorizes without changing the immutable v2 request and reserves at most one attempt', () => {
        const fixture = createLegacyFixture('authorize');
        const authorized = authorizeForgeRequest(fixture.db, authorizationInput(fixture));
        const stored = getForgeRequest(fixture.db, fixture.requestId)!;
        const receipt = getForgeAuthorizationByRequest(fixture.db, fixture.requestId)!;

        assert.equal(authorized.replayed, false);
        assert.equal(stored.request_id, fixture.requestId);
        assert.equal(stored.request_sha256, fixture.requestSha256);
        assert.equal(stored.request_summary_json, fixture.summary);
        assert.equal(stored.bead_id, fixture.legacy.bead_id);
        assert.equal(stored.decision_id, fixture.legacy.decision_id);
        assert.equal(stored.status, 'AUTHORIZED');
        assert.equal(receipt.execution_grant_sha256, fixture.grantSha256);
        assertRecordedLegacyV2ExecutionGrant(receipt, fixture.grant);

        const first = reserveForgeAttempt(fixture.db, {
            request_id: fixture.requestId,
            authorization_id: receipt.authorization_id,
            idempotency_key: 'legacy-v2-one-shot',
            execution_receipt_id: 'forge-execute-legacy-v2-one-shot',
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        });
        const replay = reserveForgeAttempt(fixture.db, {
            request_id: fixture.requestId,
            authorization_id: receipt.authorization_id,
            idempotency_key: 'legacy-v2-one-shot',
            execution_receipt_id: 'forge-execute-legacy-v2-one-shot',
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        });
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.equal(
            fixture.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?')
                .pluck().get(fixture.requestId),
            1,
        );
    });

    it('rejects missing or tampered compatibility evidence without mutating the request', () => {
        const missing = createLegacyFixture('missing-grant');
        const missingInput = authorizationInput(missing);
        delete (missingInput as Partial<typeof missingInput>).execution_grant_schema;
        delete (missingInput as Partial<typeof missingInput>).execution_grant_sha256;
        delete (missingInput as Partial<typeof missingInput>).execution_grant_json;
        assert.throws(
            () => authorizeForgeRequest(missing.db, missingInput),
            /forge_authorization_execution_grant_policy_invalid/,
        );
        assert.equal(getForgeRequest(missing.db, missing.requestId)?.authorization_profile, undefined);

        database.close();
        const tampered = createLegacyFixture('tampered-grant');
        const tamperedInput = authorizationInput(tampered);
        tamperedInput.execution_grant_json = `${tamperedInput.execution_grant_json} `;
        assert.throws(
            () => authorizeForgeRequest(tampered.db, tamperedInput),
            /forge_authorization_execution_grant_invalid/,
        );
        assert.equal(getForgeRequest(tampered.db, tampered.requestId)?.status, 'PENDING_AUTH');
    });

    it('fails closed on runtime drift, widened policy, and unknown legacy keys', () => {
        const fixture = createLegacyFixture('drift');
        const authorized = authorizeForgeRequest(fixture.db, authorizationInput(fixture));
        const drifted = buildLegacyV2ExecutionGrant(
            fixture.request,
            fixture.root,
            currentRuntime('9'),
            hermesRuntime(),
        );
        assert.throws(
            () => assertRecordedLegacyV2ExecutionGrant(authorized.authorization, drifted),
            /forge_legacy_v2_execution_grant_mismatch/,
        );

        const widened = { ...fixture.legacy, retry_budget: 1 };
        const widenedSummary = stableJson(widened);
        const widenedRequest = {
            ...fixture.request,
            request_id: buildForgeRequestId(sha256(widenedSummary)),
            request_sha256: sha256(widenedSummary),
            request_summary_json: widenedSummary,
        };
        assert.throws(
            () => buildLegacyV2ExecutionGrant(
                widenedRequest,
                fixture.root,
                currentRuntime(),
                hermesRuntime(),
            ),
            /forge_legacy_v2_compatibility_policy_invalid|forge_legacy_v2_request_integrity_invalid/,
        );
        assert.throws(
            () => parseLegacyCanonicalForgeRequestV2({ ...fixture.legacy, unexpected: true }),
            /forge_legacy_v2_request_invalid:request_keys/,
        );
    });
});
