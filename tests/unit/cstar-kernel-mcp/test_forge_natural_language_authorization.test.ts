import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import {
    activeForgeAuthorizationMatchesRequest,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
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
import { writeCountingAdapter } from './forge_durable_execution_test_support.js';
const originalRoot = registry.getRoot();
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function setupRoot(label: string) {
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

function insertBead(
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

function requestArgs(
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

function saveExactProfileRequest(
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

async function requestAndAuthorize(
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

beforeEach(() => {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalAdapter === undefined) delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    else process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = originalAdapter;
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('natural-language Forge authorization', () => {
    it('binds one same-turn build instruction without exposing a machine challenge', async () => {
        const value = setupRoot('happy');
        const beadId = 'bead:test:natural-happy';
        const decisionId = 'decision:test:natural-happy';
        insertBead(value, beadId);
        const session = createSession({ textParts: [
            `Build the Moonshot PR 32 improvement for ${beadId} and ${decisionId}.`,
        ] });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        assert.equal(pending.status, 'pending_authorization_recorded');
        assert.equal(pending.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(pending.authorization_challenge, null);
        assert.equal(pending.authorization_challenge_sha256, null);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(granted.status, 'authorized');
        assert.equal(granted.authorization_profile, 'root_user_forge_intent_v1');
        assert.match(granted.authorization_binding_sha256, /^[a-f0-9]{64}$/);
        assert.equal(granted.authorization_challenge, null);
        const stored = getForgeAuthorizationByRequest(value.db, pending.receipt_id)!;
        assert.equal(stored.challenge_sha256, undefined);
        assert.match(stored.operator_intent_json ?? '', /same_turn_request/);
        assert.doesNotMatch(stored.operator_intent_json ?? '', /bounded synthetic result/i);
        const replay = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(replay.authorization_replayed, true);
        assert.equal(replay.authorization_id, granted.authorization_id);
        const sameTurnRequestReplay = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        assert.equal(sameTurnRequestReplay.status, 'authorized_request_replayed');
        assert.equal(sameTurnRequestReplay.guardrail.verdict, 'allow');
        const later = createSession({ textParts: ['Inspect the Moonshot PR 32 request status.'] });
        const historical = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId),
            validRequestContext(later.threadId, later.turnId),
        ));
        assert.equal(historical.status, 'authorized_request_historical_retrieval');
        assert.equal(historical.guardrail.verdict, 'block');
        assert.equal(historical.dispatch_execution.fail_closed_reason,
            'forge_authorization_turn_mismatch');
    });
    for (const [label, instruction] of [
        ['question', 'Could you build the Moonshot PR 32 improvement?'],
        ['example', 'For example, "Build the Moonshot PR 32 improvement."'],
        ['negated', 'Do not build the Moonshot PR 32 improvement.'],
        ['conditional', 'Build the Moonshot PR 32 improvement if I later approve it.'],
        ['deferred', 'Build the Moonshot PR 32 improvement after you ask me again.'],
        ['embedded quotation', 'Build the Moonshot PR 32 improvement described as "approved".'],
        ['single quoted instruction', "Build a warning saying 'Avoid building Moonshot PR 32'."],
        ['unrelated object', 'Build a warning against Moonshot PR 32.'],
        ['bidi control', 'Build the Moonshot \u202ePR 32 improvement.'],
        ['deictic', 'Build this.'],
        ['continuation', 'Proceed.'],
    ] as const) {
        it(`rejects ${label} text without creating authorization`, async () => {
            const value = setupRoot(label);
            const beadId = `bead:test:natural-${label}`;
            const decisionId = `decision:test:natural-${label}`;
            insertBead(value, beadId);
            const { pending, result } = await requestAndAuthorize(
                value, beadId, decisionId, instruction,
            );
            assert.equal(result.error_code, 'forge_operator_authorization_required');
            assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
        });
    }
    it('normalizes ordinary outer and multiline whitespace before authorization', async () => {
        const value = setupRoot('multiline');
        const beadId = 'bead:test:natural-multiline';
        const decisionId = 'decision:test:natural-multiline';
        insertBead(value, beadId);
        const session = createSession({
            textParts: ['\n\tBuild the Moonshot PR 32 improvement.\r\n'],
        });
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId),
            validRequestContext(session.threadId, session.turnId),
        ));
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(granted.status, 'authorized');
    });
    it('resolves a unique multi-token operator label from the immutable decision identity', async () => {
        const value = setupRoot('tokenpath-q0-label');
        const beadId = 'bead:repair:tokenpath-causal-evaluation-promotion-2026-07-13';
        const decisionId = 'decision:tokenpath-q0-runtime-tests-phase1-recovery1-2026-07-15';
        insertBead(value, beadId, 'tokenpath-causal-evaluation-promotion');
        const session = createSession({
            textParts: ['Build the TokenPath Q0 phase-one repair.'],
        });
        const { requestId, requestSha256 } = saveExactProfileRequest(
            value, beadId, decisionId,
        );
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: requestId,
            request_sha256: requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(granted.status, 'authorized');
        assert.equal(granted.authorization_profile, 'root_user_forge_intent_v1');
        assert.match(getForgeAuthorizationByRequest(value.db, requestId)?.operator_intent_json ?? '',
            /"kind":"decision"/);
    });
    it('rejects a one-token project label instead of guessing the pending request', async () => {
        const value = setupRoot('weak-project-label');
        const beadId = 'bead:repair:tokenpath-causal-evaluation-promotion-2026-07-13';
        const decisionId = 'decision:tokenpath-q0-runtime-tests-phase1-recovery1-2026-07-15';
        insertBead(value, beadId, 'tokenpath-causal-evaluation-promotion');
        const { pending, result } = await requestAndAuthorize(
            value, beadId, decisionId, 'Build TokenPath.',
        );
        assert.equal(result.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
    });
    for (const [label, instruction] of [
        ['internal activity', 'Build runtime tests.'],
        ['stage without identity', 'Build Q0 phase one.'],
        ['date fragments', 'Build 2026 15.'],
        ['identity plus date', 'Build TokenPath 2026.'],
        ['incomplete stage', 'Build TokenPath Q0.'],
        ['reordered alias', 'Build phase one TokenPath Q0.'],
    ] as const) {
        it(`rejects ${label} as an incomplete derived decision label`, async () => {
            const value = setupRoot(`unsafe-derived-${label.replaceAll(' ', '-')}`);
            const beadId = 'bead:repair:tokenpath-causal-evaluation-promotion-2026-07-13';
            const decisionId = 'decision:tokenpath-q0-runtime-tests-phase1-recovery1-2026-07-15';
            insertBead(value, beadId, 'tokenpath-causal-evaluation-promotion');
            const { pending, result } = await requestAndAuthorize(
                value, beadId, decisionId, instruction,
            );
            assert.equal(result.error_code, 'forge_operator_authorization_required');
            assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
        });
    }
    it('rejects a multi-token label shared by two immutable decision identities', async () => {
        const value = setupRoot('ambiguous-decision-label');
        const session = createSession({
            textParts: ['Build the TokenPath Q0 phase-one repair.'],
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const ids = [1, 2].map((recovery) => ({
            bead: `bead:repair:tokenpath-causal-evaluation-${recovery}`,
            decision: `decision:tokenpath-q0-runtime-tests-phase1-recovery${recovery}`,
        }));
        for (const id of ids) {
            insertBead(value, id.bead, `tokenpath-causal-evaluation-${id.bead.at(-1)}`);
            await handleForgeRequest(requestArgs(
                value, id.bead, id.decision, session.threadId,
            ), context);
        }
        const selected = getForgeRequest(
            value.db,
            String(value.db.prepare(
                'SELECT request_id FROM hall_forge_requests WHERE bead_id = ?',
            ).pluck().get(ids[0]!.bead)),
        )!;
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: selected.request_id,
            request_sha256: selected.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 0);
    });
    it('rejects excluded competing work even when only the excluded item is pending', async () => {
        const value = setupRoot('excluded');
        const beadId = 'bead:test:natural-excluded';
        const decisionId = 'decision:test:natural-excluded';
        insertBead(value, beadId, 'Moonshot PR 33');
        const session = createSession({
            textParts: ['Build Moonshot PR 32, not Moonshot PR 33.'],
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
    });
    it('rejects an exact identifier embedded in an unrelated affirmative object', async () => {
        const value = setupRoot('embedded-identifier');
        const beadId = 'bead:test:natural-embedded-identifier';
        const decisionId = 'decision:test:natural-embedded-identifier';
        insertBead(value, beadId);
        const session = createSession({
            textParts: [`Build a warning mentioning ${beadId}.`],
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
    });
    it('fails closed when one human reference resolves to multiple pending work items', async () => {
        const value = setupRoot('ambiguous');
        const session = createSession({ textParts: ['Build the Moonshot PR 32 improvement.'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const ids = [1, 2].map((index) => ({
            bead: `bead:test:natural-ambiguous-${index}`,
            decision: `decision:test:natural-ambiguous-${index}`,
        }));
        for (const id of ids) {
            insertBead(value, id.bead);
            await handleForgeRequest(requestArgs(value, id.bead, id.decision, session.threadId), context);
        }
        const selected = getForgeRequest(
            value.db,
            String((value.db.prepare(
                'SELECT request_id FROM hall_forge_requests WHERE bead_id = ?',
            ).pluck().get(ids[0]!.bead))),
        )!;
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: selected.request_id,
            request_sha256: selected.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').get().count, 0);
    });
    it('fails closed on the same canonical target reference in another repository', async () => {
        const value = setupRoot('cross-repo-ambiguous');
        const beadId = 'bead:test:natural-cross-repo-selected';
        const decisionId = 'decision:test:natural-cross-repo-selected';
        insertBead(value, beadId);
        const session = createSession({ textParts: ['Build the Moonshot PR 32 improvement.'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        const selected = getForgeRequest(value.db, pending.receipt_id)!;
        const otherRoot = path.join(value.root, 'other-repository');
        const otherRepoId = buildHallRepositoryId(normalizeHallPath(otherRoot));
        const now = Date.now();
        value.db.prepare(`
            INSERT INTO hall_repositories (
                repo_id, root_path, name, status, created_at, updated_at
            ) VALUES (?, ?, 'other', 'ACTIVE', ?, ?)
        `).run(otherRepoId, otherRoot, now, now);
        value.db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_ref, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'WORKFLOW', 'Moonshot PR 32', ?, 'cross-repo ambiguity',
                      'IN_PROGRESS', ?, ?)
        `).run('bead:test:natural-cross-repo-other', otherRepoId, value.target, now, now);
        saveForgeRequest(value.db, {
            request_id: `dispatch-forge-${'9'.repeat(32)}`,
            repo_id: otherRepoId,
            bead_id: 'bead:test:natural-cross-repo-other',
            decision_id: 'decision:test:natural-cross-repo-other',
            request_sha256: '8'.repeat(64),
            request_summary_json: '{"schema":"cstar.forge_request.v3"}',
            target_paths_sha256: '7'.repeat(64),
            live_source_allowed: false,
            max_attempts: 1,
            requester_thread_id: selected.requester_thread_id,
            requester_turn_id: selected.requester_turn_id,
            requester_record_set_sha256: selected.requester_record_set_sha256,
            authorization_profile: 'root_user_forge_intent_v1',
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
        });
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').get().count, 0);
    });
    it('binds requester lineage mode into the natural authorization hash', async () => {
        const value = setupRoot('lineage-mode-hash');
        const beadId = 'bead:test:natural-lineage-mode-hash';
        const decisionId = 'decision:test:natural-lineage-mode-hash';
        insertBead(value, beadId);
        const session = createSession({ textParts: [`Build the repair for ${beadId}.`] });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context);
        const request = getForgeRequest(value.db, pending.receipt_id)!;
        const authorization = getForgeAuthorizationByRequest(value.db, pending.receipt_id)!;
        const projection = JSON.parse(authorization.operator_intent_json!);
        projection.requester_lineage_mode = 'explicit_legacy_request_upgrade';
        assert.equal(activeForgeAuthorizationMatchesRequest(request, {
            ...authorization,
            operator_intent_json: JSON.stringify(projection),
        }), false);
    });
    it('upgrades an unspent exact-profile v3 request only after an explicit work reference', async () => {
        const value = setupRoot('upgrade');
        const beadId = 'bead:test:natural-exact-upgrade';
        const decisionId = 'decision:test:natural-exact-upgrade';
        insertBead(value, beadId);
        const { requestId, requestSha256 } = saveExactProfileRequest(
            value, beadId, decisionId,
        );
        const before = getForgeRequest(value.db, requestId)!;
        assert.equal(before.authorization_profile, 'exact_request_challenge_v1');
        const session = createSession({ textParts: [`Build the repair for ${beadId}.`] });
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: requestId,
            request_sha256: requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(granted.status, 'authorized');
        const after = getForgeRequest(value.db, requestId)!;
        assert.equal(after.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(after.authorization_challenge_sha256, undefined);
        assert.match(getForgeAuthorizationByRequest(value.db, requestId)?.operator_intent_json ?? '',
            /explicit_legacy_request_upgrade/);
    });
});
