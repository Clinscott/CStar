import { RuntimeAdapter, WeaveInvocation, RuntimeContext, WeaveResult } from './contracts.js';
import { execa } from 'execa';
import { createGungnirMatrix } from '../../../types/gungnir.js';
import { PythonSkillAdapter } from './python_adapter.js';

export interface RegistryEntry {
    tier: string;
    description: string;
    instruction_path?: string;
    execution: {
        mode: string;
        cli?: string;
        adapter_id?: string;
        script_path?: string;
        ownership_model?: string;
    };
}

/**
 * [🔱] UNIVERSAL ADAPTER
 * Wraps dynamically discovered skills and weaves from the skill registry.
 */
export class UniversalAdapter implements RuntimeAdapter {
    public readonly id: string;
    private config: RegistryEntry;

    constructor(id: string, config: RegistryEntry) {
        this.id = id;
        this.config = config;
    }

    public async execute(invocation: WeaveInvocation<any>, context: RuntimeContext): Promise<WeaveResult> {
        if (this.config.execution.ownership_model === 'host-workflow') {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "Capability '${this.id}' is cataloged as a host-workflow. The Node kernel may register it, but must not execute it."`,
                metadata: {
                    execution_boundary: 'host-native-required',
                    ownership_model: 'host-workflow',
                },
            };
        }

        // If it's kernel-backed and has a script path, delegate to Python adapter
        if (this.config.execution.mode === 'kernel-backed' && this.config.execution.script_path) {
            const pythonAdapter = new PythonSkillAdapter(this.id, this.config.execution.script_path);
            return pythonAdapter.execute(invocation, context);
        }

        // If it's kernel-backed but we ended up here (no script_path), the native TS adapter is missing!
        if (this.config.execution.mode === 'kernel-backed') {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "The kernel-backed adapter for '${this.id}' was not found in the runtime."`
            };
        }

        // If it's agent-native and has a CLI command
        if (this.config.execution.mode === 'agent-native' && this.config.execution.cli) {
            try {
                // Parse CLI string to command + args
                const parts = this.config.execution.cli.split(' ');
                const command = parts[0];
                const args = parts.slice(1);

                // Add any payload params as args or env vars
                if (invocation.payload) {
                    if (typeof invocation.payload === 'object' && invocation.payload !== null) {
                        for (const [key, value] of Object.entries(invocation.payload)) {
                            if (typeof value === 'boolean') {
                                if (value) args.push(`--${key}`);
                            } else if (typeof value === 'string' || typeof value === 'number') {
                                args.push(`--${key}`, String(value));
                            }
                        }
                    } else if (typeof invocation.payload === 'string') {
                        args.push(invocation.payload);
                    }
                }

                const result = await execa(command, args, {
                    cwd: context.workspace_root,
                    env: context.env,
                    reject: false // don't throw on non-zero exit, capture it
                });

                return {
                    weave_id: this.id,
                    status: result.exitCode === 0 ? 'SUCCESS' : 'FAILURE',
                    output: result.stdout || result.stderr,
                    metrics_delta: createGungnirMatrix(),
                    error: result.exitCode !== 0 ? result.stderr || 'Command failed' : undefined
                };
            } catch (err: any) {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `[ALFRED]: "Execution of universal adapter failed: ${err.message}"`
                };
            }
        }

        // Fallback for unknown execution modes
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: `[ALFRED]: "The universal adapter cannot determine how to execute mode '${this.config.execution.mode}'."`
        };
    }
}
