import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleGoalResume } from '../../../src/tools/cstar-kernel-mcp/tools/goal_resume.js';
import { verifyCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    assertGoalResumeV2RequestAndBinding,
} from '../../../src/tools/pennyone/intel/goal_resume_v2_authority.js';
import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { getForgeAuthorizationByRequest } from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];
const OBJECTIVE = 'Host goal é remains blocked; continue the unchanged request.';

function parse(response: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(response.content[0]!.text) as Record<string, any>;
}

function repairArgs(root: string, beadId: string, decisionId: string, threadId: string) {
    const target = path.join(root, 'target.ts');
    return {
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: threadId,
        objective: 'Repair one bounded CStar v2 source seam.',
        prompt: null,
        target_paths: [target],
        required_output_paths: [target],
        system_under_test: null,
        scope: 'One immutable CStar v2 repair request only.',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'focused', threshold: '= pass' }],
        artifact_expectations: ['source receipt'],
        prohibited_actions: [
            'git_push', 'git_commit', 'git_merge', 'install', 'deploy', 'restart', 'activation',
            'secret_config_mutation', 'credential_mutation', 'token_mutation', 'direct_state_write',
            'destructive_cleanup', 'production_claim', 'expanded_spend', 'authorized_source_collection',
        ],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source collection.',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'SOURCE_RECEIPT', callback_required: true },
        package_locks: [],
    };
}

