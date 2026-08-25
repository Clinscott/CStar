import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

import {
    IntelligenceRequest,
    IntelligenceResponse,
    type IntelligenceExecutionIdentity,
    buildEffectivePrompt,
    buildIntelligenceError,
    buildIntelligenceSuccess,
    normalizeIntelligenceRequest,
} from '../types/intelligence-contract.ts';
import {
    HostProvider,
    expandHostBridgeArgs,
    getHostBridgeConfigurationHint,
    resolveConfiguredHostBridge,
    resolveHostProvider,
} from './host_session.ts';
import { resolveOneMindDecision } from './one_mind_bridge.ts';
import { ensureHealthySynapseDb } from './synapse_db.ts';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '../../');
const DEFAULT_HOST_SESSION_TIMEOUT_MS = 300_000; // Increased to 5 minutes
const DEFAULT_HOST_SESSION_MAX_BUFFER = 10 * 1024 * 1024;
const LOCAL_LLM_URL = 'http://localhost:11434/v1';

type HostExecRunner = (
    command: string,
    args: string[],
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        signal?: AbortSignal;
        maxBuffer?: number;
    },
) => Promise<{ stdout: string; stderr: string }>;

type HostInvocationResult = {
    text: string;
    provider: HostProvider;
};

const defaultHostExecRunner: HostExecRunner = async (command, args, options) => {
    const result = await execFileAsync(command, args, {
        ...options,
        encoding: 'utf-8',
    });
    return {
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
    };
};

function getDefaultCliBridgeArgs(provider: Exclude<HostProvider, 'codex'>, prompt: string): string[] {
    if (provider === 'claude') {
        return ['-p', prompt];
    }
    // Optimization for Gemini: Use plan mode to avoid tool loops and approval stalls
    return ['--approval-mode', 'plan', '-p', prompt];
}

function shouldRequireNativeCodexInvoker(
    request: ReturnType<typeof normalizeIntelligenceRequest>,
    provider: HostProvider,
): boolean {
    if (provider !== 'codex') {
        return false;
    }

    const executionMode = typeof request.metadata?.execution_mode === 'string'
        ? request.metadata.execution_mode.trim().toLowerCase()
        : '';
    if (executionMode === 'agent-native') {
        return true;
    }

    const requireAgentHarness = request.metadata?.require_agent_harness;
    if (requireAgentHarness === true) {
        return true;
    }
    if (typeof requireAgentHarness === 'string') {
        const normalized = requireAgentHarness.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
            return true;
        }
    }

    const traceCritical = request.metadata?.trace_critical;
    if (traceCritical === true) {
        return true;
    }
    if (typeof traceCritical === 'string') {
        const normalized = traceCritical.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
            return true;
        }
    }

    return false;
}

function executionIdentity(
    request: ReturnType<typeof normalizeIntelligenceRequest>,
    provider: HostProvider | null,
): IntelligenceExecutionIdentity {
    const requestedModel = typeof request.metadata.requested_model === 'string'
        ? request.metadata.requested_model.trim() || null
        : null;
    const reasoningProfile = typeof request.metadata.reasoning_profile === 'string'
        ? request.metadata.reasoning_profile.trim() || null
        : null;
    const adapterVersion = typeof request.metadata.adapter_version === 'string'
        ? request.metadata.adapter_version.trim() || null
        : null;
    return {
        provider,
        requested_model: requestedModel,
        actual_model: null,
        model_source: 'unreported',
        adapter_version: adapterVersion,
        reasoning_profile: reasoningProfile,
    };
}

export interface MimirClientOptions {
    projectRoot?: string;
    dbPath?: string;
    env?: NodeJS.ProcessEnv;
    hostSessionActive?: boolean;
    hostProvider?: HostProvider | null;
    hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    oracleInvoker?: (synapseId: number) => Promise<void> | void;
    hostExecRunner?: HostExecRunner;
    codexExecRunner?: HostExecRunner;
    hostSessionTimeoutMs?: number;
    pollIntervalMs?: number;
    pollAttempts?: number;
}

type SynapseRow = {
    response: string | null;
    status: string;
};

/**
 * [Ω] Canonical TypeScript bridge for Corvus Star intelligence requests.
 */
