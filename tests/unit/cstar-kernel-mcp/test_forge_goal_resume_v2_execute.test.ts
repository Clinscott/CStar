import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { handleGoalResume } from '../../../src/tools/cstar-kernel-mcp/tools/goal_resume.js';
import { canonicalizeForgeRequest, buildForgeRequestId, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { verifyCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { forgeGoalResumeV2AuthorizationMatchesRequest } from '../../../src/tools/pennyone/intel/forge_goal_resume_v2_lineage.js';
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
const originalTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];
const OBJECTIVE = 'Host goal é remains blocked; continue the unchanged request.';

function parse(response: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(response.content[0]!.text) as Record<string, any>;
}

function repairArgs(root: string, beadId: string, decisionId: string, threadId: string) {
    const target = path.join(root, 'target.ts');
    return {
        bead_id: beadId, decision_id: decisionId, source_callback_thread_id: threadId,
        objective: 'Repair one bounded CStar v2 source seam.', prompt: null,
        target_paths: [target], required_output_paths: [target], system_under_test: null,
        scope: 'One immutable CStar v2 repair request only.', authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'focused', threshold: '= pass' }], artifact_expectations: ['source receipt'],
        prohibited_actions: ['git_push', 'git_commit', 'git_merge', 'install', 'deploy', 'restart', 'activation',
            'secret_config_mutation', 'credential_mutation', 'token_mutation', 'direct_state_write',
            'destructive_cleanup', 'production_claim', 'expanded_spend', 'authorized_source_collection'],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source collection.', fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'SOURCE_RECEIPT', callback_required: true }, package_locks: [],
    };
}

async function setup() {
    const root = fs.mkdtempSync(path.join('/tmp', 'cstar-goal-resume-v2-execute-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'docs', 'operations'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-skill-spec.md'), '# Forge\n');
    fs.writeFileSync(path.join(root, 'docs', 'operations', 'corvus-forge-pipeline-playbook.md'), '# Forge\n');
    fs.writeFileSync(path.join(root, 'target.ts'), 'export const unchanged = true;\n');
    closeDb();
    registry.setRoot(root);
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const beadId = `bead:test:goal-resume-v2-execute:${randomUUID()}`;
    const decisionId = `decision:test:goal-resume-v2-execute:${randomUUID()}`;
    const now = Date.now();
    db.prepare(`INSERT INTO hall_beads (
        bead_id, repo_id, target_kind, target_path, rationale, status, created_at, updated_at
    ) VALUES (?, ?, 'WORKFLOW', ?, 'v2 execute test', 'IN_PROGRESS', ?, ?)`).run(
        beadId, repoId, root, now, now,
    );
    const session = createSession({ textParts: ['Repair one bounded CStar v2 source seam.'] });
    const rootIdentity = await verifyCodexRequestIdentity(
        validRequestContext(session.threadId, session.turnId),
    );
    const args = repairArgs(root, beadId, decisionId, session.threadId);
    const canonical = canonicalizeForgeRequest(
        args, root, decisionId, null, 'project_files', 1,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const request = saveForgeRequest(db, {
        request_id: buildForgeRequestId(requestSha256), repo_id: repoId, bead_id: beadId,
        decision_id: decisionId, request_sha256: requestSha256, request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical), live_source_allowed: false, max_attempts: 1,
        requester_thread_id: rootIdentity.thread_id, requester_turn_id: rootIdentity.turn_id,
        requester_record_set_sha256: rootIdentity.turn_record_set_sha256,
        authorization_profile: 'root_user_forge_intent_v1', adapter_ref: canonical.adapter_ref,
        write_capability: 'project_files',
    }).request;
    return { root, db, repoId, request, session, args, nextOffset: 1_000 };
}

function appendTurn(value: Awaited<ReturnType<typeof setup>>, text: string) {
    const turnId = randomUUID();
    appendUserMessage(
        value.session.sessionFile, turnId, text,
        new Date(Date.parse(value.session.timestamp) + value.nextOffset++).toISOString(),
    );
    return { turnId, context: validRequestContext(value.session.threadId, turnId) };
}

function goalResumeArgs(value: Awaited<ReturnType<typeof setup>>, overrides: Record<string, unknown> = {}) {
    return {
        forge_request_receipt_id: value.request.request_id, request_sha256: value.request.request_sha256,
        host_goal_projection: {
            schema: 'cstar.host_get_goal_projection.v1', threadId: value.session.threadId,
            objective: OBJECTIVE, status: 'blocked', tokensUsed: 7, timeUsedSeconds: 8,
            createdAt: 1_700_000_000, updatedAt: 1_700_000_001, hostResumeCapability: 'unavailable',
        },
        ...overrides,
    };
}

async function authorize(value: Awaited<ReturnType<typeof setup>>) {
    const resumedTurn = appendTurn(value, 'The unchanged request remains blocked.');
    const resumed = parse(await handleGoalResume(goalResumeArgs(value), resumedTurn.context));
    assert.equal(resumed.status, 'recorded');
    const authorizationTurn = appendTurn(value, 'The same bounded request remains the one to authorize.');
    const response = parse(await handleForgeAuthorize({
        forge_request_receipt_id: value.request.request_id,
        request_sha256: value.request.request_sha256,
        goal_resume_id: resumed.resume_id,
    }, authorizationTurn.context));
    assert.equal(response.status, 'authorized');
    assert.equal(response.execution_grant_schema, null);
    assert.equal(response.execution_grant_sha256, null);
    return { authorization: response, context: authorizationTurn.context };
}

