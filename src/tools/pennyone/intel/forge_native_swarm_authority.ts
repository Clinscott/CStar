import path from 'node:path';
import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_GENERATION,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    assertIdentitySeparation,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    type ForgeNativeAuthorityScope,
    type NativeAuthorityIntersectionInput,
} from '../../../types/forge_native_swarm.js';

export const FORGE_NATIVE_AUTHORITY_CHAIN_SCHEMA = 'cstar.forge_native_authority_chain.v1' as const;

export type ForgeNativeRunLease = {
    lease_id: string;
    lease_started_at: number;
    lease_expires_at: number;
};

/** Trusted kernel inputs. No field in the public Forge tool schema can supply this object. */
export type ForgeNativeAuthorityChainInput = NativeAuthorityIntersectionInput & {
    control_root: string;
    lease: ForgeNativeRunLease;
    now?: number;
};

export type ForgeNativeAuthorityChain = {
    schema: typeof FORGE_NATIVE_AUTHORITY_CHAIN_SCHEMA;
    effective_scope: ForgeNativeAuthorityScope;
    scope_sha256: string;
    authority_binding_sha256: string;
    evidence_root: string;
    generation: number;
    lease: ForgeNativeRunLease;
    requested_identity: {
        model: typeof FORGE_NATIVE_REQUESTED_MODEL;
        reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING;
    };
    actual_identity: typeof FORGE_NATIVE_ACTUAL_UNREPORTED;
    actual_identity_attested: false;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const SCOPE_KEYS = [
    'decision_id', 'set_batch_id', 'connection_id', 'generation', 'request_id',
    'request_sha256', 'source_repository', 'source_head', 'execution_root',
    'read_allowlist', 'write_allowlist', 'test_allowlist', 'quarantine_allowlist',
    'effect_exclusions', 'model_policy_sha256', 'retry_policy', 'cancellation_policy',
] as const;

function assertExactKeys(value: object, allowed: readonly string[], code: string): void {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new ForgeNativeError(`${code}:${unknown.sort().join(',')}`);
}

function assertScopeShape(scope: ForgeNativeAuthorityScope, label: string): void {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
        throw new ForgeNativeError(`forge_native_${label}_scope_invalid`);
    }
    assertExactKeys(scope, SCOPE_KEYS, `forge_native_${label}_scope_field_forbidden`);
    if (!scope.retry_policy || typeof scope.retry_policy !== 'object') {
        throw new ForgeNativeError(`forge_native_${label}_retry_policy_invalid`);
    }
    assertExactKeys(
        scope.retry_policy,
        ['initial_attempts', 'repair_continuations', 'unknown_retries'],
        `forge_native_${label}_retry_policy_field_forbidden`,
    );
}

function assertLease(lease: ForgeNativeRunLease, now: number): void {
    if (!lease || typeof lease !== 'object' || Array.isArray(lease)) {
        throw new ForgeNativeError('forge_native_run_lease_invalid');
    }
    assertExactKeys(
        lease,
        ['lease_id', 'lease_started_at', 'lease_expires_at'],
        'forge_native_run_lease_field_forbidden',
    );
    if (!ID.test(lease.lease_id)
        || !Number.isSafeInteger(lease.lease_started_at) || lease.lease_started_at < 0
        || !Number.isSafeInteger(lease.lease_expires_at)
        || lease.lease_expires_at <= lease.lease_started_at) {
        throw new ForgeNativeError('forge_native_run_lease_invalid');
    }
    if (!Number.isSafeInteger(now) || now < 0) throw new ForgeNativeError('forge_native_clock_invalid');
    if (now >= lease.lease_expires_at) throw new ForgeNativeError('forge_native_run_lease_expired');
}

export function deriveForgeNativeEvidenceRoot(controlRoot: string, requestSha256: string): string {
    if (!isCanonicalAbsolutePath(controlRoot)) throw new ForgeNativeError('forge_native_control_root_invalid');
    if (!/^[a-f0-9]{64}$/.test(requestSha256)) {
        throw new ForgeNativeError('forge_native_request_sha256_invalid');
    }
    return path.join(controlRoot, 'work', 'forge-native', requestSha256.slice(0, 32));
}

/**
 * Derive the only effective native authority: durable SET ∩ immutable request
 * ∩ connection policy ∩ run lease. The returned identity and evidence root
 * are kernel-derived and cannot be widened by ordinary tool arguments.
 */
export function deriveForgeNativeSwarmAuthority(
    input: ForgeNativeAuthorityChainInput,
): ForgeNativeAuthorityChain {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ForgeNativeError('forge_native_authority_chain_input_invalid');
    }
    assertExactKeys(input, [
        'durable_set', 'immutable_request', 'connection_policy', 'run_lease',
        'control_root', 'lease', 'now',
    ], 'forge_native_authority_chain_field_forbidden');
    const sources = [
        ['durable_set', input.durable_set],
        ['immutable_request', input.immutable_request],
        ['connection_policy', input.connection_policy],
        ['run_lease', input.run_lease],
    ] as const;
    for (const [label, scope] of sources) assertScopeShape(scope, label);
    const now = input.now ?? Date.now();
    assertLease(input.lease, now);
    const intersection = intersectNativeAuthority(input);
    const generation = intersection.effective_scope.generation ?? FORGE_NATIVE_GENERATION;
    if (generation !== FORGE_NATIVE_GENERATION) {
        throw new ForgeNativeError('forge_native_generation_policy_mismatch');
    }
    const identity = assertIdentitySeparation(
        { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        undefined,
        false,
    );
    const evidenceRoot = deriveForgeNativeEvidenceRoot(
        input.control_root,
        intersection.effective_scope.request_sha256,
    );
    const core = {
        schema: FORGE_NATIVE_AUTHORITY_CHAIN_SCHEMA,
        sources: Object.fromEntries(sources),
        effective_scope: intersection.effective_scope,
        scope_sha256: intersection.scope_sha256,
        evidence_root: evidenceRoot,
        generation,
        lease: input.lease,
        requested_identity: {
            model: identity.requested_model,
            reasoning: identity.requested_reasoning,
        },
        actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED,
        actual_identity_attested: false as const,
    };
    return { ...core, authority_binding_sha256: hashNative(core) };
}

