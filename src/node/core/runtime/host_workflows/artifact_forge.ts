import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import type {
    RuntimeAdapter,
    RuntimeContext,
    TaliesinForgeWeaveMetadata as ArtifactForgeWeaveMetadata,
    TaliesinForgeWeavePayload as ArtifactForgeWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

const MARKER = '__CORVUS_ARTIFACT_FORGE__';

function resolvePythonPath(projectRoot: string): string {
    const windows = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    const unix = path.join(projectRoot, '.venv', 'bin', 'python');
    if (process.platform === 'win32' && fs.existsSync(windows)) {
        return windows;
    }
    if (process.platform !== 'win32' && fs.existsSync(unix)) {
        return unix;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

function extractEnvelope(raw: string): ArtifactForgeWeaveMetadata & { status?: string; summary?: string; error?: string } {
    const markerIndex = raw.lastIndexOf(MARKER);
    const payload = markerIndex === -1 ? raw : raw.slice(markerIndex + MARKER.length);
    const start = payload.indexOf('{');
    const end = payload.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('Artifact forge did not return a JSON envelope.');
    }
    return JSON.parse(payload.slice(start, end + 1)) as ArtifactForgeWeaveMetadata & {
        status?: string;
        summary?: string;
        error?: string;
    };
}

export class ArtifactForgeHostWorkflow implements RuntimeAdapter<ArtifactForgeWeavePayload> {
    public readonly id = 'weave:artifact-forge';

    public constructor(private readonly runner: typeof execa = execa) {}

    public async execute(
        invocation: WeaveInvocation<ArtifactForgeWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const workspaceRoot = payload.project_root || context.workspace_root;
        if (!payload.bead_id) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Artifact forge requires --bead-id for canonical execution.',
            };
        }

        const scriptPath = path.join(workspaceRoot, '.agents', 'skills', 'artifact-forge', 'scripts', 'forge.py');
        const args = [scriptPath, '--bead-id', payload.bead_id];

        if (payload.persona) {
            args.push('--persona', payload.persona);
        }
        if (payload.model) {
            args.push('--model', payload.model);
        }

        const { stdout } = await this.runner(resolvePythonPath(workspaceRoot), args, {
            cwd: payload.cwd || workspaceRoot,
            env: { ...context.env, PYTHONPATH: workspaceRoot },
        });
        const envelope = extractEnvelope(stdout);
        const success = envelope.status === 'SUCCESS' && envelope.candidate?.status === 'STAGED';

        return {
            weave_id: this.id,
            status: success ? 'SUCCESS' : 'FAILURE',
            output: String(
                envelope.summary
                ?? (success ? 'Artifact candidate staged for validation.' : 'Artifact forge failed.')
            ),
            error: success ? undefined : String(envelope.error ?? envelope.summary ?? 'Artifact forge failed.'),
            metadata: envelope,
        };
    }
}

export { ArtifactForgeHostWorkflow as ArtifactForgeWeave };
