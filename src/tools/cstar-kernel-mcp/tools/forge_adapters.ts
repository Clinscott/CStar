import fs from 'node:fs';
import path from 'node:path';
import { validateForgeAdapterResponseContract } from './forge_adapter_response_contract.js';
import type { DispatchRequestArgs } from './dispatch_request.js';
import {
    dispatchActionRequiresProjectFiles,
    resolveDispatchActionAuthority,
} from './dispatch_action_authority.js';
import type { ForgeExecutionArgs } from './forge_execute.js';
import {
    assertSafePrivateArtifact,
    quarantinePrivateEntryNoFollow,
    removePrivateFile,
} from './forge_adapter_artifacts.js';
import { ForgeParentPublication } from './forge_adapter_publication.js';
import {
    buildCanonicalForgeDeliveryReceipt,
    buildSanitizedForgeResponseRejection,
    buildUnverifiedForgeResponseEvidence,
    privateForgeResponseProof,
    type PrivateForgeResponseProof,
} from './forge_adapter_delivery_receipt.js';
import {
    cleanupPreparedForgeAdapterInvocation,
    prepareForgeHermesMinimaxAdapterInvocation,
    type PreparedForgeAdapterInvocation,
} from './forge_adapter_invocation.js';
import {
    readVerifiedRuntimeFile,
    runtimeProofEquals,
    sealForgeAdapterRuntime,
    type ForgeAdapterRuntimeProof,
} from './forge_adapter_runtime.js';
import { CODE_ROOT, readBoundedFileInside } from '../contracts/runtime.js';
import {
    forgeRuntimeReadOnlyPaths,
    isolatedPythonArguments,
    spawnContainedForgeProcess,
    validateForgeContainmentSpec,
} from './forge_adapter_containment.js';
import {
    assertForgeWorkspaceProjectionCurrent,
} from './forge_workspace_projection.js';
import {
    commitForgeWorkspaceProjection,
    type ForgeWorkspaceCommitReceipt,
} from './forge_workspace_commit.js';
import {
    projectForgeFailureEvidence,
} from './forge_failure_evidence.js';
import {
    boundedAdapterStatus,
    parseAdapterEnvelope,
    projectAdapterEnvelope,
    type ReturnedForgeAdapterEnvelope,
} from './forge_adapter_envelope.js';
import { buildForgeExecutionOwnerProof } from './forge_execution_owner.js';
export {
    cleanupPreparedForgeAdapterInvocation,
    prepareForgeHermesMinimaxAdapterInvocation,
    sealForgeAdapterRuntime,
};
export type {
    ForgeAdapterRuntimeProof,
    ForgeRuntimeFileProof,
} from './forge_adapter_runtime.js';
export type { PreparedForgeAdapterInvocation } from './forge_adapter_invocation.js';
export const FORGE_EXECUTION_ADAPTERS = [
    {
        ref: 'cstar-forge-hermes-minimax-adapter',
        plain_english_label: 'cstar-forge-report-only',
        aliases: ['cstar-forge-report-only', 'response-only-report', 'report-only'],
        name: 'CStar Forge Hermes MiniMax adapter',
        contract_surface: 'docs/operations/corvus-forge-skill-spec.md',
        playbook_surface: 'docs/operations/corvus-forge-pipeline-playbook.md',
        invocation: 'operator_authorized_live_gate',
        default_script: null,
        explicit_registration_env: 'CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT',
        write_capability: 'response_only',
        codex_worker_fallback_allowed: false,
    },
    {
        ref: 'cstar-forge-hermes-minimax-worker-adapter',
        plain_english_label: 'cstar-forge-edit-files',
        aliases: ['cstar-forge-edit-files', 'file-editing-worker', 'edit-files'],
        name: 'CStar Forge Hermes MiniMax worker adapter',
        contract_surface: 'docs/operations/corvus-forge-skill-spec.md',
        playbook_surface: 'docs/operations/corvus-forge-pipeline-playbook.md',
        invocation: 'operator_authorized_live_gate',
        default_script: '.agents/skills/corvus-forge/scripts/forge_worker_adapter.py',
        explicit_registration_env: null,
        write_capability: 'project_files',
        codex_worker_fallback_allowed: false,
    },
];
export function resolveForgeExecutionAdapterRef(requestedRef: string | undefined, root = CODE_ROOT) {
    const requested = requestedRef?.trim() || null;
    const requestedCanonical = requested
        ? FORGE_EXECUTION_ADAPTERS.find((adapter) =>
            adapter.ref === requested || adapter.aliases.includes(requested),
        )?.ref ?? requested
        : null;
    const proofs = FORGE_EXECUTION_ADAPTERS.map((adapter) => {
        const workerOverride = adapter.ref === 'cstar-forge-hermes-minimax-worker-adapter'
            ? process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT?.trim() || null
            : null;
        const explicitScript = workerOverride || (adapter.explicit_registration_env
            ? process.env[adapter.explicit_registration_env]?.trim() || null
            : null);
        const defaultScript = adapter.default_script
            ? path.resolve(root, adapter.default_script)
            : null;
        const registeredScript = explicitScript || defaultScript;
        let registrationError: string | null = null;
        if (adapter.explicit_registration_env && !registeredScript) {
            registrationError = `explicit Forge-native adapter registration is required via ${adapter.explicit_registration_env}`;
        } else if (!registeredScript) {
            registrationError = `Forge-native adapter ${adapter.ref} has no registered runtime`;
        } else {
            if (explicitScript && !path.isAbsolute(explicitScript)) {
                registrationError = `${adapter.explicit_registration_env ?? 'CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT'} must be an absolute path`;
            } else {
                try {
                    const stat = fs.lstatSync(registeredScript);
                    if (stat.isSymbolicLink() || !stat.isFile()) {
                        registrationError = 'Forge adapter runtime must be a regular non-symlink file';
                    }
                } catch {
                    registrationError = `Forge adapter runtime does not identify a readable file: ${registeredScript}`;
                }
            }
        }
        const registered = registrationError === null;
        const requested = requestedCanonical === adapter.ref;
        return {
            ...adapter,
            registered_script: registeredScript,
            registration_error: registrationError,
            requested,
            authorized: requested && registered,
        };
    });
    const selected = requestedCanonical
        ? proofs.find((adapter) => adapter.ref === requestedCanonical && adapter.authorized) ?? null
        : null;
    return {
        requested_ref: requested,
        canonical_ref: requestedCanonical,
        found: selected !== null,
        selected,
        checked: requested
            ? proofs.length > 0
                ? proofs
                : [{ ref: requested, authorized: false, reason: 'no approved Forge/Hermes/MiniMax execution adapter is registered' }]
            : proofs.map((adapter) => ({ ...adapter, authorized: false, reason: 'execution_adapter_ref is required for live execution' })),
    };
}
export function resolveForgeExecutionAdapter(args: ForgeExecutionArgs, root = CODE_ROOT) {
    return resolveForgeExecutionAdapterRef(args.execution_adapter_ref, root);
}
export function forgeExecutionRequiresImplementationWrites(args: DispatchRequestArgs): boolean {
    return dispatchActionRequiresProjectFiles(resolveDispatchActionAuthority(args));
}

