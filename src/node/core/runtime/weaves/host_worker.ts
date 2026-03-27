import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import { mimir } from '../../../../core/mimir_client.js';
import {
    requestHostDelegatedExecution,
    type DelegatedExecutionRequest,
    type DelegatedExecutionResult,
} from '../../../../core/host_delegation.js';
import { getHallBeads } from '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import type { SovereignBead } from '../../../../types/bead.js';
import type {
    HostWorkerWeavePayload,
    HostWorkerWeaveMetadata,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export interface HostWorkerDependencies {
    runner?: typeof execa;
    getBeads?: (repoId: string) => SovereignBead[];
    delegateExecution?: (
        request: DelegatedExecutionRequest,
        env: NodeJS.ProcessEnv,
    ) => Promise<DelegatedExecutionResult | { handle_id: string; provider: 'gemini' | 'codex' | 'claude'; status: 'queued' | 'running'; correlation_id?: string }>;
    requestViaMimir?: typeof mimir.request;
    existsSync?: typeof fs.existsSync;
    readFileSync?: typeof fs.readFileSync;
    mkdirSync?: typeof fs.mkdirSync;
    writeFileSync?: typeof fs.writeFileSync;
}

function extractCodeBlock(raw: string): string {
    const match = raw.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    return (match?.[1] ?? raw).trim();
}

function parseAcceptanceCriteria(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }
    return raw
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function buildWorkerPrompt(bead: SovereignBead, targetPath: string, targetContent: string, testContents: string): string {
    return [
        'You are the Corvus Star Host Worker.',
        'Your task is to implement the requested changes to pass the provided TDD tests.',
        `BEAD RATIONALE: ${bead.rationale}`,
        `ACCEPTANCE CRITERIA: ${bead.acceptance_criteria ?? ''}`,
        '',
        `TARGET FILE: ${targetPath}`,
        'CURRENT CONTENT:',
        '```',
        targetContent || '// File does not exist yet',
        '```',
        '',
        'TEST FILES:',
        testContents,
        '',
        'INSTRUCTIONS:',
        '1. Write the COMPLETE, valid code for the TARGET FILE.',
        '2. Every function and class MUST include the `export` keyword so they can be imported by the tests.',
        '3. Do not write partial code or omit sections with comments like "...rest of code".',
        '4. Output ONLY the raw code inside a single markdown code block.',
        '5. Do not include markdown formatting outside the code block.',
    ].join('\n');
}

function shouldFallbackToHall(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /configured delegated-execution bridge/i.test(message)
        || /host agent session inactive/i.test(message)
        || /delegate bridge .* returned no output/i.test(message);
}

export class HostWorkerWeave implements RuntimeAdapter<HostWorkerWeavePayload> {
    public readonly id = 'weave:host-worker';
    private readonly runner: typeof execa;
    private readonly getBeads: (repoId: string) => SovereignBead[];
    private readonly delegateExecution: NonNullable<HostWorkerDependencies['delegateExecution']>;
    private readonly requestViaMimir: typeof mimir.request;
    private readonly existsSync: typeof fs.existsSync;
    private readonly readFileSync: typeof fs.readFileSync;
    private readonly mkdirSync: typeof fs.mkdirSync;
    private readonly writeFileSync: typeof fs.writeFileSync;

    public constructor(deps: HostWorkerDependencies = {}) {
        this.runner = deps.runner ?? execa;
        this.getBeads = deps.getBeads ?? ((repoId: string) => getHallBeads(repoId));
        this.delegateExecution = deps.delegateExecution ?? requestHostDelegatedExecution;
        this.requestViaMimir = deps.requestViaMimir ?? mimir.request.bind(mimir);
        this.existsSync = deps.existsSync ?? fs.existsSync;
        this.readFileSync = deps.readFileSync ?? fs.readFileSync;
        this.mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
        this.writeFileSync = deps.writeFileSync ?? fs.writeFileSync;
    }

    public async execute(
        invocation: WeaveInvocation<HostWorkerWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const beads = this.getBeads(repoId);
        const bead = beads.find((entry) => entry.id === payload.bead_id);

        if (!bead) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Bead ${payload.bead_id} not found.`,
            };
        }

        const targetPath = bead.target_path ?? bead.target_ref;
        if (!targetPath) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Bead ${payload.bead_id} has no target path.`,
            };
        }

        const absoluteTargetPath = path.resolve(projectRoot, targetPath);
        const targetContent = this.existsSync(absoluteTargetPath)
            ? this.readFileSync(absoluteTargetPath, 'utf-8')
            : '';

        const testPaths = bead.contract_refs ?? [];
        let testContents = '';
        for (const testPath of testPaths) {
            const absoluteTestPath = path.resolve(projectRoot, testPath);
            if (this.existsSync(absoluteTestPath)) {
                testContents += `\n--- ${testPath} ---\n${this.readFileSync(absoluteTestPath, 'utf-8')}\n`;
            }
        }

        const prompt = buildWorkerPrompt(bead, targetPath, targetContent, testContents);
        const env = { ...process.env, ...context.env } as NodeJS.ProcessEnv;
        const delegateRequest: DelegatedExecutionRequest = {
            request_id: `host-worker:${payload.bead_id}`,
            repo_root: projectRoot,
            boundary: 'subagent',
            task_kind: 'implementation',
            prompt,
            target_paths: [targetPath, ...testPaths],
            acceptance_criteria: parseAcceptanceCriteria(bead.acceptance_criteria),
            checker_shell: bead.checker_shell ?? null,
            metadata: {
                bead_id: payload.bead_id,
                caller_source: 'runtime:host-worker',
                one_mind_boundary: 'subagent',
                execution_role: 'subagent',
            },
        };

        try {
            let newContent: string | null = null;
            let delegated = false;
            let delegatedProvider: string | null = null;

            try {
                const delegatedResult = await this.delegateExecution(delegateRequest, env);
                if (delegatedResult.status === 'completed') {
                    if (!delegatedResult.raw_text?.trim()) {
                        throw new Error('Delegate bridge returned a completed result without raw_text.');
                    }
                    newContent = extractCodeBlock(delegatedResult.raw_text);
                    delegated = true;
                    delegatedProvider = delegatedResult.provider;
                } else if (delegatedResult.status === 'failed' || delegatedResult.status === 'cancelled') {
                    throw new Error(delegatedResult.error || `Delegate bridge returned ${delegatedResult.status}.`);
                } else {
                    throw new Error(`Delegate bridge returned non-terminal status '${delegatedResult.status}'.`);
                }
            } catch (error) {
                if (!shouldFallbackToHall(error)) {
                    throw error;
                }

                const response = await this.requestViaMimir({
                    prompt,
                    caller: { source: 'runtime:host-worker', sector_path: targetPath },
                    metadata: {
                        one_mind_boundary: 'subagent',
                        execution_role: 'subagent',
                    },
                    transport_mode: 'synapse_db',
                });

                if (response.status !== 'success' || !response.raw_text) {
                    throw new Error(response.error || 'Failed to retrieve code from One Mind.');
                }

                newContent = extractCodeBlock(response.raw_text);
            }

            this.mkdirSync(path.dirname(absoluteTargetPath), { recursive: true });
            this.writeFileSync(absoluteTargetPath, newContent, 'utf-8');

            if (bead.checker_shell) {
                const [cmd, ...args] = bead.checker_shell.trim().split(/\s+/);
                if (cmd === 'npx' || cmd === 'node') {
                    await this.runner(cmd, args, { cwd: projectRoot });
                } else {
                    await this.runner(cmd, args, { cwd: projectRoot, shell: true });
                }
            }

            const metadata: HostWorkerWeaveMetadata = {
                context_policy: 'project',
                delegated,
                provider: delegatedProvider,
            };
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `Host worker successfully implemented and verified bead ${payload.bead_id}.`,
                metadata,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Host worker failed: ${message}`,
            };
        }
    }
}
