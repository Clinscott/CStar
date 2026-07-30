import type { HallForgeRequestRecord } from '../../../types/forge.js';
import { getForgeWritableDb } from '../../pennyone/intel/forge_hall_store.js';
import { bindLegacyV2RequesterLineage } from '../../pennyone/intel/forge_legacy_v2_reconciliation_controller.js';
import type { ForgeAdapterRuntimeProof } from './forge_adapters.js';
import {
    buildForgeAuthorizationChallenge,
    hashForgeAuthorizationChallenge,
} from './forge_authorization_challenge.js';
import {
    buildLegacyV2ExecutionGrant,
    hashLegacyV2ExecutionGrant,
    type LegacyV2ExecutionGrant,
} from './forge_legacy_v2_compatibility.js';
import type { ForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';
import { stableJson, type CanonicalForgeRequest } from './forge_request_contract.js';

export interface LegacyV2ReconciliationIdentity {
    thread_id: string;
    turn_id: string;
    turn_record_set_sha256: string;
}

export interface LegacyV2ReconciliationResult {
    request: HallForgeRequestRecord;
    compatibility: LegacyV2ExecutionGrant;
    compatibility_sha256: string;
    authorization_challenge: string;
    authorization_challenge_sha256: string;
    requester_lineage_replayed: boolean;
}

export function reconcileLegacyV2ForgeRequest(input: {
    request: HallForgeRequestRecord;
    attempt_count: number;
    root: string;
    canonical: CanonicalForgeRequest;
    adapter_runtime: ForgeAdapterRuntimeProof;
    hermes_runtime: ForgeHermesRuntimeExpectation;
    requester_identity: LegacyV2ReconciliationIdentity;
}): LegacyV2ReconciliationResult {
    if (input.attempt_count !== 0 || input.request.status !== 'PENDING_AUTH') {
        throw new Error('forge_legacy_v2_reconciliation_requires_unspent_pending_request');
    }
    const preliminary = buildLegacyV2ExecutionGrant(
        input.request,
        input.root,
        input.adapter_runtime,
        input.hermes_runtime,
    );
    if (stableJson(preliminary.effective_request) !== stableJson(input.canonical)) {
        throw new Error('forge_legacy_v2_semantic_reconciliation_mismatch');
    }
    const bound = bindLegacyV2RequesterLineage(getForgeWritableDb(input.root), {
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        requester_thread_id: input.requester_identity.thread_id,
        requester_turn_id: input.requester_identity.turn_id,
        requester_record_set_sha256: input.requester_identity.turn_record_set_sha256,
    });
    const compatibility = buildLegacyV2ExecutionGrant(
        bound.request,
        input.root,
        input.adapter_runtime,
        input.hermes_runtime,
    );
    if (stableJson(compatibility.effective_request) !== stableJson(input.canonical)
        || compatibility.legacy_requester_lineage.status !== 'recorded_v2_extension') {
        throw new Error('forge_legacy_v2_reconciliation_lineage_invalid');
    }
    const compatibilitySha256 = hashLegacyV2ExecutionGrant(compatibility);
    return {
        request: bound.request,
        compatibility,
        compatibility_sha256: compatibilitySha256,
        authorization_challenge: buildForgeAuthorizationChallenge(
            bound.request.request_id,
            bound.request.request_sha256,
            compatibilitySha256,
        ),
        authorization_challenge_sha256: hashForgeAuthorizationChallenge(
            bound.request.request_id,
            bound.request.request_sha256,
            compatibilitySha256,
        ),
        requester_lineage_replayed: bound.replayed,
    };
}
