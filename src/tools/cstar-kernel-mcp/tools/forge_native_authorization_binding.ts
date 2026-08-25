import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_AUTHORIZATION_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorization,
    type ForgeNativeRequest,
} from '../../../types/forge_native_swarm.js';
import type { ForgeNativeAuthorityChainInput } from '../../pennyone/intel/forge_native_swarm_authority.js';
import { forgeNativeAuthorizationSchema } from '../contracts/forge_native_swarm.js';
import { verifyForgeNativeRequestBinding } from './forge_native_request_binding.js';

export const FORGE_NATIVE_AUTHORIZATION_BINDING_SCHEMA = 'cstar.forge_native_authorization_binding.v1' as const;

export type ForgeNativeAuthorizationBindingInput = {
    authority_chain: ForgeNativeAuthorityChainInput;
    native_request: ForgeNativeRequest;
    authorization_id: string;
    authorization_ref: string;
    legacy_authorization_binding_sha256: string;
};

export type ForgeNativeAuthorizationBinding = {
    schema: typeof FORGE_NATIVE_AUTHORIZATION_BINDING_SCHEMA;
    authorization: ForgeNativeAuthorization;
    authorization_binding_sha256: string;
    native_request_binding_sha256: string;
    legacy_authorization_binding_sha256: string;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function assertExactKeys(value: object, allowed: readonly string[], code: string): void {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new ForgeNativeError(`${code}:${unknown.sort().join(',')}`);
}

export function bindForgeNativeAuthorization(
    input: ForgeNativeAuthorizationBindingInput,
): ForgeNativeAuthorizationBinding {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ForgeNativeError('forge_native_authorization_binding_input_invalid');
    }
    assertExactKeys(input, [
        'authority_chain', 'native_request', 'authorization_id', 'authorization_ref',
        'legacy_authorization_binding_sha256',
    ], 'forge_native_authorization_binding_field_forbidden');
    const authorizationRef = typeof input.authorization_ref === 'string'
        ? input.authorization_ref.trim() : '';
    if (!ID.test(input.authorization_id) || !authorizationRef || authorizationRef.length > 512) {
        throw new ForgeNativeError('forge_native_authorization_identity_invalid');
    }
    if (!DIGEST.test(input.legacy_authorization_binding_sha256)) {
        throw new ForgeNativeError('forge_native_legacy_authorization_binding_invalid');
    }
    const requestBinding = verifyForgeNativeRequestBinding({
        authority_chain: input.authority_chain,
        goal: input.native_request.goal,
        acceptance: input.native_request.acceptance,
    }, input.native_request);
    const authorizationCore = {
        schema: FORGE_NATIVE_AUTHORIZATION_SCHEMA,
        request_id: input.native_request.authority.request_id,
        request_sha256: input.native_request.authority.request_sha256,
        authorization_id: input.authorization_id,
        authorization_ref: authorizationRef,
        authority: input.native_request.authority,
        scope_sha256: requestBinding.scope_sha256,
        evidence_root: requestBinding.evidence_root,
        requested_identity: {
            model: FORGE_NATIVE_REQUESTED_MODEL,
            reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        },
        actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED,
        actual_identity_attested: false as const,
    };
    const bindingSha256 = hashNative({
        schema: FORGE_NATIVE_AUTHORIZATION_BINDING_SCHEMA,
        native_request_binding_sha256: requestBinding.request_binding_sha256,
        legacy_authorization_binding_sha256: input.legacy_authorization_binding_sha256,
        authorization: authorizationCore,
    });
    const authorization = forgeNativeAuthorizationSchema.parse({
        ...authorizationCore,
        binding_sha256: bindingSha256,
    }) as ForgeNativeAuthorization;
    return {
        schema: FORGE_NATIVE_AUTHORIZATION_BINDING_SCHEMA,
        authorization,
        authorization_binding_sha256: bindingSha256,
        native_request_binding_sha256: requestBinding.request_binding_sha256,
        legacy_authorization_binding_sha256: input.legacy_authorization_binding_sha256,
    };
}

export function verifyForgeNativeAuthorizationBinding(
    input: ForgeNativeAuthorizationBindingInput,
    expected: ForgeNativeAuthorization,
): ForgeNativeAuthorizationBinding {
    const derived = bindForgeNativeAuthorization(input);
    if (stableNativeJson(derived.authorization) !== stableNativeJson(expected)) {
        throw new ForgeNativeError('forge_native_authorization_binding_mismatch');
    }
    return derived;
}

