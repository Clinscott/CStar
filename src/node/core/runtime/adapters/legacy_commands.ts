/** Stable retirement code for every legacy dynamic-command entrypoint. */
export const RETIRED_DYNAMIC_COMMAND_FAILURE =
    'legacy_dynamic_command_adapter_retired_use_cstar_kernel';

/**
 * The legacy Python resolver is retained only for import compatibility.
 * It must never inspect the filesystem or choose an interpreter.
 */
export function resolvePythonPath(_projectRoot: string): never {
    throw new Error(RETIRED_DYNAMIC_COMMAND_FAILURE);
}

/** Registry-backed command discovery is retired and always exposes no commands. */
export function loadSkillRegistryManifest(_projectRoot: string): Map<string, string> {
    return new Map();
}

/** Filesystem-backed command discovery is retired and always exposes no commands. */
export function discoverLegacyCommands(_projectRoot: string): Map<string, string> {
    return new Map();
}

export function retiredDynamicCommandMetadata(): Record<string, unknown> {
    return {
        failure_code: RETIRED_DYNAMIC_COMMAND_FAILURE,
        execution_boundary: 'retired-dynamic-command',
        execution_dispatched: false,
        hall_mutation_started: false,
        provider_attempted: false,
        process_started: false,
        source_access_started: false,
    };
}
