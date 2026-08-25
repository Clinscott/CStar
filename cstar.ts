#!/usr/bin/env tsx

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
    registerCapabilityDiscoveryCommands,
    type ManifestCommandOptions,
    type SkillInfoCommandOptions,
} from './src/node/core/commands/capability_discovery_commands.js';
import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
    renderCapabilityInfoLines,
    renderCapabilityManifestLines,
} from './src/node/core/commands/capability_discovery.js';
import { registerDispatcher } from './src/node/core/commands/dispatcher.js';
import { registerRunSkillCommand } from './src/node/core/commands/run-skill.js';
import { registerAuguryCommand, registerTraceCommand } from './src/node/core/commands/trace.js';
import { getLaunchCwd, installWorkspaceSelectionHook, selectWorkspaceRoot } from './src/node/core/launcher.js';
import { bootstrapRuntime } from './src/node/core/runtime/bootstrap.js';
import { RuntimeDispatcher } from './src/node/core/runtime/dispatcher.js';
import { summarizeCommandSurfaces } from './src/node/core/runtime/entry_surface.js';
import { StateRegistry } from './src/node/core/state.js';
import { registry } from './src/tools/pennyone/pathRegistry.js';

export const RETIRED_CLI_ROUTE_ERROR =
    'legacy_cli_runtime_route_retired_use_cstar_kernel';

const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));
process.env.CSTAR_CONTROL_ROOT ||= PROJECT_ROOT;
const pkg = JSON.parse(fs.readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as {
    version: string;
};
const launchCwd = getLaunchCwd();
const selectedWorkspaceRoot = selectWorkspaceRoot(process.argv.slice(2), launchCwd);
const program = new Command();

function activeAdapterIds(): Set<string> {
    return new Set(RuntimeDispatcher.getInstance().listAdapterIds());
}

function registerRetiredRoute(name: string, description: string): void {
    program
        .command(`${name} [args...]`)
        .description(`Retired: ${description}`)
        .allowUnknownOption(true)
        .action(() => {
            console.error(chalk.red(`${RETIRED_CLI_ROUTE_ERROR}:${name}`));
            process.exitCode = 1;
        });
}

function registerStatusCommand(): void {
    program
        .command('status')
        .description('Read the local projected framework status without dispatching work')
        .option('--json', 'Emit machine-readable JSON')
        .action((options: { json?: boolean }) => {
            const snapshot = StateRegistry.get();
            const payload = {
                status: snapshot.framework.status,
                workspace: registry.getRoot(),
                mission_id: snapshot.framework.mission_id ?? null,
                runtime_adapter_ids: RuntimeDispatcher.getInstance().listAdapterIds(),
                lifecycle_authority: 'cstar-kernel-mcp',
            };
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            console.log(chalk.cyan('\n◤ CSTAR PROJECTED STATUS ◢'));
            console.log(`status: ${payload.status}`);
            console.log(`workspace: ${payload.workspace}`);
            console.log(`mission_id: ${payload.mission_id ?? 'none'}`);
            console.log('runtime adapters: disabled');
            console.log('lifecycle authority: cstar-kernel MCP');
        });
}

function registerCapabilityCommands(): void {
    registerCapabilityDiscoveryCommands(program, {
        manifest: (options: ManifestCommandOptions) => {
            const payload = buildCapabilityManifestPayload(PROJECT_ROOT, activeAdapterIds());
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderCapabilityManifestLines(payload)) console.log(line);
        },
        skillInfo: (name: string, options: SkillInfoCommandOptions) => {
            const payload = buildCapabilityInfoPayload(PROJECT_ROOT, name, activeAdapterIds());
            if (!payload) {
                console.error(chalk.red(`Capability '${name}' not found in registry.`));
                process.exitCode = 1;
                return;
            }
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderCapabilityInfoLines(payload)) console.log(line);
        },
    });
}

async function main(): Promise<void> {
    bootstrapRuntime();
    const commandSurfaces = summarizeCommandSurfaces(PROJECT_ROOT);

    program
        .name('cstar')
        .description('Corvus Star deterministic control-plane inspection CLI')
        .version(pkg.version)
        .option('-r, --root <path>', 'Select workspace root for read-only commands', selectedWorkspaceRoot)
        .addHelpText('after', `
Runtime authority cutoff:
  Supported here: status, manifest, skill-info, trace, augury.
  Retired here: run-skill, orchestrate, evolve, evolve-temporal, forge.
  Declared host-only capabilities: ${commandSurfaces.hostOnly.length}.
  Lifecycle mutation and Forge execution require the typed cstar-kernel MCP surface.
`);

    installWorkspaceSelectionHook(program, launchCwd);
    registerStatusCommand();
    registerCapabilityCommands();
    registerAuguryCommand(program, () => registry.getRoot());
    registerTraceCommand(program, () => registry.getRoot());
    registerRunSkillCommand(program);
    registerRetiredRoute('orchestrate', 'use cstar-kernel lifecycle and Forge request/execute');
    registerRetiredRoute('evolve', 'use cstar-kernel proposal inspection and authorized workflow');
    registerRetiredRoute('evolve-temporal', 'use deterministic kernel inspection');
    registerRetiredRoute('forge', 'use cstar_forge_request then cstar_forge_execute');
    registerDispatcher(program, () => registry.getRoot());

    await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(message));
    process.exitCode = 1;
});
