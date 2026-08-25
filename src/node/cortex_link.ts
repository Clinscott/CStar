import { failRetiredGateway } from './retired_gateway.js';

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

/** Retired Node-to-Python bridge. Construction is terminal and side-effect free. */
export class CortexLink {
    constructor(
        _port = 50051,
        _host = '127.0.0.1',
        _legacyTransport?: unknown,
        _executor?: KernelCommandExecutor,
    ) {
        failRetiredGateway();
    }

    async handleArchitectMove(_sourcePath: string, _targetPath: string): Promise<never> {
        return failRetiredGateway();
    }

    async interceptWrite(_filePath: string, _content: string): Promise<never> {
        return failRetiredGateway();
    }

    async ensureDaemon(): Promise<never> { return failRetiredGateway(); }

    async sendCommand(_command: string, _args: unknown = [], _cwd = ''): Promise<never> {
        return failRetiredGateway();
    }

    async shutdownDaemon(): Promise<never> { return failRetiredGateway(); }
}
