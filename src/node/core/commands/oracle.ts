import { Command, InvalidArgumentError } from 'commander';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import { requestHostText, type HostTextResult } from  '../../../core/host_intelligence.js';
import type { HostProvider } from  '../../../core/host_session.js';
import { ensureHealthySynapseDb } from '../../../core/synapse_db.js';
import { resolveWorkspaceRoot, type WorkspaceRootSource } from  '../runtime/invocation.js';

export interface OracleCommandOptions {
    system?: string;
    silent?: boolean;
    out?: string;
    db?: boolean;
    provider?: HostProvider;
}

export interface OracleSamplingOptions {
    projectRoot: string;
    env?: NodeJS.ProcessEnv;
    source?: string;
    provider?: HostProvider;
}

export interface OraclePromptFs {
    existsSync?: (target: string) => boolean;
    readFileSync?: (target: string, encoding: BufferEncoding) => string;
}

export interface OracleDatabase {
    close(): void;
    prepare(sql: string): {
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): unknown;
    };
}

export interface OracleDependencies {
    hostTextInvoker?: (request: {
        prompt: string;
        systemPrompt?: string;
        projectRoot: string;
        source: string;
        env?: NodeJS.ProcessEnv;
        provider?: HostProvider | null;
    }) => Promise<HostTextResult>;
    databaseFactory?: (dbPath: string) => OracleDatabase;
    fileSystem?: OraclePromptFs;
}

export function parseOracleProvider(value: string): HostProvider {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'gemini' || normalized === 'codex' || normalized === 'claude') {
        return normalized;
    }

    throw new InvalidArgumentError(`Expected one of gemini, codex, claude but received '${value}'.`);
}

export function buildOraclePrompt(prompt: string, systemPrompt?: string): string {
    if (!systemPrompt) {
        return prompt;
    }
    return `SYSTEM:\n${systemPrompt}\n\nUSER:\n${prompt}`;
}

export function resolveOraclePromptTarget(
    target: string,
    systemPrompt?: string,
    fileSystem: OraclePromptFs = {},
): string {
    const existsSync = fileSystem.existsSync ?? fs.existsSync;
    const readFileSync = fileSystem.readFileSync ?? ((filepath: string, encoding: BufferEncoding) => fs.readFileSync(filepath, encoding));

    const prompt = existsSync(target) ? readFileSync(target, 'utf-8') : target;
    return buildOraclePrompt(prompt, systemPrompt);
}

export async function sampleOraclePrompt(
    prompt: string,
    options: OracleSamplingOptions,
    dependencies: OracleDependencies = {},
): Promise<string> {
    const hostTextInvoker = dependencies.hostTextInvoker ?? requestHostText;
    const result = await hostTextInvoker({
        prompt,
        projectRoot: options.projectRoot,
        source: options.source ?? 'cli:oracle',
        env: options.env,
        provider: options.provider,
    });
    return result.text;
}

export async function fulfillOracleSynapseRequest(
    synapseId: number,
    options: OracleSamplingOptions,
    dependencies: OracleDependencies = {},
): Promise<string> {
    const dbPath = path.join(options.projectRoot, '.agents', 'synapse.db');
    const repair = ensureHealthySynapseDb(dbPath);
    if (repair.recovered) {
        console.warn(`[ORACLE] Synapse DB was corrupt and has been rebuilt. Backup: ${repair.backupPath}`);
    }
    const databaseFactory = dependencies.databaseFactory ?? ((resolvedDbPath: string) => new Database(resolvedDbPath));
    const db = databaseFactory(dbPath);

    try {
        const row = db.prepare('SELECT prompt FROM synapse WHERE id = ?').get(synapseId) as { prompt?: string } | undefined;
        if (!row?.prompt) {
            throw new Error(`No record found in Synapse for ID: ${synapseId}`);
        }

        const response = await sampleOraclePrompt(row.prompt, {
            ...options,
            source: options.source ?? 'cli:oracle:synapse',
        }, dependencies);

        db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?').run(response, 'COMPLETED', synapseId);
        return response;
    } finally {
        db.close();
    }
}

export function registerOracleCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dependencies: OracleDependencies = {},
): void {
    program
        .command('oracle <prompt_or_id>')
        .description('Consult the One Mind Host Agent via direct sampling')
        .option('-s, --system <prompt>', 'Override system prompt')
        .option('--silent', 'Suppress all headers and banners for programmatic use')
        .option('--out <file>', 'Write raw response to file')
        .option('--db', 'Use Synapse Database for exchange (id as first arg)')
        .option('-p, --provider <provider>', 'Explicit host provider selection (gemini|codex|claude)', parseOracleProvider)
        .action(async (target: string, options: OracleCommandOptions) => {
            try {
                const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
                const response = options.db
                    ? await fulfillOracleSynapseRequest(Number.parseInt(target, 10), {
                        projectRoot: workspaceRoot,
                        env: process.env,
                        provider: options.provider,
                    }, dependencies)
                    : await sampleOraclePrompt(
                        resolveOraclePromptTarget(target, options.system, dependencies.fileSystem),
                        {
                            projectRoot: workspaceRoot,
                            env: process.env,
                            provider: options.provider,
                        },
                        dependencies,
                    );

                if (options.out) {
                    fs.writeFileSync(options.out, response, 'utf-8');
                    return;
                }

                if (options.db) {
                    if (!options.silent) {
                        console.log(response);
                    }
                    return;
                }

                if (options.silent) {
                    process.stdout.write(response);
                    return;
                }

                console.log(response);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!options.silent) {
                    console.error(`Oracle failed: ${message}`);
                }
                process.exit(1);
            }
        });
}
