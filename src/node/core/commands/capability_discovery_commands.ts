import type { Command } from 'commander';

export interface CapabilityDiscoveryHandlers {
    manifest?: (options: { json?: boolean }) => void | Promise<void>;
    skillInfo?: (name: string, options: { json?: boolean }) => void | Promise<void>;
}

export function registerCapabilityDiscoveryCommands(
    program: Command,
    handlers: CapabilityDiscoveryHandlers = {},
): void {
    program
        .command('manifest')
        .description('List all registered Agent Skills and runtime Weaves')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action(async (options: { json?: boolean }) => {
            await handlers.manifest?.(options);
        });

    program
        .command('skill-info <name>')
        .description('Inspect the mandate and logic protocol of a specific skill')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .action(async (name: string, options: { json?: boolean }) => {
            await handlers.skillInfo?.(name, options);
        });
}
