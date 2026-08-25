import fs from 'node:fs';
import path from 'node:path';
import { validateForgeAdapterResponseContract } from './forge_adapter_response_contract.js';
import { normalizeActionList } from './dispatch_request.js';
import type { ForgeExecutionArgs } from './forge_execute.js';

export const FORGE_EXECUTION_ADAPTERS = [
    {
        ref: 'cstar-forge-hermes-minimax-adapter',
        plain_english_label: 'cstar-forge-report-only',
        aliases: ['cstar-forge-report-only', 'response-only-report', 'report-only'],
        name: 'CStar Forge Hermes MiniMax adapter',
        contract_surface: 'docs/operations/corvus-forge-skill-spec.md',
        playbook_surface: 'docs/operations/corvus-forge-pipeline-playbook.md',
        invocation: 'operator_authorized_live_gate',
        default_script: '.agents/skills/autobot/scripts/delegate.py',
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
        write_capability: 'project_files',
        codex_worker_fallback_allowed: false,
    },
];

export function resolveForgeExecutionAdapter(args: ForgeExecutionArgs) {
    const requested = args.execution_adapter_ref?.trim() || null;
    const requestedCanonical = requested
        ? FORGE_EXECUTION_ADAPTERS.find((adapter) =>
            adapter.ref === requested || adapter.aliases.includes(requested),
        )?.ref ?? requested
        : null;
    const proofs = FORGE_EXECUTION_ADAPTERS.map((adapter) => ({
        ...adapter,
        requested: requestedCanonical === adapter.ref,
        authorized: requestedCanonical === adapter.ref,
    }));
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

function commonAncestor(paths: string[]): string | null {
    if (paths.length === 0) {
        return null;
    }
    const splitPaths = paths.map((item) => path.resolve(item).split(path.sep));
    const first = splitPaths[0];
    const common: string[] = [];
    for (let index = 0; index < first.length; index += 1) {
        if (splitPaths.every((parts) => parts[index] === first[index])) {
            common.push(first[index]);
        } else {
            break;
        }
    }
    const joined = common.join(path.sep);
    return joined || path.parse(paths[0]).root || null;
}

function targetBaseDirectory(root: string, target: string): { base: string; gitRoot: string | null } {
    const absolute = path.isAbsolute(target) ? target : path.resolve(root, target);
    try {
        const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
        const base = stat?.isFile() ? path.dirname(absolute) : absolute;
        return { base, gitRoot: findNearestGitRoot(base) };
    } catch {
        const base = path.dirname(absolute);
        return { base, gitRoot: findNearestGitRoot(base) };
    }
}

function inferForgeAdapterProjectRoot(args: ForgeExecutionArgs, root: string): string {
    const targetPaths = args.target_paths ?? [];
    const bases: string[] = [];
    const gitRoots = new Set<string>();
    for (const target of targetPaths) {
        const { base, gitRoot } = targetBaseDirectory(root, target);
        bases.push(base);
        if (gitRoot && !isSharedTempGitRoot(gitRoot)) {
            gitRoots.add(gitRoot);
        }
    }
    if (gitRoots.size === 1) {
        return [...gitRoots][0];
    }
    const commonBase = commonAncestor(bases);
    if (commonBase) {
        return commonBase;
    }
    for (const target of args.target_paths ?? []) {
        const absolute = path.isAbsolute(target) ? target : path.resolve(root, target);
        try {
            const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
            const gitRoot = findNearestGitRoot(stat?.isFile() ? path.dirname(absolute) : absolute);
            if (gitRoot && !isSharedTempGitRoot(gitRoot)) {
                return gitRoot;
            }
            if (stat?.isDirectory()) {
                return absolute;
            }
            if (stat?.isFile()) {
                return path.dirname(absolute);
            }
        } catch {
            continue;
        }
    }
    return root;
}

function findNearestGitRoot(start: string): string | null {
    let current = path.resolve(start);
    while (true) {
        if (fs.existsSync(path.join(current, '.git'))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

function isSharedTempGitRoot(candidate: string): boolean {
    const tempRoots = [
        process.env.TMPDIR,
        process.env.TEMP,
        process.env.TMP,
        '/tmp',
    ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => path.resolve(value));
    return tempRoots.includes(path.resolve(candidate));
}

function forgeExecutionPathSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || 'forge-execution';
}

function forgeAdapterResponsePath(root: string, executionReceiptId: string): string {
    const artifactRoot = process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT?.trim()
        || path.join(root, 'work', 'forge-executions');
    return path.join(artifactRoot, forgeExecutionPathSegment(executionReceiptId), 'adapter-response.json');
}

function buildForgeAdapterIntent(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    adapterResponsePath: string,
    selectedAdapter: Record<string, any>,
): Record<string, unknown> {
    const expectedPacket = args.callback_contract.expected_packet;
    const workerAdapter = selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter';
    const outputContractLines = workerAdapter
        ? [
            'Worker input manifest rules:',
            'Return the worker input manifest, not the final Forge execution packet.',
            'Return JSON only with: status, summary, files, artifacts, validation, metrics, boundaries, callback_packet.',
            'files must be an array of file objects. Each file object must have path and content strings.',
            'content must be the complete file contents to write. Use repository-relative paths under the sealed target roots.',
            'Do not return files_changed. The worker creates files_changed after it writes and hashes the files.',
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
        `Owner PMT thread: ${args.owner_pmt_thread_id}`,
        `Source callback thread: ${args.source_callback_thread_id}`,
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
        'Requested actions:',
        ...normalizeActionList(args.requested_actions).map((item) => `- ${item}`),
        '',
        'Prohibited actions:',
        ...normalizeActionList(args.prohibited_actions).map((item) => `- ${item}`),
        '',
        `Callback packet: ${expectedPacket}`,
        'Do not use Codex-worker fallback. Do not collect live sources unless explicitly authorized. Do not mutate secrets/config. Do not write Hall/SQLite directly.',
        `Your JSON response will be persisted by the adapter at: ${adapterResponsePath}`,
        '',
        ...outputContractLines,
    ].filter(Boolean);

    return {
        intent: intentLines.join('\n'),
        project_root: inferForgeAdapterProjectRoot(args, root),
        target_paths: args.target_paths ?? [],
        payload: {
            hermes_profile: 'cstar-hub',
            model: 'MiniMax-M3',
            expected_output: 'json',
            max_chars: 8000,
            session_name: null,
            write_to: adapterResponsePath,
            append_with_separator: null,
            tags: [
                'cstar-forge-execute',
                args.bead_id ?? args.forge_request_bead_id ?? 'no-bead',
                decisionId,
            ],
            timeout_seconds: Math.max(300, Math.min(1800, (args.retry_policy?.budget ?? args.spend_policy.max_retries ?? 1) * 300 + 300)),
        },
    };
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
        && /^forge_[a-z0-9_]+(?:_[0-9]+)?$/.test(value) ? value : null;
}

export function forgeExecutionRequiresImplementationWrites(args: ForgeExecutionArgs): boolean {
    const text = [
        args.objective,
        args.prompt ?? '',
        ...normalizeActionList(args.requested_actions),
        ...normalizeActionList(args.artifact_expectations),
    ].join('\n').toLowerCase();
    return /\b(add|build|change|create|delete|develop|edit|fix|generate|implement|install|modify|mutate|package|patch|refactor|remove|repair|tarball|update|write)\b/.test(text);
}

export async function invokeForgeHermesMinimaxAdapter(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    selectedAdapter: Record<string, any>,
) {
    const os = await import('node:os');
    const fsp = await import('node:fs/promises');
    const cp = await import('node:child_process');
    const crypto = await import('node:crypto');
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cstar-forge-execute-'));
    const intentPath = path.join(tmpDir, 'forge-adapter-intent.json');
    const responsePath = forgeAdapterResponsePath(root, executionReceiptId);
    const responseDir = path.dirname(responsePath);
    const executionTracePath = path.join(responseDir, 'adapter-execution-envelope.json');
    const writeExecutionTrace = async (trace: Record<string, unknown>) => {
        await fsp.mkdir(responseDir, { recursive: true });
        await fsp.writeFile(executionTracePath, `${JSON.stringify(trace, null, 2)}\n`);
    };
    const intent = buildForgeAdapterIntent(args, decisionId, executionReceiptId, root, responsePath, selectedAdapter);
    const projectRoot = typeof intent.project_root === 'string' ? intent.project_root : inferForgeAdapterProjectRoot(args, root);
    await fsp.writeFile(intentPath, JSON.stringify(intent, null, 2));

    const adapterScriptOverride = selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter'
        ? process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT?.trim()
        : process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT?.trim();
    const scriptPath = adapterScriptOverride || path.join(root, selectedAdapter.default_script);
    const timeoutSec = Number((intent.payload as Record<string, any>).timeout_seconds ?? 600);
    const env = {
        ...process.env,
        CSTAR_FORGE_EXECUTE_RECEIPT_ID: executionReceiptId,
        CSTAR_FORGE_REQUEST_RECEIPT_ID: args.forge_request_receipt_id,
        CSTAR_FORGE_EXECUTE_DECISION_ID: decisionId,
        CSTAR_FORGE_EXECUTE_ADAPTER_REF: selectedAdapter.ref,
        HERMES_AUTOBOT_DELEGATED: '',
        NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc',
    };
    await writeExecutionTrace({
        schema: 'cstar.forge_adapter_execution_trace.v1',
        status: 'started',
        decision_id: decisionId,
        execution_receipt_id: executionReceiptId,
        forge_request_receipt_id: args.forge_request_receipt_id,
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        response_path: responsePath,
        response_artifact_exists: false,
        live_spend: false,
        live_source_collection: false,
    });

    const result = cp.spawnSync('python3', [scriptPath, '--intent-file', intentPath], {
        cwd: root,
        encoding: 'utf-8',
        timeout: (timeoutSec + 30) * 1000,
        env,
    });

    try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }

    const envelope = parseAdapterEnvelope(result.stdout || '');
    let adapterStatus = envelope?.status ?? (result.error ? 'spawn_error' : result.status === 0 ? 'unknown' : 'nonzero_exit');
    let responseArtifact: Record<string, unknown> | null = null;
    let responseContract: Record<string, unknown> | null = null;
    let artifactError: string | null = null;
    const wroteTo = typeof envelope?.wrote_to === 'string' && envelope.wrote_to.trim()
        ? envelope.wrote_to.trim()
        : null;
    if (wroteTo) {
        try {
            const data = await fsp.readFile(wroteTo);
            const contract = validateForgeAdapterResponseContract(
                data.toString('utf-8'),
                [projectRoot, root],
                args.callback_contract.expected_packet,
            );
            responseArtifact = {
                path: wroteTo,
                bytes: data.byteLength,
                sha256: crypto.createHash('sha256').update(data).digest('hex'),
            };
            if (contract.ok) {
                responseContract = contract.summary;
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
    const spawnFailedBeforeStart = Boolean(result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT');
    const liveSpendUnknown = envelope?.live_spend_unknown === true
        || (!liveSpendKnown && !spawnFailedBeforeStart);
    const liveSpend = liveSpendKnown ? envelope!.live_spend as boolean : null;
    await writeExecutionTrace({
        schema: 'cstar.forge_adapter_execution_trace.v1',
        status: adapterStatus,
        decision_id: decisionId,
        execution_receipt_id: executionReceiptId,
        forge_request_receipt_id: args.forge_request_receipt_id,
        adapter_ref: selectedAdapter.ref,
        adapter_script: scriptPath,
        exit_status: result.status,
        signal: result.signal,
        spawn_error: result.error ? 'forge_adapter_spawn_failed' : null,
        response_path: responsePath,
        response_artifact_exists: responseArtifact !== null,
        response_artifact: responseArtifact,
        artifact_error: artifactError,
        envelope: envelope
            ? {
                schema: envelope.schema === 'cstar.forge_delegate_failure.v1' ? envelope.schema : null,
                status: envelope.status ?? null,
                intent_id: envelope.intent_id ?? null,
                duration_ms: envelope.duration_ms ?? null,
                response_chars: envelope.response_chars ?? null,
                est_prompt_tokens: envelope.est_prompt_tokens ?? null,
                est_response_tokens: envelope.est_response_tokens ?? null,
                provider: envelope.provider === 'minimax' ? 'minimax' : null,
                requested_model: (envelope.requested_model ?? envelope.model) === 'MiniMax-M3' ? 'MiniMax-M3' : null,
                actual_model: envelope.model_source === 'provider_reported'
                    ? boundedEnvelopeIdentity(envelope.actual_model) : null,
                model_source: envelope.model_source === 'provider_reported' ? 'provider_reported' : 'unreported',
                model: envelope.model === 'MiniMax-M3' ? 'MiniMax-M3' : null,
                hermes_profile: envelope.hermes_profile === 'cstar-hub' ? 'cstar-hub' : null,
                wrote_to: envelope.wrote_to ?? null,
                degraded_reason: boundedEnvelopeReason(envelope.degraded_reason),
                live_spend: envelope.live_spend ?? null,
                live_spend_unknown: liveSpendUnknown,
                live_source_collection: envelope.live_source_collection ?? null,
            }
            : null,
        stdout_chars: (result.stdout || '').length,
        stderr_chars: (result.stderr || '').length,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        live_source_collection: envelope?.live_source_collection === true,
    });
    let executionTraceArtifact: Record<string, unknown> | null = null;
    try {
        const traceData = await fsp.readFile(executionTracePath);
        executionTraceArtifact = {
            path: executionTracePath,
            bytes: traceData.byteLength,
            sha256: crypto.createHash('sha256').update(traceData).digest('hex'),
        };
    } catch {
        executionTraceArtifact = null;
    }
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
        envelope: envelope
            ? {
                schema: envelope.schema === 'cstar.forge_delegate_failure.v1' ? envelope.schema : null,
                status: envelope.status ?? null,
                intent_id: envelope.intent_id ?? null,
                duration_ms: envelope.duration_ms ?? null,
                response_chars: envelope.response_chars ?? null,
                est_prompt_tokens: envelope.est_prompt_tokens ?? null,
                est_response_tokens: envelope.est_response_tokens ?? null,
                provider: envelope.provider === 'minimax' ? 'minimax' : null,
                requested_model: (envelope.requested_model ?? envelope.model) === 'MiniMax-M3' ? 'MiniMax-M3' : null,
                actual_model: envelope.model_source === 'provider_reported'
                    ? boundedEnvelopeIdentity(envelope.actual_model) : null,
                model_source: envelope.model_source === 'provider_reported' ? 'provider_reported' : 'unreported',
                model: envelope.model === 'MiniMax-M3' ? 'MiniMax-M3' : null,
                hermes_profile: envelope.hermes_profile === 'cstar-hub' ? 'cstar-hub' : null,
                wrote_to: envelope.wrote_to ?? null,
                response_artifact: responseArtifact,
                response_contract: responseContract,
                execution_trace_artifact: executionTraceArtifact,
                ledger_entry: envelope.ledger_entry ?? null,
                degraded_reason: boundedEnvelopeReason(envelope.degraded_reason),
                live_spend: envelope.live_spend ?? null,
                live_spend_unknown: liveSpendUnknown,
                live_source_collection: envelope.live_source_collection ?? null,
            }
            : null,
        error: result.error ? 'forge_adapter_spawn_failed' : artifactError,
        stderr_tail: null,
        stdout_tail: null,
    };
}
