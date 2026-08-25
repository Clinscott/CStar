import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';

import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import {
    getForgeAuthorizationByRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    saveForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize as rawHandleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest as rawHandleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { forgeRequestSchema } from '../../../src/tools/cstar-kernel-mcp/contracts/schemas.js';
import {
    buildForgeAuthorizationChallenge,
    hashForgeAuthorizationChallenge,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorization_challenge.js';
import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const roots: string[] = [];
const handleForgeRequest: typeof rawHandleForgeRequest = (args, context) =>
    rawHandleForgeRequest(args, context);
const handleForgeAuthorize: typeof rawHandleForgeAuthorize = (args, context) =>
    rawHandleForgeAuthorize(args, context);
const originalRoot = registry.getRoot();
const originalAdapterScript = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalForgeRuntimeTestBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function createPendingRequest(suffix: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-exact-auth-'));
    roots.push(root);
    registry.setRoot(root);
    closeDb();
    const target = path.join(root, 'target.txt');
    fs.writeFileSync(target, 'synthetic target\n');
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = `bead:test:exact-auth:${suffix}`;
    const decisionId = `decision:test:exact-auth:${suffix}`;
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Exact authorization test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, target, now, now);
    const canonical = canonicalizeForgeRequest({
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: '019f0000-0000-7000-8000-000000000001',
        objective: 'Return one bounded synthetic report.',
        target_paths: [target],
        scope: 'Synthetic exact authorization test.',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'exact_binding', threshold: '= pass' }],
        artifact_expectations: ['exact challenge receipt'],
        prohibited_actions: ['project_files', 'authorized_source_collection'],
        requested_actions: ['response_only'],
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'EXACT_AUTH_TEST', callback_required: true },
        package_locks: [],
    }, root, decisionId, 'cstar-forge-hermes-minimax-adapter', 'response_only', 1);
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const requestId = buildForgeRequestId(requestSha256);
    const challenge = buildForgeAuthorizationChallenge(requestId, requestSha256);
    saveForgeRequest(db, {
        request_id: requestId,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: decisionId,
        request_sha256: requestSha256,
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: '019f0000-0000-7000-8000-000000000002',
        requester_turn_id: '019f0000-0000-7000-8000-000000000003',
        requester_record_set_sha256: 'a'.repeat(64),
        authorization_profile: 'exact_request_challenge_v1',
        authorization_challenge_sha256: hashForgeAuthorizationChallenge(requestId, requestSha256),
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        write_capability: 'response_only',
    });
    return { root, db, requestId, requestSha256, challenge };
}

