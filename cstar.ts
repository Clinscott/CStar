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
import { renderOperationalContext, renderStandardCommandResult } from './src/node/core/commands/command_context.ts';
import { getLaunchCwd, installWorkspaceSelectionHook, selectWorkspaceRoot } from './src/node/core/launcher.ts';
import { StateRegistry } from './src/node/core/state.ts';
import { registry } from './src/tools/pennyone/pathRegistry.ts';
import { runOperatorTui, shouldLaunchOperatorTui } from './src/node/core/tui/operator_tui.ts';
import { getHostProviderBanner, isHostSessionActive, resolveHostProvider } from './src/core/host_session.ts';
import { resumeHostGovernorIfAvailable } from './src/node/core/operator_resume.ts';

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
const launchCwd = getLaunchCwd();
const selectedWorkspaceRoot = selectWorkspaceRoot(process.argv.slice(2), launchCwd);

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
  [skill]          Directly invoke any evolved skill from the ecosystem (e.g., 'cstar scribe').
  [workflow]       Execute high-level workflows (e.g., 'cstar lets-go', 'cstar plan').

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
        .command('chant [query...]')
        .description('Initiate a collaborative planning session (ChantWeave)')
        .option('-d, --dry-run', 'Simulate the session without persisting changes')
        .action(async (query: string[], options: { dryRun?: boolean }) => {
            const dispatchPort = RuntimeDispatcher.getInstance();
            const projectRoot = registry.getRoot();
            const queryString = query.join(' ');

            if (!queryString) {
                console.error(chalk.red('\n[FAILURE]: A query is required for Chant.'));
                process.exit(1);
            }

            const result = await dispatchPort.dispatch({
                id: `cli:chant:${Date.now()}`,
                skill_id: 'chant',
                target_path: projectRoot,
                intent: queryString,
                params: {
                    query: queryString,
                    project_root: projectRoot,
                    cwd: process.cwd(),
                    dry_run: options.dryRun,
                    source: 'cli'
                },
                status: 'PENDING',
                priority: 1,
            });

            if (result.status === 'SUCCESS' || result.status === 'TRANSITIONAL') {
                if (result.output) {
                    console.log(`\n${result.output}`);
                }
                renderOperationalContext(result, projectRoot);
                if (result.metadata?.emitted_beads) {
                    const beads = result.metadata.emitted_beads as string[];
                    console.log(chalk.cyan('\n ◤ EMITTED BEADS ◢ '));
                    beads.forEach(b => console.log(chalk.blue(`  • ${b}`)));
                }
            } else {
                console.error(chalk.red(`\n[FAILURE]: ${result.error}`));
                process.exit(1);
            }
        });

    program
        .command('status')
        .description('Retrieve system vitals and current framework state')
        .action(async () => {
            const resumeResult = await resumeHostGovernorIfAvailable(RuntimeDispatcher.getInstance(), {
                workspaceRoot: registry.getRoot(),
                cwd: process.cwd(),
                env: process.env,
                task: 'Resume host-governed status review.',
                source: 'cli',
            });
            const snapshot = StateRegistry.get();
            const state = snapshot.framework;
            console.log(chalk.cyan('\n ◤ FRAMEWORK STATE REPORT ◢ '));
            console.log(chalk.dim('━'.repeat(40)));
            console.log(`${chalk.bold('KERNEL:')}         ${chalk.green('RING 0 (ACTIVE)')}`);
            if (resumeResult.resumed) {
                if (resumeResult.governorResult?.status === 'FAILURE') {
                    console.log(`${chalk.bold('HOST RESUME:')}    ${chalk.red(resumeResult.governorResult.error ?? 'resume failed')}`);
                } else {
                    const detail = resumeResult.governorResult?.output?.trim()
                        ? ` ${chalk.dim(resumeResult.governorResult.output.trim())}`
                        : '';
                    console.log(
                        `${chalk.bold('HOST RESUME:')}    ${chalk.green('synchronized')} ${chalk.magenta(`(${resumeResult.provider})`)}${detail}`,
                    );
                    if (resumeResult.planningSummary) {
                        console.log(`${chalk.bold('TRACE:')}          ${chalk.dim(resumeResult.planningSummary)}`);
                    }
                }
            }
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

    program
        .command('manifest')
        .description('List all registered Agent Skills and runtime Weaves')
        .action(() => {
            const registryPath = join(PROJECT_ROOT, '.agents', 'skill_registry.json');
            if (!fs.existsSync(registryPath)) {
                console.error(chalk.red('Skill registry not found.'));
                return;
            }

            const skillRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
            const dispatcher = RuntimeDispatcher.getInstance();
            const activeAdapters = (dispatcher as any).adapters as Map<string, any>;

            console.log(chalk.cyan('\n ◤ AGENT SKILL REGISTRY ◢ '));
            console.log(chalk.dim('━'.repeat(60)));
            
            console.log(chalk.bold('◈ AUTHENTICATED SKILLS'));
            Object.keys(skillRegistry.entries).sort().forEach(name => {
                const skill = skillRegistry.entries[name];
                const status = activeAdapters.has(`weave:${name}`) || activeAdapters.has(name) 
                    ? chalk.green('ACTIVE') 
                    : chalk.dim('LOADED');
                console.log(`  ${chalk.white(name.padEnd(25))} [${status}] ${chalk.blue(skill.source)}`);
            });

            console.log(chalk.bold('\n◈ RUNTIME WEAVES'));
            Array.from(activeAdapters.keys()).sort().forEach(id => {
                if (id.startsWith('weave:')) {
                    console.log(`  ${chalk.magenta(id)}`);
                }
            });

            console.log(chalk.dim('\n' + '━'.repeat(60) + '\n'));
        });

    program
        .command('skill-info <name>')
        .description('Inspect the mandate and logic protocol of a specific skill')
        .action((name: string) => {
            const skillDir = join(PROJECT_ROOT, '.agents', 'skills', name);
            const skillMd = join(skillDir, 'SKILL.md');
            
            if (fs.existsSync(skillMd)) {
                console.log(chalk.cyan(`\n ◤ SKILL MANDATE: ${name.toUpperCase()} ◢ `));
                console.log(chalk.dim('━'.repeat(60)));
                console.log(fs.readFileSync(skillMd, 'utf-8'));
                console.log(chalk.dim('━'.repeat(60) + '\n'));
            } else {
                console.log(chalk.yellow(`No SKILL.md found for '${name}'. Attempting registry lookup...`));
                const registryPath = join(PROJECT_ROOT, '.agents', 'skill_registry.json');
                if (fs.existsSync(registryPath)) {
                    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
                    if (registry.entries[name]) {
                        console.log(JSON.stringify(registry.entries[name], null, 2));
                    } else {
                        console.error(chalk.red(`Skill '${name}' not found in registry.`));
                    }
                }
            }
        });

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
