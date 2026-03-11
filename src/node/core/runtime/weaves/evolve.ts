import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import type { EvolveWeaveMetadata, EvolveWeavePayload, RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult } from '../contracts.ts';

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

function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('Evolve weave did not return a JSON payload.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

export class EvolveWeave implements RuntimeAdapter<EvolveWeavePayload> {
    public readonly id = 'weave:evolve';

    public constructor(private readonly runner: typeof execa = execa) {}

    public async execute(
        invocation: WeaveInvocation<EvolveWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const scriptPath = path.join(context.workspace_root, '.agents', 'skills', 'evolve', 'scripts', 'evolve.py');
        const args = [scriptPath, '--action', payload.action ?? 'propose'];

        if (payload.bead_id) {
            args.push('--bead-id', payload.bead_id);
        }
        if (payload.proposal_id) {
            args.push('--proposal-id', payload.proposal_id);
        }
        if (payload.dry_run) {
            args.push('--dry-run');
        }
        if (payload.simulate ?? true) {
            args.push('--simulate');
        }
        for (const axis of payload.focus_axes ?? []) {
            args.push('--focus-axis', axis);
        }
        if (payload.validation_profile) {
            args.push('--validation-profile', payload.validation_profile);
        }

        const { stdout } = await this.runner(resolvePythonPath(context.workspace_root), args, {
            cwd: context.workspace_root,
            env: { ...context.env, PYTHONPATH: context.workspace_root },
        });
        const result = extractJsonObject(stdout) as EvolveWeaveMetadata & { status?: string; summary?: string };

        return {
            weave_id: this.id,
            status: String(result.status) === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
            output: String(result.summary ?? 'Evolve execution completed.'),
            error: String(result.status) === 'SUCCESS' ? undefined : String(result.summary ?? 'Evolve failed.'),
            metadata: result,
        };
    }
}
