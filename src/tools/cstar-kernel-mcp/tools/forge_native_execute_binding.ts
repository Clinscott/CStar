import type Database from 'better-sqlite3';
import type { HallForgeAuthorizationRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorization,
    type ForgeNativeExecuteBinding,
    type ForgeNativeRequest,
} from '../../../types/forge_native_swarm.js';
import { forgeNativeAuthorizationSchema, forgeNativeRequestSchema } from '../contracts/forge_native_swarm.js';
import type { ForgeNativeAuthorityChainInput } from '../../pennyone/intel/forge_native_swarm_authority.js';
import { bindForgeNativeRequest, type ForgeNativeRequestBinding } from './forge_native_request_binding.js';
import { reserveForgeNativeRun, type ReserveNativeRunResult } from '../../pennyone/intel/forge_native_swarm_controller.js';
import type { CanonicalForgeRequest } from './forge_request_contract.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { textResponse, type McpTextResponse } from '../contracts/responses.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';

export type ForgeNativeExecuteToolContext = {
    authority_chain: ForgeNativeAuthorityChainInput;
    native_request: ForgeNativeRequest;
    native_authorization: ForgeNativeAuthorization;
};

export type ForgeNativeExecuteBindingResult = {
    binding: ForgeNativeExecuteBinding;
    reservation: ReserveNativeRunResult;
    request_binding: ForgeNativeRequestBinding;
};

export type ForgeNativeExecuteInput = {
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    canonical: CanonicalForgeRequest;
    code_root: string;
    control_root: string;
    native_context?: ForgeNativeExecuteToolContext;
    native_request?: ForgeNativeRequest;
    native_authorization?: ForgeNativeAuthorization;
    authority_chain?: ForgeNativeAuthorityChainInput;
    caller?: unknown;
    now?: number;
    copied_state?: boolean;
};

function rejectCallerAuthority(caller: unknown): void {
    if (!caller || typeof caller !== 'object' || Array.isArray(caller)) return;
    const forbidden = Object.keys(caller as Record<string, unknown>).filter((key) => /authority|native_context|native_request|native_authorization|worker_package|control_receipt/i.test(key));
    if (forbidden.length) throw new ForgeNativeError('forge_native_caller_authority_forbidden');
}

function contextFor(input: ForgeNativeExecuteInput): ForgeNativeExecuteToolContext {
    rejectCallerAuthority(input.caller);
    const context = input.native_context ?? (
        input.authority_chain && input.native_request && input.native_authorization
            ? { authority_chain: input.authority_chain, native_request: input.native_request, native_authorization: input.native_authorization }
            : undefined
    );
    if (!context) throw new ForgeNativeError('forge_native_execute_context_missing');
    if (Object.keys(context).sort().join(',') !== 'authority_chain,native_authorization,native_request') throw new ForgeNativeError('forge_native_execute_context_field_forbidden');
    return context;
}

function bindContext(input: ForgeNativeExecuteInput, context: ForgeNativeExecuteToolContext): ForgeNativeRequestBinding {
    const requestBinding = bindForgeNativeRequest({
        authority_chain: context.authority_chain,
        goal: input.canonical.objective,
        acceptance: input.canonical.required_metrics.map((metric) => stableNativeJson(metric)),
    });
    if (stableNativeJson(requestBinding.request) !== stableNativeJson(context.native_request)) throw new ForgeNativeError('forge_native_execute_request_binding_mismatch');
    const authParsed = forgeNativeAuthorizationSchema.safeParse(context.native_authorization);
    const requestParsed = forgeNativeRequestSchema.safeParse(context.native_request);
    if (!authParsed.success || !requestParsed.success
        || context.native_authorization.request_id !== input.request.request_id
        || context.native_authorization.request_sha256 !== input.request.request_sha256
        || context.native_request.authority.request_id !== input.request.request_id
        || context.native_request.authority.request_sha256 !== input.request.request_sha256
        || context.native_request.authority.source_repository !== input.code_root
        || context.native_authorization.evidence_root !== requestBinding.evidence_root
        || (input.authorization.authorization_id && context.native_authorization.authorization_id !== input.authorization.authorization_id)
        || (input.authorization.operator_authorization_ref && context.native_authorization.authorization_ref !== input.authorization.operator_authorization_ref)) {
        throw new ForgeNativeError('forge_native_execute_tool_request_mismatch');
    }
    if ((input.request.adapter_ref && input.request.adapter_ref !== FORGE_NATIVE_CONNECTION_ID)
        || (input.canonical.adapter_ref && input.canonical.adapter_ref !== FORGE_NATIVE_CONNECTION_ID)) throw new ForgeNativeError('forge_native_connection_not_selected');
    return requestBinding;
}

