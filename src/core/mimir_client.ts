import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

import {
    IntelligenceRequest,
    IntelligenceResponse,
    buildEffectivePrompt,
    buildIntelligenceError,
    buildIntelligenceSuccess,
    normalizeIntelligenceRequest,
} from '../types/intelligence-contract.ts';
import { HostProvider, isHostSessionActive, resolveHostProvider } from './host_session.ts';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '../../');

export interface MimirClientOptions {
    projectRoot?: string;
    dbPath?: string;
    hostSessionActive?: boolean;
    hostProvider?: HostProvider | null;
    hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    oracleInvoker?: (synapseId: number) => Promise<void> | void;
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
    private readonly hostSessionActive?: boolean;
    private readonly hostProvider?: HostProvider | null;
    private readonly hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    private readonly oracleInvoker?: (synapseId: number) => Promise<void> | void;
    private readonly pollIntervalMs: number;
    private readonly pollAttempts: number;

    public constructor(options: MimirClientOptions = {}) {
        this.projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;
        this.dbPath = options.dbPath ?? path.join(this.projectRoot, '.agents', 'synapse.db');
        this.hostSessionActive = options.hostSessionActive;
        this.hostProvider = options.hostProvider;
        this.hostSessionInvoker = options.hostSessionInvoker;
        this.oracleInvoker = options.oracleInvoker;
        this.pollIntervalMs = options.pollIntervalMs ?? 100;
        this.pollAttempts = options.pollAttempts ?? 20;
    }

    public async request(request: IntelligenceRequest): Promise<IntelligenceResponse> {
        const normalized = normalizeIntelligenceRequest(request, 'ts:mimir');
        const transportMode = this.resolveTransportMode(normalized.transport_mode);

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

    private resolveTransportMode(mode: IntelligenceRequest['transport_mode'] = 'auto'): 'host_session' | 'synapse_db' {
        if (mode === 'host_session') {
            return 'host_session';
        }
        if (mode === 'synapse_db') {
            return 'synapse_db';
        }
        if (typeof this.hostSessionActive === 'boolean') {
            return this.hostSessionActive ? 'host_session' : 'synapse_db';
        }
        return isHostSessionActive(process.env) ? 'host_session' : 'synapse_db';
    }

    private async requestViaHostSession(
        request: ReturnType<typeof normalizeIntelligenceRequest>,
    ): Promise<IntelligenceResponse> {
        const effectivePrompt = buildEffectivePrompt(request);
        const provider = this.resolveHostProvider();

        if (provider === 'codex') {
            try {
                const rawText = await this.invokeHostSession(effectivePrompt, provider);
                return buildIntelligenceSuccess(request, rawText, 'host_session');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return buildIntelligenceError(request, `Host session invocation failed: ${message}`, 'host_session');
            }
        }

        const rawText = `[SAMPLING_REQUEST]\n${effectivePrompt}`;
        return buildIntelligenceSuccess(request, rawText, 'host_session');
    }

    private resolveHostProvider(): HostProvider {
        if (this.hostProvider) {
            return this.hostProvider;
        }
        if (this.hostSessionActive === true) {
            return 'gemini';
        }
        return resolveHostProvider(process.env) ?? 'gemini';
    }

    private async invokeHostSession(prompt: string, provider: HostProvider): Promise<string> {
        if (this.hostSessionInvoker) {
            const response = await this.hostSessionInvoker(prompt, provider);
            const normalized = String(response ?? '').trim();
            if (normalized) {
                return normalized;
            }
            throw new Error(`Host provider ${provider} returned no output.`);
        }

        if (provider === 'codex') {
            const { stdout } = await execFileAsync(
                'codex',
                ['exec', prompt],
                {
                    cwd: this.projectRoot,
                    env: { ...process.env },
                },
            );

            const response = stdout.trim();
            if (!response) {
                throw new Error('Codex returned no output.');
            }
            return response;
        }

        return `[SAMPLING_REQUEST]\n${prompt}`;
    }

    private async requestViaSynapse(request: ReturnType<typeof normalizeIntelligenceRequest>): Promise<IntelligenceResponse> {
        const effectivePrompt = buildEffectivePrompt(request);
        this.ensureDb();

        const cached = this.readCachedResponse(effectivePrompt);
        if (cached) {
            return buildIntelligenceSuccess(request, cached, 'synapse_db', true);
        }

        const synapseId = this.createPendingPrompt(effectivePrompt);

        try {
            await this.invokeOracle(synapseId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return buildIntelligenceError(request, `Oracle invocation failed: ${message}`, 'synapse_db');
        }

        for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
            const row = this.readSynapseRow(synapseId);
            if (row?.status === 'COMPLETED' && row.response) {
                return buildIntelligenceSuccess(request, row.response, 'synapse_db');
            }
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        }

        return buildIntelligenceError(request, 'Timed out waiting for synapse response.', 'synapse_db');
    }

    private async invokeOracle(synapseId: number): Promise<void> {
        if (this.oracleInvoker) {
            await this.oracleInvoker(synapseId);
            return;
        }

        const cstarBin = path.join(this.projectRoot, 'bin', 'cstar.js');
        await execFileAsync(
            process.execPath,
            [cstarBin, 'oracle', String(synapseId), '--db', '--silent'],
            {
                cwd: this.projectRoot,
                env: { ...process.env },
            },
        );
    }

    private ensureDb(): void {
        const db = new Database(this.dbPath);
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS synapse (
                    id INTEGER PRIMARY KEY,
                    prompt TEXT,
                    response TEXT,
                    status TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } finally {
            db.close();
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
