import { execa } from 'execa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPythonPath } from './core/python_utils.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const KERNEL_BRIDGE_ENTRYPOINT = path.join(PROJECT_ROOT, 'src', 'core', 'kernel_bridge.py');
const KERNEL_MARKER = '__CORVUS_KERNEL__';
const SAFE_KERNEL_COMMANDS = new Set(['ping', 'shutdown', 'MATRIX_UPDATED', 'HEIMDALL_ALERT']);

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

    /** Retired compatibility method; physical moves require an authorized workflow. */
    async handleArchitectMove(sourcePath: string, targetPath: string): Promise<boolean> {
        void sourcePath;
        void targetPath;
        return false;
    }

    /** Retired compatibility method; never fail open on a write request. */
    async interceptWrite(filePath: string, content: string): Promise<string> {
        void filePath;
        void content;
        throw new Error('cortex_write_path_decommissioned: use an authorized Forge or repository workflow');
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
        if (!SAFE_KERNEL_COMMANDS.has(command)) {
            throw new Error(`kernel_bridge_command_decommissioned:${command}`);
        }
        return this.executor({ command, args, cwd });
    }

    /**
     * Transitional compatibility hook. There is no resident daemon to stop in kernel mode.
     */
    async shutdownDaemon(): Promise<void> {
        await this.sendCommand('shutdown');
    }
}
