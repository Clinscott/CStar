import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    activeForgeAuthorizationMatchesRequest,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { createSession, validRequestContext } from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    insertBead,
    parse,
    requestAndAuthorize,
    requestArgs,
    saveExactProfileRequest,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('ordinary natural-language Forge authorization', () => {
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

    it('treats a bounded simplify-first sequence as repair intent', async () => {
        const value = setupRoot('simplify-sequence');
        const beadId = 'bead:test:natural-simplify-sequence';
        const decisionId = 'decision:test:natural-simplify-sequence';
        insertBead(value, beadId, 'agents');
        const { pending, result } = await requestAndAuthorize(
            value,
            beadId,
            decisionId,
            'Simplify the agents first then begin.',
        );
        assert.equal(result.status, 'authorized');
        const authorization = getForgeAuthorizationByRequest(value.db, pending.receipt_id);
        assert.match(authorization?.operator_intent_json ?? '', /"action":"repair"/);
        assert.match(authorization?.operator_intent_json ?? '', /"value":"agents"/);
    });

    for (const [label, instruction] of [
        ['simplify question', 'Could you simplify the agents?'],
        ['simplify negation', 'Do not simplify the agents.'],
        ['simplify conditional', 'Simplify the agents after I approve it.'],
        ['simplify deictic', 'Simplify this.'],
        ['simplify sequenced conditional', 'Simplify the agents first then begin if I approve it.'],
    ] as const) {
        it(`rejects ${label} without creating authorization`, async () => {
            const value = setupRoot(label.replaceAll(' ', '-'));
            const beadId = `bead:test:natural-${label.replaceAll(' ', '-')}`;
            const decisionId = `decision:test:natural-${label.replaceAll(' ', '-')}`;
            insertBead(value, beadId, 'agents');
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
        const { requestId, requestSha256 } = saveExactProfileRequest(value, beadId, decisionId);
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
        const session = createSession({ textParts: ['Build the TokenPath Q0 phase-one repair.'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const ids = [1, 2].map((recovery) => ({
            bead: `bead:repair:tokenpath-causal-evaluation-${recovery}`,
            decision: `decision:tokenpath-q0-runtime-tests-phase1-recovery${recovery}`,
        }));
        for (const id of ids) {
            insertBead(value, id.bead, `tokenpath-causal-evaluation-${id.bead.at(-1)}`);
            await handleForgeRequest(requestArgs(value, id.bead, id.decision, session.threadId), context);
        }
        const selected = getForgeRequest(value.db, String(value.db.prepare(
            'SELECT request_id FROM hall_forge_requests WHERE bead_id = ?',
        ).pluck().get(ids[0]!.bead)))!;
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
        const session = createSession({ textParts: ['Build Moonshot PR 32, not Moonshot PR 33.'] });
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
        const session = createSession({ textParts: [`Build a warning mentioning ${beadId}.`] });
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
        const selected = getForgeRequest(value.db, String(value.db.prepare(
            'SELECT request_id FROM hall_forge_requests WHERE bead_id = ?',
        ).pluck().get(ids[0]!.bead)))!;
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: selected.request_id,
            request_sha256: selected.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 0);
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
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 0);
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
        const { requestId, requestSha256 } = saveExactProfileRequest(value, beadId, decisionId);
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
