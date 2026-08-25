import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { isForgeRequesterLineageValid } from '../../pennyone/intel/forge_requester_lineage.js';
import type { ForgeAdapterRuntimeProof } from './forge_adapters.js';
import { DISPATCH_RED_ACTIONS } from './dispatch_action_authority.js';
import type { ForgeRequestContractArgs } from './forge_request_contract.js';
import {
    assertForgeRequiredOutputsContained,
    buildForgeRequestId,
    canonicalizeForgeRequest,
    canonicalizeForgeRequiredOutputPaths,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import {
    sealForgeHermesRuntimeExpectation,
    type ForgeHermesRuntimeExpectation,
} from './forge_hermes_runtime_contract.js';

export const LEGACY_V2_EXECUTION_GRANT_SCHEMA =
    'cstar.forge_legacy_v2_execution_grant.v1' as const;

export interface LegacyCanonicalForgeRequestV2 {
    schema: 'cstar.forge_request.v2';
    bead_id: string;
    decision_id: string;
    state_update_thread_id: string | null;
    source_callback_thread_id: string;
    objective: string;
    prompt: string | null;
    target_paths: string[];
    required_output_paths: string[];
    system_under_test: string | null;
    scope: string;
    authority_lane: 'green' | 'yellow' | 'red';
    required_metrics: Array<{
        name: string;
        threshold: string;
        acceptance_rule: string | null;
        unit: string | null;
    }>;
    artifact_expectations: string[];
    prohibited_actions: string[];
    requested_actions: string[];
    spend_policy: {
        mode: 'no_spend' | 'dry_run' | 'live_authorized';
        max_retries: number;
        live_source_allowed: boolean;
    };
    live_source_policy: string;
    retry_budget: number;
    callback_contract: {
        expected_packet: string;
        callback_required: boolean;
        callback_thread_id: string;
    };
    package_locks: Array<{ path: string; sha256: string }>;
    dispatch_surface_ref: string | null;
    adapter_ref: string | null;
    adapter_runtime: Record<string, unknown> | null;
    write_capability: 'response_only' | 'project_files' | null;
    max_attempts: number;
}

export interface LegacyV2ExecutionGrant {
    schema: typeof LEGACY_V2_EXECUTION_GRANT_SCHEMA;
    compatibility_profile: 'legacy_v2_no_spend_exact_operator_upgrade_v1';
    legacy_repo_id: string;
    legacy_request_id: string;
    legacy_request_sha256: string;
    legacy_target_paths_sha256: string;
    legacy_required_output_paths_sha256: string;
    legacy_package_locks_sha256: string;
    legacy_requested_actions_sha256: string;
    legacy_prohibited_actions_sha256: string;
    legacy_request_created_at: number;
    legacy_requester_lineage: {
        status: 'unrecorded_v2';
    } | {
        status: 'recorded_v2_extension';
        thread_id: string;
        turn_id: string;
        record_set_sha256: string;
    };
    legacy_adapter_runtime_sha256: string | null;
    provider: 'hermes';
    requested_model: 'minimax/MiniMax-M3';
    effective_request: CanonicalForgeRequest;
    effective_request_sha256: string;
}

const LEGACY_KEYS = [
    'adapter_ref',
    'adapter_runtime',
    'artifact_expectations',
    'authority_lane',
    'bead_id',
    'callback_contract',
    'decision_id',
    'dispatch_surface_ref',
    'live_source_policy',
    'max_attempts',
    'objective',
    'package_locks',
    'prompt',
    'prohibited_actions',
    'required_metrics',
    'required_output_paths',
    'requested_actions',
    'retry_budget',
    'schema',
    'scope',
    'source_callback_thread_id',
    'spend_policy',
    'state_update_thread_id',
    'system_under_test',
    'target_paths',
    'write_capability',
] as const;

const LEGACY_V2_PROHIBITED_ACTIONS = [
    'authorized_source_collection',
    ...DISPATCH_RED_ACTIONS,
] as const;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (stableJson(actual) !== stableJson(expected)) {
        throw new Error(`forge_legacy_v2_request_invalid:${label}_keys`);
    }
}

function requireString(value: unknown, label: string, nullable = false): asserts value is string | null {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
        throw new Error(`forge_legacy_v2_request_invalid:${label}`);
    }
}

function requireCanonicalStringSet(value: unknown, label: string): asserts value is string[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`forge_legacy_v2_request_invalid:${label}`);
    }
    for (const item of value) requireString(item, label);
    const canonical = [...new Set(value)].sort();
    if (stableJson(value) !== stableJson(canonical)) {
        throw new Error(`forge_legacy_v2_request_invalid:${label}_canonical`);
    }
}

