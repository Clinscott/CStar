#!/usr/bin/env tsx

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runStartupCeremony } from './src/node/ceremony.ts';

// Command Spokes
import { registerStartCommand } from './src/node/core/commands/start.ts';
import { registerPythonSpokes } from './src/node/core/commands/python.ts';
import { registerPennyOneCommand, buildPennyOneInvocation } from './src/node/core/commands/pennyone.ts';
import { registerRavenCommand } from './src/node/core/commands/ravens.ts';
import { registerDispatcher } from './src/node/core/commands/dispatcher.ts';
import { registerVitalsCommand } from './src/node/core/commands/vitals.ts';
import { registerRunSkillCommand } from './src/node/core/commands/run-skill.ts';
import { bootstrapRuntime } from './src/node/core/runtime/bootstrap.ts';
import { RuntimeDispatcher } from './src/node/core/runtime/dispatcher.ts';

import { registerBifrostCommand } from './src/node/core/commands/bifrost.ts';
import { registerOracleCommand } from './src/node/core/commands/oracle.ts';
import { registerTuiCommand } from './src/node/core/commands/tui.ts';
import { registerSpokeCommand } from './src/node/core/commands/spoke.ts';
import { registerOsCommands } from './src/node/core/commands/os-integration.ts';
import { registerOneMindCommand } from './src/node/core/commands/one-mind.ts';
import { registerTraceCommand } from './src/node/core/commands/trace.ts';
import { registerHallDocumentCommand } from './src/node/core/commands/hall-doc.ts';
import { registerCapabilityDiscoveryCommands } from './src/node/core/commands/capability_discovery_commands.js';
import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
    renderCapabilityInfoLines,
    renderCapabilityManifestLines,
} from './src/node/core/commands/capability_discovery.js';
import { renderOperationalContext, renderStandardCommandResult } from './src/node/core/commands/command_context.ts';
import { getLaunchCwd, installWorkspaceSelectionHook, selectWorkspaceRoot } from './src/node/core/launcher.ts';
import { StateRegistry } from './src/node/core/state.ts';
import { registry } from './src/tools/pennyone/pathRegistry.ts';
import { summarizeCommandSurfaces } from './src/node/core/runtime/entry_surface.ts';
import { runOperatorTui, shouldLaunchOperatorTui } from './src/node/core/tui/operator_tui.ts';
import { getHostProviderBanner, isHostSessionActive, resolveHostProvider } from './src/core/host_session.ts';