async function setup() {
    const root = fs.mkdtempSync(path.join('/tmp', 'cstar-goal-resume-v2-'));
    roots.push(root);
    closeDb();
    registry.setRoot(root);
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = `bead:test:goal-resume-v2:${randomUUID()}`;
    const decisionId = `decision:test:goal-resume-v2:${randomUUID()}`;
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'v2 goal resume test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, root, now, now);
    const session = createSession({ textParts: ['Repair one bounded CStar v2 source seam.'] });
    const rootIdentity = await verifyCodexRequestIdentity(
        validRequestContext(session.threadId, session.turnId),
    );
    const canonical = canonicalizeForgeRequest(
        repairArgs(root, beadId, decisionId, session.threadId),
        root,
        decisionId,
        null,
        'project_files',
        1,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const request = saveForgeRequest(db, {
        request_id: buildForgeRequestId(requestSha256),
        repo_id: repoId,
        bead_id: beadId,
        decision_id: decisionId,
        request_sha256: requestSha256,
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: rootIdentity.thread_id,
        requester_turn_id: rootIdentity.turn_id,
        requester_record_set_sha256: rootIdentity.turn_record_set_sha256,
        authorization_profile: 'root_user_forge_intent_v1',
        adapter_ref: canonical.adapter_ref ?? undefined,
        write_capability: 'project_files',
    }).request;
    return { root, db, repoId, request, session, nextOffset: 1_000 };
}

function appendTurn(value: Awaited<ReturnType<typeof setup>>, text: string) {
    const turnId = randomUUID();
    appendUserMessage(
        value.session.sessionFile,
        turnId,
        text,
        new Date(Date.parse(value.session.timestamp) + value.nextOffset++).toISOString(),
    );
    return { turnId, context: validRequestContext(value.session.threadId, turnId) };
}

function v2Args(
    value: Awaited<ReturnType<typeof setup>>,
    projectionOverrides: Record<string, unknown> = {},
    topLevelOverrides: Record<string, unknown> = {},
) {
    return {
        forge_request_receipt_id: value.request.request_id,
        request_sha256: value.request.request_sha256,
        host_goal_projection: {
            schema: 'cstar.host_get_goal_projection.v1',
            threadId: value.session.threadId,
            objective: OBJECTIVE,
            status: 'blocked',
            tokensUsed: 7,
            timeUsedSeconds: 8,
            createdAt: 1_700_000_000,
            updatedAt: 1_700_000_001,
            hostResumeCapability: 'unavailable',
            ...projectionOverrides,
        },
        ...topLevelOverrides,
    };
}

async function resume(value: Awaited<ReturnType<typeof setup>>, text: string, overrides = {}) {
    const turn = appendTurn(value, text);
    const response = await handleGoalResume(v2Args(value, overrides), turn.context);
    return { ...turn, response, body: parse(response) };
}

beforeEach(() => {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('goal-resume v2 authority and isolation', () => {
    it('records an ordinary later same-root turn and replays exactly one event', async () => {
        const value = await setup();
        const first = await resume(value, 'The host remains blocked; this is the same bounded request.');
        assert.equal(first.body.status, 'recorded');
        assert.equal(first.body.request_bead_id, value.request.bead_id);
        assert.equal(first.body.decision_id, value.request.decision_id);
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 0);
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 0);

        const replayResponse = await handleGoalResume(v2Args(value), first.context);
        assert.equal(parse(replayResponse).status, 'replayed');
        const rows = value.db.prepare(
            'SELECT payload_json, rationale, summary, metadata_json FROM hall_coordination_events WHERE event_id = ?',
        ).all(first.body.resume_id) as Array<Record<string, string>>;
        assert.equal(rows.length, 1);
        const persisted = JSON.stringify(rows[0]);
        assert.equal(persisted.includes(OBJECTIVE), false);
        assert.equal(persisted.includes('same bounded request'), false);
        assert.equal(persisted.includes('tokensUsed'), false);
        assert.equal(persisted.includes('timeUsedSeconds'), false);
        const eventCount = value.db.prepare(
            "SELECT COUNT(*) AS count FROM hall_coordination_events WHERE repo_id = ? AND json_extract(payload_json, '$.schema') = ?",
        ).get(value.repoId, 'cstar.host_goal_resume.v2') as { count: number };
        assert.equal(Number(eventCount.count), 1);
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 0);
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 0);
    });

    it('accepts neutral, status, or question text as same-root liveness without a fresh grant', async () => {
        for (const text of [
            'Inspect the README.',
            'What is the status of the unchanged request?',
            'The blocked host goal remains under review.',
        ]) {
            const value = await setup();
            const resumed = await resume(value, text);
            assert.equal(resumed.body.status, 'recorded');
            assert.equal(resumed.body.authority_effect, 'continuity_only');
            assert.equal(resumed.body.host_status_mutated, false);
        }
    });

    it('rejects request hash, host thread, snapshot replay drift, and spent state', async () => {
        const value = await setup();
        const first = await resume(value, 'The unchanged request remains blocked.', {},);
        assert.equal(first.body.status, 'recorded');
        const driftResponse = await handleGoalResume(
            v2Args(value, { objective: 'A different host objective.' }),
            first.context,
        );
        assert.match(parse(driftResponse).error, /goal_resume_v2_replay_conflict/);

        const hashTurn = appendTurn(value, 'The unchanged request remains blocked.');
        const hashResponse = await handleGoalResume(
            v2Args(value, {}, { request_sha256: 'c'.repeat(64) }),
            hashTurn.context,
        );
        assert.match(parse(hashResponse).error, /goal_resume_v2_request_lineage_invalid/);

        const mismatchTurn = appendTurn(value, 'The unchanged request remains blocked.');
        const mismatchResponse = await handleGoalResume(
            v2Args(value, { threadId: randomUUID() }),
            mismatchTurn.context,
        );
        assert.match(parse(mismatchResponse).error, /goal_resume_v2_root_thread_lineage_invalid/);

        value.db.prepare('UPDATE hall_forge_requests SET status = ? WHERE request_id = ?')
            .run('AUTHORIZED', value.request.request_id);
        const spentTurn = appendTurn(value, 'The unchanged request remains blocked.');
        const spentResponse = await handleGoalResume(v2Args(value), spentTurn.context);
        assert.match(parse(spentResponse).error, /goal_resume_v2_requires_unspent_pending_request/);
    });

    it('rejects request summary target, scope, and package-lock drift', async () => {
        const value = await setup();
        const summary = JSON.parse(value.request.request_summary_json) as Record<string, unknown>;
        const driftedSummaries = [
            { ...summary, target_paths: [path.join(value.root, 'different-target.ts')] },
            { ...summary, scope: 'An expanded and different scope.' },
            { ...summary, package_locks: ['drifted-lock-material'] },
        ];
        for (const requestSummary of driftedSummaries) {
            assert.throws(
                () => assertGoalResumeV2RequestAndBinding({
                    db: value.db,
                    repo_id: value.repoId,
                    request_id: value.request.request_id,
                    request_sha256: value.request.request_sha256,
                    request: { ...value.request, request_summary_json: stableJson(requestSummary) },
                }),
                /goal_resume_v2_request_integrity_invalid/,
            );
        }
    });

    it('rejects sidecar drift and revocation, protected, fork, or scope-veto text', async () => {
        const value = await setup();
        value.db.exec('DROP TRIGGER hall_forge_request_root_repair_bindings_immutable_update');
        value.db.prepare(
            'UPDATE hall_forge_request_root_repair_bindings SET binding_sha256 = ? WHERE request_id = ?',
        ).run('d'.repeat(64), value.request.request_id);
        assert.throws(
            () => assertGoalResumeV2RequestAndBinding({
                db: value.db,
                repo_id: value.repoId,
                request_id: value.request.request_id,
                request_sha256: value.request.request_sha256,
            }),
            /goal_resume_v2_root_repair_binding_drift/,
        );

        for (const text of [
            'Stop the unchanged request.',
            'Do not continue the unchanged request.',
            'Continue and deploy it.',
            'Continue with scope expansion.',
            'Continue with a different target.',
            'Continue with a different goal.',
            'Continue from a forked thread.',
        ]) {
            const isolated = await setup();
            const blocked = await resume(isolated, text);
            assert.equal(
                blocked.body.error ?? blocked.body.error_code,
                'goal_resume_v2_current_liveness_revoked',
            );
        }
    });

    it('lets Forge consume a v2 receipt without fresh repair wording and rejects v1', async () => {
        const value = await setup();
        const resumed = await resume(value, 'The same bounded request remains the one to authorize.');
        const authorizationTurn = appendTurn(value, 'The same bounded request remains the one to authorize.');
        const authorizeInput = {
            forge_request_receipt_id: value.request.request_id,
            request_sha256: value.request.request_sha256,
            goal_resume_id: resumed.body.resume_id,
        };
        assert.deepEqual(Object.keys(authorizeInput).sort(), [
            'forge_request_receipt_id', 'goal_resume_id', 'request_sha256',
        ]);
        const authorized = await handleForgeAuthorize(authorizeInput, authorizationTurn.context);
        const body = parse(authorized);
        assert.equal(body.status, 'authorized');
        assert.match(body.operator_authorization_ref, /^cstar-forge-goal-resume-v2:/);
        assert.equal(getForgeAuthorizationByRequest(value.db, value.request.request_id)?.authorization_profile,
            'root_user_forge_intent_v1');

        const v1 = await handleForgeAuthorize({
            forge_request_receipt_id: value.request.request_id,
            request_sha256: value.request.request_sha256,
            goal_resume_id: `goal-resume:${'e'.repeat(64)}`,
        });
        assert.match(parse(v1).error, /forge_goal_resume_v1_historical_only/);

        const afterAuthorization = appendTurn(value, 'The host remains blocked while the request is reviewed.');
        const rejectedResume = await handleGoalResume(v2Args(value), afterAuthorization.context);
        assert.match(parse(rejectedResume).error, /goal_resume_v2_requires_unspent_pending_request/);
    });
});
