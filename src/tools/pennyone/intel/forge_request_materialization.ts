import type Database from 'better-sqlite3';

import {
    materializeAndAuthorizeForgeMissionGrant,
} from './forge_mission_grant_controller.js';
import { saveForgeRequestInTransaction } from './forge_request_persistence.js';
import { ROOT_USER_FORGE_INTENT_PROFILE } from './forge_authorization_policy.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import type {
    HallForgeRequestRecord,
    MaterializeForgeMissionGrantInput,
} from '../../../types/forge.js';
import {
    verifyDispatchPackageLocks,
} from '../../cstar-kernel-mcp/tools/dispatch_request.js';
import {
    resolveForgeExecutionAdapterRef,
    sealForgeAdapterRuntime,
} from '../../cstar-kernel-mcp/tools/forge_adapters.js';
import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { sealForgeHermesRuntimeExpectation } from
    '../../cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';
import type { ForgeRequestArgs } from '../../cstar-kernel-mcp/tools/forge_request.js';
import { assertAuguryV2ForgeRequestFrontier } from
    './forge_augury_v2_frontier_guard.js';

type AdapterResolution = ReturnType<typeof resolveForgeExecutionAdapterRef>;

export interface ForgeRequesterLineage {
    thread_id: string;
    turn_id: string;
    turn_record_set_sha256: string;
}

export interface PreparedForgeRequestMaterialization {
    args: ForgeRequestArgs;
    canonical: CanonicalForgeRequest;
    request_id: string;
    request_sha256: string;
    decision_id: string;
    adapter: AdapterResolution;
    package_lock_proofs: Array<{ path: string; sha256: string; bytes: number }>;
}

export async function prepareForgeRequestMaterialization(input: {
    args: ForgeRequestArgs;
    code_root: string;
    decision_id: string;
    adapter?: AdapterResolution;
}): Promise<PreparedForgeRequestMaterialization> {
    const adapter = input.adapter
        ?? resolveForgeExecutionAdapterRef(input.args.execution_adapter_ref, input.code_root);
    const selected = adapter.selected;
    const liveRequested = input.args.spend_policy.mode === 'live_authorized';
    if (liveRequested && !selected) throw new Error('missing_authorized_execution_adapter');
    const packageLockProofs = liveRequested
        ? verifyDispatchPackageLocks(input.args.package_locks, input.code_root)
        : [];
    const adapterRuntime = selected ? sealForgeAdapterRuntime(selected) : null;
    const hermesRuntime = selected?.ref === 'cstar-forge-hermes-minimax-worker-adapter'
        && adapterRuntime
        ? await sealForgeHermesRuntimeExpectation(adapterRuntime)
        : null;
    const writeCapability = selected?.write_capability === 'project_files'
        ? 'project_files' as const
        : selected?.write_capability === 'response_only' ? 'response_only' as const : null;
    const canonical = canonicalizeForgeRequest(
        input.args,
        input.code_root,
        input.decision_id,
        selected?.ref ?? adapter.canonical_ref,
        writeCapability,
        1,
        adapterRuntime,
        hermesRuntime,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    return Object.freeze({
        args: input.args,
        canonical,
        request_id: buildForgeRequestId(requestSha256),
        request_sha256: requestSha256,
        decision_id: input.decision_id,
        adapter,
        package_lock_proofs: packageLockProofs,
    });
}

export function assertPreparedForgeRequestCurrent(
    prepared: PreparedForgeRequestMaterialization,
    args: ForgeRequestArgs,
    codeRoot: string,
): void {
    const selected = prepared.adapter.selected;
    const current = canonicalizeForgeRequest(
        args,
        codeRoot,
        prepared.decision_id,
        selected?.ref ?? prepared.adapter.canonical_ref,
        selected?.write_capability === 'project_files'
            ? 'project_files'
            : selected?.write_capability === 'response_only' ? 'response_only' : null,
        1,
        prepared.canonical.adapter_runtime,
        prepared.canonical.hermes_runtime,
    );
    if (hashCanonicalForgeRequest(current) !== prepared.request_sha256
        || stableJson(current) !== stableJson(prepared.canonical)) {
        throw new Error('forge_request_materialization_projection_drift');
    }
}

export function persistPreparedForgeRequest(input: {
    db: Database.Database;
    control_root: string;
    code_root: string;
    prepared: PreparedForgeRequestMaterialization;
    requester: ForgeRequesterLineage;
    now?: number;
    test_hooks?: {
        after_frontier_guard?: () => void;
    };
}) {
    const prepared = input.prepared;
    const persist = input.db.transaction(() => {
        assertPreparedForgeMissionGrantFrontier({
            db: input.db,
            control_root: input.control_root,
            code_root: input.code_root,
            prepared,
        });
        input.test_hooks?.after_frontier_guard?.();
        return saveForgeRequestInTransaction(input.db, {
            request_id: prepared.request_id,
            repo_id: buildHallRepositoryId(normalizeHallPath(input.control_root)),
            bead_id: prepared.canonical.bead_id,
            decision_id: prepared.decision_id,
            request_sha256: prepared.request_sha256,
            request_summary_json: stableJson(prepared.canonical),
            target_paths_sha256: hashForgeTargetPaths(prepared.canonical),
            live_source_allowed: false,
            max_attempts: 1,
            requester_thread_id: input.requester.thread_id,
            requester_turn_id: input.requester.turn_id,
            requester_record_set_sha256: input.requester.turn_record_set_sha256,
            authorization_profile: prepared.canonical.spend_policy.mode === 'live_authorized'
                ? ROOT_USER_FORGE_INTENT_PROFILE : undefined,
            adapter_ref: prepared.canonical.adapter_ref ?? undefined,
            write_capability: prepared.canonical.write_capability ?? undefined,
            runtime_evidence_refresh_validated: prepared.adapter.selected ? true : undefined,
            now: input.now,
        });
    });
    return persist.immediate();
}

export function assertPreparedForgeMissionGrantFrontier(input: {
    db: Database.Database;
    control_root: string;
    code_root: string;
    prepared: PreparedForgeRequestMaterialization;
}): void {
    if (input.prepared.canonical.spend_policy.mode !== 'live_authorized') return;
    assertAuguryV2ForgeRequestFrontier({
        db: input.db,
        control_root: input.control_root,
        code_root: input.code_root,
        bead_id: input.prepared.canonical.bead_id,
        decision_id: input.prepared.decision_id,
    });
}

export function authorizePreparedForgeMissionGrant(input: {
    db: Database.Database;
    control_root: string;
    code_root: string;
    prepared: PreparedForgeRequestMaterialization;
    request: HallForgeRequestRecord;
    grant: MaterializeForgeMissionGrantInput;
    now?: number;
}) {
    const authorize = input.db.transaction(() => {
        assertPreparedForgeMissionGrantFrontier(input);
        return materializeAndAuthorizeForgeMissionGrant({
            db: input.db,
            request: input.request,
            grant: input.grant,
            now: input.now,
        });
    });
    return authorize.immediate();
}
