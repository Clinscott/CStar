import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';

export interface AutobotArgs {
    intent: string;
    project_root?: string;
    target_paths?: string[];
    payload?: {
        hermes_profile?: string;
        model?: string;
        expected_output?: 'markdown' | 'json' | 'plain';
        max_chars?: number;
        session_name?: string | null;
        write_to?: string | null;
        append_with_separator?: string | null;
        tags?: string[];
        timeout_seconds?: number;
    };
}

export function isAutobotMcpEnabled(): boolean {
    return process.env.CSTAR_KERNEL_ENABLE_AUTOBOT !== '0' && process.env.HERMES_AUTOBOT_DELEGATED !== '1';
}

export async function handleAutobot(args: AutobotArgs): Promise<McpTextResponse> {
    if (!isAutobotMcpEnabled()) {
        return errorResponse(new Error('Unauthorized tool call: cstar_autobot is disabled or blocked in this context.'));
    }

    try {
        const root = registry.getRoot();
        const projectRoot = args.project_root || root;
        const intentObj = {
            intent: args.intent,
            project_root: projectRoot,
            target_paths: args.target_paths || [],
            payload: args.payload || {},
        };

        const os = await import('node:os');
        const fsp = await import('node:fs/promises');
        const path = await import('node:path');
        const cp = await import('node:child_process');

        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'autobot-intent-'));
        const intentPath = path.join(tmpDir, 'intent.json');
        await fsp.writeFile(intentPath, JSON.stringify(intentObj, null, 2));

        const scriptPath = path.join(root, '.agents', 'skills', 'autobot', 'scripts', 'delegate.py');
        const timeoutSec = args.payload?.timeout_seconds ?? 300;
        const subprocessTimeoutMs = (timeoutSec + 30) * 1000;

        const constrainedEnv = {
            ...process.env,
            NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc',
            HERMES_AUTOBOT_DELEGATED: '',
        };

        const result = cp.spawnSync(
            'python3',
            [scriptPath, '--intent-file', intentPath],
            {
                encoding: 'utf-8',
                timeout: subprocessTimeoutMs,
                env: constrainedEnv,
            },
        );

        try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }

        if (result.error) {
            return textResponse({
                status: 'degraded',
                degraded_reason: `mcp_subprocess_error:${result.error.message}`,
                intent_summary: args.intent.slice(0, 160),
            }, true);
        }
        if (result.status === 2) {
            return textResponse({
                status: 'invalid_intent',
                error: result.stderr.trim() || 'unknown_validation_error',
            }, true);
        }
        try {
            const envelope = JSON.parse(result.stdout);
            const isError = envelope.status !== 'ok';
            return textResponse(envelope, isError);
        } catch (parseErr: any) {
            return textResponse({
                status: 'degraded',
                degraded_reason: `envelope_parse_failed:${parseErr.message}`,
                raw_stdout: result.stdout.slice(0, 500),
                raw_stderr: result.stderr.slice(0, 500),
            }, true);
        }
    } catch (error: any) {
        return errorResponse(error);
    }
}
