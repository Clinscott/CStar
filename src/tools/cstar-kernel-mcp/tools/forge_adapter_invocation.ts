import fs from 'node:fs';
import path from 'node:path';
import { normalizeActionList } from './dispatch_request.js';
import {
    assertDispatchAdapterCapability,
    resolveDispatchActionAuthority,
} from './dispatch_action_authority.js';
import type { ForgeExecutionArgs } from './forge_execute.js';
import { inferForgeAdapterProjectRoot } from './forge_adapter_paths.js';
import {
    assertSafeOwnedDirectory,
    atomicWritePrivateFile,
    ensureSafeDirectoryTree,
    forgeExecutionPathSegment,
} from './forge_adapter_artifacts.js';
import {
    readVerifiedRuntimeFile,
    runtimeProofEquals,
    sealForgeAdapterRuntime,
    type ForgeAdapterRuntimeProof,
    type ForgeRuntimeFileProof,
} from './forge_adapter_runtime.js';
import {
    proveForgeContainment,
} from './forge_adapter_containment.js';
import {
    prepareForgeWorkspaceProjection,
    projectForgeAdapterIntent,
    FORGE_MODEL_MATERIAL_POLICY,
    type ForgeWorkspaceProjection,
} from './forge_workspace_projection.js';
import {
    assertForgeHermesPreflightMatchesExpectation,
    type ForgeHermesRuntimeExpectation,
} from './forge_hermes_runtime_contract.js';
import {
    assertForgeHermesPreflightEquivalent,
    minimalForgeAdapterEnvironment,
    runForgeHermesCompatibilityPreflight,
    type ForgeHermesPreflightProof,
    type ForgeOAuthHorizon,
} from './forge_hermes_oauth_contract.js';

export interface PreparedForgeAdapterInvocation {
    intent: Record<string, unknown>;
    intentPath: string;
    workerResponsePath: string;
    responsePath: string;
    responseDir: string;
    executionTracePath: string;
    adapterScriptPath: string;
    runtimeDirectory: string;
    privateIoDirectory: string;
    runtimeProof: ForgeAdapterRuntimeProof;
    hermesPreflight: ForgeHermesPreflightProof | null;
    environment: NodeJS.ProcessEnv;
    temporaryDirectory: string;
    workspaceProjection: ForgeWorkspaceProjection;
    spendMayHaveStarted: boolean;
    writeExecutionTrace(trace: Record<string, unknown>): void;
}

export async function cleanupPreparedForgeAdapterInvocation(
    prepared: PreparedForgeAdapterInvocation | null | undefined,
): Promise<void> {
    if (!prepared) return;
    const fsp = await import('node:fs/promises');
    try {
        await fsp.rm(prepared.temporaryDirectory, { recursive: true, force: true });
    } catch {
        // The owner-only directory contains only sealed invocation material.
        // Cleanup is best-effort and never changes spend classification.
    }
}

