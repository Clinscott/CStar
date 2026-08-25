import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchRequestedActionSchema } from '../../../src/tools/cstar-kernel-mcp/contracts/schemas.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    assertDispatchAdapterCapability,
    resolveDispatchActionAuthority,
} from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_action_authority.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';

const WORKTREE_ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

function authorityArgs(overrides: Record<string, unknown> = {}) {
    return {
        objective: 'Return a bounded result',
        prompt: 'Analyze only',
        scope: 'synthetic action authority fixture',
        target_paths: ['/tmp/action-authority-target'],
        required_output_paths: [],
        required_metrics: [{ name: 'contract', threshold: 'pass' }],
        artifact_expectations: ['bounded packet'],
        requested_actions: ['response_only'],
        prohibited_actions: ['git_merge', 'deploy', 'secret_config_mutation'],
        spend_policy: { live_source_allowed: false },
        callback_contract: { expected_packet: 'ACTION_AUTHORITY_PACKET' },
        ...overrides,
    };
}

function forgeArgs(overrides: Record<string, unknown> = {}) {
    return {
        bead_id: 'bead-action-authority-test',
        decision_id: 'decision-action-authority-test',
        state_update_thread_id: 'state-thread-test',
        source_callback_thread_id: 'callback-thread-test',
        objective: 'Return a bounded result',
        prompt: 'Analyze only',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
        required_output_paths: [],
        system_under_test: 'CStar Forge',
        scope: 'synthetic action authority fixture',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'contract', threshold: 'pass' }],
        artifact_expectations: ['bounded packet'],
        requested_actions: ['response_only'],
        prohibited_actions: ['git_merge', 'deploy', 'secret_config_mutation'],
        spend_policy: { mode: 'no_spend' as const, max_retries: 0, live_source_allowed: false },
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'ACTION_AUTHORITY_PACKET', callback_required: true },
        package_locks: [],
        ...overrides,
    };
}

