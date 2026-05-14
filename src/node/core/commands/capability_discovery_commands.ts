import type { Command } from 'commander';

export type CapabilityScope = 'hub' | 'spoke' | 'all';

export interface ManifestCommandOptions {
    json?: boolean;
    scope?: CapabilityScope;
    spoke?: string;
}

export interface SkillInfoCommandOptions {
    json?: boolean;
    spoke?: string;
}

export interface CapabilityDiscoveryHandlers {
    manifest?: (options: ManifestCommandOptions) => void | Promise<void>;
    skillInfo?: (name: string, options: SkillInfoCommandOptions) => void | Promise<void>;
}

export function registerCapabilityDiscoveryCommands(
    program: Command,
    handlers: CapabilityDiscoveryHandlers = {},
): void {
    program
        .command('manifest')
        .description('List registered capabilities (hub registry and/or spoke-local SKILL.md walks)')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .option('--scope <scope>', 'Capability source: hub (default), spoke, or all')
        .option('--spoke <slug>', 'When scope=spoke or scope=all, narrows spoke walk to this slug')
        .action(async (options: ManifestCommandOptions) => {
            await handlers.manifest?.(options);
        });

    program
        .command('skill-info <name>')
        .description('Inspect the mandate and logic protocol of a specific skill (hub or <slug>:<id>)')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .option('--spoke <slug>', 'Optional override of the spoke slug parsed from the id')
        .action(async (name: string, options: SkillInfoCommandOptions) => {
            await handlers.skillInfo?.(name, options);
        });
}
