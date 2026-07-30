import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from './contracts.js';

/** Stable retirement code for direct universal/Python adapter construction. */
export const RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE =
    'legacy_universal_python_adapter_retired_use_cstar_kernel';

export function retiredUniversalPythonAdapterMetadata(): Record<string, unknown> {
    return {
        failure_code: RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE,
        execution_boundary: 'retired-universal-python-adapter',
        execution_dispatched: false,
        hall_mutation_started: false,
        provider_attempted: false,
        process_started: false,
        source_access_started: false,
    };
}

/**
 * Import-compatible tombstone for the retired generic Python execution lane.
 * Supported Python work must be exposed by a bounded kernel primitive instead.
 */
export class PythonSkillAdapter implements RuntimeAdapter {
    public readonly id: string;

    constructor(id: string, _scriptPath: string) {
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
