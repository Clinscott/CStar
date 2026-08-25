import {
    FORGE_NATIVE_AUTHORIZATION_SCHEMA,
    FORGE_NATIVE_CONNECTION_ID,
    ForgeNativeError,
    hashNative,
    type ForgeNativeAuthorization,
} from '../../../types/forge_native_swarm.js';
import type { HallForgeRequestRecord } from '../../../types/forge.js';
import {
    buildForgeOperatorIntentProjection,
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from '../../../tools/pennyone/intel/forge_authorization_policy.js';
import { forgeNativeAuthorizationSchema } from '../contracts/forge_native_swarm.js';
import {
    deriveNativeAuthorizationId,
    deriveNativeAuthorizationRef,
} from '../../../tools/pennyone/intel/forge_native_swarm_authority.js';
import {
    rejectNativeCallerAuthority,
    type ForgeNativeRequestBinding,
} from './forge_native_request_binding.js';

export type ForgeNativeAuthorizationBinding = {
    authorization: ForgeNativeAuthorization;
    request_binding: ForgeNativeRequestBinding;
    authorization_id: string;
    authorization_ref: string;
    scope_sha256: string;
    evidence_root: string;
};

export type ForgeNativeAuthorizationIntent = {
    authorization_profile: typeof ROOT_USER_FORGE_INTENT_PROFILE;
    authorization_binding_sha256: string;
    operator_intent_json: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: 1;
    authorized_at: number;
    expires_at: number;
};

type AuthorizationInput = {
    binding?: ForgeNativeRequestBinding;
    request_binding?: ForgeNativeRequestBinding;
    authorization_id?: string;
    authorization_ref?: string;
    caller?: unknown;
};

function resolveRequestBinding(input: AuthorizationInput): ForgeNativeRequestBinding {
    const binding = input.binding ?? input.request_binding;
    if (!binding) throw new ForgeNativeError('forge_native_request_binding_missing');
    return binding;
}

/** Build an authorization object from the already-derived CStar request. */
export function bindForgeNativeAuthorization(input: AuthorizationInput): ForgeNativeAuthorizationBinding {
    rejectNativeCallerAuthority(input.caller);
    const requestBinding = resolveRequestBinding(input);
    const authorizationId = deriveNativeAuthorizationId(
        requestBinding.request_id,
        requestBinding.scope_sha256,
    );
    const authorizationRef = deriveNativeAuthorizationRef(authorizationId);
    if (input.authorization_id !== undefined && input.authorization_id !== authorizationId) {
        throw new ForgeNativeError('forge_native_authorization_id_conflict');
    }
    if (input.authorization_ref !== undefined && input.authorization_ref !== authorizationRef) {
        throw new ForgeNativeError('forge_native_authorization_ref_conflict');
    }
    const authorization: ForgeNativeAuthorization = {
        schema: FORGE_NATIVE_AUTHORIZATION_SCHEMA,
        request_id: requestBinding.request_id,
        request_sha256: requestBinding.request_sha256,
        authorization_id: authorizationId,
        authorization_ref: authorizationRef,
        authority: requestBinding.effective_scope,
        scope_sha256: requestBinding.scope_sha256,
        evidence_root: requestBinding.evidence_root,
        requested_identity: requestBinding.request.requested_identity,
        actual_identity: 'unreported',
        actual_identity_attested: false,
        binding_sha256: '',
    };
    authorization.binding_sha256 = hashNative({ ...authorization, binding_sha256: '' });
    const result: ForgeNativeAuthorizationBinding = {
        authorization,
        request_binding: requestBinding,
        authorization_id: authorizationId,
        authorization_ref: authorizationRef,
        scope_sha256: requestBinding.scope_sha256,
        evidence_root: requestBinding.evidence_root,
    };
    verifyForgeNativeAuthorizationBinding(result);
    return result;
}

export function verifyForgeNativeAuthorizationBinding(
    binding: ForgeNativeAuthorizationBinding,
): void {
    const authorization = binding.authorization;
    forgeNativeAuthorizationSchema.parse(authorization);
    if (authorization.schema !== FORGE_NATIVE_AUTHORIZATION_SCHEMA
        || authorization.request_id !== binding.request_binding.request_id
        || authorization.request_sha256 !== binding.request_binding.request_sha256
        || authorization.authority.connection_id !== FORGE_NATIVE_CONNECTION_ID
        || authorization.scope_sha256 !== binding.scope_sha256
        || authorization.evidence_root !== binding.evidence_root
        || authorization.authorization_id !== binding.authorization_id
        || authorization.authorization_ref !== binding.authorization_ref) {
        throw new ForgeNativeError('forge_native_authorization_binding_mismatch');
    }
    if (authorization.actual_identity !== 'unreported' || authorization.actual_identity_attested !== false) {
        throw new ForgeNativeError('forge_native_actual_identity_policy_mismatch');
    }
    if (authorization.binding_sha256 !== hashNative({ ...authorization, binding_sha256: '' })) {
        throw new ForgeNativeError('forge_native_authorization_binding_digest_mismatch');
    }
    if (authorization.scope_sha256 !== hashNative(authorization.authority)) {
        throw new ForgeNativeError('forge_native_authorization_scope_digest_mismatch');
    }
    if (authorization.requested_identity.model !== 'gpt-5.6-luna'
        || authorization.requested_identity.reasoning !== 'max') {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
}

/** Produce the CStar-owned root-user projection used by the legacy Hall
 * authorization ledger. No caller or transport field participates. */
export function deriveNativeAuthorizationIntent(input: {
    binding: ForgeNativeAuthorizationBinding;
    request: Pick<HallForgeRequestRecord, 'request_id' | 'request_sha256' | 'bead_id' | 'repo_id' | 'requester_thread_id' | 'requester_turn_id' | 'requester_record_set_sha256'>;
    now?: number;
}): ForgeNativeAuthorizationIntent {
    const thread = input.request.requester_thread_id;
    if (!thread?.trim()) throw new ForgeNativeError('forge_native_requester_lineage_missing');
    const projection = buildForgeOperatorIntentProjection({
        action: 'implement', requester_lineage_mode: 'explicit_request_receipt_binding',
        kind: 'bead', value: input.request.bead_id, repo_id: input.request.repo_id,
    });
    const turn = `cstar-native-turn:${hashNative({
        request_id: input.request.request_id, request_sha256: input.request.request_sha256,
    }).slice(0, 32)}`;
    const message = hashNative({ schema: 'cstar.native.operator.message.v1', request_id: input.request.request_id });
    const record = hashNative({ schema: 'cstar.native.operator.record.v1', request_id: input.request.request_id });
    const recordSet = hashNative({ schema: 'cstar.native.operator.record-set.v1', request_id: input.request.request_id });
    const authorizedAt = input.now ?? Date.now();
    return {
        authorization_profile: ROOT_USER_FORGE_INTENT_PROFILE,
        authorization_binding_sha256: hashRootUserForgeIntentBinding({
            request: input.request,
            projection,
            operator_thread_id: thread,
            operator_turn_id: turn,
            operator_message_sha256: message,
            operator_record_sha256: record,
            operator_record_set_sha256: recordSet,
            operator_record_count: 1,
        }),
        operator_intent_json: forgeOperatorIntentProjectionJson(projection),
        operator_authorization_ref: input.binding.authorization.authorization_ref,
        operator_thread_id: thread,
        operator_turn_id: turn,
        operator_message_sha256: message,
        operator_record_sha256: record,
        operator_record_set_sha256: recordSet,
        operator_record_count: 1,
        authorized_at: authorizedAt,
        expires_at: authorizedAt + 24 * 60 * 60 * 1_000,
    };
}

export const bindNativeAuthorization = bindForgeNativeAuthorization;
export const verifyNativeAuthorizationBinding = verifyForgeNativeAuthorizationBinding;
