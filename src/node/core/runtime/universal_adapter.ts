import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from './contracts.js';
import {
    RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE,
    retiredUniversalPythonAdapterMetadata,
} from './python_adapter.js';

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

/** Import-compatible tombstone for the retired generic registry adapter. */
export class UniversalAdapter implements RuntimeAdapter {
    public readonly id: string;

    constructor(id: string, _config: RegistryEntry) {
        this.id = id;
    }

    public async execute(
        _invocation: WeaveInvocation<unknown>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE,
            metadata: retiredUniversalPythonAdapterMetadata(),
        };
    }
}