export function reserveForgeNativeExecution(input: ForgeNativeExecuteInput): ForgeNativeExecuteBindingResult {
    const context = contextFor(input);
    const requestBinding = bindContext(input, context);
    const reservation = reserveForgeNativeRun(input.db, {
        request: context.native_request,
        authorization: context.native_authorization,
        now: input.now,
        copied_state: input.copied_state,
    });
    const base: Omit<ForgeNativeExecuteBinding, 'binding_sha256'> = {
        schema: 'cstar.forge_native_swarm_execute_binding.v1',
        run_id: reservation.run.run_id,
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        scope_sha256: requestBinding.scope_sha256,
        evidence_root: requestBinding.evidence_root,
        worker_package: reservation.worker_package,
        control_receipt: reservation.control_receipt,
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED,
        actual_identity_attested: false,
    };
    return {
        binding: { ...base, binding_sha256: hashNative({ ...base, binding_sha256: '' }) },
        reservation,
        request_binding: requestBinding,
    };
}

export function verifyForgeNativeExecuteBinding(result: ForgeNativeExecuteBindingResult): void {
    const { binding } = result;
    if (hashNative({ ...binding, binding_sha256: '' }) !== binding.binding_sha256) throw new ForgeNativeError('forge_native_execute_binding_digest_mismatch');
    if (binding.actual_identity !== FORGE_NATIVE_ACTUAL_UNREPORTED || binding.actual_identity_attested) throw new ForgeNativeError('forge_native_actual_identity_invalid');
    if (stableNativeJson(binding.worker_package).includes('cancellation_secret_sha256') || stableNativeJson(binding.worker_package).includes('lease_id')) throw new ForgeNativeError('forge_native_worker_package_control_field_forbidden');
    if (stableNativeJson(binding.control_receipt).includes('worker_package')) throw new ForgeNativeError('forge_native_control_receipt_worker_field_forbidden');
}

export function nativeExecutionResponse(result: ForgeNativeExecuteBindingResult, args: Pick<ForgeExecutionArgs, 'forge_request_receipt_id'>): McpTextResponse {
    verifyForgeNativeExecuteBinding(result);
    return textResponse({
        status: result.reservation.replayed ? 'native_run_replayed' : 'native_run_reserved',
        execution_kind: 'forge', forge_request_receipt_id: args.forge_request_receipt_id,
        native_connection_id: FORGE_NATIVE_CONNECTION_ID, run_id: result.reservation.run.run_id,
        worker_package: result.reservation.worker_package, control_receipt: result.reservation.control_receipt,
        native_execute_binding: result.binding,
        requested_identity: result.binding.requested_identity, actual_identity: result.binding.actual_identity,
        forge_execution: { mode: 'live_authorized', attempted: false, provider_attempted: false,
            adapter_invoked: false, live_spend: false, spend_uncertain: false, known_spend_observed: false,
            live_source_collection: false, codex_worker_fallback_allowed: false },
    });
}

export function reserveNativeExecutionFromRoot(input: Omit<ForgeNativeExecuteInput, 'db'> & { root: string }): ForgeNativeExecuteBindingResult {
    return reserveForgeNativeExecution({ ...input, db: getForgeWritableDb(input.root), control_root: input.root });
}