function assertLegacyMetrics(value: unknown): void {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('forge_legacy_v2_request_invalid:required_metrics');
    }
    for (const metric of value) {
        if (!isRecord(metric)) throw new Error('forge_legacy_v2_request_invalid:required_metric');
        assertExactKeys(metric, ['acceptance_rule', 'name', 'threshold', 'unit'], 'required_metric');
        requireString(metric.name, 'required_metric_name');
        requireString(metric.threshold, 'required_metric_threshold');
        requireString(metric.acceptance_rule, 'required_metric_acceptance_rule', true);
        requireString(metric.unit, 'required_metric_unit', true);
    }
    const canonical = [...value].sort((left, right) =>
        stableJson(left).localeCompare(stableJson(right)));
    if (stableJson(value) !== stableJson(canonical)) {
        throw new Error('forge_legacy_v2_request_invalid:required_metrics_canonical');
    }
}

function assertLegacyPackageLocks(value: unknown): void {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('forge_legacy_v2_request_invalid:package_locks');
    }
    for (const lock of value) {
        if (!isRecord(lock)) throw new Error('forge_legacy_v2_request_invalid:package_lock');
        assertExactKeys(lock, ['path', 'sha256'], 'package_lock');
        requireString(lock.path, 'package_lock_path');
        if (typeof lock.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(lock.sha256)) {
            throw new Error('forge_legacy_v2_request_invalid:package_lock_sha256');
        }
    }
    const canonical = [...value].sort((left, right) =>
        stableJson(left).localeCompare(stableJson(right)));
    if (stableJson(value) !== stableJson(canonical)) {
        throw new Error('forge_legacy_v2_request_invalid:package_locks_canonical');
    }
}

export function parseLegacyCanonicalForgeRequestV2(value: unknown): LegacyCanonicalForgeRequestV2 {
    if (!isRecord(value)) throw new Error('forge_legacy_v2_request_invalid:shape');
    assertExactKeys(value, LEGACY_KEYS, 'request');
    if (value.schema !== 'cstar.forge_request.v2') {
        throw new Error('forge_legacy_v2_request_invalid:schema');
    }
    for (const key of ['bead_id', 'decision_id', 'source_callback_thread_id', 'objective', 'scope', 'live_source_policy'] as const) {
        requireString(value[key], key);
    }
    for (const key of ['state_update_thread_id', 'prompt', 'system_under_test', 'dispatch_surface_ref'] as const) {
        requireString(value[key], key, true);
    }
    if (!['green', 'yellow', 'red'].includes(String(value.authority_lane))) {
        throw new Error('forge_legacy_v2_request_invalid:authority_lane');
    }
    requireCanonicalStringSet(value.target_paths, 'target_paths');
    requireCanonicalStringSet(value.required_output_paths, 'required_output_paths');
    if (!value.target_paths.every((item) => path.isAbsolute(item))
        || !value.required_output_paths.every((item) => path.isAbsolute(item))) {
        throw new Error('forge_legacy_v2_request_invalid:absolute_paths');
    }
    assertLegacyMetrics(value.required_metrics);
    requireCanonicalStringSet(value.artifact_expectations, 'artifact_expectations');
    requireCanonicalStringSet(value.prohibited_actions, 'prohibited_actions');
    requireCanonicalStringSet(value.requested_actions, 'requested_actions');
    if (!isRecord(value.spend_policy)) throw new Error('forge_legacy_v2_request_invalid:spend_policy');
    assertExactKeys(value.spend_policy, ['live_source_allowed', 'max_retries', 'mode'], 'spend_policy');
    if (!['no_spend', 'dry_run', 'live_authorized'].includes(String(value.spend_policy.mode))
        || !Number.isInteger(value.spend_policy.max_retries)
        || typeof value.spend_policy.live_source_allowed !== 'boolean') {
        throw new Error('forge_legacy_v2_request_invalid:spend_policy_values');
    }
    if (!Number.isInteger(value.retry_budget) || Number(value.retry_budget) < 0) {
        throw new Error('forge_legacy_v2_request_invalid:retry_budget');
    }
    if (!isRecord(value.callback_contract)) {
        throw new Error('forge_legacy_v2_request_invalid:callback_contract');
    }
    assertExactKeys(
        value.callback_contract,
        ['callback_required', 'callback_thread_id', 'expected_packet'],
        'callback_contract',
    );
    requireString(value.callback_contract.expected_packet, 'callback_expected_packet');
    requireString(value.callback_contract.callback_thread_id, 'callback_thread_id');
    if (typeof value.callback_contract.callback_required !== 'boolean') {
        throw new Error('forge_legacy_v2_request_invalid:callback_required');
    }
    assertLegacyPackageLocks(value.package_locks);
    if (value.adapter_ref !== null) requireString(value.adapter_ref, 'adapter_ref');
    if (value.adapter_runtime !== null && !isRecord(value.adapter_runtime)) {
        throw new Error('forge_legacy_v2_request_invalid:adapter_runtime');
    }
    if (value.write_capability !== null
        && value.write_capability !== 'response_only'
        && value.write_capability !== 'project_files') {
        throw new Error('forge_legacy_v2_request_invalid:write_capability');
    }
    if (!Number.isInteger(value.max_attempts) || Number(value.max_attempts) < 1) {
        throw new Error('forge_legacy_v2_request_invalid:max_attempts');
    }
    return value as unknown as LegacyCanonicalForgeRequestV2;
}

