import fs from 'node:fs';
import path from 'node:path';
import { validateForgeAdapterResponseContract } from './forge_adapter_response_contract.js';
import { normalizeActionList, type DispatchRequestArgs } from './dispatch_request.js';
import type { ForgeExecutionArgs } from './forge_execute.js';
import { inferForgeAdapterProjectRoot } from './forge_adapter_paths.js';
import { assertSafePrivateArtifact } from './forge_adapter_artifacts.js';
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
import { registry } from '../../pennyone/pathRegistry.js';
import { readBoundedFileInside } from '../contracts/runtime.js';
import {
    isolatedPythonArguments,
    spawnContainedForgeProcess,
    validateForgeContainmentSpec,
} from './forge_adapter_containment.js';
import { projectForgeRoleEvidence, type ForgeRoleReceiptEvidence } from './forge_role_evidence.js';

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

export function resolveForgeExecutionAdapterRef(requestedRef: string | undefined, root = registry.getRoot()) {
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

export function resolveForgeExecutionAdapter(args: ForgeExecutionArgs, root = registry.getRoot()) {
    return resolveForgeExecutionAdapterRef(args.execution_adapter_ref, root);
}

function parseAdapterEnvelope(stdout: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(stdout);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
    } catch {
        return null;
    }
}

function boundedEnvelopeIdentity(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,80}$/.test(value) ? value : null;
}

function boundedEnvelopeReason(value: unknown): string | null {
    return typeof value === 'string' && value.length <= 120
        && /^forge_[a-z0-9_]+(?:_[0-9]+)?(?::[a-z0-9_]+)?$/.test(value) ? value : null;
}

function boundedEnvelopeStatus(value: unknown): 'ok' | 'degraded' | null {
    return value === 'ok' || value === 'degraded' ? value : null;
}

function boundedEnvelopeBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

type ProjectedForgeAdapterEnvelope = {
    schema: 'cstar.forge_delegate_failure.v1' | null;
    status: 'ok' | 'degraded' | null;
    provider: 'minimax-oauth' | null;
    auth_provider: 'minimax-oauth' | null;
    auth_mode: 'oauth' | null;
    requested_model: 'MiniMax-M3' | null;
    actual_model: string | null;
    model_source: 'provider_reported' | 'unreported';
    model: 'MiniMax-M3' | null;
    hermes_profile: 'cstar-hub' | null;
    degraded_reason: string | null;
    live_spend: boolean | null;
    live_spend_unknown: boolean | null;
    live_source_collection: boolean | null;
    role_evidence_valid: boolean;
    forge_topology: 'bounded-six-role-manifest-v1' | null;
    role_plan_sha256: string | null;
    role_receipts: ForgeRoleReceiptEvidence[] | null;
    provider_requests_started: number | null;
    provider_requests_completed: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
};

function projectAdapterEnvelope(envelope: Record<string, any> | null): ProjectedForgeAdapterEnvelope | null {
    if (!envelope) return null;
    const modelSource = envelope.model_source === 'provider_reported'
        ? 'provider_reported'
        : 'unreported';
    const roleEvidence = projectForgeRoleEvidence(envelope);
    return {
        schema: envelope.schema === 'cstar.forge_delegate_failure.v1' ? envelope.schema : null,
        status: boundedEnvelopeStatus(envelope.status),
        provider: envelope.provider === 'minimax-oauth' ? 'minimax-oauth' : null,
        auth_provider: envelope.auth_provider === 'minimax-oauth' ? 'minimax-oauth' : null,
        auth_mode: envelope.auth_mode === 'oauth' ? 'oauth' : null,
        requested_model: (envelope.requested_model ?? envelope.model) === 'MiniMax-M3'
            ? 'MiniMax-M3'
            : null,
        actual_model: modelSource === 'provider_reported'
            ? boundedEnvelopeIdentity(envelope.actual_model)
            : null,
        model_source: modelSource,
        model: envelope.model === 'MiniMax-M3' ? 'MiniMax-M3' : null,
        hermes_profile: envelope.hermes_profile === 'cstar-hub' ? 'cstar-hub' : null,
        degraded_reason: boundedEnvelopeReason(envelope.degraded_reason),
        live_spend: boundedEnvelopeBoolean(envelope.live_spend),
        live_spend_unknown: boundedEnvelopeBoolean(envelope.live_spend_unknown),
        live_source_collection: boundedEnvelopeBoolean(envelope.live_source_collection),
        role_evidence_valid: roleEvidence.valid,
        forge_topology: roleEvidence.forge_topology,
        role_plan_sha256: roleEvidence.role_plan_sha256,
        role_receipts: roleEvidence.role_receipts,
        provider_requests_started: roleEvidence.provider_requests_started,
        provider_requests_completed: roleEvidence.provider_requests_completed,
        input_tokens: roleEvidence.input_tokens,
        output_tokens: roleEvidence.output_tokens,
    };
}

