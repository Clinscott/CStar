import type Database from 'better-sqlite3';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import type { HallForgeAuthorizationRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_CONNECTION_ID,
    ForgeNativeError,
    hashNative,
    type ForgeNativeExecuteBinding,
} from '../../../types/forge_native_swarm.js';
import { bindForgeNativeAuthorization } from './forge_native_authorization_binding.js';
import { bindForgeNativeRequest, isNativeForgeRequest, rejectNativeCallerAuthority, type ForgeNativeRequestBinding } from './forge_native_request_binding.js';
import type { CanonicalForgeRequest } from './forge_request_contract.js';
import { reserveForgeNativeRun, type ReserveNativeRunResult } from '../../pennyone/intel/forge_native_swarm_controller.js';
import type { ForgeExecutionArgs } from './forge_execute_contract.js';
import { textResponse, type McpTextResponse } from '../contracts/responses.js';

export type ForgeNativeExecuteBindingResult = { binding: ForgeNativeExecuteBinding; reservation: ReserveNativeRunResult; request_binding: ForgeNativeRequestBinding };
export type ForgeNativeExecuteInput = {
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    canonical: CanonicalForgeRequest;
    code_root: string;
    control_root: string;
    caller?: unknown;
    now?: number;
};
export function reserveForgeNativeExecution(input: ForgeNativeExecuteInput): ForgeNativeExecuteBindingResult {
    rejectNativeCallerAuthority(input.caller);
    if (!isNativeForgeRequest(input.canonical) || input.request.adapter_ref !== FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_connection_not_selected');
    const requestBinding = bindForgeNativeRequest({ request: input.request, canonical: input.canonical, code_root: input.code_root, control_root: input.control_root, now: input.now });
    const authorizationBinding = bindForgeNativeAuthorization({ request: input.request, authorization: input.authorization, request_binding: requestBinding });
    const reservation = reserveForgeNativeRun(input.db, { request: requestBinding.request, authorization: authorizationBinding.authorization, now: input.now });
    const base: Omit<ForgeNativeExecuteBinding, 'binding_sha256'> = {
        schema: 'cstar.forge_native_swarm_execute_binding.v1', run_id: reservation.run.run_id,
        request_id: input.request.request_id, request_sha256: input.request.request_sha256,
        scope_sha256: requestBinding.scope_sha256, evidence_root: requestBinding.evidence_root,
        worker_package: reservation.worker_package, control_receipt: reservation.control_receipt,
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED, actual_identity_attested: false,
    };
    const bindingSha = hashNative({ ...base, binding_sha256: '' });
    return { binding: { ...base, binding_sha256: bindingSha }, reservation, request_binding: requestBinding };
}
export function nativeExecutionResponse(result: ForgeNativeExecuteBindingResult, args: Pick<ForgeExecutionArgs, 'forge_request_receipt_id'>): McpTextResponse {
    return textResponse({
        status: result.reservation.replayed ? 'native_run_replayed' : 'native_run_reserved', execution_kind: 'forge',
        forge_request_receipt_id: args.forge_request_receipt_id, native_connection_id: FORGE_NATIVE_CONNECTION_ID,
        run_id: result.reservation.run.run_id, worker_package: result.reservation.worker_package,
        control_receipt: result.reservation.control_receipt, native_execute_binding: result.binding,
        requested_identity: result.binding.requested_identity, actual_identity: result.binding.actual_identity,
        forge_execution: { mode: 'live_authorized', attempted: false, provider_attempted: false, adapter_invoked: false, live_spend: false, spend_uncertain: false, known_spend_observed: false, live_source_collection: false, codex_worker_fallback_allowed: false },
    });
}
export function reserveNativeExecutionFromRoot(input: Omit<ForgeNativeExecuteInput, 'db'> & { root: string }): ForgeNativeExecuteBindingResult {
    const db = getForgeWritableDb(input.root);
    return reserveForgeNativeExecution({ ...input, db });
}