beforeEach(() => {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalAdapterScript === undefined) {
        delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    } else {
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = originalAdapterScript;
    }
    if (originalForgeRuntimeTestBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalForgeRuntimeTestBypass;
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('exact hash-bound Forge authorization', () => {
    it('forbids the legacy freeform authorization reference at the request schema', () => {
        const schema = z.object(forgeRequestSchema);
        const parsed = schema.safeParse({
            bead_id: 'bead:test:schema',
            decision_id: 'decision:test:schema',
            source_callback_thread_id: '019f0000-0000-7000-8000-000000000001',
            objective: 'Schema-only synthetic request.',
            target_paths: ['/tmp/synthetic'],
            scope: 'schema test',
            authority_lane: 'yellow',
            required_metrics: [{ name: 'schema', threshold: '= pass' }],
            artifact_expectations: ['schema receipt'],
            prohibited_actions: ['project_files'],
            requested_actions: ['response_only'],
            spend_policy: {
                mode: 'live_authorized',
                max_retries: 0,
                live_source_allowed: false,
                operator_authorization_ref: 'legacy-prose-ref',
            },
            fixture_policy: 'synthetic_only',
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: { expected_packet: 'SCHEMA_TEST', callback_required: true },
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        });
        assert.equal(parsed.success, false);
        assert.match(JSON.stringify(parsed.error), /operator_authorization_ref/);
    });

    it('records no-spend work without presenting a null authorization challenge', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-no-spend-'));
        roots.push(root);
        registry.setRoot(root);
        closeDb();
        const target = path.join(root, 'target.txt');
        fs.writeFileSync(target, 'synthetic target\n');
        const db = database.getWritableDb(root);
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        const beadId = 'bead:test:no-spend';
        const now = Date.now();
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'WORKFLOW', ?, 'No-spend Forge test', 'IN_PROGRESS', ?, ?)
        `).run(beadId, repoId, target, now, now);
        const session = createSession({ textParts: ['Record this synthetic no-spend Forge request.'] });

        const result = parse(await handleForgeRequest({
            bead_id: beadId,
            decision_id: 'decision:test:no-spend',
            source_callback_thread_id: session.threadId,
            objective: 'Record one synthetic no-spend request.',
            target_paths: [target],
            scope: 'Synthetic no-spend semantics only.',
            authority_lane: 'green',
            required_metrics: [{ name: 'live_spend', threshold: '= 0' }],
            artifact_expectations: ['durable no-spend receipt'],
            prohibited_actions: ['project_files', 'authorized_source_collection'],
            requested_actions: ['request_receipt'],
            spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
            fixture_policy: 'synthetic_only',
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: { expected_packet: 'NO_SPEND_TEST', callback_required: true },
            package_locks: [],
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(result.status, 'no_spend_request_recorded');
        assert.equal(result.authorization_challenge, null);
        assert.equal(result.authorization_manifest, null);
        assert.equal(result.dispatch_execution.attempted, false);
        assert.equal(result.dispatch_execution.live_spend, false);
        assert.equal(result.dispatch_execution.fail_closed_reason, 'no_live_execution_requested');
        assert.equal(result.next_action, 'No live execution is authorized by this receipt.');
    });

    it('binds the public live manifest and blocks expired or terminal re-authorization', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-public-live-'));
        roots.push(root);
        registry.setRoot(root);
        closeDb();
        const target = path.join(root, 'target.txt');
        const adapter = path.join(root, 'synthetic_adapter.py');
        fs.writeFileSync(target, 'synthetic target\n');
        fs.writeFileSync(adapter, '# synthetic sealed adapter\n', { mode: 0o600 });
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = adapter;
        const db = database.getWritableDb(root);
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        const beadId = 'bead:test:public-live';
        const now = Date.now();
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'WORKFLOW', ?, 'Public live manifest test', 'IN_PROGRESS', ?, ?)
        `).run(beadId, repoId, target, now, now);
        const args = {
            bead_id: beadId,
            decision_id: 'decision:test:public-live',
            source_callback_thread_id: '019f0000-0000-7000-8000-000000000010',
            objective: 'Return one bounded synthetic response.',
            prompt: 'Return the synthetic response only.',
            target_paths: [target],
            scope: 'Synthetic public live-request proof.',
            authority_lane: 'yellow' as const,
            required_metrics: [{ name: 'manifest_binding', threshold: '= pass' }],
            artifact_expectations: ['work-referenced authorization receipt'],
            prohibited_actions: ['project_files', 'authorized_source_collection'] as const,
            requested_actions: ['response_only'] as const,
            spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
            live_source_policy: 'no live source collection',
            fixture_policy: 'synthetic_only' as const,
            retry_policy: { budget: 0, spent: 0 },
            callback_contract: { expected_packet: 'PUBLIC_LIVE_TEST', callback_required: true },
            package_locks: [],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        };
        const requestSession = createSession({ textParts: [
            `Build the bounded synthetic Forge work for ${beadId} and decision:test:public-live.`,
        ] });
        const pending = parse(await handleForgeRequest(
            args,
            validRequestContext(requestSession.threadId, requestSession.turnId),
        ));

        assert.equal(pending.status, 'pending_authorization_recorded');
        assert.equal(pending.request_status, 'PENDING_AUTH');
        assert.equal(
            pending.authorization_manifest.canonical_request_json,
            stableJson(pending.authorization_manifest.canonical_request),
        );
        assert.equal(
            hashCanonicalForgeRequest(pending.authorization_manifest.canonical_request),
            pending.request_sha256,
        );
        assert.equal(pending.authorization_manifest.request_sha256, pending.request_sha256);
        assert.equal(pending.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(pending.authorization_challenge, null);
        assert.equal(pending.authorization_challenge_sha256, null);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, validRequestContext(requestSession.threadId, requestSession.turnId)));
        assert.equal(granted.status, 'authorized');
        const authorization = getForgeAuthorizationByRequest(db, pending.receipt_id)!;
        const expiredAt = now - 1;
        db.prepare('UPDATE hall_forge_authorizations SET expires_at = ? WHERE authorization_id = ?')
            .run(expiredAt, authorization.authorization_id);
        db.prepare('UPDATE hall_forge_requests SET expires_at = ? WHERE request_id = ?')
            .run(expiredAt, pending.receipt_id);
        const expiredSession = createSession({ textParts: ['Replay the same immutable request.'] });
        const expired = parse(await handleForgeRequest(
            args,
            validRequestContext(expiredSession.threadId, expiredSession.turnId),
        ));
        assert.equal(expired.status, 'authorization_expired_replayed');
        assert.equal(expired.authorization_challenge, null);
        assert.equal(expired.guardrail.verdict, 'block');

        db.prepare(`
            UPDATE hall_forge_requests
            SET status = 'FAILED_FINAL', completed_at = ?, updated_at = ?
            WHERE request_id = ?
        `).run(now, now, pending.receipt_id);
        const terminalSession = createSession({ textParts: ['Replay the terminal request.'] });
        const terminal = parse(await handleForgeRequest(
            args,
            validRequestContext(terminalSession.threadId, terminalSession.turnId),
        ));
        assert.equal(terminal.status, 'terminal_request_replayed');
        assert.equal(terminal.authorization_challenge, null);
        assert.match(terminal.next_action, /do not authorize or spend again/i);
    });

    it('authorizes once from the sole exact root-user input and replays exactly', async () => {
        const fixture = createPendingRequest('success');
        const session = createSession({ textParts: [fixture.challenge] });
        const context = validRequestContext(session.threadId, session.turnId);
        const args = {
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        };

        const first = parse(await handleForgeAuthorize(args, context));
        const replay = parse(await handleForgeAuthorize(args, context));

        assert.equal(first.status, 'authorized');
        assert.equal(first.authorization_replayed, false);
        assert.match(first.authorization_id, /^forge-auth-[a-f0-9]{32}$/);
        assert.equal(replay.authorization_replayed, true);
        assert.equal(replay.authorization_id, first.authorization_id);
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId)?.authorization_id, first.authorization_id);
    });

    it('authorizes the exact input after a proven Codex platform-context companion', async () => {
        const fixture = createPendingRequest('platform-context');
        const session = createSession({ textParts: [fixture.challenge], platformContext: true });

        const result = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(result.status, 'authorized');
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId)?.operator_record_count, 1);
    });

    it('rejects an exact input when its platform-context evidence conflicts', async () => {
        const fixture = createPendingRequest('platform-context-mismatch');
        const session = createSession({
            textParts: [fixture.challenge],
            platformContext: true,
            platformContextWorldDate: '2099-01-01',
        });

        const result = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(result.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
    });

    it('treats an exact authorization replay as historical after the request is terminal', async () => {
        const fixture = createPendingRequest('terminal-replay');
        const session = createSession({ textParts: [fixture.challenge] });
        const context = validRequestContext(session.threadId, session.turnId);
        const args = {
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        };
        const first = parse(await handleForgeAuthorize(args, context));
        assert.equal(first.status, 'authorized');
        fixture.db.prepare(`
            UPDATE hall_forge_requests
            SET status = 'FAILED_FINAL', completed_at = ?, updated_at = ?
            WHERE request_id = ?
        `).run(Date.now(), Date.now(), fixture.requestId);

        const replay = parse(await handleForgeAuthorize(args, context));

        assert.equal(replay.status, 'terminal_authorization_replay');
        assert.equal(replay.authorization_replayed, true);
        assert.equal(replay.mutation, null);
        assert.equal(replay.guardrail.verdict, 'block');
        assert.match(replay.next_action, /do not spend again/i);
    });

    it('masks pre-challenge receipt and runtime distinctions after root-user identity', async () => {
        const fixture = createPendingRequest('masked-pre-challenge');
        const session = createSession({ textParts: ['Not the exact Forge challenge.'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const existing = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        }, context));
        const absent = parse(await handleForgeAuthorize({
            forge_request_receipt_id: `dispatch-forge-${'9'.repeat(32)}`,
            request_sha256: '8'.repeat(64),
        }, context));
        const noRecord = parse(await handleForgeAuthorize({
            forge_request_receipt_id: `dispatch-forge-${'9'.repeat(32)}`,
            request_sha256: '8'.repeat(64),
        }, validRequestContext(session.threadId, randomUUID())));

        assert.equal(existing.error_code, 'forge_operator_authorization_required');
        assert.equal(absent.error_code, 'forge_request_receipt_not_found');
        assert.deepEqual(noRecord, existing);
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
    });

    for (const [label, mutate] of [
        ['suffix', (value: string) => `${value} One retry is allowed.`],
        ['leading whitespace', (value: string) => ` ${value}`],
        ['trailing whitespace', (value: string) => `${value} `],
    ] as const) {
        it(`rejects ${label} without authorizing the request`, async () => {
            const fixture = createPendingRequest(label.replace(/\s+/g, '-'));
            const session = createSession({ textParts: [mutate(fixture.challenge)] });
            const result = parse(await handleForgeAuthorize({
                forge_request_receipt_id: fixture.requestId,
                request_sha256: fixture.requestSha256,
            }, validRequestContext(session.threadId, session.turnId)));

            assert.match(result.error, /forge_operator_authorization_required/);
            assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
        });
    }

    it('rejects multiple input blocks even when their concatenation resembles the challenge', async () => {
        const fixture = createPendingRequest('multiple-blocks');
        const midpoint = Math.floor(fixture.challenge.length / 2);
        const session = createSession({
            textParts: [fixture.challenge.slice(0, midpoint), fixture.challenge.slice(midpoint)],
        });
        const result = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(result.error, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
    });

    it('rejects a duplicate canonical user record in the same authorizing turn', async () => {
        const fixture = createPendingRequest('duplicate-user-record');
        const session = createSession({ textParts: [fixture.challenge], duplicate: true });
        const result = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.requestId,
            request_sha256: fixture.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.match(result.error, /codex_request_identity_duplicate_turn_record|forge_operator_authorization_required/);
        assert.equal(getForgeAuthorizationByRequest(fixture.db, fixture.requestId), null);
    });
});
