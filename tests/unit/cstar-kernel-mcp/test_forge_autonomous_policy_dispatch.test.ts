import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeMissionGrantByRequest,
} from '../../../src/tools/pennyone/intel/forge_mission_grant_controller.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import {
    verifyForgeExecutionAuthorization,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_authority.js';
import {
    assertAutonomousDispatchPolicyRequestScope,
    hashAutonomousDispatchChild,
    hashAutonomousDispatchPolicy,
    resolveAutonomousDispatchPolicyBinding,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_autonomous_policy_contract.js';
import { hashCanonicalForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { verifyCodexRequestIdentity }
    from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import { createSession, validRequestContext } from './operator_authorization_test_support.js';
import { parse, setupRoot } from './forge_natural_authorization_test_support.js';
import {
    POLICY_PARENT,
    autonomousPolicyChildTemplate,
    appendAutonomousPolicyTurn,
    appendAutonomousPolicySameTurnRecord,
    beginAutonomousPolicyTest,
    cleanupAutonomousPolicyTest,
    createAutonomousPolicyFixture,
    markAutonomousPolicyBeadUpdated,
    requestAutonomousPolicyChild,
    rewriteAutonomousPolicyMetadata,
} from './forge_autonomous_policy_test_support.js';

beforeEach(beginAutonomousPolicyTest);
afterEach(cleanupAutonomousPolicyTest);

function stored(fixture: Awaited<ReturnType<typeof createAutonomousPolicyFixture>>, receiptId: string) {
    const request = getForgeRequest(fixture.value.db, receiptId)!;
    const authorization = getForgeAuthorizationByRequest(fixture.value.db, receiptId)!;
    return { request, authorization };
}

async function executionAuthority(
    fixture: Awaited<ReturnType<typeof createAutonomousPolicyFixture>>,
    receipt: Record<string, any>,
    context = validRequestContext(fixture.session.threadId, randomUUID()),
) {
    const value = stored(fixture, receipt.receipt_id);
    return verifyForgeExecutionAuthorization(
        fixture.value.db,
        value.request,
        value.authorization.operator_authorization_ref,
        context,
    );
}

describe('autonomous Hermes dispatch policy', () => {
    it('binds host-created immutable policy metadata before the child receipt is requested', async () => {
        const value = setupRoot('host-bead-binding');
        fs.mkdirSync(`${value.root}/src`);
        fs.mkdirSync(`${value.root}/tests/features`, { recursive: true });
        fs.mkdirSync(`${value.root}/tests/unit`, { recursive: true });
        const session = createSession({
            timestamp: new Date(Date.now() - 5_000).toISOString(),
            textParts: ['Create the autonomous Hermes dispatch policy.'],
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const expiresAt = Date.now() + 60 * 60 * 1_000;
        const prohibited = [...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS].sort();
        const parentArgs = {
            action: 'create' as const, bead_id: POLICY_PARENT, target_kind: 'WORKFLOW' as const,
            target_ref: 'decision:cstar:autonomous-hermes-dispatch-policy-test',
            target_path: value.root, status: 'IN_PROGRESS' as const,
            rationale: 'Synthetic host-created autonomous policy.',
            metadata: {
                schema: 'cstar.autonomous_hermes_dispatch_policy.v1', version: 1,
                policy_id: 'decision:cstar:autonomous-hermes-dispatch-policy-test',
                code_root: value.root, allowed_lanes: ['forge', 'researcher'],
                provider_profiles: ['hermes:minimax', 'hermes:x-grok'],
                prohibited_actions: prohibited, provider_attempt_ceiling: 2,
                max_child_attempts: 1, max_child_retries: 0, live_source_allowed: false,
                expires_at: expiresAt,
            },
        };
        const parentResult = parse(await handleBead(parentArgs, context));
        assert.equal(parentResult.status, 'created', JSON.stringify(parentResult));
        const parent = JSON.parse(value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(POLICY_PARENT) as string);
        const parentRow = value.db.prepare(
            'SELECT status, metadata_json, created_at, updated_at FROM hall_beads WHERE bead_id = ?',
        ).get(POLICY_PARENT);
        assert.equal(parent.policy_sha256, hashAutonomousDispatchPolicy(parent));
        assert.equal(parent.issued_at, parentRow.created_at);
        assert.equal(parent.mutation_request_identity.thread_id, session.threadId);

        const template = autonomousPolicyChildTemplate();
        const childId = 'bead:cstar:autonomous-policy:host-child';
        const decisionId = 'decision:cstar:autonomous-hermes-dispatch-policy-test:host-child';
        const childMetadata = {
            schema: 'cstar.autonomous_hermes_dispatch_child.v1', version: 1,
            parent_bead_id: POLICY_PARENT,
            decision_id: decisionId, lane: 'forge', scope: 'CStar autonomous Hermes policy test only.',
            target_paths: ['src', 'tests'],
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            write_capability: 'project_files', provider_profile: 'hermes:minimax',
            source_callback_thread_id: session.threadId, state_update_thread_id: null,
            dispatch_surface_ref: null, forge_child_request_template: template,
        };
        const childResult = parse(await handleBead({
            action: 'create' as const, bead_id: childId, target_kind: 'WORKFLOW' as const,
            target_ref: decisionId, target_path: value.root, status: 'IN_PROGRESS' as const,
            rationale: 'Synthetic host-created autonomous child.',
            metadata: childMetadata,
        }, context));
        assert.equal(childResult.status, 'created', JSON.stringify(childResult));
        const child = JSON.parse(value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(childId) as string);
        assert.equal(child.child_sha256, hashAutonomousDispatchChild(child));
        assert.equal(child.policy_sha256, parent.policy_sha256);
        const callerHash = await handleBead({
            action: 'create', bead_id: `${childId}-caller-hash`, target_kind: 'WORKFLOW',
            target_ref: `${decisionId}:caller-hash`, target_path: value.root, status: 'IN_PROGRESS',
            rationale: 'Caller hash injection must be rejected.',
            metadata: {
                ...childMetadata,
                decision_id: `${decisionId}:caller-hash`,
                policy_sha256: parent.policy_sha256,
            },
        }, context);
        assert.equal(callerHash.isError, true);
        assert.match(callerHash.content[0]!.text, /forge_autonomous_policy_child_creation_metadata_invalid/);
        const fixture = {
            value, session, context, identity: await verifyCodexRequestIdentity(context),
            issuedAt: parent.issued_at, expiresAt, prohibitedActions: prohibited,
            children: [{ beadId: childId, decisionId, template }],
        };
        const receipt = await requestAutonomousPolicyChild(fixture);
        assert.equal(receipt.status, 'AUTHORIZED', JSON.stringify(receipt));

        const duplicate = await handleBead({
            action: 'create', bead_id: POLICY_PARENT,
            rationale: 'Attempt to replace an autonomous policy with an ordinary bead.',
        }, context);
        assert.equal(duplicate.isError, true);
        assert.match(duplicate.content[0]!.text, /forge_autonomous_policy_bead_already_exists/);

        for (const mutation of [
            { action: 'update_status', bead_id: POLICY_PARENT, status: 'BLOCKED' },
            { action: 'claim', bead_id: POLICY_PARENT, assigned_agent: 'test-agent' },
            { action: 'block', bead_id: POLICY_PARENT, triage_reason: 'Synthetic mutation probe.' },
            { action: 'resolve', bead_id: POLICY_PARENT, resolution_note: 'Synthetic mutation probe.' },
        ]) {
            const blocked = await handleBead(mutation as any, context);
            assert.equal(blocked.isError, true);
            assert.match(blocked.content[0]!.text, /forge_autonomous_policy_bead_mutation_forbidden/);
        }
        assert.deepEqual(value.db.prepare(
            'SELECT status, metadata_json, created_at, updated_at FROM hall_beads WHERE bead_id = ?',
        ).get(POLICY_PARENT), parentRow);
        const childRow = value.db.prepare(
            'SELECT status, metadata_json, created_at, updated_at FROM hall_beads WHERE bead_id = ?',
        ).get(childId);
        const childMutation = await handleBead({
            action: 'claim', bead_id: childId, assigned_agent: 'test-agent',
        }, context);
        assert.equal(childMutation.isError, true);
        assert.match(childMutation.content[0]!.text, /forge_autonomous_policy_bead_mutation_forbidden/);
        assert.deepEqual(value.db.prepare(
            'SELECT status, metadata_json, created_at, updated_at FROM hall_beads WHERE bead_id = ?',
        ).get(childId), childRow);
    });

    it('seals identity and host issuance against direct metadata tampering', async () => {
        const parentTamper = await createAutonomousPolicyFixture('parent-identity-tamper');
        rewriteAutonomousPolicyMetadata(parentTamper, POLICY_PARENT, (metadata) => {
            metadata.mutation_request_identity.turn_id = randomUUID();
        });
        const parentResult = await requestAutonomousPolicyChild(parentTamper);
        assert.equal(parentResult.error_code, 'forge_autonomous_policy_parent_scope_invalid');

        const childTamper = await createAutonomousPolicyFixture('child-identity-tamper');
        rewriteAutonomousPolicyMetadata(childTamper, childTamper.children[0]!.beadId, (metadata) => {
            metadata.mutation_request_identity.turn_id = randomUUID();
        });
        const childResult = await requestAutonomousPolicyChild(childTamper);
        assert.equal(childResult.error_code, 'forge_autonomous_policy_child_immutable_invalid');

        const futureIssuance = await createAutonomousPolicyFixture('future-issuance');
        const revoked = appendAutonomousPolicyTurn(futureIssuance, 'Stop.');
        rewriteAutonomousPolicyMetadata(futureIssuance, POLICY_PARENT, (metadata) => {
            metadata.issued_at = futureIssuance.issuedAt + 60_000;
            metadata.policy_sha256 = hashAutonomousDispatchPolicy(metadata);
        });
        const futureResult = await requestAutonomousPolicyChild(futureIssuance, 0, revoked);
        assert.equal(futureResult.error_code, 'forge_autonomous_policy_parent_immutable_invalid');
    });

    it('materializes a one-attempt Forge receipt without SET text or a public authorize step', async () => {
        const fixture = await createAutonomousPolicyFixture('automatic');
        const result = await requestAutonomousPolicyChild(fixture);
        const value = stored(fixture, result.receipt_id);

        assert.equal(result.status, 'AUTHORIZED', JSON.stringify(result));
        assert.equal(result.request_status, 'AUTHORIZED');
        assert.equal(result.authorization_profile, 'autonomous_dispatch_policy_v1');
        assert.equal(value.authorization.authorization_profile, 'autonomous_dispatch_policy_v1');
        assert.equal(value.request.max_attempts, 1);
        assert.equal(JSON.parse(value.request.request_summary_json).retry_budget, 0);
        assert.match(result.operator_authorization_ref, /^cstar-forge-mission-grant:/);
        assert.doesNotMatch(result.next_action, /cstar_forge_authorize/i);
        assert.match(result.next_action, /same-root structural workflow/i);
        assert.ok(getForgeMissionGrantByRequest(fixture.value.db, result.receipt_id));
    });

    it('rebinds an immutable pending policy receipt after a preauthorization failure', async () => {
        const fixture = await createAutonomousPolicyFixture('pending-rebind');
        const parentRaw = fixture.value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(POLICY_PARENT) as string;
        const parentMetadata = JSON.parse(parentRaw) as Record<string, any>;
        rewriteAutonomousPolicyMetadata(fixture, POLICY_PARENT, (metadata) => {
            metadata.policy_sha256 = 'b'.repeat(64);
        });

        const first = await requestAutonomousPolicyChild(fixture);
        assert.equal(first.error_code, 'forge_autonomous_policy_parent_scope_invalid');
        rewriteAutonomousPolicyMetadata(fixture, POLICY_PARENT, (metadata) => {
            Object.assign(metadata, parentMetadata);
        });
        const later = appendAutonomousPolicyTurn(fixture, 'Resume the same bounded policy receipt.');
        const rebound = await requestAutonomousPolicyChild(fixture, 0, later);

        assert.equal(rebound.status, 'AUTHORIZED', JSON.stringify(rebound));
        assert.equal(rebound.request_replayed, true);
        assert.match(rebound.request_sha256, /^[a-f0-9]{64}$/);
    });

    it('replays the same autonomous receipt from a later same-root turn without a second grant', async () => {
        const fixture = await createAutonomousPolicyFixture('replay');
        const first = await requestAutonomousPolicyChild(fixture);
        const later = appendAutonomousPolicyTurn(fixture, 'Inspect the existing autonomous child receipt.');
        const replay = await requestAutonomousPolicyChild(fixture, 0, later);

        assert.equal(replay.status, 'AUTHORIZED', JSON.stringify(replay));
        assert.equal(replay.receipt_id, first.receipt_id);
        assert.equal(replay.operator_authorization_ref, first.operator_authorization_ref);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_mission_grants',
        ).get().count, 1);
    });

    it('accepts an appended informational record in the still-open originating turn', async () => {
        const fixture = await createAutonomousPolicyFixture('same-turn-information');
        const first = await requestAutonomousPolicyChild(fixture);
        const later = appendAutonomousPolicySameTurnRecord(
            fixture, 'Inspect the existing child receipt; no authority changes.',
        );
        const replay = await requestAutonomousPolicyChild(fixture, 0, later);

        assert.equal(replay.status, 'AUTHORIZED', JSON.stringify(replay));
        assert.equal(replay.receipt_id, first.receipt_id);
    });

    it('keeps execution authority valid after same-turn informational continuation', async () => {
        const fixture = await createAutonomousPolicyFixture('same-turn-executor');
        const result = await requestAutonomousPolicyChild(fixture);
        const later = appendAutonomousPolicySameTurnRecord(
            fixture, 'Review the bounded result packet only.',
        );
        const authority = await executionAuthority(fixture, result, later);

        assert.equal(authority.mode, 'autonomous_dispatch_policy_v1');
    });

    it('seals a multi-record originating prefix before accepting later information', async () => {
        const fixture = await createAutonomousPolicyFixture(
            'multi-record-prefix', 2, 1, 'The second original root-user record is informational.',
        );
        const first = await requestAutonomousPolicyChild(fixture);
        const later = appendAutonomousPolicySameTurnRecord(
            fixture, 'A later note must not rewrite the sealed prefix.',
        );
        const replay = await requestAutonomousPolicyChild(fixture, 0, later);

        assert.equal(first.status, 'AUTHORIZED', JSON.stringify(first));
        assert.equal(replay.status, 'AUTHORIZED', JSON.stringify(replay));
        assert.equal(replay.receipt_id, first.receipt_id);
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )?.set_record_count, 2);
    });

    it('accepts a same-root structural executor and rejects a different root', async () => {
        const fixture = await createAutonomousPolicyFixture('executor');
        const result = await requestAutonomousPolicyChild(fixture);
        const authority = await executionAuthority(fixture, result);

        assert.equal(authority.mode, 'autonomous_dispatch_policy_v1');
        assert.equal(authority.continuation_fingerprint, null);
        await assert.rejects(
            executionAuthority(fixture, result, validRequestContext(randomUUID(), randomUUID())),
            /forge_autonomous_policy_persisted_authority_invalid/,
        );
    });

    it('revokes a persisted policy grant after a later root-user cancellation', async () => {
        for (const [label, text] of [['stop', 'Stop.'], ['cancel', 'Cancel it.']]) {
            const fixture = await createAutonomousPolicyFixture(`revocation-${label}`);
            const result = await requestAutonomousPolicyChild(fixture);
            const revoked = appendAutonomousPolicyTurn(fixture, text);

            await assert.rejects(
                executionAuthority(fixture, result, revoked),
                /forge_autonomous_policy_revoked/,
            );
            assert.equal(getForgeMissionGrantByRequest(
                fixture.value.db, result.receipt_id,
            )!.status, 'REVOKED');
        }
    });

    it('revokes a persisted policy grant after a same-turn cancellation', async () => {
        for (const [label, text] of [['stop', 'Stop.'], ['cancel', 'Cancel it.']]) {
            const fixture = await createAutonomousPolicyFixture(`same-turn-revocation-${label}`);
            const result = await requestAutonomousPolicyChild(fixture);
            const revoked = appendAutonomousPolicySameTurnRecord(fixture, text);

            await assert.rejects(
                executionAuthority(fixture, result, revoked),
                /forge_autonomous_policy_revoked/,
            );
            assert.equal(getForgeMissionGrantByRequest(
                fixture.value.db, result.receipt_id,
            )!.status, 'REVOKED');
        }
    });

    it('rejects tampering with a sealed prefix record', async () => {
        const fixture = await createAutonomousPolicyFixture('prefix-tamper');
        const lines = fs.readFileSync(fixture.session.sessionFile, 'utf8').trimEnd().split('\n');
        const index = lines.findIndex((line) => line.includes(
            'Create the immutable autonomous Hermes dispatch policy.',
        ));
        assert.notEqual(index, -1);
        const row = JSON.parse(lines[index]!) as Record<string, any>;
        row.payload.content[0].text = 'Tampered policy instruction.';
        lines[index] = JSON.stringify(row);
        fs.writeFileSync(fixture.session.sessionFile, `${lines.join('\n')}\n`);

        const result = await requestAutonomousPolicyChild(fixture);
        assert.equal(result.error_code, 'forge_autonomous_policy_identity_drift');
    });

    it('rejects replacement of a record in a multi-record sealed prefix', async () => {
        const fixture = await createAutonomousPolicyFixture(
            'multi-prefix-replacement', 2, 1, 'The second original root-user record is informational.',
        );
        const lines = fs.readFileSync(fixture.session.sessionFile, 'utf8').trimEnd().split('\n');
        const index = lines.findIndex((line) => line.includes(
            'The second original root-user record is informational.',
        ));
        assert.notEqual(index, -1);
        const row = JSON.parse(lines[index]!) as Record<string, any>;
        row.payload.content[0].text = 'Replacement with a different original record.';
        lines[index] = JSON.stringify(row);
        fs.writeFileSync(fixture.session.sessionFile, `${lines.join('\n')}\n`);

        const result = await requestAutonomousPolicyChild(fixture);
        assert.equal(result.error_code, 'forge_autonomous_policy_identity_drift');
    });

    it('rejects reordering records in a multi-record sealed prefix', async () => {
        const fixture = await createAutonomousPolicyFixture(
            'multi-prefix-reorder', 2, 1, 'The second original root-user record is informational.',
        );
        const lines = fs.readFileSync(fixture.session.sessionFile, 'utf8').trimEnd().split('\n');
        const firstIndex = lines.findIndex((line) => line.includes(
            'Create the immutable autonomous Hermes dispatch policy.',
        ));
        const secondIndex = lines.findIndex((line) => line.includes(
            'The second original root-user record is informational.',
        ));
        assert.notEqual(firstIndex, -1);
        assert.notEqual(secondIndex, -1);
        const firstRow = JSON.parse(lines[firstIndex]!) as Record<string, any>;
        const secondRow = JSON.parse(lines[secondIndex]!) as Record<string, any>;
        [firstRow.payload.content, secondRow.payload.content] = [
            secondRow.payload.content,
            firstRow.payload.content,
        ];
        lines[firstIndex] = JSON.stringify(firstRow);
        lines[secondIndex] = JSON.stringify(secondRow);
        fs.writeFileSync(fixture.session.sessionFile, `${lines.join('\n')}\n`);

        const result = await requestAutonomousPolicyChild(fixture);
        assert.equal(result.error_code, 'forge_autonomous_policy_identity_drift');
    });

    it('ignores a same-turn subagent notification but still revokes on a real root-user stop', async () => {
        const fixture = await createAutonomousPolicyFixture('notification-cancel');
        const first = await requestAutonomousPolicyChild(fixture);
        const notification = appendAutonomousPolicySameTurnRecord(
            fixture, '<subagent_notification>Cancel it.</subagent_notification>',
        );
        const replay = await requestAutonomousPolicyChild(fixture, 0, notification);
        assert.equal(replay.status, 'AUTHORIZED', JSON.stringify(replay));
        assert.equal(replay.receipt_id, first.receipt_id);

        const stop = appendAutonomousPolicySameTurnRecord(fixture, 'Stop.');
        await assert.rejects(
            executionAuthority(fixture, first, stop),
            /forge_autonomous_policy_revoked/,
        );
    });

    it('rejects compatibility authorization so a policy child cannot fall back to free-form parsing', async () => {
        const fixture = await createAutonomousPolicyFixture('compatibility');
        const result = await requestAutonomousPolicyChild(fixture);
        const response = await handleForgeAuthorize({
            forge_request_receipt_id: result.receipt_id,
            request_sha256: result.request_sha256,
        }, fixture.context);

        assert.equal(response.isError, true);
        assert.match(response.content[0]!.text, /forge_autonomous_policy_compatibility_authorize_forbidden/);
    });

    it('fails closed on an immutable child path escape or a mutated policy parent', async () => {
        const pathEscape = await createAutonomousPolicyFixture('path-escape');
        const child = pathEscape.children[0]!;
        rewriteAutonomousPolicyMetadata(pathEscape, child.beadId, (metadata) => {
            metadata.target_paths = ['../outside', 'src'];
            metadata.child_sha256 = hashAutonomousDispatchChild(metadata);
        });
        const escaped = await requestAutonomousPolicyChild(pathEscape);
        assert.equal(escaped.error_code, 'forge_autonomous_policy_child_lineage_invalid');

        const parentMutation = await createAutonomousPolicyFixture('parent-mutation');
        markAutonomousPolicyBeadUpdated(parentMutation, POLICY_PARENT);
        const mutated = await requestAutonomousPolicyChild(parentMutation);
        assert.equal(mutated.error_code, 'forge_autonomous_policy_parent_immutable_invalid');
    });

    it('rejects a request scope expansion and atomically enforces the parent child ceiling', async () => {
        const expanded = await createAutonomousPolicyFixture('scope-expansion');
        const widened = await requestAutonomousPolicyChild(expanded, 0, expanded.context, (args) => {
            args.target_paths = [...args.target_paths, `${expanded.value.root}/outside`];
        });
        assert.equal(widened.error_code, 'forge_autonomous_policy_request_scope_widened');

        const capped = await createAutonomousPolicyFixture('capacity', 1, 2);
        const first = await requestAutonomousPolicyChild(capped, 0);
        assert.equal(first.status, 'AUTHORIZED', JSON.stringify(first));
        const second = await requestAutonomousPolicyChild(capped, 1);
        assert.equal(second.error_code, 'forge_autonomous_policy_capacity_exhausted');
        assert.equal(capped.value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 1);
    });

    it('accepts legacy unordered policy obligation lists without widening their scope', async () => {
        const fixture = await createAutonomousPolicyFixture('unordered-obligations');
        const receipt = await requestAutonomousPolicyChild(fixture);
        const { request } = stored(fixture, receipt.receipt_id);
        const binding = resolveAutonomousDispatchPolicyBinding(fixture.value.db, request);
        const summary = JSON.parse(request.request_summary_json) as Record<string, any>;
        summary.artifact_expectations = [...summary.artifact_expectations].reverse();
        const legacyRequest = {
            ...request,
            request_sha256: hashCanonicalForgeRequest(summary as any),
            request_summary_json: JSON.stringify(summary),
        };

        assert.doesNotThrow(() => assertAutonomousDispatchPolicyRequestScope(binding, legacyRequest));
    });
});
