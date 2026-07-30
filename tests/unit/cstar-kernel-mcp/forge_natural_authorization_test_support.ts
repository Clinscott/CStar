import fs from 'node:fs';
import path from 'node:path';

import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { hashForgeAuthorizationChallenge } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_authorization_challenge.js';
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
import { writeCountingAdapter } from './forge_durable_execution_test_support.js';

const originalRoot = registry.getRoot();
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];

export function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

export function setupRoot(label: string) {
    const root = fs.mkdtempSync(path.join('/tmp', `cstar-forge-intent-${label}-`));
    fs.chmodSync(root, 0o700);
    roots.push(root);
    registry.setRoot(root);
    closeDb();
    const target = path.join(root, 'target.txt');
    fs.writeFileSync(target, 'synthetic target\n', { mode: 0o600 });
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCountingAdapter(root, true);
    return { root, target, db: database.getWritableDb(root) };
}

export function insertBead(
    value: ReturnType<typeof setupRoot>,
    beadId: string,
    targetRef = 'Moonshot PR 32',
): void {
    const now = Date.now();
    value.db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, ?, 'Natural Forge authorization test',
                  'IN_PROGRESS', ?, ?)
    `).run(
        beadId,
        buildHallRepositoryId(normalizeHallPath(value.root)),
        targetRef,
        value.target,
        now,
        now,
    );
}

export function requestArgs(
    value: ReturnType<typeof setupRoot>,
    beadId: string,
    decisionId: string,
    sourceThreadId: string,
) {
    return {
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: sourceThreadId,
        objective: 'Build one bounded synthetic Moonshot improvement.',
        prompt: 'Return the bounded synthetic result only.',
        target_paths: [value.target],
        scope: 'Natural-language Forge authorization test only.',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'operator_binding', threshold: '= pass' }],
        artifact_expectations: ['natural authorization receipt'],
        prohibited_actions: ['project_files', 'authorized_source_collection'],
        requested_actions: ['response_only'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'NATURAL_AUTH_TEST', callback_required: true },
        package_locks: [],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
    };
}

export function saveExactProfileRequest(
    value: ReturnType<typeof setupRoot>, beadId: string, decisionId: string,
): { requestId: string; requestSha256: string } {
    const canonical = canonicalizeForgeRequest(
        requestArgs(value, beadId, decisionId, '019f0000-0000-7000-8000-000000000001'),
        value.root, decisionId, 'cstar-forge-hermes-minimax-adapter', 'response_only', 1,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const requestId = buildForgeRequestId(requestSha256);
    saveForgeRequest(value.db, {
        request_id: requestId,
        repo_id: buildHallRepositoryId(normalizeHallPath(value.root)),
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
        authorization_challenge_sha256: hashForgeAuthorizationChallenge(
            requestId, requestSha256,
        ),
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        write_capability: 'response_only',
    });
    return { requestId, requestSha256 };
}

export async function requestAndAuthorize(
    value: ReturnType<typeof setupRoot>, beadId: string, decisionId: string, instruction: string,
): Promise<{ pending: Record<string, any>; result: Record<string, any> }> {
    const session = createSession({ textParts: [instruction] });
    const context = validRequestContext(session.threadId, session.turnId);
    const pending = parse(await handleForgeRequest(
        requestArgs(value, beadId, decisionId, session.threadId), context,
    ));
    const result = parse(await handleForgeAuthorize({
        forge_request_receipt_id: pending.receipt_id,
        request_sha256: pending.request_sha256,
    }, context));
    return { pending, result };
}

export function beginNaturalAuthorizationTest(): void {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
}

export function cleanupNaturalAuthorizationTest(): void {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalAdapter === undefined) delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    else process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = originalAdapter;
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
}