export function assertLegacyV2RequestIntegrity(
    request: HallForgeRequestRecord,
    root: string,
): LegacyCanonicalForgeRequestV2 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(request.request_summary_json);
    } catch {
        throw new Error('forge_legacy_v2_request_summary_invalid');
    }
    const legacy = parseLegacyCanonicalForgeRequestV2(parsed);
    const canonicalOutputs = canonicalizeForgeRequiredOutputPaths(root, legacy.required_output_paths);
    if (
        stableJson(legacy) !== request.request_summary_json
        || sha256(request.request_summary_json) !== request.request_sha256
        || buildForgeRequestId(request.request_sha256) !== request.request_id
        || sha256(stableJson(legacy.target_paths)) !== request.target_paths_sha256
        || stableJson(canonicalOutputs) !== stableJson(legacy.required_output_paths)
        || request.bead_id !== legacy.bead_id
        || request.decision_id !== legacy.decision_id
        || request.repo_id !== buildHallRepositoryId(normalizeHallPath(root))
        || request.adapter_ref !== legacy.adapter_ref
        || request.write_capability !== legacy.write_capability
        || request.live_source_allowed !== 0
        || request.max_attempts !== legacy.max_attempts
    ) {
        throw new Error('forge_legacy_v2_request_integrity_invalid');
    }
    if (
        legacy.spend_policy.mode !== 'no_spend'
        || legacy.spend_policy.max_retries !== 0
        || legacy.spend_policy.live_source_allowed !== false
        || legacy.retry_budget !== 0
        || legacy.max_attempts !== 1
        || legacy.adapter_ref !== 'cstar-forge-hermes-minimax-worker-adapter'
        || legacy.write_capability !== 'project_files'
    ) {
        throw new Error('forge_legacy_v2_compatibility_policy_invalid');
    }
    assertForgeRequiredOutputsContained(root, legacy.target_paths, legacy.required_output_paths);
    return legacy;
}

