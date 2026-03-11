import { execa } from 'execa';
import chalk from 'chalk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';

import { getPythonPath } from './core/python_utils.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const KERNEL_BRIDGE_ENTRYPOINT = path.join(PROJECT_ROOT, 'src', 'core', 'kernel_bridge.py');
const KERNEL_MARKER = '__CORVUS_KERNEL__';

export interface CortexResponse {
    type?: string;
    data?: unknown;
    error?: string;
    status: string;
}

export interface KernelCommandPayload {
    command: string;
    args: unknown;
    cwd: string;
}

export type KernelCommandExecutor = (payload: KernelCommandPayload) => Promise<CortexResponse>;

function extractKernelEnvelope(stdout: string): CortexResponse {
    const markerIndex = stdout.lastIndexOf(KERNEL_MARKER);
    if (markerIndex === -1) {
        throw new Error('Kernel bridge returned no structured response.');
    }

    const raw = stdout.slice(markerIndex + KERNEL_MARKER.length).trim();
    return JSON.parse(raw) as CortexResponse;
}

async function defaultKernelExecutor(payload: KernelCommandPayload): Promise<CortexResponse> {
    const result = await execa(getPythonPath(), [KERNEL_BRIDGE_ENTRYPOINT], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            PYTHONPATH: PROJECT_ROOT,
        },
        input: JSON.stringify(payload),
        reject: false,
        timeout: 300000,
    });

    if (!result.stdout.trim() && result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || 'Kernel bridge failed without output.');
    }

    const response = extractKernelEnvelope(result.stdout);
    if (result.exitCode !== 0 && response.status !== 'error') {
        throw new Error(result.stderr.trim() || 'Kernel bridge exited unsuccessfully.');
    }

    return response;
}

export class CortexLink {
    constructor(
        _port = 50051,
        _host = '127.0.0.1',
        _legacyTransport?: unknown,
        private readonly executor: KernelCommandExecutor = defaultKernelExecutor,
    ) {}

    /**
     * Handles the Two-Phase Commit for moving physical files and updating AST.
     * @param sourcePath Original file path relative to root
     * @param targetPath Target file path relative to root
     */
    async handleArchitectMove(sourcePath: string, targetPath: string): Promise<boolean> {
        console.log(chalk.cyan(`[CORTEX] Initiating AST Two-Phase Commit: ${sourcePath} -> ${targetPath}`));

        const project = new Project({
            tsConfigFilePath: path.join(PROJECT_ROOT, 'tsconfig.json'),
            skipAddingFilesFromTsConfig: false,
        });

        const absSource = path.join(PROJECT_ROOT, sourcePath);
        const absTarget = path.join(PROJECT_ROOT, targetPath);

        const sourceFile = project.getSourceFile(absSource);
        if (sourceFile) {
            sourceFile.move(absTarget);
            console.log(chalk.dim(`[CORTEX] AST mutations staged for ${sourcePath}.`));
        } else {
            console.warn(chalk.yellow(`[CORTEX] File not found in AST: ${sourcePath}. Proceeding with physical move only.`));
        }

        try {
            const response = await this.sendCommand('PHYSICAL_MOVE_REQUEST', [sourcePath, targetPath]);

            if (response.status === 'success' && (response.data as { status?: string } | undefined)?.status === 'MOVE_SUCCESS') {
                console.log(chalk.green('[CORTEX] Kernel bridge confirmed physical move. Flushing AST...'));
                try {
                    await project.save();
                    console.log(chalk.green('[CORTEX] AST flush complete. Sync locked.'));
                    return true;
                } catch {
                    console.error(chalk.red('[CORTEX] AST flush failed. Triggering FATAL_ROLLBACK.'));
                    await this.sendCommand('FATAL_ROLLBACK', [sourcePath, targetPath]);
                    return false;
                }
            }

            console.warn(chalk.yellow('[CORTEX] Kernel bridge rejected move. Discarding AST mutations.'));
            return false;
        } catch (error: any) {
            console.error(chalk.red(`[CORTEX] Physical move request failed: ${error.message}`));
            return false;
        }
    }

    /**
     * Intercepts a file write intent and performs pre-disk adjudication via the Ghost Warden.
     * @param filePath Target file path
     * @param content Proposed content string
     * @returns Promise resolving to the verified content if cleared
     * @throws Error if Ghost Warden issues a PRECOGNITIVE_WARNING
     */
    async interceptWrite(filePath: string, content: string): Promise<string> {
        console.log(chalk.cyan(`[CORTEX] Ghost Pulse Emission: Adjudicating mutation for ${filePath}...`));

        try {
            const response = await this.sendCommand('GHOST_PULSE', [filePath, content]);

            if (response.status === 'success') {
                const result = response.data as { status: string; score: number; reasons: string[] };

                if (result.status === 'PULSE_CLEARED') {
                    console.log(chalk.green(`[CORTEX] Ghost Pulse Cleared (Score: ${result.score}). Allowing write.`));
                    return content;
                }

                const reasonStr = result.reasons.join(' | ');
                console.error(chalk.bgRed.white.bold(' [PRECOGNITIVE WARNING] '));
                console.error(chalk.red(`Ghost Warden Rejected Mutation: ${reasonStr} (Score: ${result.score})`));
                throw new Error(`[PRECOGNITIVE_WARNING] ${reasonStr}`);
            }

            console.warn(chalk.yellow('[CORTEX] Ghost Warden communication failure. Falling back to optimistic write.'));
            return content;
        } catch (error: any) {
            if (error.message.includes('[PRECOGNITIVE_WARNING]')) {
                throw error;
            }
            console.warn(chalk.yellow(`[CORTEX] Ghost Pulse failed: ${error.message}. Proceeding cautiously.`));
            return content;
        }
    }

    /**
     * Transitional compatibility hook. In kernel mode this validates the one-shot bridge.
     */
    async ensureDaemon(): Promise<void> {
        const response = await this.sendCommand('ping');
        if (response.status !== 'success') {
            throw new Error(response.error ?? 'Kernel bridge unavailable.');
        }
    }

    /**
     * Sends a one-shot command payload to the Python kernel bridge.
     * @param command
     * @param args
     * @param cwd
     */
    async sendCommand(command: string, args: unknown = [], cwd = process.cwd()): Promise<CortexResponse> {
        return this.executor({ command, args, cwd });
    }

    /**
     * Transitional compatibility hook. There is no resident daemon to stop in kernel mode.
     */
    async shutdownDaemon(): Promise<void> {
        await this.sendCommand('shutdown');
    }
}
