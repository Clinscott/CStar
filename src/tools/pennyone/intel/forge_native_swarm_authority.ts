import path from 'node:path';

import type { CanonicalForgeRequest } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_GENERATION,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    uniqueSorted,
    type ForgeNativeAuthorityScope,
} from '../../../types/forge_native_swarm.js';

/** A fixed future boundary keeps the derived request replayable. The lease is
 * owned by the execute binding; this value is only the request envelope's
 * deterministic deadline. */
export const FORGE_NATIVE_DETERMINISTIC_DEADLINE_AT = 4_102_444_800_000 as const;

export type NativeAuthorityInputs = {
    durable_set?: ForgeNativeAuthorityScope;
    immutable_request?: ForgeNativeAuthorityScope;
    connection_policy?: ForgeNativeAuthorityScope;
    run_lease?: ForgeNativeAuthorityScope;
};

export type NativeAuthorityContext = {
    canonical: CanonicalForgeRequest;
    request_id: string;
    request_sha256: string;
    code_root: string;
    control_root: string;
    authority?: NativeAuthorityInputs;
};

export type NativeAuthorityDerivation = {
    durable_set: ForgeNativeAuthorityScope;
    immutable_request: ForgeNativeAuthorityScope;
    connection_policy: ForgeNativeAuthorityScope;
    run_lease: ForgeNativeAuthorityScope;
    effective_scope: ForgeNativeAuthorityScope;
    scope_sha256: string;
    generation: number;
    requested_identity: { model: typeof FORGE_NATIVE_REQUESTED_MODEL; reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING };
    actual_identity: 'unreported';
    actual_identity_attested: false;
};

function canonicalRoot(value: string, name: string): string {
    if (!isCanonicalAbsolutePath(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
    return value;
}

function canonicalPathList(values: string[], fallback: string, name: string): string[] {
    const paths = uniqueSorted(values.length ? values : [fallback]);
    if (paths.some((value) => !isCanonicalAbsolutePath(value))) {
        throw new ForgeNativeError(`forge_native_${name}_path_invalid`);
    }
    return paths;
}

function sourceHead(input: NativeAuthorityContext): string {
    return hashNative({
        schema: 'cstar.forge_native_source_identity.v1',
        request_id: input.request_id,
        request_sha256: input.request_sha256,
        source_repository: input.code_root,
    });
}

function policyDigest(): string {
    return hashNative({
        schema: 'cstar.forge_native_model_policy.v1',
        model: FORGE_NATIVE_REQUESTED_MODEL,
        reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        capabilities: [...FORGE_NATIVE_CAPABILITIES],
        actual_identity: 'unreported',
        protected_effects: [
            'activation', 'credential_mutation', 'deployment', 'destructive_cleanup', 'git_commit',
            'git_merge', 'git_push', 'install', 'live_database_migration', 'network', 'old_forge_route',
            'production_claim', 'research', 'restart', 'secrets_or_config', 'sprt', 'wd_access',
        ],
    });
}

function requestScope(input: NativeAuthorityContext): ForgeNativeAuthorityScope {
    const canonical = input.canonical;
    const source = canonicalRoot(input.code_root, 'source_repository');
    const control = canonicalRoot(input.control_root, 'control_root');
    const targets = canonicalPathList(canonical.target_paths, source, 'target');
    const outputs = canonicalPathList(canonical.required_output_paths, targets[0] ?? source, 'output');
    return {
        decision_id: canonical.decision_id,
        set_batch_id: `set:${canonical.decision_id}`,
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: FORGE_NATIVE_GENERATION,
        request_id: input.request_id,
        request_sha256: input.request_sha256,
        source_repository: source,
        source_head: sourceHead(input),
        execution_root: source,
        read_allowlist: uniqueSorted([source, control, ...targets, ...outputs]),
        write_allowlist: outputs,
        test_allowlist: targets,
        quarantine_allowlist: [source],
        effect_exclusions: uniqueSorted(canonical.prohibited_actions),
        model_policy_sha256: policyDigest(),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
}

function copyScope(scope: ForgeNativeAuthorityScope): ForgeNativeAuthorityScope {
    return {
        ...scope,
        generation: scope.generation ?? FORGE_NATIVE_GENERATION,
        read_allowlist: uniqueSorted(scope.read_allowlist),
        write_allowlist: uniqueSorted(scope.write_allowlist),
        test_allowlist: uniqueSorted(scope.test_allowlist),
        quarantine_allowlist: uniqueSorted(scope.quarantine_allowlist),
        effect_exclusions: uniqueSorted(scope.effect_exclusions),
    };
}

function scopeFor(input: ForgeNativeAuthorityScope | undefined, fallback: ForgeNativeAuthorityScope): ForgeNativeAuthorityScope {
    return copyScope(input ?? fallback);
}

/** Derive all four authority records from CStar-owned inputs and intersect them.
 * Optional records are useful only for pure copied-state fixtures; a live
 * caller still cannot supply these fields because the handlers reject them. */
export function deriveNativeAuthority(input: NativeAuthorityContext): NativeAuthorityDerivation {
    const fallback = requestScope(input);
    const supplied = input.authority ?? {};
    const durableSet = scopeFor(supplied.durable_set, fallback);
    const immutable = scopeFor(supplied.immutable_request, fallback);
    const connection = scopeFor(supplied.connection_policy, fallback);
    const lease = scopeFor(supplied.run_lease, fallback);
    const intersection = intersectNativeAuthority({
        durable_set: durableSet,
        immutable_request: immutable,
        connection_policy: connection,
        run_lease: lease,
    });
    return {
        durable_set: durableSet,
        immutable_request: immutable,
        connection_policy: connection,
        run_lease: lease,
        effective_scope: intersection.effective_scope,
        scope_sha256: intersection.scope_sha256,
        generation: intersection.effective_scope.generation ?? FORGE_NATIVE_GENERATION,
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        actual_identity: 'unreported',
        actual_identity_attested: false,
    };
}

export function deriveNativeEvidenceRoot(controlRoot: string, requestId: string): string {
    const root = canonicalRoot(controlRoot, 'control_root');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(requestId)) {
        throw new ForgeNativeError('forge_native_request_id_invalid');
    }
    const evidence = path.resolve(root, 'work', 'forge-native', requestId);
    if (!isCanonicalAbsolutePath(evidence)) throw new ForgeNativeError('forge_native_evidence_root_invalid');
    return evidence;
}

export function deriveNativeRequestId(requestId: string): string {
    if (!requestId.trim()) throw new ForgeNativeError('forge_native_request_id_invalid');
    return `native-request:${hashNative({ schema: 'cstar.forge_native_request_id.v1', request_id: requestId })}`;
}

export function deriveNativeAuthorizationId(requestId: string, scopeSha256: string): string {
    if (!requestId.trim() || !/^[a-f0-9]{64}$/.test(scopeSha256)) {
        throw new ForgeNativeError('forge_native_authorization_identity_invalid');
    }
    return `native-authorization:${hashNative({
        schema: 'cstar.forge_native_authorization_id.v1', request_id: requestId, scope_sha256: scopeSha256,
    })}`;
}

export function deriveNativeAuthorizationRef(authorizationId: string): string {
    if (!authorizationId.trim()) throw new ForgeNativeError('forge_native_authorization_ref_invalid');
    return `cstar-native-authorization:${hashNative({
        schema: 'cstar.forge_native_authorization_ref.v1', authorization_id: authorizationId,
    }).slice(0, 32)}`;
}

export function deriveNativeAuthorityBinding(input: NativeAuthorityContext): NativeAuthorityDerivation {
    return deriveNativeAuthority(input);
}
