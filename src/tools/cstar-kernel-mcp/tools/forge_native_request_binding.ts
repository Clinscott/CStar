import path from 'node:path';
import {
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    FORGE_NATIVE_REQUEST_SCHEMA,
    ForgeNativeError,
    hashNative,
    stableNativeJson,
    uniqueSorted,
    validateNativeCapabilities,
    type ForgeNativeRequest,
} from '../../../types/forge_native_swarm.js';
import {
    deriveForgeNativeSwarmAuthority,
    type ForgeNativeAuthorityChainInput,
} from '../../pennyone/intel/forge_native_swarm_authority.js';
import { forgeNativeRequestSchema } from '../contracts/forge_native_swarm.js';

export const FORGE_NATIVE_REQUEST_BINDING_SCHEMA = 'cstar.forge_native_request_binding.v1' as const;

export type ForgeNativeRequestBindingInput = {
    authority_chain: ForgeNativeAuthorityChainInput;
    goal: string;
    acceptance: string[];
};

export type ForgeNativeRequestBinding = {
    schema: typeof FORGE_NATIVE_REQUEST_BINDING_SCHEMA;
    request: ForgeNativeRequest;
    request_binding_sha256: string;
    authority_binding_sha256: string;
    scope_sha256: string;
    evidence_root: string;
};

function assertExactKeys(value: object, allowed: readonly string[], code: string): void {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new ForgeNativeError(`${code}:${unknown.sort().join(',')}`);
}

function canonicalTextList(values: unknown): string[] {
    if (!Array.isArray(values) || values.length === 0 || values.some(
        (value) => typeof value !== 'string' || !value.trim() || value.length > 8192,
    )) throw new ForgeNativeError('forge_native_request_acceptance_invalid');
    return uniqueSorted(values.map((value) => value.trim()));
}

export function bindForgeNativeRequest(input: ForgeNativeRequestBindingInput): ForgeNativeRequestBinding {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ForgeNativeError('forge_native_request_binding_input_invalid');
    }
    assertExactKeys(
        input,
        ['authority_chain', 'goal', 'acceptance'],
        'forge_native_request_binding_field_forbidden',
    );
    const goal = typeof input.goal === 'string' ? input.goal.trim() : '';
    if (!goal || goal.length > 65536) throw new ForgeNativeError('forge_native_request_goal_invalid');
    const authority = deriveForgeNativeSwarmAuthority(input.authority_chain);
    const acceptance = canonicalTextList(input.acceptance);
    validateNativeCapabilities(FORGE_NATIVE_CAPABILITIES);
    const requestCore = {
        schema: FORGE_NATIVE_REQUEST_SCHEMA,
        authority: authority.effective_scope,
        goal,
        acceptance,
        source_identity: {
            repository: authority.effective_scope.source_repository,
            head: authority.effective_scope.source_head,
            execution_root: authority.effective_scope.execution_root,
        },
        requested_identity: {
            model: FORGE_NATIVE_REQUESTED_MODEL,
            reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        },
        capabilities: [...FORGE_NATIVE_CAPABILITIES],
        deadline_at: authority.lease.lease_expires_at,
        idempotency_key: `forge-native-request:${hashNative({
            request_id: authority.effective_scope.request_id,
            request_sha256: authority.effective_scope.request_sha256,
            authority_binding_sha256: authority.authority_binding_sha256,
        }).slice(0, 32)}`,
        evidence_root: authority.evidence_root,
    };
    const bindingSha256 = hashNative({
        schema: FORGE_NATIVE_REQUEST_BINDING_SCHEMA,
        authority_binding_sha256: authority.authority_binding_sha256,
        request: requestCore,
    });
    const request = forgeNativeRequestSchema.parse({
        ...requestCore,
        binding_sha256: bindingSha256,
    }) as ForgeNativeRequest;
    return {
        schema: FORGE_NATIVE_REQUEST_BINDING_SCHEMA,
        request,
        request_binding_sha256: bindingSha256,
        authority_binding_sha256: authority.authority_binding_sha256,
        scope_sha256: authority.scope_sha256,
        evidence_root: authority.evidence_root,
    };
}

export function verifyForgeNativeRequestBinding(
    input: ForgeNativeRequestBindingInput,
    expected: ForgeNativeRequest,
): ForgeNativeRequestBinding {
    const derived = bindForgeNativeRequest(input);
    if (stableNativeJson(derived.request) !== stableNativeJson(expected)) {
        throw new ForgeNativeError('forge_native_request_binding_mismatch');
    }
    return derived;
}

function inside(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative));
}

/** Prove that the native projection cannot exceed the immutable public request. */
export function assertForgeNativeRequestMatchesToolRequest(binding: ForgeNativeRequestBinding, expected: {
    request_id: string;
    request_sha256: string;
    decision_id: string;
    source_repository: string;
    target_paths: string[];
    required_output_paths: string[];
    prohibited_actions: string[];
}): void {
    const scope = binding.request.authority;
    if (scope.request_id !== expected.request_id
        || scope.request_sha256 !== expected.request_sha256
        || scope.decision_id !== expected.decision_id
        || scope.source_repository !== expected.source_repository) {
        throw new ForgeNativeError('forge_native_request_tool_identity_mismatch');
    }
    const writable = expected.required_output_paths.length
        ? expected.required_output_paths : expected.target_paths;
    if (scope.write_allowlist.some((candidate) => !writable.some((parent) => inside(candidate, parent)))) {
        throw new ForgeNativeError('forge_native_request_tool_scope_widened');
    }
    if (expected.prohibited_actions.some((effect) => !scope.effect_exclusions.includes(effect))) {
        throw new ForgeNativeError('forge_native_request_tool_effect_exclusion_missing');
    }
}

