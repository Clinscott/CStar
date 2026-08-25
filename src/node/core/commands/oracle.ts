import type { Command } from 'commander';

import type { WorkspaceRootSource } from '../runtime/invocation.js';

export const ORACLE_COMMAND_RETIRED_ERROR =
    'legacy_oracle_command_retired_use_authorized_researcher';

export interface OracleDependencies {
    hostTextInvoker?: (...args: never[]) => unknown;
    databaseFactory?: (...args: never[]) => unknown;
    fileSystem?: Record<string, unknown>;
}

/**
 * Register an import-compatible tombstone. Dependencies and workspace sources
 * are accepted only to preserve callers and are never evaluated.
 */
export function registerOracleCommand(
    program: Command,
    _workspaceRootSource: WorkspaceRootSource = '',
    _dependencies: OracleDependencies = {},
): void {
    program
        .command('oracle [args...]')
        .description('Retired: use the authorized Researcher or cstar-kernel route')
        .allowUnknownOption(true)
        .action(() => {
            throw new Error(ORACLE_COMMAND_RETIRED_ERROR);
        });
}