function executeArgs(value: Awaited<ReturnType<typeof setup>>, authorizationRef: string, key: string) {
    return {
        ...value.args, forge_request_receipt_id: value.request.request_id,
        forge_request_decision_id: value.request.decision_id, forge_request_bead_id: value.request.bead_id,
        execution_mode: 'live_authorized' as const,
        operator_authorization_ref: authorizationRef, idempotency_key: key, project_root: value.root,
    };
}

function rebindLineageTamper(
    value: Awaited<ReturnType<typeof setup>>,
    authorization: NonNullable<ReturnType<typeof getForgeAuthorizationByRequest>>,
    mutate: (projection: Record<string, any>) => void,
) {
    const projection = JSON.parse(authorization.operator_intent_json!) as Record<string, any>;
    mutate(projection);
    const operatorIntentJson = JSON.stringify(projection);
    const operatorContinuity = projection.continuity_evidence as Record<string, any>;
    const authorizationBinding = createHash('sha256').update(JSON.stringify({
        schema: 'cstar.forge_goal_resume_authorization_binding.v2',
        request_id: value.request.request_id,
        request_sha256: value.request.request_sha256,
        bead_id: value.request.bead_id,
        decision_id: value.request.decision_id,
        projection,
    }), 'utf8').digest('hex');
    return {
        ...authorization,
        operator_intent_json: operatorIntentJson,
        authorization_binding_sha256: authorizationBinding,
        operator_thread_id: operatorContinuity.operator_thread_id,
        operator_turn_id: operatorContinuity.operator_turn_id,
    };
}

beforeEach(() => {
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalTestMode === undefined) delete process.env.CSTAR_FORGE_TEST_MODE;
    else process.env.CSTAR_FORGE_TEST_MODE = originalTestMode;
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge v2 goal-resume authorization consumption', () => {
    it('consumes the exact same-turn authorization through one state-only v3 handoff and replays once', async () => {
        const value = await setup();
        const authorized = await authorize(value);
        const auth = getForgeAuthorizationByRequest(value.db, value.request.request_id)!;
        assert.equal(auth.execution_grant_schema, undefined);
        assert.equal(auth.execution_grant_sha256, undefined);
        assert.equal(forgeGoalResumeV2AuthorizationMatchesRequest(value.request, auth), true);

        const args = executeArgs(value, authorized.authorization.operator_authorization_ref, 'goal-resume-v2-one-shot');
        const first = parse(await handleForgeExecute(args, authorized.context));
        assert.equal(first.status, 'host_handoff_queued', JSON.stringify(first));
        assert.equal(first.attempt_status, 'STARTED');
        assert.equal(first.worker_job.runner_owner, 'codex-host');
        assert.equal(first.worker_job.requested_model, 'gpt-5.6-luna');
        assert.equal(first.worker_job.requested_reasoning, 'max');
        assert.equal(first.worker_job.actual_identity, null);
        assert.equal(first.worker_job.provider_requests_started, 0);
        assert.equal(first.worker_job.cognition_launch, false);
        assert.equal(first.worker_job.cstar_launch, false);
        assert.equal(first.host_handoff.provider_attempted, false);
        const handoff = fs.readFileSync(first.host_handoff.handoff_path, 'utf8');

        const replay = parse(await handleForgeExecute(args, authorized.context));
        assert.equal(replay.status, 'host_handoff_replayed', JSON.stringify(replay));
        assert.equal(replay.attempt_id, first.attempt_id);
        assert.equal(replay.forge_execution.provider_attempted, false);
        assert.equal(fs.readFileSync(first.host_handoff.handoff_path, 'utf8'), handoff);
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 1);
    });

    it('rejects a later turn and tampered v2 lineage before reservation', async () => {
        const value = await setup();
        const authorized = await authorize(value);
        const auth = getForgeAuthorizationByRequest(value.db, value.request.request_id)!;
        assert.equal(forgeGoalResumeV2AuthorizationMatchesRequest(value.request, auth), true);
        assert.equal(forgeGoalResumeV2AuthorizationMatchesRequest(value.request, {
            ...auth, authorization_binding_sha256: '0'.repeat(64),
        }), false);
        assert.equal(forgeGoalResumeV2AuthorizationMatchesRequest(value.request, {
            ...auth, operator_record_set_sha256: '1'.repeat(64),
        }), false);

        const later = appendTurn(value, 'A later root-user turn cannot spend the exact grant.');
        const rejected = parse(await handleForgeExecute(
            executeArgs(value, authorized.authorization.operator_authorization_ref, 'later-turn-rejected'),
            later.context,
        ));
        assert.equal(rejected.error_code, 'forge_execution_authorization_required');
        assert.equal(Number((value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(value.request.request_id) as { count: number }).count), 0);
    });

    it('requires independent root-thread continuity and a different root turn', async () => {
        const value = await setup();
        await authorize(value);
        const authorization = getForgeAuthorizationByRequest(value.db, value.request.request_id)!;

        const changedThread = rebindLineageTamper(value, authorization, (projection) => {
            (projection.continuity_evidence as Record<string, any>).operator_thread_id = randomUUID();
        });
        assert.equal(
            forgeGoalResumeV2AuthorizationMatchesRequest(value.request, changedThread),
            false,
        );

        const rootTurn = (JSON.parse(authorization.operator_intent_json!) as Record<string, any>)
            .scope_authority.root_turn_id as string;
        const reusedRootTurn = rebindLineageTamper(value, authorization, (projection) => {
            (projection.continuity_evidence as Record<string, any>).operator_turn_id = rootTurn;
        });
        assert.equal(
            forgeGoalResumeV2AuthorizationMatchesRequest(value.request, reusedRootTurn),
            false,
        );
    });
});