export async function invokeForgeHermesMinimaxAdapter(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    selectedAdapter: Record<string, any>,
    expectedRuntimeProof?: ForgeAdapterRuntimeProof,
    preparedInvocation?: PreparedForgeAdapterInvocation,
) {
    const fsp = await import('node:fs/promises');
    const prepared = preparedInvocation ?? await prepareForgeHermesMinimaxAdapterInvocation(
        args,
        decisionId,
        executionReceiptId,
        root,
        selectedAdapter,
        expectedRuntimeProof,
    );
    const {
        intent,
        intentPath,
        workerResponsePath,
        responsePath,
        responseDir,
        executionTracePath,
        adapterScriptPath,
        runtimeDirectory,
        privateIoDirectory,
        runtimeProof,
        hermesPreflight,
        environment,
        temporaryDirectory,
        workspaceProjection,
    } = prepared;
    const invocationRuntimeProof = sealForgeAdapterRuntime(selectedAdapter);
    if (!runtimeProofEquals(invocationRuntimeProof, runtimeProof)
        || (expectedRuntimeProof && !runtimeProofEquals(invocationRuntimeProof, expectedRuntimeProof))) {
        throw new Error('forge_adapter_runtime_drift_before_invocation');
    }
    readVerifiedRuntimeFile(invocationRuntimeProof.python_interpreter);
    if (invocationRuntimeProof.node_interpreter) readVerifiedRuntimeFile(invocationRuntimeProof.node_interpreter);
    readVerifiedRuntimeFile(invocationRuntimeProof.process_containment);
    const scriptPath = invocationRuntimeProof.path;
    const timeoutSec = Number((intent.payload as Record<string, any>).timeout_seconds ?? 600);
    const writablePaths = [privateIoDirectory, workspaceProjection.workspace_root];
    const containedSpawn = {
        runtimeProof: invocationRuntimeProof,
        command: invocationRuntimeProof.python_interpreter.path,
        commandArgs: isolatedPythonArguments(adapterScriptPath, ['--intent-file', intentPath]),
        cwd: workspaceProjection.workspace_root,
        environment,
        readOnlyPaths: [
            ...forgeRuntimeReadOnlyPaths(invocationRuntimeProof, environment),
            runtimeDirectory,
            workspaceProjection.control_root,
            intentPath,
        ],
        writablePaths,
        timeoutMs: (timeoutSec + 35) * 1000,
    };
    validateForgeContainmentSpec(containedSpawn);
    assertForgeWorkspaceProjectionCurrent(workspaceProjection);
    prepared.writeExecutionTrace({
        schema: 'cstar.forge_adapter_execution_trace.v2',
        status: 'started',
        decision_id: decisionId,
        execution_receipt_id: executionReceiptId,
        forge_request_receipt_id: args.forge_request_receipt_id,
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        adapter_runtime_proof: invocationRuntimeProof,
        hermes_preflight: hermesPreflight,
        response_path: responsePath,
        response_artifact_exists: false,
        execution_owner: buildForgeExecutionOwnerProof(),
        live_spend: false,
        live_source_collection: false,
    });

    assertForgeWorkspaceProjectionCurrent(workspaceProjection);
    prepared.spendMayHaveStarted = true;
    const result = spawnContainedForgeProcess(containedSpawn);

    const envelope = parseAdapterEnvelope(result.stdout || '');
    const syntheticRoleEvidenceBypass = Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_TEST_MODE === '1'
        && Boolean(environment.CSTAR_FORGE_WORKER_MODEL_RESPONSE
            || environment.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT);
    const spawnErrorCode = result.error
        ? (result.error as NodeJS.ErrnoException).code ?? null : null;
    const projectedFailureEvidence = projectForgeFailureEvidence(envelope, spawnErrorCode);
    const syntheticNoSpend = Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_TEST_MODE === '1'
        && envelope?.status === 'ok' && envelope.live_spend === false
        && envelope.live_spend_unknown !== true;
    const failureEvidence = syntheticNoSpend
        ? { ...projectedFailureEvidence, live_spend: false,
            live_spend_unknown: false, known_spend_observed: false }
        : projectedFailureEvidence;
    const projectedEnvelope = projectAdapterEnvelope(envelope, failureEvidence);
    const reportedAdapterStatus = boundedAdapterStatus(envelope?.status);
    let adapterStatus: string = reportedAdapterStatus
        ?? (result.error ? 'spawn_error' : result.status === 0 ? 'unknown' : 'nonzero_exit');
    let responseContract: Record<string, unknown> | null = null;
    let privateResponse: PrivateForgeResponseProof | null = null;
    let sanitizedRejection: Buffer | null = null;
    let privateResponseQuarantined = false;
    let privateResponseCleanupFailed = false;
    let artifactError: string | null = envelope && !reportedAdapterStatus
        ? 'adapter_status_invalid'
        : null;
    if (adapterStatus === 'ok' && selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter'
        && !syntheticRoleEvidenceBypass && projectedEnvelope?.success_evidence_valid !== true) {
        adapterStatus = 'degraded'; artifactError = 'adapter_failure_evidence_invalid';
    }
    const wroteTo = typeof envelope?.wrote_to === 'string' && envelope.wrote_to
        ? envelope.wrote_to
        : null;
    if (wroteTo) {
        if (wroteTo !== workerResponsePath) {
            artifactError = 'adapter_response_path_mismatch';
        } else try {
            assertSafePrivateArtifact(workerResponsePath);
            const safeResponse = readBoundedFileInside(
                privateIoDirectory,
                workerResponsePath,
                16 * 1024 * 1024,
            );
            const data = safeResponse.content;
            privateResponse = privateForgeResponseProof(data);
            const contract = validateForgeAdapterResponseContract(
                data.toString('utf-8'),
                [workspaceProjection.workspace_root],
                args.callback_contract.expected_packet,
            );
            if (contract.ok) {
                responseContract = contract.summary;
            } else {
                artifactError = contract.error;
                sanitizedRejection = buildSanitizedForgeResponseRejection(
                    contract.error,
                    args.callback_contract.expected_packet,
                    privateResponse,
                );
            }
        } catch {
            artifactError = 'adapter_response_artifact_invalid';
        }
    }
    if (adapterStatus === 'ok' && !privateResponse) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_response_artifact_missing';
    }
    if (adapterStatus === 'ok' && !responseContract) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_response_contract_invalid';
    }
    const liveSourceKnown = typeof envelope?.live_source_collection === 'boolean';
    const liveSpendUnknown = failureEvidence.live_spend_unknown;
    const liveSpend = failureEvidence.live_spend;
    if (adapterStatus === 'ok' && liveSpendUnknown) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_live_spend_unreported';
    }
    if (adapterStatus === 'ok' && !liveSourceKnown) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_live_source_unreported';
    }
    if (privateResponse) {
        try {
            removePrivateFile(privateIoDirectory, workerResponsePath);
            if (fs.lstatSync(workerResponsePath, { throwIfNoEntry: false })) {
                throw new Error('adapter_private_response_cleanup_failed');
            }
        } catch {
            adapterStatus = 'degraded';
            artifactError = 'adapter_private_response_cleanup_failed';
            privateResponse = null;
            responseContract = null;
            sanitizedRejection = null;
        }
    }
    if (!privateResponse && fs.lstatSync(workerResponsePath, { throwIfNoEntry: false })) {
        try {
            privateResponseQuarantined = quarantinePrivateEntryNoFollow(
                privateIoDirectory,
                workerResponsePath,
            ) !== null;
        } catch {
            adapterStatus = 'degraded';
            artifactError = 'adapter_private_response_quarantine_failed';
            privateResponseCleanupFailed = true;
        }
    }
    const publication = new ForgeParentPublication(
        responseDir,
        responsePath,
        executionTracePath,
        prepared.writeExecutionTrace.bind(prepared),
    );
    const degradedEvidence = adapterStatus === 'ok'
        ? null
        : sanitizedRejection ?? (privateResponse && responseContract
            ? buildUnverifiedForgeResponseEvidence(
                artifactError,
                args.callback_contract.expected_packet,
                privateResponse,
                responseContract,
            ) : null);
    let workspaceCommit: ForgeWorkspaceCommitReceipt | null = null;
    const terminalTrace = (commit: ForgeWorkspaceCommitReceipt | null) => ({
        schema: 'cstar.forge_adapter_execution_trace.v2',
        status: adapterStatus,
        decision_id: decisionId,
        execution_receipt_id: executionReceiptId,
        forge_request_receipt_id: args.forge_request_receipt_id,
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        adapter_runtime_proof: invocationRuntimeProof,
        hermes_preflight: hermesPreflight,
        exit_status: result.status,
        signal: result.signal,
        spawn_error: result.error ? 'forge_adapter_spawn_failed' : null,
        response_path: responsePath,
        response_artifact_exists: publication.responseArtifact !== null,
        response_artifact: publication.responseArtifact,
        artifact_error: artifactError,
        private_response_quarantined: privateResponseQuarantined,
        envelope: projectedEnvelope,
        stdout_chars: (result.stdout || '').length,
        stderr_chars: (result.stderr || '').length,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        known_spend_observed: failureEvidence.known_spend_observed,
        live_source_collection: envelope?.live_source_collection === true,
        workspace_commit: commit,
    });
    if (adapterStatus === 'ok' && envelope?.live_source_collection !== true && !liveSpendUnknown) {
        try {
            workspaceCommit = commitForgeWorkspaceProjection(
                workspaceProjection,
                (receipt) => {
                    if (!privateResponse || !responseContract) {
                        throw new Error('forge_workspace_delivery_receipt_inputs_missing');
                    }
                    const delivery = buildCanonicalForgeDeliveryReceipt(
                        args.callback_contract.expected_packet,
                        privateResponse,
                        responseContract,
                        receipt,
                    );
                    publication.publishResponse(delivery);
                    try {
                        publication.publishTerminalTrace(terminalTrace(receipt));
                    } catch (error) {
                        publication.removeResponse();
                        throw error;
                    }
                },
            );
        } catch (error) {
            let rollbackError: unknown = null;
            try { publication.removeResponse(); } catch (failure) { rollbackError = failure; }
            adapterStatus = 'degraded';
            const reason = error instanceof Error ? error.message : '';
            if (rollbackError) {
                artifactError = 'forge_workspace_response_rollback_failed';
            } else {
                artifactError = /^forge_(?:workspace|artifact|adapter)_[a-z0-9_]+$/.test(reason)
                    ? reason : 'forge_workspace_commit_failed';
            }
            publication.publishTerminalTrace(terminalTrace(null));
            if (rollbackError) throw rollbackError;
        }
    } else {
        try {
            publication.publishDegraded(degradedEvidence, () => terminalTrace(null));
        } catch (error) {
            const reason = error instanceof Error ? error.message : '';
            if (reason === 'forge_workspace_response_rollback_failed'
            ) throw error;
            if (reason === 'forge_artifact_publication_rollback_failed') {
                publication.removeResponse();
            }
            if (!publication.executionTraceArtifact) {
                artifactError = 'adapter_response_evidence_publication_failed';
                publication.publishDegraded(null, () => terminalTrace(null));
            } else throw error;
        }
    }
    const executionTraceArtifact = publication.executionTraceArtifact;
    if (!executionTraceArtifact) throw new Error('forge_adapter_terminal_trace_unavailable');
    if (privateResponseCleanupFailed) {
        throw new Error('adapter_private_response_quarantine_failed');
    }
    const returnedEnvelope: ReturnedForgeAdapterEnvelope | null = projectedEnvelope
        ? {
            ...projectedEnvelope,
            // This path is reconstructed from CStar's verified artifact,
            // never copied from the worker-controlled envelope.
            wrote_to: publication.responseArtifact ? responsePath : null,
            response_artifact: publication.responseArtifact,
            response_contract: responseContract,
            execution_trace_artifact: executionTraceArtifact,
            hermes_preflight: hermesPreflight as unknown as Record<string, unknown> | null,
        }
        : null;
    const returned = {
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        invoked: true,
        exit_status: result.status,
        signal: result.signal,
        status: adapterStatus,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        known_spend_observed: failureEvidence.known_spend_observed,
        live_source_collection: envelope?.live_source_collection === true,
        execution_trace_artifact: executionTraceArtifact,
        hermes_preflight: hermesPreflight,
        hermes_runtime_content_sha256: hermesPreflight?.runtime_content_sha256 ?? null,
        envelope: returnedEnvelope,
        error: result.error ? 'forge_adapter_spawn_failed' : artifactError,
        stderr_tail: null,
        stdout_tail: null,
        workspace_commit: workspaceCommit,
    };
    try { await fsp.rm(temporaryDirectory, { recursive: true, force: true }); } catch { /* best-effort */ }
    return returned;
}