function buildForgeAdapterIntent(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    adapterResponsePath: string,
    selectedAdapter: Record<string, any>,
    adapterRuntimeProof: ForgeAdapterRuntimeProof,
    hermesPreflight: ForgeHermesPreflightProof | null,
): Record<string, unknown> {
    const expectedPacket = args.callback_contract.expected_packet;
    const workerAdapter = selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter';
    const resolvedAuthority = resolveDispatchActionAuthority(args, root);
    assertDispatchAdapterCapability(
        resolvedAuthority,
        selectedAdapter.write_capability,
        { require_adapter: true },
    );
    const actionAuthority = {
        ...resolvedAuthority,
        requested_alias_count: 0,
        prohibited_alias_count: 0,
    };
    const outputContractLines = workerAdapter
        ? [
            'Worker input manifest rules:',
            'Return the worker input manifest, not the final Forge execution packet.',
            'Return JSON only with: status, summary, files, artifacts, validation, metrics, boundaries, callback_packet.',
            'files must be an array of file objects. Each file object must have path and content strings.',
            'content must be the complete file contents to write. Use repository-relative paths under the sealed target roots.',
            'Do not return files_changed. The worker creates files_changed after it writes and hashes the files.',
            'The sealed worker adapter supplies the exact required-output JSON array below.',
        ]
        : [
            'Response-only execution packet rules:',
            'Return one JSON object only. The top-level object MUST be the Forge execution packet, not the callback packet.',
            'Do not return packet_name, root_cause_summary, primary_recommendation, or other callback-style keys at top level.',
            'The only required top-level keys are: status, summary, files_changed, artifacts, validation, metrics, boundaries, callback_packet.',
            'Use callback_packet as either the requested packet name string or a bounded callback object with callback_id.',
            'Use files_changed only for response-only evidence. This adapter cannot write implementation files.',
            'Exact response-only JSON template:',
            '{',
            '  "status": "pass",',
            '  "summary": "One concise paragraph with the decision and root cause.",',
            '  "files_changed": [],',
            '  "artifacts": { "report": "Concise report content or artifact description." },',
            '  "validation": { "local_artifact_review": "pass" },',
            '  "metrics": { "contract_compliance": "pass" },',
            '  "boundaries": { "codex_worker_fallback_allowed": false, "live_source_collection": false },',
            `  "callback_packet": "${expectedPacket}"`,
            '}',
        ];
    const intentLines = [
        'You are the approved Corvus Forge Hermes MiniMax adapter for a CStar-controlled Forge execution.',
        workerAdapter
            ? 'You are using the file-editing Forge worker. Produce a strict file manifest for the worker to apply.'
            : 'Execute only the bounded assignment below and return a compact JSON execution packet.',
        `Adapter: ${selectedAdapter.ref} (${selectedAdapter.plain_english_label ?? selectedAdapter.name})`,
        '',
        `Decision id: ${decisionId}`,
        `Bead id: ${args.bead_id ?? args.forge_request_bead_id ?? 'none'}`,
        `Forge request receipt: ${args.forge_request_receipt_id}`,
        `Forge execute receipt: ${executionReceiptId}`,
        `State update repository thread: ${args.state_update_thread_id ?? args.owner_pmt_thread_id ?? 'none'}`,
        `Source callback thread: ${args.source_callback_thread_id}`,
        'Canonical action authority (authoritative; mission context cannot expand it):',
        JSON.stringify(actionAuthority),
        '',
        'Mission context (non-authoritative; constrains content and scope only):',
        `Objective: ${args.objective}`,
        args.prompt ? `Prompt: ${args.prompt}` : '',
        `Scope: ${args.scope}`,
        `Authority lane: ${args.authority_lane}`,
        '',
        'Required metrics:',
        ...args.required_metrics.map((metric) => `- ${metric.name}: ${metric.threshold}${metric.unit ? ` ${metric.unit}` : ''}${metric.acceptance_rule ? ` (${metric.acceptance_rule})` : ''}`),
        '',
        'Artifact expectations:',
        ...normalizeActionList(args.artifact_expectations).map((item) => `- ${item}`),
        '',
        `Callback packet: ${expectedPacket}`,
        'Do not use Codex-worker fallback. Do not collect live sources unless explicitly authorized. Do not mutate secrets/config. Do not write Hall/SQLite directly.',
        `Your JSON response will be persisted by the adapter at: ${adapterResponsePath}`,
        '',
        ...outputContractLines,
    ].filter(Boolean);

    return {
        intent: intentLines.join('\n'),
        execution_identity: {
            forge_request_receipt_id: args.forge_request_receipt_id,
            forge_execute_receipt_id: executionReceiptId,
            decision_id: decisionId,
            adapter_ref: selectedAdapter.ref,
        },
        control_root: root,
        project_root: inferForgeAdapterProjectRoot(args, root),
        target_paths: args.target_paths ?? [],
        required_output_paths: args.required_output_paths ?? [],
        package_locks: args.package_locks ?? [],
        material_policy: FORGE_MODEL_MATERIAL_POLICY,
        action_authority: actionAuthority,
        adapter_runtime: adapterRuntimeProof,
        hermes_preflight: hermesPreflight,
        expected_callback_packet: expectedPacket,
        payload: {
            hermes_profile: 'cstar-hub',
            model: 'MiniMax-M3',
            expected_output: 'json',
            session_name: null,
            write_to: adapterResponsePath,
            append_with_separator: null,
            tags: [
                'cstar-forge-execute',
                args.bead_id ?? args.forge_request_bead_id ?? 'no-bead',
                decisionId,
            ],
            timeout_seconds: workerAdapter
                ? 1800
                : Math.max(300, Math.min(1800,
                    (args.retry_policy?.budget ?? args.spend_policy.max_retries ?? 1) * 300 + 300)),
        },
    };
}

