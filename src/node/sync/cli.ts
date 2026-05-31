/**
 * The sanctioned-writer bridge.
 *
 * The ONLY writer to `pennyone.db` is `scripts/sync_research_proposals.py` in
 * the cstar-console checkout. This runner shells it with an explicit argv array
 * via {@link execFile} — never `shell: true`, never string interpolation — so
 * operator-supplied intent fields cannot inject commands.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

import type { CliResult, CliRunner } from './types.js';

/** Construction options for {@link PipelineCli}. */
export interface PipelineCliOptions {
    /** Absolute path to the cstar-console checkout (contains `scripts/…`). */
    consoleDir: string;
    /** Python interpreter to invoke (default `python3`). */
    pythonBin?: string;
    /** Explicit path to the pipeline script (default `<consoleDir>/scripts/sync_research_proposals.py`). */
    scriptPath?: string;
    /** Environment for the child process (default `process.env`). The Mongo URI is never needed here. */
    env?: NodeJS.ProcessEnv;
    /** Per-invocation timeout in ms (default 120000). */
    timeoutMs?: number;
    /** Max stdout/stderr buffer in bytes (default 16 MiB to accommodate `list --history`). */
    maxBuffer?: number;
}

/**
 * Safely parse JSON from CLI stdout.
 * @param stdout - Raw stdout text.
 * @returns The parsed value, or null when stdout is not valid JSON.
 */
function parseJsonSafe(stdout: string): unknown {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
        return null;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

/** Shells the pipeline CLI with argv arrays and normalizes the outcome. */
export class PipelineCli implements CliRunner {
    private readonly pythonBin: string;
    private readonly scriptPath: string;
    private readonly consoleDir: string;
    private readonly env: NodeJS.ProcessEnv;
    private readonly timeoutMs: number;
    private readonly maxBuffer: number;

    /**
     * @param options - {@link PipelineCliOptions} describing the checkout + runtime knobs.
     */
    constructor(options: PipelineCliOptions) {
        this.consoleDir = options.consoleDir;
        this.pythonBin = options.pythonBin ?? 'python3';
        this.scriptPath =
            options.scriptPath ?? path.join(options.consoleDir, 'scripts', 'sync_research_proposals.py');
        this.env = options.env ?? process.env;
        this.timeoutMs = options.timeoutMs ?? 120_000;
        this.maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
    }

    /**
     * Run the pipeline CLI with the given argv.
     * @param argv - Subcommand + flags (e.g. `['accept', '--id', 'X', '--notes', '']`).
     * @returns A normalized {@link CliResult}; never rejects (errors are captured).
     */
    run(argv: string[]): Promise<CliResult> {
        return new Promise((resolve) => {
            execFile(
                this.pythonBin,
                [this.scriptPath, ...argv],
                {
                    cwd: this.consoleDir,
                    env: this.env,
                    timeout: this.timeoutMs,
                    maxBuffer: this.maxBuffer,
                    encoding: 'utf-8',
                },
                (error, stdout, stderr) => {
                    const out = String(stdout ?? '');
                    const err = String(stderr ?? '');
                    if (error) {
                        // execFile sets a numeric `code` on non-zero exit, a string code (e.g. ENOENT) on spawn failure.
                        const rawCode = (error as NodeJS.ErrnoException & { code?: number | string }).code;
                        const code = typeof rawCode === 'number' ? rawCode : null;
                        const stderrText = err.length > 0 ? err : error.message;
                        resolve({ ok: false, code, stdout: out, stderr: stderrText, json: parseJsonSafe(out) });
                        return;
                    }
                    resolve({ ok: true, code: 0, stdout: out, stderr: err, json: parseJsonSafe(out) });
                },
            );
        });
    }
}
