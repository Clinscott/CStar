import type {
    ArchitectServicePayload,
    RuntimeContext,
    WeaveResult,
} from '../contracts.js';

export const ARCHITECT_SERVICE_RETIRED_ERROR =
    'legacy_architect_service_retired_use_host_native_skill';

export const deps = Object.freeze({ compatibility: 'retired' as const });

/** Retired before provider selection, callback invocation, or prompt assembly. */
export async function executeArchitectService(
    _payload: ArchitectServicePayload,
    _context: RuntimeContext,
    ..._legacyArguments: unknown[]
): Promise<WeaveResult> {
    void _payload;
    void _context;
    void _legacyArguments;
    return {
        weave_id: 'weave:architect',
        status: 'FAILURE',
        output: '',
        error: ARCHITECT_SERVICE_RETIRED_ERROR,
        metadata: {
            compatibility: 'retired',
            provider_attempted: false,
            callback_invoked: false,
            source_access_started: false,
            hall_mutation_started: false,
        },
    };
}