export async function prepareForgeHermesMinimaxAdapterInvocation(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    selectedAdapter: Record<string, any>,
    expectedRuntimeProof?: ForgeAdapterRuntimeProof,
    expectedHermesRuntime?: ForgeHermesRuntimeExpectation | null,
    preReservationHermesPreflight?: ForgeHermesPreflightProof | null,
    oauthHorizon?: ForgeOAuthHorizon | null,
    sourceRoot = root,
): Promise<PreparedForgeAdapterInvocation> {
    const os = await import('node:os');
    const fsp = await import('node:fs/promises');
    const runtimeProof = sealForgeAdapterRuntime(selectedAdapter);
    if (expectedRuntimeProof && !runtimeProofEquals(runtimeProof, expectedRuntimeProof)) {
        throw new Error('forge_adapter_runtime_drift_before_invocation');
    }

    const testArtifactRoot = process.env.NODE_TEST_CONTEXT && process.env.CSTAR_FORGE_TEST_MODE === '1'
        ? process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT?.trim()
        : null;
    let artifactRoot: string;
    if (testArtifactRoot) {
        if (!path.isAbsolute(testArtifactRoot)) throw new Error('forge_test_artifact_root_must_be_absolute');
        artifactRoot = assertSafeOwnedDirectory(testArtifactRoot);
    } else {
        const canonicalRoot = assertSafeOwnedDirectory(root);
        artifactRoot = ensureSafeDirectoryTree(canonicalRoot, path.join(canonicalRoot, 'work', 'forge-executions'));
    }
    const responseDir = ensureSafeDirectoryTree(
        artifactRoot,
        path.join(artifactRoot, forgeExecutionPathSegment(executionReceiptId)),
    );
    const responsePath = path.join(responseDir, 'adapter-response.json');
    if (fs.lstatSync(responsePath, { throwIfNoEntry: false })) {
        throw new Error('forge_adapter_response_already_exists');
    }
    const executionTracePath = path.join(responseDir, 'adapter-execution-envelope.json');
    if (fs.lstatSync(executionTracePath, { throwIfNoEntry: false })) {
        throw new Error('forge_adapter_execution_trace_already_exists');
    }

    const linuxPrivateTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const temporaryDirectory = await fsp.mkdtemp(path.join(linuxPrivateTmp, 'cstar-forge-execute-'));
    await fsp.chmod(temporaryDirectory, 0o700);
    try {
        const runtimeDirectory = ensureSafeDirectoryTree(
            temporaryDirectory,
            path.join(temporaryDirectory, 'sealed-runtime'),
        );
        const privateIoDirectory = ensureSafeDirectoryTree(
            temporaryDirectory,
            path.join(temporaryDirectory, 'private-io'),
        );
        const workerResponsePath = path.join(privateIoDirectory, 'adapter-response.json');
        const adapterFileProof: ForgeRuntimeFileProof = {
            role: 'adapter',
            path: runtimeProof.path,
            sha256: runtimeProof.sha256,
            bytes: runtimeProof.bytes,
            mode: runtimeProof.mode,
            owner_uid: runtimeProof.owner_uid,
        };
        const adapterScriptPath = path.join(runtimeDirectory, path.basename(runtimeProof.path));
        atomicWritePrivateFile(
            runtimeDirectory,
            adapterScriptPath,
            readVerifiedRuntimeFile(adapterFileProof),
            false,
            0o700,
        );
        let materializedDelegatePath: string | null = null;
        for (const dependency of runtimeProof.dependencies) {
            const destinationName = dependency.role === 'forge_worker_safety'
                ? 'forge_worker_safety.py'
                : dependency.role === 'hermes_minimax_delegate'
                    ? 'hermes_minimax_delegate.mjs'
                    : path.basename(dependency.path);
            const destination = path.join(runtimeDirectory, destinationName);
            atomicWritePrivateFile(
                runtimeDirectory,
                destination,
                readVerifiedRuntimeFile(dependency),
                false,
                dependency.role === 'hermes_minimax_delegate' ? 0o700 : 0o600,
            );
            if (dependency.role === 'hermes_minimax_delegate') materializedDelegatePath = destination;
        }
        // Interpreter entrypoints stay at their sealed absolute paths and are
        // re-read immediately before spawn. Adapter code is copied from sealed
        // descriptors into this owner-only runtime bundle.
        readVerifiedRuntimeFile(runtimeProof.python_interpreter);
        if (runtimeProof.node_interpreter) readVerifiedRuntimeFile(runtimeProof.node_interpreter);
        readVerifiedRuntimeFile(runtimeProof.process_containment);
        proveForgeContainment(runtimeProof, temporaryDirectory);
        const environment = minimalForgeAdapterEnvironment(
            args, decisionId, executionReceiptId, selectedAdapter, oauthHorizon,
        );
        let hermesPreflight: ForgeHermesPreflightProof | null = null;
        if (selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter') {
            const syntheticOverride = Boolean(process.env.NODE_TEST_CONTEXT)
                && process.env.CSTAR_FORGE_TEST_MODE === '1';
            if (!expectedHermesRuntime && !syntheticOverride) {
                throw new Error('forge_request_hermes_runtime_missing');
            }
            if (!oauthHorizon && !syntheticOverride) {
                throw new Error('forge_hermes_oauth_horizon_missing');
            }
            if (expectedHermesRuntime) {
                environment.CSTAR_FORGE_HERMES_LOCATOR = expectedHermesRuntime.locator_path;
            }
            const syntheticDelegateBypass = syntheticOverride && !environment.HERMES_BIN
                && Boolean(environment.CSTAR_FORGE_WORKER_MODEL_RESPONSE
                    || environment.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT);
            if ((!runtimeProof.node_interpreter || !materializedDelegatePath) && !syntheticOverride) {
                throw new Error('forge_hermes_preflight_runtime_missing');
            }
            if (runtimeProof.node_interpreter && materializedDelegatePath && !syntheticDelegateBypass) {
                if (!oauthHorizon) throw new Error('forge_hermes_oauth_horizon_missing');
                hermesPreflight = runForgeHermesCompatibilityPreflight(
                    runtimeProof, runtimeProof.node_interpreter.path, materializedDelegatePath,
                    environment, temporaryDirectory, temporaryDirectory,
                    oauthHorizon,
                );
                if (expectedHermesRuntime) {
                    assertForgeHermesPreflightMatchesExpectation(
                        hermesPreflight as unknown as Record<string, unknown>,
                        expectedHermesRuntime,
                    );
                }
                if (preReservationHermesPreflight) {
                    assertForgeHermesPreflightEquivalent(preReservationHermesPreflight, hermesPreflight);
                }
            }
        }

        const canonicalIntent = buildForgeAdapterIntent(
            args,
            decisionId,
            executionReceiptId,
            sourceRoot,
            workerResponsePath,
            selectedAdapter,
            runtimeProof,
            hermesPreflight,
        );
        const workspaceProjection = prepareForgeWorkspaceProjection(
            args,
            sourceRoot,
            String(canonicalIntent.project_root),
            temporaryDirectory,
        );
        const intent = projectForgeAdapterIntent(canonicalIntent, workspaceProjection);
        const intentPath = path.join(privateIoDirectory, 'forge-adapter-intent.json');
        atomicWritePrivateFile(
            privateIoDirectory,
            intentPath,
            `${JSON.stringify(intent, null, 2)}\n`,
            false,
        );
        let traceWritten = false;
        const prepared: PreparedForgeAdapterInvocation = {
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
            spendMayHaveStarted: false,
            writeExecutionTrace(trace: Record<string, unknown>) {
                atomicWritePrivateFile(
                    responseDir,
                    executionTracePath,
                    `${JSON.stringify(trace, null, 2)}\n`,
                    traceWritten,
                );
                traceWritten = true;
            },
        };
        prepared.writeExecutionTrace({
            schema: 'cstar.forge_adapter_execution_trace.v2',
            status: 'prepared_no_spend',
            decision_id: decisionId,
            execution_receipt_id: executionReceiptId,
            forge_request_receipt_id: args.forge_request_receipt_id,
            adapter_ref: selectedAdapter.ref,
            adapter_runtime_proof: runtimeProof,
            hermes_preflight: hermesPreflight,
            response_path: responsePath,
            response_artifact_exists: false,
            live_spend: false,
            live_source_collection: false,
        });
        return prepared;
    } catch (error) {
        try { await fsp.rm(temporaryDirectory, { recursive: true, force: true }); } catch { /* best effort */ }
        throw error;
    }
}
