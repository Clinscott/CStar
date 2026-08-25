import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { readBoundedFileInside } from '../contracts/runtime.js';
import {
    publishPrivateFileNoClobber,
    removePrivateFile,
} from './forge_adapter_artifacts.js';
import type { ForgeAdapterArtifact } from './forge_adapter_envelope.js';

function artifact(pathname: string, content: Buffer): ForgeAdapterArtifact {
    return {
        path: pathname,
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
    };
}

export class ForgeParentPublication {
    responseArtifact: ForgeAdapterArtifact | null = null;
    executionTraceArtifact: ForgeAdapterArtifact | null = null;

    constructor(
        private readonly responseDir: string,
        private readonly responsePath: string,
        private readonly executionTracePath: string,
        private readonly writeExecutionTrace: (trace: Record<string, unknown>) => void,
    ) {}

    publishResponse(content: Buffer): ForgeAdapterArtifact {
        publishPrivateFileNoClobber(this.responseDir, this.responsePath, content);
        try {
            const durable = readBoundedFileInside(
                this.responseDir,
                this.responsePath,
                16 * 1024 * 1024,
            ).content;
            if (!durable.equals(content)) {
                throw new Error('forge_adapter_response_publication_drift');
            }
            this.responseArtifact = artifact(this.responsePath, durable);
            return this.responseArtifact;
        } catch (error) {
            try {
                this.removeResponse();
            } catch {
                throw new Error('forge_workspace_response_rollback_failed');
            }
            throw error;
        }
    }

    removeResponse(): void {
        if (!fs.lstatSync(this.responsePath, { throwIfNoEntry: false })) {
            this.responseArtifact = null;
            return;
        }
        try {
            removePrivateFile(this.responseDir, this.responsePath);
        } catch {
            throw new Error('forge_workspace_response_rollback_failed');
        }
        if (fs.lstatSync(this.responsePath, { throwIfNoEntry: false })) {
            throw new Error('forge_workspace_response_rollback_failed');
        }
        this.responseArtifact = null;
    }

    publishTerminalTrace(trace: Record<string, unknown>): ForgeAdapterArtifact {
        this.writeExecutionTrace(trace);
        try {
            const content = readBoundedFileInside(
                this.responseDir,
                this.executionTracePath,
                4 * 1024 * 1024,
            ).content;
            this.executionTraceArtifact = artifact(this.executionTracePath, content);
            return this.executionTraceArtifact;
        } catch {
            throw new Error('forge_adapter_terminal_trace_unavailable');
        }
    }

    publishDegraded(
        response: Buffer | null,
        trace: () => Record<string, unknown>,
    ): void {
        if (response) this.publishResponse(response);
        try {
            this.publishTerminalTrace(trace());
        } catch (error) {
            if (fs.lstatSync(this.responsePath, { throwIfNoEntry: false })) {
                this.removeResponse();
            }
            throw error;
        }
    }
}