/**
 * 🔱 GUNGNIR CONTROL PLANE (v2.0)
 * Purpose: Sovereign entry point for Corvus Star.
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = __dirname;
process.env.CSTAR_CONTROL_ROOT = process.env.CSTAR_CONTROL_ROOT || PROJECT_ROOT;
const pkgPath = join(PROJECT_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const commandSurfaces = summarizeCommandSurfaces(PROJECT_ROOT);
const hostOnlySurfaceSummary = commandSurfaces.hostOnly.length > 0
    ? `  Host-only capabilities: ${commandSurfaces.hostOnly.slice(0, 6).join(', ')}${commandSurfaces.hostOnly.length > 6 ? ', ...' : ''}\n`
    : '';
const legacySurfaceSummary = commandSurfaces.compatibility.length > 0
    ? `  Legacy compatibility capabilities: ${commandSurfaces.compatibility.join(', ')}\n`
    : '  Legacy compatibility capabilities: disabled\n';
const launchCwd = getLaunchCwd();
const selectedWorkspaceRoot = selectWorkspaceRoot(process.argv.slice(2), launchCwd);

function getActiveAdapterIds(): Set<string> {
    const dispatcher = RuntimeDispatcher.getInstance();
    return new Set<string>(Array.from(((dispatcher as any).adapters as Map<string, any>).keys()));
}

const program = new Command();

(async () => {
    const isHelpOrVersion = process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--version') || process.argv.includes('-V');
    const isStart = process.argv.includes('start');
    const isSilent = process.argv.includes('--silent');
    const isJsonOutput = process.argv.includes('--json');
    const shouldStartTui = !isHelpOrVersion && shouldLaunchOperatorTui(process.argv.slice(2));
    const hostSessionActive = isHostSessionActive();
    const hostProvider = resolveHostProvider();

    if (!shouldStartTui && !isHelpOrVersion && isStart && !isSilent) {
        await runStartupCeremony();
    }

    if (hostSessionActive && !isHelpOrVersion && !isSilent && !isJsonOutput) {
        console.log(chalk.bgMagenta.white.bold(getHostProviderBanner(hostProvider)));
        console.log(chalk.magenta(' ' + '━'.repeat(40) + '\n'));
    }

    // [Ω] AWAKEN THE RUNTIME SPINE
    bootstrapRuntime();

    if (shouldStartTui) {
        await runOperatorTui(RuntimeDispatcher.getInstance());
        return;
    }

    program
        .name('cstar')
        .description('Corvus Star (C*) - The One Mind Framework (TypeScript Core)')
        .version(pkg.version)
        .option('-v, --verbose', 'Enable verbose logging for deep architectural traces')
        .option('-r, --root <path>', 'Select workspace root for operator commands', selectedWorkspaceRoot)
        .addHelpText('after', `
◈ COMMANDS
  start [target]   Awaken the system pulse or initiate a specific agent loop.
  ravens           Monitor and release the Raven Wardens (Muninn/Memory).
  status           Retrieve system vitals, mission traces, and perimeter reports.
  tui              Open the operator matrix shell.
  bifrost          Manage the Corvus Control & PennyOne MCP servers.
  spoke            Link, unlink, and inspect mounted estate spokes.
  hall [query]     Consult the Hall of Records or search the estate by intent.
  manifest         List all registered Agent Skills and runtime Weaves.
  skill-info <id>  Inspect the mandate and logic protocol of a specific skill.
  oracle           Consult the One Mind Host Agent via direct sampling.
  one-mind         Inspect or fulfill Hall-backed One Mind broker requests.
  trace           Show the active Hall-backed planning trace for the host CLI.
  [skill]          Directly invoke CLI-exposed skills from the registry.

◈ CAPABILITY SURFACES
  CLI-exposed capabilities: ${commandSurfaces.cli.length}
${hostOnlySurfaceSummary}${legacySurfaceSummary}

◈ PERSONA PROTOCOL
  The framework dynamically adjusts its logic and aesthetics based on the active persona
  defined in .agents/config.json.

  IF "O.D.I.N.": Focus on high-velocity creation and architectural disruption.
  IF "ALFRED":   Focus on maintenance, safety, and steady optimization.

◈ VERIFICATION MANDATE
  All changes must satisfy the Triad of Verification: Lore, Isolation, and Audit.
  Use 'cstar status' to verify the current Gungnir Score [Ω].

> "Synergy is the blood of the Totem. Without it, the system is but clay."
`);

    installWorkspaceSelectionHook(program, launchCwd);

    // --- Register Command Spokes ---
    registerStartCommand(program, () => registry.getRoot());
    registerPythonSpokes(program, PROJECT_ROOT);
    registerPennyOneCommand(program, () => registry.getRoot());
    registerRavenCommand(program, () => registry.getRoot());
    registerVitalsCommand(program);
    registerBifrostCommand(program);
    registerOracleCommand(program, () => registry.getRoot());
    registerOneMindCommand(program, () => registry.getRoot());
    registerTraceCommand(program, () => registry.getRoot());
    registerHallDocumentCommand(program);
    registerRunSkillCommand(program);
    registerTuiCommand(program);
    registerSpokeCommand(program, () => registry.getRoot());
    registerOsCommands(program);
    registerDispatcher(program, () => registry.getRoot());

    program
        .command('broadcast <message...>')
        .description('Post a global message to the War Room Blackboard')
        .action(async (message: string[]) => {
            const text = message.join(' ');
            const state = StateRegistry.get();
            StateRegistry.postToBlackboard({
                from: state.framework.active_persona,
                message: text,
                type: 'BROADCAST'
            });
            console.log(chalk.green(`[BROADCAST]: ${text}`));
        });

    program
        .command('hand <agent> <context...>')
        .description('Pass task focus and context to a specific agent')
        .action(async (agent: string, context: string[]) => {
            const targetAgent = agent.toLowerCase();
            const text = context.join(' ');
            const state = StateRegistry.get();

            if (state.agents && state.agents[targetAgent]) {
                state.agents[targetAgent].status = 'WORKING';
                state.agents[targetAgent].current_task = text;
                StateRegistry.save(state);

                StateRegistry.postToBlackboard({
                    from: state.framework.active_persona,
                    to: targetAgent,
                    message: text,
                    type: 'HANDOFF'
                });
                console.log(chalk.green(`[HANDOFF]: Context passed to ${targetAgent}.`));
            } else {
                console.error(chalk.red(`[FAILURE]: Unknown agent '${targetAgent}'.`));
                process.exit(1);
            }
        });

    program
        .command('orchestrate')
        .description('Initiate a sovereign execution cycle for SET beads')
        .option('-l, --limit <n>', 'Maximum beads to process in this tick', '1')
        .option('-p, --parallel <n>', 'Maximum concurrent workers', '1')
        .option('-t, --timeout <n>', 'Maximum execution time for each worker in seconds', '600')
        .option('-d, --dry-run', 'Simulate the swarm dispatch without execution')
        .action(async (options: { limit: string, parallel: string, timeout: string, dryRun?: boolean }) => {
            const projectRoot = registry.getRoot();
            const dispatchPort = RuntimeDispatcher.getInstance();

            console.log(chalk.cyan('\n ◤ ORCHESTRATOR: SWARM DISPATCH ◢ '));
            console.log(chalk.dim('━'.repeat(40)));

            // [Ω] SIGNAL TRAPPING: Catch Ctrl+C and reap workers
            process.on('SIGINT', async () => {
                console.log(chalk.yellow('\n[ORCHESTRATOR]: Interruption detected. Initiating emergency reap...'));
                await dispatchPort.shutdown();
                process.exit(130);
            });

            const result = await dispatchPort.dispatch({
                weave_id: 'weave:orchestrate',
                payload: {
                    project_root: projectRoot,
                    cwd: process.cwd(),
                    max_parallel: parseInt(options.parallel),
                    limit: parseInt(options.limit),
                    tick_timeout: parseInt(options.timeout),
                    dry_run: options.dryRun
                }
            });

            if (result.status === 'SUCCESS') {
                console.log(chalk.green(`[SUCCESS]: ${result.output}`));
                renderOperationalContext(result, projectRoot);
                if (result.metadata?.bead_outcomes) {
                    const outcomes = result.metadata.bead_outcomes as any;
                    Object.entries(outcomes).forEach(([id, data]: [string, any]) => {
                        const statusColor = data.status === 'READY_FOR_REVIEW' ? chalk.green : chalk.red;
                        console.log(`  • ${chalk.white(id.padEnd(25))} : ${statusColor(data.status)}`);
                    });
                }
            } else {
                console.error(chalk.red(`[FAILURE]: ${result.error}`));
                process.exit(1);
            }

            console.log(chalk.dim('━'.repeat(40) + '\n'));
        });

    program
        .command('evolve')
        .description('Trigger Karpathy\'s Auto Researcher cycle for a specific bead')
        .option('-b, --bead <id>', 'The bead ID to evolve')
        .option('-p, --proposal <id>', 'The proposal ID to promote')
        .option('--action <action>', 'Action: propose or promote', 'propose')
        .option('--dry-run', 'Preview the evolution without implementing')
        .option('--no-simulate', 'Run live instead of simulated')
        .action(async (options: { bead?: string, proposal?: string, action: 'propose' | 'promote', dryRun?: boolean, simulate: boolean }) => {
            const dispatchPort = RuntimeDispatcher.getInstance();
            console.log(chalk.cyan('\n ◤ EVOLVE: AUTO RESEARCHER ◢ '));
            console.log(chalk.dim('━'.repeat(40)));

            const result = await dispatchPort.dispatch({
                weave_id: 'weave:evolve',
                payload: {
                    action: options.action,
                    bead_id: options.bead,
                    proposal_id: options.proposal,
                    dry_run: options.dryRun,
                    simulate: options.simulate,
                    project_root: registry.getRoot(),
                    cwd: process.cwd(),
                    source: 'cli'
                }
            });

            if (result.status === 'SUCCESS') {
                console.log(chalk.green(`\n[SUCCESS]: ${result.output}`));
                renderOperationalContext(result, registry.getRoot());
                if (result.metadata) {
                    const meta = result.metadata as any;
                    if (meta.proposal_path) console.log(chalk.dim(`  Proposal: ${meta.proposal_path}`));
                    if (meta.validation_id) console.log(chalk.dim(`  Validation: ${meta.validation_id}`));
                }
            } else {
                console.error(chalk.red(`\n[FAILURE]: ${result.error}`));
                process.exit(1);
            }

            console.log(chalk.dim('━'.repeat(40) + '\n'));
        });

    program
        .command('evolve-temporal')
        .description('Trigger a temporal learning cycle to identify churn and seed evolutionary beads')
        .option('--days <days>', 'Lookback window in days', '30')
        .option('--min-churn <churn>', 'Minimum commit count to trigger a bead', '3')
        .option('--limit <limit>', 'Maximum number of sectors to identify', '5')
        .action(async (options: { days: string, minChurn: string, limit: string }) => {
            const dispatchPort = RuntimeDispatcher.getInstance();
            console.log(chalk.cyan('\n ◤ TEMPORAL LEARNING: CHURN AUDIT ◢ '));
            console.log(chalk.dim('━'.repeat(40)));

            const result = await dispatchPort.dispatch({
                weave_id: 'weave:temporal-learning',
                payload: {
                    lookback_days: parseInt(options.days),
                    min_churn: parseInt(options.minChurn),
                    limit: parseInt(options.limit),
                    project_root: registry.getRoot(),
                    cwd: process.cwd(),
                    source: 'cli'
                }
            });

            if (result.status === 'SUCCESS') {
                console.log(chalk.green(`\n[SUCCESS]: ${result.output}`));
                renderOperationalContext(result, registry.getRoot());
                if (result.metadata?.emitted_beads) {
                    const beads = result.metadata.emitted_beads as string[];
                    console.log(chalk.dim(`\nGenerated ${beads.length} beads for Evolve:`));
                    beads.forEach(b => console.log(chalk.blue(`  • ${b}`)));
                }
            } else {
                console.error(chalk.red(`\n[FAILURE]: ${result.error}`));
                process.exit(1);
            }

            console.log(chalk.dim('━'.repeat(40) + '\n'));
        });

    program
        .command('status')
        .description('Retrieve system vitals and current framework state')
        .action(async () => {
            const snapshot = StateRegistry.get();
            const state = snapshot.framework;
            console.log(chalk.cyan('\n ◤ FRAMEWORK STATE REPORT ◢ '));
            console.log(chalk.dim('━'.repeat(40)));
            console.log(`${chalk.bold('KERNEL:')}         ${chalk.green('RING 0 (ACTIVE)')}`);
            console.log(`${chalk.bold('HOST RESUME:')}    ${chalk.dim('disabled for observation-only status')}`);
            console.log(`${chalk.bold('STATUS:')}         ${state.status === 'AWAKE' ? chalk.green(state.status) : chalk.yellow(state.status)}`);
            console.log(`${chalk.bold('PERSONA:')}        ${chalk.magenta(state.active_persona)}`);
            console.log(`${chalk.bold('WORKSPACE:')}      ${chalk.blue(registry.getRoot())}`);
            if (state.last_awakening) {
                console.log(`${chalk.bold('AWAKENED:')}       ${new Date(state.last_awakening).toLocaleString()}`);
            }
            if (state.active_task) {
                console.log(`${chalk.bold('ACTIVE TASK:')}    ${chalk.white(state.active_task)}`);
            }
            if (state.mission_id) {
                console.log(`${chalk.bold('MISSION ID:')}     ${chalk.blue(state.mission_id)}`);
            }

            const integrity = state.intent_integrity || 0;
            let integrityColor = chalk.red;
            if (integrity >= 90) integrityColor = chalk.green;
            else if (integrity >= 70) integrityColor = chalk.yellow;

            console.log(`${chalk.bold('INTEGRITY:')}      ${integrityColor(integrity.toFixed(1) + '%')}`);

            // [Ω] CHRONICLE INTEGRATION
            const chroniclePath = join(PROJECT_ROOT, '.agents', 'skills', 'chronicle', 'state_map.json');
            if (fs.existsSync(chroniclePath)) {
                try {
                    const chronicle = JSON.parse(fs.readFileSync(chroniclePath, 'utf-8'));
                    const coverage = chronicle.compliance.contract_coverage;
                    console.log(`${chalk.bold('COMPLIANCE:')}     ${chalk.cyan(coverage.toFixed(1) + '% Coverage')}`);
                } catch (e) {}
            }

            console.log(`${chalk.bold('GUNGNIR Ω:')}      ${state.gungnir_score.toFixed(2)}`);
            console.log(chalk.dim('━'.repeat(40) + '\n'));

            if (snapshot.managed_spokes.length > 0) {
                console.log(chalk.cyan(' ◤ ESTATE MATRIX ◢ '));
                console.log(chalk.dim('━'.repeat(60)));
                for (const spoke of snapshot.managed_spokes) {
                    const mountColor = spoke.mount_status === 'active' ? chalk.green : spoke.mount_status === 'pending' ? chalk.yellow : chalk.red;
                    console.log(
                        `${chalk.bold(spoke.slug.padEnd(16))} ${mountColor(spoke.mount_status.padEnd(12))} ${chalk.blue(spoke.root_path)}`,
                    );
                }
                console.log(chalk.dim('━'.repeat(60) + '\n'));
            }
        });

    program
        .command('hall')
        .description('Consult the Hall of Records for system identity and guiding principles')
        .argument('[query]', 'Search the Hall of Records by intent, path, or API endpoint')
        .action(async (query?: string) => {
            if (query) {
                const projectRoot = registry.getRoot();
                const dispatchPort = RuntimeDispatcher.getInstance();
                const result = await dispatchPort.dispatch(buildPennyOneInvocation({ search: query }, projectRoot));
                renderStandardCommandResult(result, projectRoot);
                return;
            }

            const state = StateRegistry.get();
            const id = state.identity;
            const hall = state.hall_of_records;

            console.log(chalk.cyan(`\n ◤ HALL OF RECORDS: ${id.name} ◢ `));
            console.log(chalk.italic.dim(` "${id.tagline}" `));
            console.log(chalk.dim('━'.repeat(60)));

            console.log(chalk.bold('\n◈ GUIDING PRINCIPLES'));
            id.guiding_principles.forEach(p => console.log(`  • ${chalk.white(p)}`));

            console.log(chalk.bold('\n◈ USE SYSTEMS'));
            Object.entries(id.use_systems).forEach(([k, v]) => {
                const label = k.charAt(0).toUpperCase() + k.slice(1);
                console.log(`  ${chalk.dim(label.padEnd(15))} : ${chalk.magenta(v)}`);
            });

            console.log(chalk.bold('\n◈ PRIMARY ASSETS'));
            Object.entries(hall.primary_assets).forEach(([k, v]) => {
                const label = k.charAt(0).toUpperCase() + k.slice(1);
                console.log(`  ${chalk.dim(label.padEnd(15))} : ${chalk.blue(v)}`);
            });

            console.log(chalk.dim('\n' + '━'.repeat(60) + '\n'));
        });

    registerCapabilityDiscoveryCommands(program, {
        manifest: (options: { json?: boolean }) => {
            const payload = buildCapabilityManifestPayload(PROJECT_ROOT, getActiveAdapterIds());
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderCapabilityManifestLines(payload)) {
                console.log(line);
            }
        },
        skillInfo: (name: string, options: { json?: boolean }) => {
            const payload = buildCapabilityInfoPayload(PROJECT_ROOT, name, getActiveAdapterIds());
            if (!payload) {
                console.error(chalk.red(`Capability '${name}' not found in registry.`));
                process.exit(1);
            }
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                return;
            }
            for (const line of renderCapabilityInfoLines(payload)) {
                console.log(line);
            }
        },
    });

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