type ForgeAdapterArtifact = {
    path: string;
    bytes: number;
    sha256: string;
};

type ReturnedForgeAdapterEnvelope = ProjectedForgeAdapterEnvelope & {
    intent_id?: undefined;
    wrote_to: string | null;
    response_artifact: ForgeAdapterArtifact | null;
    response_contract: Record<string, unknown> | null;
    execution_trace_artifact: ForgeAdapterArtifact | null;
    hermes_preflight: Record<string, unknown> | null;
};

function isSuccessAdapterStatus(status: string): boolean {
    return ['accepted', 'ok', 'pass', 'passed', 'success', 'succeeded'].includes(status.trim().toLowerCase());
}

export function forgeExecutionRequiresImplementationWrites(args: DispatchRequestArgs): boolean {
    const text = [
        args.objective,
        args.prompt ?? '',
        ...normalizeActionList(args.requested_actions),
        ...normalizeActionList(args.artifact_expectations),
    ].join('\n').toLowerCase();
    if ((args.required_output_paths ?? []).some((value) => value.trim())) return true;
    if (/\b(add|apply|author|build|change|compile|configure|correct|create|delete|develop|edit|fix|generate|implement|install|make|migrate|modify|mutate|package|patch|refactor|remove|repair|rewrite|ship|tarball|touch|update|write)\b/.test(text)) {
        return true;
    }
    // Response-only is an explicit capability, not the fallback for ambiguous
    // work. Unknown intent fails toward the write-capable lane before spend.
    return !/\b(analy[sz](?:e|is)|assess|audit|decision|diagnos(?:e|is)|evidence|inspect|packet|recommend|report|response[- ]only|review|summari[sz]e|verdict|validation)\b/.test(text);
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
    const crypto = await import('node:crypto');
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
        responsePath,
        responseDir,
        executionTracePath,
        adapterScriptPath,
        runtimeProof,
        hermesPreflight,
        environment,
        temporaryDirectory,
    } = prepared;
    const projectRoot = typeof intent.project_root === 'string' ? intent.project_root : inferForgeAdapterProjectRoot(args, root);

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
    const writablePaths = [projectRoot, responseDir, temporaryDirectory];
    if (process.env.NODE_TEST_CONTEXT && process.env.CSTAR_FORGE_TEST_MODE === '1') writablePaths.push(root);
    const containedSpawn = {
        runtimeProof: invocationRuntimeProof,
        command: invocationRuntimeProof.python_interpreter.path,
        commandArgs: isolatedPythonArguments(adapterScriptPath, ['--intent-file', intentPath]),
        cwd: root,
        environment,
        writablePaths,
        timeoutMs: (timeoutSec + 35) * 1000,
    };
    validateForgeContainmentSpec(containedSpawn);
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
        live_spend: false,
        live_source_collection: false,
    });

    prepared.spendMayHaveStarted = true;
    const result = spawnContainedForgeProcess(containedSpawn);

    try { await fsp.rm(temporaryDirectory, { recursive: true, force: true }); } catch { /* best-effort */ }

    const envelope = parseAdapterEnvelope(result.stdout || '');
    const projectedEnvelope = projectAdapterEnvelope(envelope);
    const reportedAdapterStatus = boundedEnvelopeStatus(envelope?.status);
    let adapterStatus: string = reportedAdapterStatus
        ?? (result.error ? 'spawn_error' : result.status === 0 ? 'unknown' : 'nonzero_exit');
    let responseArtifact: ForgeAdapterArtifact | null = null;
    let responseContract: Record<string, unknown> | null = null;
    let artifactError: string | null = envelope && !reportedAdapterStatus
        ? 'adapter_status_invalid'
        : null;
    const syntheticRoleEvidenceBypass = Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_TEST_MODE === '1'
        && Boolean(environment.CSTAR_FORGE_WORKER_MODEL_RESPONSE
            || environment.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT);
    if (adapterStatus === 'ok' && selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter'
        && !syntheticRoleEvidenceBypass && projectedEnvelope?.role_evidence_valid !== true) {
        adapterStatus = 'degraded'; artifactError = 'adapter_role_evidence_invalid';
    }
    const wroteTo = typeof envelope?.wrote_to === 'string' && envelope.wrote_to.trim()
        ? envelope.wrote_to.trim()
        : null;
    if (wroteTo) {
        if (path.resolve(wroteTo) !== path.resolve(responsePath)) {
            artifactError = 'adapter_response_path_mismatch';
        } else try {
            assertSafePrivateArtifact(responsePath);
            const safeResponse = readBoundedFileInside(responseDir, responsePath, 16 * 1024 * 1024);
            const data = safeResponse.content;
            const contract = validateForgeAdapterResponseContract(
                data.toString('utf-8'),
                [projectRoot, root, responseDir],
                args.callback_contract.expected_packet,
            );
            responseArtifact = {
                path: responsePath,
                bytes: data.byteLength,
                sha256: crypto.createHash('sha256').update(data).digest('hex'),
            };
            if (contract.ok) {
                const innerStatus = String(contract.summary?.status ?? '');
                if (!isSuccessAdapterStatus(innerStatus)) {
                    artifactError = 'adapter_response_reported_failure';
                } else {
                    responseContract = contract.summary;
                }
            } else {
                artifactError = contract.error;
            }
        } catch (err) {
            artifactError = err instanceof Error ? err.message : String(err);
        }
    }
    if (adapterStatus === 'ok' && !responseArtifact) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_response_artifact_missing';
    }
    if (adapterStatus === 'ok' && !responseContract) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_response_contract_invalid';
    }
    const liveSpendKnown = typeof envelope?.live_spend === 'boolean';
    const liveSourceKnown = typeof envelope?.live_source_collection === 'boolean';
    const spawnFailedBeforeStart = Boolean(result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT');
    const liveSpendUnknown = envelope?.live_spend_unknown === true
        || (!liveSpendKnown && !spawnFailedBeforeStart);
    const liveSpend = liveSpendKnown ? envelope!.live_spend as boolean : null;
    if (adapterStatus === 'ok' && liveSpendUnknown) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_live_spend_unreported';
    }
    if (adapterStatus === 'ok' && !liveSourceKnown) {
        adapterStatus = 'degraded';
        artifactError = artifactError ?? 'adapter_live_source_unreported';
    }
    prepared.writeExecutionTrace({
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
        response_artifact_exists: responseArtifact !== null,
        response_artifact: responseArtifact,
        artifact_error: artifactError,
        envelope: projectedEnvelope,
        stdout_chars: (result.stdout || '').length,
        stderr_chars: (result.stderr || '').length,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        live_source_collection: envelope?.live_source_collection === true,
    });
    let executionTraceArtifact: ForgeAdapterArtifact | null = null;
    try {
        const traceData = readBoundedFileInside(
            responseDir,
            executionTracePath,
            4 * 1024 * 1024,
        ).content;
        executionTraceArtifact = {
            path: executionTracePath,
            bytes: traceData.byteLength,
            sha256: crypto.createHash('sha256').update(traceData).digest('hex'),
        };
    } catch {
        throw new Error('forge_adapter_terminal_trace_unavailable');
    }
    const returnedEnvelope: ReturnedForgeAdapterEnvelope | null = projectedEnvelope
        ? {
            ...projectedEnvelope,
            // This path is reconstructed from CStar's verified artifact,
            // never copied from the worker-controlled envelope.
            wrote_to: responseArtifact ? responsePath : null,
            response_artifact: responseArtifact,
            response_contract: responseContract,
            execution_trace_artifact: executionTraceArtifact,
            hermes_preflight: hermesPreflight as unknown as Record<string, unknown> | null,
        }
        : null;
    return {
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        invoked: true,
        exit_status: result.status,
        signal: result.signal,
        status: adapterStatus,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        live_source_collection: envelope?.live_source_collection === true,
        execution_trace_artifact: executionTraceArtifact,
        hermes_preflight: hermesPreflight,
        hermes_runtime_content_sha256: hermesPreflight?.runtime_content_sha256 ?? null,
        envelope: returnedEnvelope,
        error: result.error ? 'forge_adapter_spawn_failed' : artifactError,
        stderr_tail: null,
        stdout_tail: null,
    };
}
