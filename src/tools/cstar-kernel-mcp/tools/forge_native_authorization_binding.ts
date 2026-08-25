import type { HallForgeAuthorizationRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_AUTHORIZATION_SCHEMA,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    type ForgeNativeAuthorization,
} from '../../../types/forge_native_swarm.js';
import { bindForgeNativeRequest, isNativeForgeRequest, type ForgeNativeRequestBinding } from './forge_native_request_binding.js';
import type { CanonicalForgeRequest } from './forge_request_contract.js';

export type ForgeNativeAuthorizationBinding = {
    authorization: ForgeNativeAuthorization;
    request_binding: ForgeNativeRequestBinding;
    binding_sha256: string;
};
export function assertNativeAuthorizationRequest(
    request: HallForgeRequestRecord,
    canonical: CanonicalForgeRequest,
    requestBinding: ForgeNativeRequestBinding,
): void {
    if (!isNativeForgeRequest(canonical)) throw new ForgeNativeError('forge_native_connection_not_selected');
    if (request.adapter_ref !== FORGE_NATIVE_CONNECTION_ID || requestBinding.request.authority.request_id !== request.request_id
        || requestBinding.request.authority.request_sha256 !== request.request_sha256) {
        throw new ForgeNativeError('forge_native_request_binding_missing');
    }
}
export function bindForgeNativeAuthorization(input: {
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    request_binding: ForgeNativeRequestBinding;
}): ForgeNativeAuthorizationBinding {
    const { request, authorization, request_binding: requestBinding } = input;
    if (request.adapter_ref !== FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_connection_not_selected');
    if (authorization.request_id !== request.request_id || authorization.request_sha256 !== request.request_sha256
        || authorization.operator_authorization_ref.trim() === '' || request.status !== 'AUTHORIZED') {
        throw new ForgeNativeError('forge_native_authorization_binding_invalid');
    }
    if (requestBinding.request.authority.request_id !== request.request_id || requestBinding.request.authority.request_sha256 !== request.request_sha256) {
        throw new ForgeNativeError('forge_native_request_binding_missing');
    }
    const base: Omit<ForgeNativeAuthorization, 'binding_sha256'> = {
        schema: FORGE_NATIVE_AUTHORIZATION_SCHEMA, request_id: request.request_id, request_sha256: request.request_sha256,
        authorization_id: authorization.authorization_id, authorization_ref: authorization.operator_authorization_ref,
        authority: requestBinding.effective_scope, scope_sha256: requestBinding.scope_sha256, evidence_root: requestBinding.evidence_root,
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED, actual_identity_attested: false,
    };
    const digest = hashNative({ ...base, binding_sha256: '' });
    return { authorization: { ...base, binding_sha256: digest }, request_binding: requestBinding, binding_sha256: digest };
}
export function verifyForgeNativeAuthorizationBinding(binding: ForgeNativeAuthorizationBinding): void {
    const { authorization } = binding;
    if (authorization.schema !== FORGE_NATIVE_AUTHORIZATION_SCHEMA || authorization.actual_identity !== FORGE_NATIVE_ACTUAL_UNREPORTED || authorization.actual_identity_attested) {
        throw new ForgeNativeError('forge_native_authorization_identity_invalid');
    }
    if (binding.binding_sha256 !== authorization.binding_sha256
        || binding.binding_sha256 !== hashNative({ ...authorization, binding_sha256: '' })) {
        throw new ForgeNativeError('forge_native_authorization_binding_digest_mismatch');
    }
    if (authorization.scope_sha256 !== hashNative(authorization.authority)) throw new ForgeNativeError('forge_native_scope_digest_mismatch');
}