export function buildLegacyV2ExecutionGrant(
    request: HallForgeRequestRecord,
    root: string,
    adapterRuntime: ForgeAdapterRuntimeProof,
    hermesRuntime: ForgeHermesRuntimeExpectation,
): LegacyV2ExecutionGrant {
    const legacy = assertLegacyV2RequestIntegrity(request, root);
    const requesterFields = [
        request.requester_thread_id,
        request.requester_turn_id,
        request.requester_record_set_sha256,
    ];
    const requesterFieldCount = requesterFields.filter((value) => value !== undefined).length;
    if (requesterFieldCount !== 0 && requesterFieldCount !== requesterFields.length) {
        throw new Error('forge_legacy_v2_requester_lineage_incomplete');
    }
    if (requesterFieldCount === requesterFields.length && !isForgeRequesterLineageValid(
        request.requester_thread_id,
        request.requester_turn_id,
        request.requester_record_set_sha256,
    )) {
        throw new Error('forge_legacy_v2_requester_lineage_invalid');
    }
    const args: ForgeRequestContractArgs = {
        bead_id: legacy.bead_id,
        decision_id: legacy.decision_id,
        state_update_thread_id: legacy.state_update_thread_id ?? undefined,
        source_callback_thread_id: legacy.source_callback_thread_id,
        objective: legacy.objective,
        prompt: legacy.prompt ?? undefined,
        target_paths: legacy.target_paths,
        required_output_paths: legacy.required_output_paths,
        system_under_test: legacy.system_under_test ?? undefined,
        scope: legacy.scope,
        authority_lane: legacy.authority_lane,
        required_metrics: legacy.required_metrics.map((metric) => ({
            name: metric.name,
            threshold: metric.threshold,
            acceptance_rule: metric.acceptance_rule ?? undefined,
            unit: metric.unit ?? undefined,
        })),
        artifact_expectations: legacy.artifact_expectations,
        prohibited_actions: [...LEGACY_V2_PROHIBITED_ACTIONS],
        requested_actions: ['project_files'],
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
        },
        live_source_policy: legacy.live_source_policy,
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: legacy.callback_contract.expected_packet,
            callback_required: legacy.callback_contract.callback_required,
            callback_thread_id: legacy.callback_contract.callback_thread_id,
        },
        package_locks: legacy.package_locks,
        dispatch_surface_ref: legacy.dispatch_surface_ref ?? undefined,
        execution_adapter_ref: legacy.adapter_ref ?? undefined,
    };
    const effectiveRequest = canonicalizeForgeRequest(
        args,
        root,
        legacy.decision_id,
        legacy.adapter_ref,
        'project_files',
        1,
        adapterRuntime,
        hermesRuntime,
    );
    return {
        schema: LEGACY_V2_EXECUTION_GRANT_SCHEMA,
        compatibility_profile: 'legacy_v2_no_spend_exact_operator_upgrade_v1',
        legacy_repo_id: request.repo_id,
        legacy_request_id: request.request_id,
        legacy_request_sha256: request.request_sha256,
        legacy_target_paths_sha256: request.target_paths_sha256,
        legacy_required_output_paths_sha256: sha256(stableJson(legacy.required_output_paths)),
        legacy_package_locks_sha256: sha256(stableJson(legacy.package_locks)),
        legacy_requested_actions_sha256: sha256(stableJson(legacy.requested_actions)),
        legacy_prohibited_actions_sha256: sha256(stableJson(legacy.prohibited_actions)),
        legacy_request_created_at: request.created_at,
        legacy_requester_lineage: requesterFieldCount === 0
            ? { status: 'unrecorded_v2' }
            : {
                status: 'recorded_v2_extension',
                thread_id: request.requester_thread_id!,
                turn_id: request.requester_turn_id!,
                record_set_sha256: request.requester_record_set_sha256!,
            },
        legacy_adapter_runtime_sha256: legacy.adapter_runtime
            ? sha256(stableJson(legacy.adapter_runtime))
            : null,
        provider: 'hermes',
        requested_model: 'minimax/MiniMax-M3',
        effective_request: effectiveRequest,
        effective_request_sha256: hashCanonicalForgeRequest(effectiveRequest),
    };
}

export function hashLegacyV2ExecutionGrant(grant: LegacyV2ExecutionGrant): string {
    return sha256(stableJson(grant));
}

export function assertRecordedLegacyV2ExecutionGrant(
    authorization: HallForgeAuthorizationRecord,
    expected: LegacyV2ExecutionGrant,
): void {
    if (
        authorization.execution_grant_schema !== LEGACY_V2_EXECUTION_GRANT_SCHEMA
        || authorization.execution_grant_sha256 !== hashLegacyV2ExecutionGrant(expected)
        || authorization.execution_grant_json !== stableJson(expected)
    ) {
        throw new Error('forge_legacy_v2_execution_grant_mismatch');
    }
}

export async function resolveRecordedForgeExecutionContract(
    request: HallForgeRequestRecord,
    authorization: HallForgeAuthorizationRecord,
    root: string,
    adapterRef: string,
    adapterRuntime: ForgeAdapterRuntimeProof,
): Promise<{ canonical: CanonicalForgeRequest; legacyCompatibility: boolean }> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(request.request_summary_json);
    } catch {
        throw new Error('forge_request_summary_invalid');
    }
    const schema = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).schema
        : null;
    if (schema === 'cstar.forge_request.v3') {
        const canonical = parsed as CanonicalForgeRequest;
        if (stableJson(canonical) !== request.request_summary_json
            || hashCanonicalForgeRequest(canonical) !== request.request_sha256
            || buildForgeRequestId(request.request_sha256) !== request.request_id
            || hashForgeTargetPaths(canonical) !== request.target_paths_sha256) {
            throw new Error('forge_request_summary_integrity_invalid');
        }
        return { canonical, legacyCompatibility: false };
    }
    if (schema !== 'cstar.forge_request.v2') {
        throw new Error('forge_request_summary_schema_invalid');
    }
    if (adapterRef !== 'cstar-forge-hermes-minimax-worker-adapter') {
        throw new Error('forge_legacy_v2_execution_adapter_invalid');
    }
    const hermesRuntime = await sealForgeHermesRuntimeExpectation(adapterRuntime);
    const grant = buildLegacyV2ExecutionGrant(request, root, adapterRuntime, hermesRuntime);
    assertRecordedLegacyV2ExecutionGrant(authorization, grant);
    return { canonical: grant.effective_request, legacyCompatibility: true };
}
