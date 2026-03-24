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
import { mimir } from  '../../../../core/mimir_client.js';

export class HostWorkerWeave implements RuntimeAdapter<HostWorkerWeavePayload> {
    public readonly id = 'weave:host-worker';
    private readonly runner: typeof execa;

    public constructor(runner: typeof execa = execa) {
        this.runner = runner;
    }

    public async execute(
        invocation: WeaveInvocation<HostWorkerWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;

        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const beads = getHallBeads(repoId);
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
             // [🔱] THE ONE MIND SHIFT: Queue the request in Synapse DB and wait for agentic fulfillment.
             // We set a long poll time because the agent (me) might take a turn to provide the answer.
             const response = await mimir.request({
                 prompt,
                 caller: { source: 'runtime:host-worker', sector_path: targetPath },
                 transport_mode: 'synapse_db'
             });

             if (response.status !== 'success' || !response.raw_text) {
                 throw new Error(response.error || 'Failed to retrieve code from One Mind.');
             }

             const newContent = extractCodeBlock(response.raw_text);
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
