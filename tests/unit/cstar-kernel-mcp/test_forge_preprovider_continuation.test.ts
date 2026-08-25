import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyForgePreProviderFailure } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_continuation_authority.js';
import {
    assertForgeContinuationScope,
    hashForgeContinuationAuthority,
    hashForgeRuntimeBinding,
    type CanonicalForgeRequest,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';

function canonical(runtime = '1'): CanonicalForgeRequest {
    return {
        schema: 'cstar.forge_request.v3',
        bead_id: 'bead:test:continuation', decision_id: 'decision:test:continuation',
        state_update_thread_id: null, source_callback_thread_id: 'thread',
        objective: 'Build the repair.', prompt: null,
        target_paths: ['/tmp/project/a.ts'], required_output_paths: ['/tmp/project/a.ts'],
        system_under_test: 'forge', scope: 'fixture', authority_lane: 'yellow',
        required_metrics: [], artifact_expectations: [],
        prohibited_actions: ['deploy'], requested_actions: ['project_files'],
        action_authority: {
            schema: 'cstar.dispatch_action_authority.v1',
            action_semantics_source: 'requested_actions', primary_action: 'project_files',
            requested_actions: ['project_files'], prohibited_actions: ['deploy'],
            context_can_expand_actions: false, action_set_sha256: '2'.repeat(64),
            context_sha256: '3'.repeat(64), path_scope_sha256: '4'.repeat(64),
            authority_sha256: '5'.repeat(64), requested_alias_count: 0,
            prohibited_alias_count: 0,
        },
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'none', fixture_policy: 'synthetic_only', retry_budget: 0,
        callback_contract: { expected_packet: 'PACKET', callback_required: true, callback_thread_id: 'thread' },
        package_locks: [{ path: '/tmp/project/package-lock.json', sha256: '6'.repeat(64) }],
        dispatch_surface_ref: 'docs/forge.md', adapter_ref: 'adapter',
        adapter_runtime: { path: `/runtime/${runtime}`, sha256: runtime.repeat(64), bytes: 1, mode: 0o500, owner_uid: 1, dependencies: [] },
        hermes_runtime: null, write_capability: 'project_files', max_attempts: 1,
    };
}

const zeroEnvelope = {
    status: 'degraded', degraded_reason: 'forge_hermes_target_material_too_large',
    role_receipts: [], provider_request_receipts: [],
    provider_requests_started: 0, provider_requests_completed: 0,
    provider_requests_ambiguous: 0, input_tokens: 0, output_tokens: 0,
    live_spend: false, live_spend_unknown: false, known_spend_observed: false,
};

describe('Forge pre-provider continuation authority', () => {
    it('classifies only exact zero-provider allowlisted evidence', () => {
        const recorded = canonical();
        const result = classifyForgePreProviderFailure({
            envelope: zeroEnvelope,
            failure_code: 'forge_hermes_target_material_too_large',
            execution_trace_sha256: '7'.repeat(64),
            live_source_collection: false,
            workspace_commit_present: false,
            recorded_canonical: recorded,
        });
        assert.ok(result);
        assert.equal(result.continuation_authority_sha256, hashForgeContinuationAuthority(recorded));
        assert.equal(result.prior_runtime_sha256, hashForgeRuntimeBinding(recorded));

        assert.equal(classifyForgePreProviderFailure({
            envelope: { ...zeroEnvelope, provider_requests_started: 1 },
            failure_code: 'forge_hermes_target_material_too_large',
            execution_trace_sha256: '7'.repeat(64),
            live_source_collection: false,
            workspace_commit_present: false,
            recorded_canonical: recorded,
        }), null);
        assert.equal(classifyForgePreProviderFailure({
            envelope: zeroEnvelope, failure_code: 'forge_request_hash_mismatch',
            execution_trace_sha256: '7'.repeat(64), live_source_collection: false,
            workspace_commit_present: false, recorded_canonical: recorded,
        }), null);
    });

    it('allows only runtime drift while preserving exact operator authority', () => {
        const recorded = canonical('1');
        const repaired = canonical('2');
        assert.doesNotThrow(() => assertForgeContinuationScope(recorded, repaired));
        assert.notEqual(hashForgeRuntimeBinding(recorded), hashForgeRuntimeBinding(repaired));
        assert.equal(hashForgeContinuationAuthority(recorded), hashForgeContinuationAuthority(repaired));

        assert.throws(
            () => assertForgeContinuationScope(recorded, { ...repaired, objective: 'Different work.' }),
            /forge_continuation_authority_drift/,
        );
        assert.throws(
            () => assertForgeContinuationScope(recorded, { ...repaired, required_output_paths: [] }),
            /forge_continuation_authority_drift|forge_continuation_required_outputs_drift/,
        );
    });
});
