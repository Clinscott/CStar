import { RuntimeAdapter, WeaveInvocation, RuntimeContext, WeaveResult } from './contracts.js';
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
        if (this.config.execution.mode === 'agent-native') {
            const ownershipModel = this.config.execution.ownership_model ?? 'agent-native';
            const executionHint = ownershipModel === 'host-workflow'
                ? 'The Node kernel may register it, but must not execute it.'
                : 'The active host session must own execution, not the generic kernel adapter.';
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "Capability '${this.id}' is cataloged as agent-native. ${executionHint}"`,
                metadata: {
                    execution_boundary: 'host-native-required',
                    execution_mode: 'agent-native',
                    ownership_model: ownershipModel,
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

        // Fallback for unknown execution modes
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: `[ALFRED]: "The universal adapter cannot determine how to execute mode '${this.config.execution.mode}'."`
        };
    }
}
