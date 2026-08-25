import assert from 'node:assert/strict';
import test from 'node:test';
import { FORGE_NATIVE_CONNECTION_ID, hashNative } from '../../../src/types/forge_native_swarm.js';
import { bindForgeNativeRequest, deriveNativeEvidenceRoot, rejectNativeCallerAuthority, verifyForgeNativeRequestBinding } from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_request_binding.js';
import { buildForgeRequestId, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson, type CanonicalForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import type { HallForgeRequestRecord } from '../../../src/types/forge.js';

function fixture(): { canonical: CanonicalForgeRequest; request: HallForgeRequestRecord } {
    const target = '/tmp/cstar-native-binding/worker.ts';
    const canonical = {
        schema: 'cstar.forge_request.v3', bead_id: 'bead-native-binding', decision_id: 'decision-native-binding', state_update_thread_id: null,
        source_callback_thread_id: 'thread-source', objective: 'bind native request', prompt: null, target_paths: [target], required_output_paths: [target],
        system_under_test: null, scope: 'isolated native fixture', authority_lane: 'yellow', required_metrics: [{ name: 'focused', threshold: 'pass', acceptance_rule: null, unit: null }],
        artifact_expectations: ['worker receipt'], prohibited_actions: [], requested_actions: [], action_authority: {} as CanonicalForgeRequest['action_authority'],
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false }, live_source_policy: 'no live source collection', fixture_policy: 'synthetic_only', retry_budget: 0,
        callback_contract: { expected_packet: 'receipt', callback_required: true, callback_thread_id: 'thread-source' }, package_locks: [], dispatch_surface_ref: null,
        adapter_ref: FORGE_NATIVE_CONNECTION_ID, adapter_runtime: null, hermes_runtime: null, write_capability: 'project_files', max_attempts: 1,
    } as CanonicalForgeRequest;
    const requestSha = hashCanonicalForgeRequest(canonical);
    const request = {
        request_id: buildForgeRequestId(requestSha), repo_id: 'repo-native', bead_id: canonical.bead_id, decision_id: canonical.decision_id,
        request_sha256: requestSha, request_summary_json: stableJson(canonical), adapter_ref: FORGE_NATIVE_CONNECTION_ID, write_capability: 'project_files',
        target_paths_sha256: hashForgeTargetPaths(canonical), live_source_allowed: 0, max_attempts: 1, status: 'PENDING_AUTH', created_at: 1, updated_at: 1,
    } as unknown as HallForgeRequestRecord;
    return { canonical, request };
}

test('native request binding derives evidence root and scope from durable request identity', () => {
    const { canonical, request } = fixture();
    const binding = bindForgeNativeRequest({ request, canonical, code_root: '/tmp', control_root: '/tmp' });
    assert.equal(binding.request.authority.connection_id, FORGE_NATIVE_CONNECTION_ID); assert.equal(binding.request.authority.request_id, request.request_id);
    assert.equal(binding.evidence_root, deriveNativeEvidenceRoot('/tmp', request.request_id)); assert.equal(binding.request.evidence_root, binding.evidence_root);
    assert.equal(binding.request.requested_identity.model, 'gpt-5.6-luna'); assert.equal(binding.request.requested_identity.reasoning, 'max');
    assert.equal(binding.request.binding_sha256, hashNative({ ...binding.request, binding_sha256: '' })); verifyForgeNativeRequestBinding(binding);
});

test('native authority and identity fields cannot be supplied by caller', () => {
    assert.throws(() => rejectNativeCallerAuthority({ native_evidence_root: '/tmp/attacker' }), /caller_field_forbidden/);
    assert.throws(() => rejectNativeCallerAuthority({ actual_identity: 'caller-claim' }), /caller_field_forbidden/);
    assert.doesNotThrow(() => rejectNativeCallerAuthority({ execution_adapter_ref: FORGE_NATIVE_CONNECTION_ID, objective: 'bounded' }));
});
