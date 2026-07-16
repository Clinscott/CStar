import type { Command } from 'commander';

export interface BifrostGuide {
    summary: string;
    primary_servers: string[];
    recommended_path: string;
}

export interface BifrostDependencies {
    hostTextInvoker?: (...args: never[]) => unknown;
    projectRoot?: () => string;
}

export const BIFROST_COMMAND_RETIRED_ERROR =
    'legacy_bifrost_command_retired_use_cstar_manifest';

export function buildStaticGuide(): BifrostGuide {
    return {
        summary: 'Corvus Star exposes its current capabilities through the bounded manifest surface.',
        primary_servers: ['cstar-kernel'],
        recommended_path: 'Use cstar manifest or the typed cstar-kernel MCP inventory.',
    };
}

export function parseBifrostGuide(raw: string): BifrostGuide {
    const parsed = JSON.parse(raw) as Partial<BifrostGuide>;
    if (
        typeof parsed.summary !== 'string'
        || typeof parsed.recommended_path !== 'string'
        || !Array.isArray(parsed.primary_servers)
        || !parsed.primary_servers.every((entry) => typeof entry === 'string')
    ) {
        throw new Error('invalid_bifrost_guide');
    }
    return {
        summary: parsed.summary,
        primary_servers: [...parsed.primary_servers],
        recommended_path: parsed.recommended_path,
    };
}

export function renderBifrostGuide(guide: BifrostGuide): string {
    return [
        guide.summary,
        '',
        'Primary servers:',
        ...guide.primary_servers.map((server) => `- ${server}`),
        '',
        `Recommended path: ${guide.recommended_path}`,
    ].join('\n');
}

/** Compatibility helper retained only as a no-effect failure boundary. */
export async function resolveBifrostGuide(
    _env: NodeJS.ProcessEnv,
    _dependencies: BifrostDependencies = {},
    _hostGuide = false,
): Promise<never> {
    throw new Error(BIFROST_COMMAND_RETIRED_ERROR);
}

/** Register a tombstone that never resolves a provider or invokes a callback. */
export function registerBifrostCommand(
    program: Command,
    _dependencies: BifrostDependencies = {},
): void {
    program
        .command('bifrost [args...]')
        .description('Retired: use cstar manifest or typed cstar-kernel inventory')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(BIFROST_COMMAND_RETIRED_ERROR);
        });
}
