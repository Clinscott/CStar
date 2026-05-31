/**
 * Worker configuration loaded from the environment.
 *
 * The Mongo URI is a secret: it lives on the config object but is NEVER logged.
 * Use {@link redactedConfig} for any log line that describes the configuration.
 */

import os from 'node:os';
import path from 'node:path';

import type { Logger } from './types.js';

/** Resolved worker configuration. */
export interface WorkerConfig {
    /** The Atlas driver string (`mongodb+srv://…`). SECRET — never log this. */
    mongoUri: string;
    /** Mongo database name. */
    dbName: string;
    /** Mirror collection name (the console reads this). */
    mirrorCollection: string;
    /** Intent queue collection name (the console writes this). */
    intentCollection: string;
    /** Absolute path to the cstar-console checkout. */
    consoleDir: string;
    /** Python interpreter for the pipeline CLI. */
    pythonBin: string;
    /** Resolved pipeline script path. */
    scriptPath: string;
    /** Daemon tick interval in ms. */
    intervalMs: number;
    /** Per-CLI-invocation timeout in ms. */
    cliTimeoutMs: number;
    /** Run `sync` before each export. */
    runSync: boolean;
    /** Reconcile (delete) stale mirror docs after export. */
    reconcile: boolean;
    /** Server-selection timeout for the Mongo client in ms. */
    serverSelectionTimeoutMs: number;
    /** Max intents to drain per tick. */
    maxIntentsPerTick: number;
}

/** Raised when required configuration (the Mongo URI) is absent. */
export class MissingConfigError extends Error {}

/**
 * Parse an integer env var with a default.
 * @param value - The raw env value.
 * @param fallback - Default when unset / unparseable.
 * @returns The parsed positive integer, or the fallback.
 */
function intEnv(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Parse a boolean env var (`1`/`true`/`yes` ⇒ true) with a default.
 * @param value - The raw env value.
 * @param fallback - Default when unset.
 * @returns The parsed boolean.
 */
function boolEnv(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    return /^(1|true|yes|on)$/i.test(value.trim());
}

/**
 * Load and validate the worker configuration from the environment.
 *
 * @param env - The environment to read (default `process.env`).
 * @returns A fully-resolved {@link WorkerConfig}.
 * @throws {MissingConfigError} when `CSTAR_MONGO_URI` is unset/empty.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
    const mongoUri = env.CSTAR_MONGO_URI;
    if (!mongoUri || mongoUri.trim() === '') {
        throw new MissingConfigError(
            'CSTAR_MONGO_URI is not set; refusing to start. Provide the Atlas driver string (treated as a secret).',
        );
    }

    const consoleDir = env.CSTAR_CONSOLE_DIR && env.CSTAR_CONSOLE_DIR.trim() !== ''
        ? path.resolve(env.CSTAR_CONSOLE_DIR)
        : path.join(os.homedir(), 'cstar-console');

    const scriptPath = env.CSTAR_PIPELINE_SCRIPT && env.CSTAR_PIPELINE_SCRIPT.trim() !== ''
        ? path.resolve(env.CSTAR_PIPELINE_SCRIPT)
        : path.join(consoleDir, 'scripts', 'sync_research_proposals.py');

    return {
        mongoUri,
        dbName: env.CSTAR_MONGO_DB && env.CSTAR_MONGO_DB.trim() !== '' ? env.CSTAR_MONGO_DB.trim() : 'cstar_console',
        mirrorCollection: 'proposal_mirror',
        intentCollection: 'intent_queue',
        consoleDir,
        pythonBin: env.CSTAR_PYTHON_BIN && env.CSTAR_PYTHON_BIN.trim() !== '' ? env.CSTAR_PYTHON_BIN.trim() : 'python3',
        scriptPath,
        intervalMs: intEnv(env.CSTAR_SYNC_INTERVAL_MS, 15_000),
        cliTimeoutMs: intEnv(env.CSTAR_SYNC_CLI_TIMEOUT_MS, 120_000),
        runSync: boolEnv(env.CSTAR_SYNC_RUN_SYNC, true),
        reconcile: boolEnv(env.CSTAR_SYNC_RECONCILE, false),
        serverSelectionTimeoutMs: intEnv(env.CSTAR_MONGO_SELECT_TIMEOUT_MS, 10_000),
        maxIntentsPerTick: intEnv(env.CSTAR_SYNC_MAX_INTENTS, 500),
    };
}

/**
 * Build a secret-free view of the config for logging.
 * @param config - The resolved configuration.
 * @returns A copy with `mongoUri` removed and a `mongoUriPresent` flag instead.
 */
export function redactedConfig(config: WorkerConfig): Record<string, unknown> {
    const clone: Record<string, unknown> = { ...config };
    delete clone.mongoUri;
    return { ...clone, mongoUriPresent: true };
}

/** A minimal stderr JSON-lines logger that can never leak the URI (it only logs what it's given). */
export const stderrLogger: Logger = {
    info(event: string, fields: Record<string, unknown> = {}): void {
        process.stderr.write(`${JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...fields })}\n`);
    },
    error(event: string, fields: Record<string, unknown> = {}): void {
        process.stderr.write(`${JSON.stringify({ level: 'error', event, ts: new Date().toISOString(), ...fields })}\n`);
    },
};
