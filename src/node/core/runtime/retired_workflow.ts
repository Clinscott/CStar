import type { WeaveResult } from './contracts.js';

export function retiredWorkflowResult(
    weaveId: string,
    replacement: string,
): WeaveResult {
    return {
        weave_id: weaveId,
        status: 'FAILURE',
        output: '',
        error: `${weaveId} is decommissioned and cannot execute, mutate lifecycle state, write memory, spawn workers, or invoke models. ${replacement}`,
        metadata: {
            decommissioned: true,
            execution_attempted: false,
            mutation_performed: false,
            model_invoked: false,
            replacement,
        },
    };
}
