import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import { buildHallRepositoryId } from '../../../../types/hall.ts';
import {
    createRavensHallReferenceSet,
    materializeRavensTargetIdentity,
    type RavensCycleResult,
    type RavensStageName,
    type RavensStageResult,
} from '../../../../types/ravens-stage.ts';
import type {
    RavensCycleWeaveMetadata,
    RavensCycleWeavePayload,
    RavensStageWeaveMetadata,
    RavensStageWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

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
        throw new Error('Ravens cycle weave did not return a JSON payload.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function toWeaveStatus(cycleStatus: string): WeaveResult['status'] {
    if (cycleStatus === 'SUCCESS') {
        return 'SUCCESS';
    }
    if (cycleStatus === 'FAILURE') {
        return 'FAILURE';
    }
    return 'TRANSITIONAL';
}

export class RavensCycleWeave implements RuntimeAdapter<RavensCycleWeavePayload> {
    public readonly id = 'weave:ravens-cycle';

    public constructor(private readonly runner: typeof execa = execa) {}

    public async execute(
        invocation: WeaveInvocation<RavensCycleWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const kernelRoot = context.workspace_root;
        const targetRoot = invocation.payload.project_root || kernelRoot;
        const scriptPath = path.join(kernelRoot, 'src', 'sentinel', 'ravens_cycle.py');
        const { stdout } = await this.runner(resolvePythonPath(kernelRoot), [scriptPath, '--project-root', targetRoot], {
            cwd: kernelRoot,
            env: { ...context.env, PYTHONPATH: kernelRoot },
        });

        const cycleResult = extractJsonObject(stdout) as unknown as RavensCycleResult;
        const metadata: RavensCycleWeaveMetadata = { cycle_result: cycleResult };
        return {
            weave_id: this.id,
            status: toWeaveStatus(String(cycleResult.status ?? 'TRANSITIONAL')),
            output: String(cycleResult.summary ?? 'Ravens cycle execution completed.'),
            error:
                String(cycleResult.status) === 'FAILURE'
                    ? String(cycleResult.summary ?? 'Ravens cycle failed.')
                    : undefined,
            metadata,
        };
    }
}

export class RavensStageContractAdapter implements RuntimeAdapter<RavensStageWeavePayload> {
    public readonly id: string;

    public constructor(private readonly stage: RavensStageName) {
        this.id = `weave:ravens-${stage}`;
    }

    public async execute(
        invocation: WeaveInvocation<RavensStageWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const target = invocation.payload.target
            ? materializeRavensTargetIdentity(invocation.payload.target)
            : undefined;
        const stageResult: RavensStageResult = {
            stage: this.stage,
            status: 'TRANSITIONAL',
            summary: `Ravens ${this.stage} stage contract is frozen. Extraction remains transitional until its Phase 3 ticket lands.`,
            target,
            hall: createRavensHallReferenceSet(context.workspace_root, {
                repo_id: buildHallRepositoryId(context.workspace_root),
                bead_id: target?.bead_id,
            }),
            metadata: {
                contract_only: true,
                requested_metadata: { ...(invocation.payload.metadata ?? {}) },
            },
        };
        const metadata: RavensStageWeaveMetadata = { stage_result: stageResult };

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: stageResult.summary,
            metadata,
        };
    }
}
