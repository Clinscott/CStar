import { fileURLToPath } from 'node:url';

export interface EnvironmentBootstrapReport {
    mutated: false;
    provider_flags_injected: false;
    status: 'retired';
    authority_surface: 'operator_environment';
}

/**
 * Compatibility probe retained for callers that still import bootstrapEnv.
 * Routine startup must never create `.env` or select a provider implicitly.
 */
export function bootstrapEnv(): EnvironmentBootstrapReport {
    return {
        mutated: false,
        provider_flags_injected: false,
        status: 'retired',
        authority_surface: 'operator_environment',
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.stdout.write(`${JSON.stringify(bootstrapEnv())}\n`);
}