export class MimirClient {
    private readonly projectRoot: string;
    private readonly dbPath: string;
    private readonly env: NodeJS.ProcessEnv;
    private readonly hostSessionActive?: boolean;
    private readonly hostProvider?: HostProvider | null;
    private readonly hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    private readonly oracleInvoker?: (synapseId: number) => Promise<void> | void;
    private readonly hostExecRunner: HostExecRunner;
    private readonly hostSessionTimeoutMs: number;
    private readonly pollIntervalMs: number;
    private readonly pollAttempts: number;

    public constructor(options: MimirClientOptions = {}) {
        this.projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;
        this.dbPath = options.dbPath ?? path.join(this.projectRoot, '.stats', 'synapse.db');
        this.env = options.env ?? process.env;
        this.hostSessionActive = options.hostSessionActive;
        this.hostProvider = options.hostProvider;
        this.hostSessionInvoker = options.hostSessionInvoker;
        this.oracleInvoker = options.oracleInvoker;
        this.hostExecRunner = options.hostExecRunner ?? options.codexExecRunner ?? defaultHostExecRunner;
        this.hostSessionTimeoutMs = options.hostSessionTimeoutMs ?? DEFAULT_HOST_SESSION_TIMEOUT_MS;
        this.pollIntervalMs = options.pollIntervalMs ?? 100;
        this.pollAttempts = options.pollAttempts ?? 600; // Increase to 60 seconds (100ms * 600)
    }

    public async request(request: IntelligenceRequest): Promise<IntelligenceResponse> {
        const normalized = normalizeIntelligenceRequest(request, 'ts:mimir');
        const decision = this.resolveDecision(normalized);
        const transportMode = decision.transportMode;

        if (!decision.executionAllowed) {
            return buildIntelligenceError(
                normalized,
                'One Mind delegated execution is retired; route implementation through CStar Forge.',
                transportMode,
                executionIdentity(normalized, null),
            );
        }

        if (transportMode === 'host_session') {
            return this.requestViaHostSession(normalized);
        }

        return this.requestViaSynapse(normalized);
    }

    public async think(query: string, systemPrompt?: string): Promise<string | null> {
        const response = await this.request({
            prompt: query,
            system_prompt: systemPrompt,
            caller: { source: 'ts:mimir:think' },
        });
        return response.status === 'success' ? response.raw_text ?? null : null;
    }

    public async getFileIntent(filepath: string): Promise<string | null> {
        const response = await this.request({
            prompt: `What is the intent of sector: ${filepath}?`,
            caller: {
                source: 'ts:mimir:get_file_intent',
                sector_path: filepath,
            },
        });
        return response.status === 'success' ? response.raw_text ?? null : null;
    }

    public async get_file_intent(filepath: string): Promise<string | null> {
        return this.getFileIntent(filepath);
    }

    public async getWellIntent(filepath: string): Promise<string | null> {
        return this.getFileIntent(filepath);
    }

    public async sampleMind(options: {
        prompt: string;
        system_instructions?: string;
        systemPrompt?: string;
    }): Promise<{ data: { raw: string | null }; trace: IntelligenceResponse['trace']; status: IntelligenceResponse['status']; error?: string }> {
        const response = await this.request({
            prompt: options.prompt,
            system_prompt: options.system_instructions ?? options.systemPrompt,
            caller: { source: 'ts:mimir:sample_mind' },
        });
        return {
            status: response.status,
            error: response.error,
            data: {
                raw: response.raw_text ?? null,
            },
            trace: response.trace,
        };
    }

    public async close(): Promise<void> {
        return;
    }

    private resolveDecision(
        request: ReturnType<typeof normalizeIntelligenceRequest>,
    ) {
        return resolveOneMindDecision(request, this.env, {
            hostSessionActive: this.hostSessionActive,
        });
    }

    private async requestViaHostSession(
        request: ReturnType<typeof normalizeIntelligenceRequest>,
    ): Promise<IntelligenceResponse> {
        const effectivePrompt = buildEffectivePrompt(request);
        const provider = this.resolveHostProvider();
        const requestedIdentity = executionIdentity(request, provider);
        const requireNativeCodexInvoker = shouldRequireNativeCodexInvoker(request, provider);

        try {
            const invocation = await this.invokeHostSession(effectivePrompt, provider, {
                forbidCodexExecFallback: requireNativeCodexInvoker,
            });
            const actualIdentity = executionIdentity(request, invocation.provider);
            const rawText = invocation.text;
            return buildIntelligenceSuccess(request, rawText, 'host_session', false, actualIdentity);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const disableLocalFallback = this.env.CORVUS_DISABLE_LOCAL_LLM_FALLBACK === 'true'
                || this.env.CORVUS_DISABLE_LOCAL_LLM_FALLBACK === '1';

            if (!disableLocalFallback && !requireNativeCodexInvoker) {
                return this.requestViaSynapse(request);
            }

            return buildIntelligenceError(
                request,
                `Host session invocation failed: ${message}`,
                'host_session',
                requestedIdentity,
            );
        }
    }

