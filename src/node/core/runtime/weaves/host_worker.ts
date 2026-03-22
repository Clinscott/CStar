import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

import type {
    HostWorkerWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, type HostTextInvoker } from './host_bridge.ts';
import { getHallBeads } from '../../../../tools/pennyone/intel/database.ts';
import { resolveRuntimeHostProvider } from './host_bridge.ts';

function extractCodeBlock(text: string): string {
    const lines = text.split('\n');
    let code = '';
    let inBlock = false;
    for (const line of lines) {
        if (line.startsWith('```')) {
            if (inBlock) {
                return code.trim();
            }
            inBlock = true;
            continue;
        }
        if (inBlock) {
            code += line + '\n';
        }
    }
    return text.trim();
}

export class HostWorkerWeave implements RuntimeAdapter<HostWorkerWeavePayload> {
    public readonly id = 'weave:host-worker';
    private readonly runner: typeof execa;

    public constructor(runner: typeof execa = execa, private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker) {
        this.runner = runner;
    }

    public async execute(
        invocation: WeaveInvocation<HostWorkerWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const provider = resolveRuntimeHostProvider(context);

        if (!provider) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Host worker requires an active host session.',
            };
        }

        const beads = getHallBeads(projectRoot);
        const bead = beads.find(b => b.id === payload.bead_id);

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
        const targetContent = fs.existsSync(absoluteTargetPath) ? fs.readFileSync(absoluteTargetPath, 'utf-8') : '';

        const testPaths = bead.contract_refs ?? [];
        let testContents = '';
        for (const testPath of testPaths) {
             const absoluteTestPath = path.resolve(projectRoot, testPath);
             if (fs.existsSync(absoluteTestPath)) {
                  testContents += `\n--- ${testPath} ---\n${fs.readFileSync(absoluteTestPath, 'utf-8')}\n`;
             }
        }

        const prompt = [
            'You are the Corvus Star Host Worker.',
            'Your task is to implement the requested changes to pass the provided TDD tests.',
            `BEAD RATIONALE: ${bead.rationale}`,
            `ACCEPTANCE CRITERIA: ${bead.acceptance_criteria}`,
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

        try {
             const response = await this.hostTextInvoker({
                 prompt,
                 provider,
                 projectRoot,
                 source: 'runtime:host-worker',
                 env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
             });

             const newContent = extractCodeBlock(response);
             fs.mkdirSync(path.dirname(absoluteTargetPath), { recursive: true });
             fs.writeFileSync(absoluteTargetPath, newContent, 'utf-8');

             if (bead.checker_shell) {
                 const [cmd, ...args] = bead.checker_shell.trim().split(/\s+/);
                 if (cmd === 'npx' || cmd === 'node') {
                     await this.runner(cmd, args, { cwd: projectRoot });
                 } else {
                     await this.runner(cmd, args, { cwd: projectRoot, shell: true });
                 }
             }

             return {
                 weave_id: this.id,
                 status: 'SUCCESS',
                 output: `Host worker successfully implemented and verified bead ${payload.bead_id}.`,
             };
        } catch (error: any) {
             return {
                 weave_id: this.id,
                 status: 'FAILURE',
                 output: '',
                 error: `Host worker failed: ${error.message}`,
             };
        }
    }
}
