import { RuntimeAdapter, WeaveInvocation, RuntimeContext, WeaveResult } from './contracts.js';
import { execa } from 'execa';
import { createGungnirMatrix } from '../../../types/gungnir.js';
import { getPythonPath } from '../python_utils.js';
import path from 'node:path';
import { RegistryEntry } from './universal_adapter.js';

/**
 * [🔱] PYTHON SKILL ADAPTER
 * Purpose: First-class execution of Python skills within the CStar Dispatcher.
 */
export class PythonSkillAdapter implements RuntimeAdapter {
    public readonly id: string;
    private scriptPath: string;

    constructor(id: string, scriptPath: string) {
        this.id = id;
        this.scriptPath = scriptPath;
    }

    public async execute(invocation: WeaveInvocation<any>, context: RuntimeContext): Promise<WeaveResult> {
        const pythonPath = getPythonPath();
        const absoluteScriptPath = path.isAbsolute(this.scriptPath) 
            ? this.scriptPath 
            : path.join(context.workspace_root, this.scriptPath);

        try {
            // CStar Python skills usually expect JSON via CLI or stdin
            const args = [absoluteScriptPath];
            
            // Serialize payload to JSON for the Python skill
            const payload = invocation.payload || {};
            const payloadJson = JSON.stringify(payload);

            // Also pass as CLI flags for scripts that use argparse
            if (typeof payload === 'object' && payload !== null) {
                for (const [key, value] of Object.entries(payload)) {
                    if (typeof value === 'boolean') {
                        if (value) args.push(`--${key}`);
                    } else if (typeof value === 'string' || typeof value === 'number') {
                        args.push(`--${key}`, String(value));
                    }
                }
            }
            
            const result = await execa(pythonPath, args, {
                cwd: context.workspace_root,
                env: { 
                    ...context.env, 
                    PYTHONPATH: context.workspace_root,
                    CSTAR_SKILL_PAYLOAD: payloadJson 
                },
                input: payloadJson, // Also provide via stdin for versatility
                reject: false
            });

            // Try to parse Python output as JSON if possible
            let output = result.stdout;
            let metadata = {};
            try {
                const parsed = JSON.parse(result.stdout);
                if (parsed.output) output = parsed.output;
                if (parsed.metadata) metadata = parsed.metadata;
            } catch {
                // Not JSON, use raw stdout
            }

            return {
                weave_id: this.id,
                status: result.exitCode === 0 ? 'SUCCESS' : 'FAILURE',
                output: output || result.stderr,
                metrics_delta: createGungnirMatrix(),
                metadata: metadata,
                error: result.exitCode !== 0 ? result.stderr || 'Python skill failed' : undefined
            };
        } catch (err: any) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "Python skill execution failed: ${err.message}"`
            };
        }
    }
}