    private resolveHostProvider(): HostProvider {
        if (this.hostProvider) {
            return this.hostProvider;
        }
        const detectedProvider = resolveHostProvider(this.env);
        if (detectedProvider) {
            return detectedProvider;
        }
        if (this.hostSessionActive === true) {
            return 'gemini';
        }
        return 'gemini';
    }

    private async invokeConfiguredHostBridge(prompt: string, provider: HostProvider): Promise<string | null> {
        const bridge = resolveConfiguredHostBridge(this.env, provider);
        if (!bridge) {
            return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.hostSessionTimeoutMs);

        try {
            const args = expandHostBridgeArgs(bridge.args, {
                prompt,
                project_root: this.projectRoot,
                provider,
            });
            const { stdout, stderr } = await this.hostExecRunner(
                bridge.command,
                args,
                {
                    cwd: this.projectRoot,
                    env: { ...this.env },
                    signal: controller.signal,
                    maxBuffer: DEFAULT_HOST_SESSION_MAX_BUFFER,
                },
            );

            const response = stdout.trim() || stderr.trim();
            if (!response) {
                throw new Error(`Host provider ${provider} returned no output.`);
            }
            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`${provider} host session timed out after ${this.hostSessionTimeoutMs}ms.`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    private async invokeHostSession(
        prompt: string,
        provider: HostProvider,
        options: { forbidCodexExecFallback?: boolean } = {},
    ): Promise<HostInvocationResult> {
        if (this.hostSessionInvoker) {
            const response = await this.hostSessionInvoker(prompt, provider);
            const normalized = String(response ?? '').trim();
            if (normalized) {
                return { text: normalized, provider };
            }
            throw new Error(`Host provider ${provider} returned no output.`);
        }

        if (provider === 'codex' && options.forbidCodexExecFallback) {
            throw new Error(
                'Codex host-session execution requires an injected hostSessionInvoker. Shell bridge and synapse fallback are forbidden for agent-harness-required work.',
            );
        }

        const configuredBridgeResponse = await this.invokeConfiguredHostBridge(prompt, provider);
        if (configuredBridgeResponse) {
            return { text: configuredBridgeResponse, provider };
        }

        if (provider === 'codex') {
            const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'corvus-codex-host-'));
            const outputPath = path.join(scratchDir, 'last-message.txt');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.hostSessionTimeoutMs);

            try {
                const { stdout } = await this.hostExecRunner(
                    'codex',
                    [
                        'exec',
                        '--skip-git-repo-check',
                        '--cd', this.projectRoot,
                        '-c', 'model_reasoning_effort="low"',
                        '--output-last-message', outputPath,
                        prompt,
                    ],
                    {
                        cwd: DEFAULT_PROJECT_ROOT,
                        env: { ...this.env },
                        signal: controller.signal,
                        maxBuffer: DEFAULT_HOST_SESSION_MAX_BUFFER,
                    },
                );

                const captured = await readFile(outputPath, 'utf-8').catch(() => '');
                const response = (captured.trim() || stdout.trim());
                if (!response) {
                    throw new Error('Codex returned no output.');
                }
                return { text: response, provider };
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new Error(`Codex host session timed out after ${this.hostSessionTimeoutMs}ms.`);
                }
                throw error;
            } finally {
                clearTimeout(timer);
                await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
            }
        }

        if (provider === 'gemini' || provider === 'claude') {
            // [🔱] THE SHIELD: Prevent agy from executing headlessly and destroying OAuth tokens.
            if (provider === 'gemini' && !process.stdout.isTTY) {
                console.warn(`[WARNING] Bypassing primary host provider 'agy' in headless mode to prevent OAuth credential corruption. Falling back to codex...`);
                return await this.invokeHostSession(prompt, 'codex');
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.hostSessionTimeoutMs);

            try {
                const cmd = provider === 'gemini' ? 'agy' : provider;
                const { stdout, stderr } = await this.hostExecRunner(
                    cmd,
                    getDefaultCliBridgeArgs(provider, prompt),
                    {
                        cwd: this.projectRoot,
                        env: { ...this.env },
                        signal: controller.signal,
                        maxBuffer: DEFAULT_HOST_SESSION_MAX_BUFFER,
                    },
                );

                const response = stdout.trim() || stderr.trim();
                if (!response) {
                    throw new Error(`${cmd} returned no output.`);
                }
                return { text: response, provider };
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new Error(`${provider} host session timed out after ${this.hostSessionTimeoutMs}ms.`);
                }
                if (provider === 'gemini') {
                    console.warn(`[WARNING] Primary host provider 'agy' failed: ${error instanceof Error ? error.message : String(error)}. Falling back to codex...`);
                    clearTimeout(timer);
                    return await this.invokeHostSession(prompt, 'codex');
                }
                throw error;
            } finally {
                clearTimeout(timer);
            }
        }

        throw new Error(
            `Provider ${provider} does not have an executable host-session bridge configured in the TypeScript runtime. ${getHostBridgeConfigurationHint(provider)}`,
        );
    }

    private async requestViaSynapse(
        request: ReturnType<typeof normalizeIntelligenceRequest>,
    ): Promise<IntelligenceResponse> {
        const effectivePrompt = buildEffectivePrompt(request);
        const identity = executionIdentity(request, null);
        this.ensureDb();

        const cached = this.readCachedResponse(effectivePrompt);
        if (cached) {
            return buildIntelligenceSuccess(request, cached, 'synapse_db', true, identity);
        }

        const synapseId = this.createPendingPrompt(effectivePrompt);

        try {
            await this.invokeOracle(synapseId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return buildIntelligenceError(
                request,
                `Oracle invocation failed: ${message}`,
                'synapse_db',
                identity,
            );
        }

        for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
            const row = this.readSynapseRow(synapseId);
            if (row?.status === 'COMPLETED' && row.response) {
                return buildIntelligenceSuccess(request, row.response, 'synapse_db', false, identity);
            }
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        }

        return buildIntelligenceError(
            request,
            'Timed out waiting for synapse response.',
            'synapse_db',
            identity,
        );
    }

    private async invokeOracle(synapseId: number): Promise<void> {
        if (this.oracleInvoker) {
            await this.oracleInvoker(synapseId);
            return;
        }

        if (this.env.CORVUS_SKIP_ORACLE_INVOKE === 'true' || this.env.CORVUS_SKIP_ORACLE_INVOKE === '1') {
            return;
        }

        const cstarBin = path.join(this.projectRoot, 'bin', 'cstar.js');
        await execFileAsync(
            process.execPath,
            [cstarBin, '--root', this.projectRoot, 'oracle', String(synapseId), '--db', '--silent'],
            {
                cwd: this.projectRoot,
                env: { ...this.env },
            },
        );
    }

    private ensureDb(): void {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        const result = ensureHealthySynapseDb(this.dbPath);
        if (result.recovered) {
            console.warn(`[MIMIR] Synapse DB was corrupt and has been rebuilt. Backup: ${result.backupPath}`);
        }
    }

    private readCachedResponse(prompt: string): string | null {
        const db = new Database(this.dbPath, { readonly: true });
        try {
            const row = db
                .prepare(
                    "SELECT response FROM synapse WHERE prompt = ? AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1",
                )
                .get(prompt) as { response?: string | null } | undefined;
            return row?.response ?? null;
        } finally {
            db.close();
        }
    }

    private createPendingPrompt(prompt: string): number {
        const db = new Database(this.dbPath);
        try {
            const result = db
                .prepare('INSERT INTO synapse (prompt, status) VALUES (?, ?)')
                .run(prompt, 'PENDING');
            return Number(result.lastInsertRowid);
        } finally {
            db.close();
        }
    }

    private readSynapseRow(synapseId: number): SynapseRow | undefined {
        const db = new Database(this.dbPath, { readonly: true });
        try {
            return db
                .prepare('SELECT response, status FROM synapse WHERE id = ?')
                .get(synapseId) as SynapseRow | undefined;
        } finally {
            db.close();
        }
    }

}

export const mimir = new MimirClient();
