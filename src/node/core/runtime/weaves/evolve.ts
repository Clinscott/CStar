import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import type { EvolveWeaveMetadata, EvolveWeavePayload, RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult, RuntimeDispatchPort } from  '../contracts.js';
import { inheritTraceInvocation } from '../trace_inheritance.js';

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

    public constructor(
        private readonly dispatchPort?: RuntimeDispatchPort,
        private readonly runner: typeof execa = execa
    ) {}

    public async execute(
        invocation: WeaveInvocation<EvolveWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const kernelRoot = payload.project_root || context.workspace_root;
        const targetRoot = context.workspace_root;
        const scriptPath = path.join(kernelRoot, '.agents', 'skills', 'evolve', 'scripts', 'evolve.py');
        const args = [scriptPath, '--project-root', targetRoot, '--action', payload.action ?? 'propose'];

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

        const { stdout } = await this.runner(resolvePythonPath(kernelRoot), args, {
            cwd: kernelRoot,
            env: { ...context.env, PYTHONPATH: kernelRoot },
        });
        const result = extractJsonObject(stdout) as EvolveWeaveMetadata & { status?: string; summary?: string };
        const metadata: EvolveWeaveMetadata = {
            ...result,
            context_policy: 'project',
        };

        // [🔱] THE ADVERSARIAL GATE: Critique the proposal
        if (result.status === 'SUCCESS' && metadata.proposal_id && this.dispatchPort) {
            console.log(`  ↳ [EVOLVE]: Triggering adversarial critique for proposal ${metadata.proposal_id}...`);

            const critiqueResult = await this.dispatchPort.dispatch(inheritTraceInvocation({
                weave_id: 'weave:critique',
                payload: {
                    bead: { id: payload.bead_id || 'unknown', title: payload.bead_id || 'unknown' },
                    research: { rationale: result.summary, proposal_path: metadata.proposal_path },
                    context: `Adversarial review for evolutionary mutation: ${metadata.proposal_id}`,
                    project_root: kernelRoot,
                    cwd: targetRoot
                } as any,
                session: invocation.session
            }, context));

            if (critiqueResult.status === 'SUCCESS' && (critiqueResult.metadata as any)?.critique_payload?.needs_revision === true) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: critiqueResult.output,
                    error: `[FAIL-FAST]: Evolutionary proposal REJECTED by adversarial critique. ${critiqueResult.output}`,
                    metadata: {
                        ...metadata,
                        critique_failed: true,
                        critique_output: critiqueResult.output
                    }
                };
            }
        }

        return {
            weave_id: this.id,
            status: String(result.status) === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
            output: String(result.summary ?? 'Evolve execution completed.'),
            error: String(result.status) === 'SUCCESS' ? undefined : String(result.summary ?? 'Evolve failed.'),
            metadata,
        };
    }
}
