import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';

import type {
    AutobotWeaveMetadata,
    AutobotWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { RUNTIME_KERNEL_ROOT } from '../kernel_root.ts';

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
        throw new Error('AutoBot weave did not return a JSON payload.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

export class AutoBotWeave implements RuntimeAdapter<AutobotWeavePayload> {
    public readonly id = 'weave:autobot';
    private readonly runner: typeof execa;

    public constructor(runner: typeof execa = execa) {
        this.runner = runner;
    }

    public async execute(
        invocation: WeaveInvocation<AutobotWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        if (!payload.bead_id && !payload.claim_next) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'AutoBot execution requires a bead_id or claim_next=true.',
            };
        }

        const kernelRoot = RUNTIME_KERNEL_ROOT;
        const targetRoot = context.workspace_root;
        const scriptPath = path.join(kernelRoot, '.agents', 'skills', 'autobot', 'scripts', 'autobot.py');
        const args = [scriptPath, '--project-root', targetRoot];

        if (payload.bead_id) {
            args.push('--bead-id', payload.bead_id);
        } else {
            args.push('--claim-next');
        }
        if (payload.checker_shell) {
            // THE GAUNTLET: Wrap the checker shell in a phantom sync and fast-failing syntax checker
            const targetPath = context.workspace_root; 
            const syncScript = path.join(RUNTIME_KERNEL_ROOT, 'src', 'node', 'core', 'runtime', 'sync_slice.ts');
            const syncCommand = `npx tsx ${syncScript} "${targetPath}" "${payload.bead_id}"`;
            
            const isTs = fs.existsSync(path.join(targetPath, 'tsconfig.json'));
            const syntaxCheck = isTs ? `npx tsc --noEmit && ` : ``;
            
            args.push('--checker-shell', `${syncCommand} && ${syntaxCheck}${payload.checker_shell}`);
        }
        if (payload.max_attempts !== undefined) {
            args.push('--max-attempts', String(payload.max_attempts));
        }
        if (payload.timeout !== undefined) {
            args.push('--timeout', String(payload.timeout));
        }
        if (payload.startup_timeout !== undefined) {
            args.push('--startup-timeout', String(payload.startup_timeout));
        }
        if (payload.checker_timeout !== undefined) {
            args.push('--checker-timeout', String(payload.checker_timeout));
        }
        if (payload.grace_seconds !== undefined) {
            args.push('--grace-seconds', String(payload.grace_seconds));
        }
        if (payload.agent_id) {
            args.push('--agent-id', payload.agent_id);
        }
        if (payload.worker_note) {
            args.push('--worker-note', payload.worker_note);
        }
        if (payload.autobot_dir) {
            args.push('--autobot-dir', payload.autobot_dir);
        }
        if (payload.command) {
            args.push('--command', payload.command);
        }
        for (const commandArg of payload.command_args ?? []) {
            args.push('--command-arg', commandArg);
        }
        if (payload.ready_regex) {
            args.push('--ready-regex', payload.ready_regex);
        }
        for (const doneRegex of payload.done_regexes ?? []) {
            args.push('--done-regex', doneRegex);
        }
        for (const [key, value] of Object.entries(payload.env ?? {})) {
            args.push('--env', `${key}=${value}`);
        }
        if (payload.stream) {
            args.push('--stream');
        }

        const { stdout } = await this.runner(resolvePythonPath(kernelRoot), args, {
            cwd: kernelRoot,
            env: { ...context.env, PYTHONPATH: kernelRoot },
        });
        const result = extractJsonObject(stdout) as AutobotWeaveMetadata & {
            status?: string;
            summary?: string;
        };

        return {
            weave_id: this.id,
            status: String(result.status) === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
            output: String(result.summary ?? 'AutoBot execution completed.'),
            error: String(result.status) === 'SUCCESS' ? undefined : String(result.summary ?? 'AutoBot execution failed.'),
            metadata: result,
        };
    }
}