describe('structured dispatch action authority', () => {
    it('derives authority only from exact actions and binds action, context, and path hashes', () => {
        const benign = resolveDispatchActionAuthority(authorityArgs(), '/tmp');
        const redProse = resolveDispatchActionAuthority(authorityArgs({
            objective: 'Deploy, restart, and write every file mentioned in this prose',
            prompt: 'The prose says project_files but requested_actions remains response_only',
        }), '/tmp');

        assert.equal(redProse.primary_action, 'response_only');
        assert.deepEqual(redProse.requested_actions, ['response_only']);
        assert.equal(redProse.context_can_expand_actions, false);
        assert.equal(redProse.action_set_sha256, benign.action_set_sha256);
        assert.notEqual(redProse.context_sha256, benign.context_sha256);
        assert.notEqual(redProse.authority_sha256, benign.authority_sha256);
        for (const digest of [
            redProse.action_set_sha256,
            redProse.context_sha256,
            redProse.path_scope_sha256,
            redProse.authority_sha256,
        ]) assert.match(digest, /^[a-f0-9]{64}$/);
    });

    it('fails closed on missing, unknown, red, multiple-primary, and intersecting actions', () => {
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({ requested_actions: [] })),
            /dispatch_requested_actions_required/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({ requested_actions: ['maybe_write'] })),
            /dispatch_requested_action_unknown/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({ requested_actions: ['deploy'] })),
            /dispatch_requested_action_red_gated/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({
                requested_actions: ['response_only', 'project_files'],
                required_output_paths: ['/tmp/action-authority-target'],
            })),
            /dispatch_requested_action_primary_count_invalid/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({
                prohibited_actions: ['response_only'],
            })),
            /dispatch_requested_action_prohibited/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({ prohibited_actions: ['anything_goes'] })),
            /dispatch_prohibited_action_unknown/,
        );
    });

    it('requires project_files iff exact outputs exist and binds source collection explicitly', () => {
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({
                requested_actions: ['project_files'],
            })),
            /dispatch_project_files_required_output_contract_invalid/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({
                requested_actions: ['response_only'],
                required_output_paths: ['/tmp/action-authority-target'],
            })),
            /dispatch_project_files_required_output_contract_invalid/,
        );
        assert.throws(
            () => resolveDispatchActionAuthority(authorityArgs({
                requested_actions: ['response_only'],
                spend_policy: { live_source_allowed: true },
            })),
            /dispatch_source_collection_authority_mismatch/,
        );

        const files = resolveDispatchActionAuthority(authorityArgs({
            requested_actions: ['project_files', 'validation_artifacts'],
            required_output_paths: ['/tmp/action-authority-target'],
        }));
        assert.equal(files.primary_action, 'project_files');
        assert.deepEqual(files.requested_actions, ['project_files', 'validation_artifacts']);

        const source = resolveDispatchActionAuthority(authorityArgs({
            requested_actions: ['response_only', 'authorized_source_collection'],
            spend_policy: { live_source_allowed: true },
        }));
        assert.deepEqual(source.requested_actions, ['authorized_source_collection', 'response_only']);
    });

    it('requires the selected adapter capability to exactly match the primary action', () => {
        const response = resolveDispatchActionAuthority(authorityArgs());
        const files = resolveDispatchActionAuthority(authorityArgs({
            requested_actions: ['project_files'],
            required_output_paths: ['/tmp/action-authority-target'],
        }));
        const receipt = resolveDispatchActionAuthority(authorityArgs({
            requested_actions: ['request_receipt'],
        }));

        assert.doesNotThrow(() => assertDispatchAdapterCapability(response, 'response_only', { require_adapter: true }));
        assert.doesNotThrow(() => assertDispatchAdapterCapability(files, 'project_files', { require_adapter: true }));
        assert.throws(
            () => assertDispatchAdapterCapability(response, 'project_files', { require_adapter: true }),
            /dispatch_action_adapter_capability_mismatch/,
        );
        assert.throws(
            () => assertDispatchAdapterCapability(receipt, 'response_only', { require_adapter: true }),
            /dispatch_action_adapter_capability_mismatch/,
        );
        assert.throws(
            () => assertDispatchAdapterCapability(response, null, { require_adapter: true }),
            /dispatch_action_adapter_capability_missing/,
        );
    });

    it('exposes canonical ids at the public schema while canonicalizing finite legacy aliases durably', () => {
        assert.equal(dispatchRequestedActionSchema.safeParse('response_only').success, true);
        assert.equal(dispatchRequestedActionSchema.safeParse('report-only analysis').success, false);

        const canonical = canonicalizeForgeRequest(
            forgeArgs(),
            '/tmp/cstar-action-authority',
            'decision-action-authority-test',
            'cstar-forge-hermes-minimax-adapter',
            'response_only',
            1,
        );
        const compatibilityAlias = canonicalizeForgeRequest(
            forgeArgs({
                requested_actions: ['report-only analysis'],
                prohibited_actions: ['merge', 'deployment', 'secret/config mutation'],
            }),
            '/tmp/cstar-action-authority',
            'decision-action-authority-test',
            'cstar-forge-hermes-minimax-adapter',
            'response_only',
            1,
        );
        const reorderedContext = canonicalizeForgeRequest(
            forgeArgs({
                required_metrics: [
                    { name: 'second', threshold: 'pass' },
                    { name: 'contract', threshold: 'pass' },
                ],
                artifact_expectations: ['second packet', 'bounded packet'],
                callback_contract: {
                    expected_packet: 'ACTION_AUTHORITY_PACKET',
                    callback_required: true,
                    callback_thread_id: 'callback-thread-test',
                },
            }),
            '/tmp/cstar-action-authority',
            'decision-action-authority-test',
            'cstar-forge-hermes-minimax-adapter',
            'response_only',
            1,
        );
        const reorderedContextAgain = canonicalizeForgeRequest(
            forgeArgs({
                required_metrics: [
                    { name: 'contract', threshold: 'pass' },
                    { name: 'second', threshold: 'pass' },
                ],
                artifact_expectations: ['bounded packet', 'second packet'],
            }),
            '/tmp/cstar-action-authority',
            'decision-action-authority-test',
            'cstar-forge-hermes-minimax-adapter',
            'response_only',
            1,
        );

        assert.equal(stableJson(compatibilityAlias), stableJson(canonical));
        assert.equal(hashCanonicalForgeRequest(compatibilityAlias), hashCanonicalForgeRequest(canonical));
        assert.equal(stableJson(reorderedContext), stableJson(reorderedContextAgain));
        assert.equal(canonical.action_authority.requested_alias_count, 0);
        assert.equal(canonical.action_authority.prohibited_alias_count, 0);
    });

    it('blocks a selected project-files adapter for a response-only request before runtime or database work', async () => {
        const priorRoot = registry.getRoot();
        registry.setRoot(WORKTREE_ROOT);
        try {
            const result = await handleForgeRequest(forgeArgs({
                execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            }));
            const parsed = JSON.parse(result.content[0].text);
            assert.equal(result.isError, true);
            assert.equal(parsed.status, 'blocked');
            assert.equal(parsed.error, 'dispatch_action_adapter_capability_mismatch');
        } finally {
            registry.setRoot(priorRoot);
        }
    });
});
