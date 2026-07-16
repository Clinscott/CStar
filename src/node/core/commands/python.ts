import type { Command } from 'commander';

export const PYTHON_COMMAND_REGISTRARS_RETIRED_ERROR =
    'legacy_python_command_registrars_retired_use_cstar_kernel';

const RETIRED_PYTHON_COMMANDS = [
    { name: 'dominion', description: 'Retired Python UI launcher' },
    { name: 'odin', description: 'Retired Python protocol launcher' },
    { name: 'dormancy', alias: 'sleep', description: 'Retired dormancy launcher' },
    { name: 'skill', description: 'Retired dynamic Python skill launcher' },
    { name: 'lore', description: 'Retired Python lore launcher' },
    { name: 'recreate', description: 'Retired Python narrative launcher' },
] as const;

/**
 * Import-compatible tombstones for Python-backed CLI routes that are absent
 * from the canonical cstar.ts surface. Parsing any route fails before Python,
 * filesystem, environment, process, or callback access.
 */
export function registerPythonSpokes(program: Command, _projectRoot: string): void {
    for (const descriptor of RETIRED_PYTHON_COMMANDS) {
        const command = program
            .command(`${descriptor.name} [args...]`)
            .description(descriptor.description)
            .allowUnknownOption(true);
        if ('alias' in descriptor) command.alias(descriptor.alias);
        command.action(() => {
            throw new Error(`${PYTHON_COMMAND_REGISTRARS_RETIRED_ERROR}:${descriptor.name}`);
        });
    }
}
