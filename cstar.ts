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
import { registerAuguryCommand, registerTraceCommand } from './src/node/core/commands/trace.ts';
import { registerHallDocumentCommand } from './src/node/core/commands/hall-doc.ts';
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
import {
    walkSpokeSkills,
    walkSpokeJournal,
    type SpokeSkillManifest,
} from './src/node/core/spokes/spoke_capability_walker.js';
import { renderOperationalContext, renderStandardCommandResult } from './src/node/core/commands/command_context.ts';
import { getLaunchCwd, installWorkspaceSelectionHook, selectWorkspaceRoot } from './src/node/core/launcher.ts';
import { StateRegistry } from './src/node/core/state.ts';
import { registry } from './src/tools/pennyone/pathRegistry.ts';
import { database } from './src/tools/pennyone/intel/database.ts';
import {
    tallyContest as warGameTallyContest,
    tallyAllContests as warGameTallyAll,
    recentScores as warGameRecentScores,
    byScenario as warGameByScenario,
    getScoreByShot as warGameGetScoreByShot,
} from './src/tools/war_game/score_trigger.ts';
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
    registerAuguryCommand(program, () => registry.getRoot());
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

    // ─────────────────────────────────────────────────────────────────
    // BEAD-CSTAR-WAR-GAME-SCORING-001 — war-game scoreboard CLI.
    // Wraps the cstar_war_game_score MCP tool actions for operator use.
    // ─────────────────────────────────────────────────────────────────
    const warGame = program
        .command('war-game')
        .description('Inspect the kernel-arbitrated war-game scoreboard (e.g. USB Forge vs USB Sentry)');

    warGame
        .command('tally [contest_id]')
        .description('Show running totals per contest, or for a single contest if specified')
        .action((contestId?: string) => {
            try {
                const db = database.getDb();
                const tallies = contestId
                    ? (warGameTallyContest(db, contestId) ? [warGameTallyContest(db, contestId)!] : [])
                    : warGameTallyAll(db);
                if (tallies.length === 0) {
                    if (contestId) {
                        console.log(chalk.yellow(`No contest found with id '${contestId}'.`));
                    } else {
                        console.log(chalk.dim('No registered contests yet.'));
                    }
                    return;
                }
                console.log(chalk.cyan('\n ◤ WAR-GAME SCOREBOARD ◢ '));
                console.log(chalk.dim('━'.repeat(70)));
                console.log(
                    chalk.bold(
                        `${'CONTEST'.padEnd(34)} ${'DEFENDER'.padEnd(10)} ${'ATTACKER'.padEnd(10)} ${'INCONCL.'.padEnd(10)} ${'VIOLATIONS'}`,
                    ),
                );
                for (const t of tallies) {
                    const def = chalk.green(String(t.defender_points).padEnd(10));
                    const atk = chalk.red(String(t.attacker_points).padEnd(10));
                    const inc = chalk.dim(String(t.inconclusive_count).padEnd(10));
                    const vio = t.protocol_violation_count > 0
                        ? chalk.yellow(String(t.protocol_violation_count))
                        : chalk.dim('0');
                    console.log(
                        `${t.contest_name.padEnd(34).slice(0, 34)} ${def} ${atk} ${inc} ${vio}`,
                    );
                    console.log(
                        chalk.dim(
                            `  ${t.attacker_label} vs ${t.defender_label}   total shots: ${t.total_shots}   ` +
                            `def_blocked:${t.scores.defender_blocked} bypass:${t.scores.attacker_bypassed} ` +
                            `false_pos:${t.scores.false_positive} baseline:${t.scores.baseline_pass}`,
                        ),
                    );
                }
                console.log(chalk.dim('━'.repeat(70) + '\n'));
            } catch (error: any) {
                console.error(chalk.red(`war-game tally failed: ${error.message}`));
                process.exit(1);
            }
        });

    warGame
        .command('recent [n]')
        .description('List the N most-recent scored events (default 10)')
        .option('-c, --contest <id>', 'Filter to a single contest')
        .action((nArg: string | undefined, options: { contest?: string }) => {
            try {
                const db = database.getDb();
                const limit = nArg ? Math.max(1, Math.min(100, parseInt(nArg, 10) || 10)) : 10;
                const rows = warGameRecentScores(db, options.contest ?? null, limit);
                if (rows.length === 0) {
                    console.log(chalk.dim('No scored events yet.'));
                    return;
                }
                console.log(chalk.cyan(`\n ◤ RECENT WAR-GAME EVENTS (${rows.length}) ◢ `));
                console.log(chalk.dim('━'.repeat(80)));
                for (const r of rows) {
                    const when = new Date(r.scored_at).toISOString();
                    const outcomeColor =
                        r.outcome === 'defender_blocked' ? chalk.green
                        : r.outcome === 'attacker_bypassed' ? chalk.red
                        : r.outcome === 'false_positive' ? chalk.red
                        : r.outcome === 'protocol_violation' ? chalk.yellow
                        : chalk.dim;
                    console.log(
                        `${chalk.dim(when)}  ${outcomeColor(r.outcome.padEnd(20))} ${r.scenario_id.padEnd(16)} ${chalk.blue(r.shot_id)}`,
                    );
                    if (r.observed_terminal_event) {
                        console.log(chalk.dim(`    → ${r.observed_terminal_event}`));
                    }
                    if (r.inconclusive_reason) {
                        console.log(chalk.dim(`    ⚠ ${r.inconclusive_reason}`));
                    }
                }
                console.log(chalk.dim('━'.repeat(80) + '\n'));
            } catch (error: any) {
                console.error(chalk.red(`war-game recent failed: ${error.message}`));
                process.exit(1);
            }
        });

    warGame
        .command('by-scenario <contest_id>')
        .description('Show per-scenario outcome breakdown for a contest')
        .action((contestId: string) => {
            try {
                const db = database.getDb();
                const buckets = warGameByScenario(db, contestId);
                if (buckets.length === 0) {
                    console.log(chalk.dim(`No scored events for contest '${contestId}'.`));
                    return;
                }
                console.log(chalk.cyan(`\n ◤ ${contestId} — BY SCENARIO ◢ `));
                console.log(chalk.dim('━'.repeat(80)));
                console.log(
                    chalk.bold(
                        `${'SCENARIO'.padEnd(20)} ${'DEF_BLK'.padEnd(8)} ${'BYPASS'.padEnd(8)} ${'FALSE_P'.padEnd(8)} ${'BASE'.padEnd(8)} ${'INCONCL'.padEnd(8)} ${'VIO'.padEnd(8)} TOTAL`,
                    ),
                );
                for (const b of buckets) {
                    console.log(
                        `${b.scenario_id.padEnd(20)} ${chalk.green(String(b.scores.defender_blocked).padEnd(8))} ${chalk.red(String(b.scores.attacker_bypassed).padEnd(8))} ${chalk.red(String(b.scores.false_positive).padEnd(8))} ${String(b.scores.baseline_pass).padEnd(8)} ${chalk.dim(String(b.scores.inconclusive).padEnd(8))} ${chalk.yellow(String(b.scores.protocol_violation).padEnd(8))} ${b.total}`,
                    );
                }
                console.log(chalk.dim('━'.repeat(80) + '\n'));
            } catch (error: any) {
                console.error(chalk.red(`war-game by-scenario failed: ${error.message}`));
                process.exit(1);
            }
        });

    warGame
        .command('get <shot_id>')
        .description('Look up the score row for a single shot')
        .option('-c, --contest <id>', 'Narrow to a specific contest')
        .action((shotId: string, options: { contest?: string }) => {
            try {
                const db = database.getDb();
                const score = warGameGetScoreByShot(db, shotId, options.contest);
                if (!score) {
                    console.log(chalk.dim(`No score recorded for shot '${shotId}'.`));
                    return;
                }
                console.log(chalk.cyan(`\n ◤ SHOT ${shotId} ◢ `));
                console.log(chalk.dim('━'.repeat(60)));
                console.log(`  ${chalk.dim('contest    ')}: ${chalk.blue(score.contest_id)}`);
                console.log(`  ${chalk.dim('scenario   ')}: ${chalk.cyan(score.scenario_id)}`);
                console.log(`  ${chalk.dim('outcome    ')}: ${chalk.bold(score.outcome)}`);
                if (score.observed_terminal_event) {
                    console.log(`  ${chalk.dim('observed   ')}: ${score.observed_terminal_event}`);
                }
                if (score.inconclusive_reason) {
                    console.log(`  ${chalk.dim('note       ')}: ${chalk.yellow(score.inconclusive_reason)}`);
                }
                console.log(`  ${chalk.dim('scored_at  ')}: ${new Date(score.scored_at).toISOString()}`);
                console.log(chalk.dim('━'.repeat(60) + '\n'));
            } catch (error: any) {
                console.error(chalk.red(`war-game get failed: ${error.message}`));
                process.exit(1);
            }
        });

    warGame
        .command('list-contests')
        .description('List registered war-game contests')
        .action(() => {
            try {
                const db = database.getDb();
                const rows = db.prepare(
                    `SELECT contest_id, contest_name, attacker_label, defender_label,
                            attacker_bead_id, defender_bead_id, created_at
                     FROM war_game_contests ORDER BY created_at DESC`,
                ).all() as Array<{ contest_id: string; contest_name: string; attacker_label: string; defender_label: string; attacker_bead_id: string | null; defender_bead_id: string | null; created_at: number }>;
                if (rows.length === 0) {
                    console.log(chalk.dim('No contests registered.'));
                    return;
                }
                console.log(chalk.cyan(`\n ◤ REGISTERED CONTESTS (${rows.length}) ◢ `));
                console.log(chalk.dim('━'.repeat(70)));
                for (const r of rows) {
                    console.log(`  ${chalk.blue(r.contest_id)}`);
                    console.log(`    ${chalk.dim('name      ')}: ${r.contest_name}`);
                    console.log(`    ${chalk.dim('attacker  ')}: ${chalk.red(r.attacker_label)}${r.attacker_bead_id ? `  (${r.attacker_bead_id})` : ''}`);
                    console.log(`    ${chalk.dim('defender  ')}: ${chalk.green(r.defender_label)}${r.defender_bead_id ? `  (${r.defender_bead_id})` : ''}`);
                    console.log(`    ${chalk.dim('registered')}: ${new Date(r.created_at).toISOString()}`);
                }
                console.log(chalk.dim('━'.repeat(70) + '\n'));
            } catch (error: any) {
                console.error(chalk.red(`war-game list-contests failed: ${error.message}`));
                process.exit(1);
            }
        });

    registerCapabilityDiscoveryCommands(program, {
        manifest: (options: ManifestCommandOptions) => {
            // Legacy byte-compat path: no scope flag, no spoke flag → produce the
            // unwrapped manifest payload exactly as before BEAD-CSTAR-SPOKE-DISCOVERY-001.
            const explicitScope = options.scope !== undefined;
            const explicitSpoke = options.spoke !== undefined;
            if (!explicitScope && !explicitSpoke) {
                const legacyPayload = buildCapabilityManifestPayload(PROJECT_ROOT, getActiveAdapterIds());
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(legacyPayload, null, 2)}\n`);
                    return;
                }
                for (const line of renderCapabilityManifestLines(legacyPayload)) {
                    console.log(line);
                }
                return;
            }

            const scope = options.scope ?? 'hub';
            const hubPayload = scope === 'hub' || scope === 'all'
                ? buildCapabilityManifestPayload(PROJECT_ROOT, getActiveAdapterIds())
                : null;
            const spokeEntries = scope === 'spoke' || scope === 'all'
                ? walkSpokeSkills(options.spoke)
                : [];

            if (options.json) {
                const hubCapabilities = (hubPayload?.capabilities ?? []).map((c) => ({ ...c, source: 'hub' }));
                const spokeCapabilities = spokeEntries.map((s: SpokeSkillManifest) => ({
                    id: s.id,
                    bare_id: s.bare_id,
                    source: 'spoke',
                    source_spoke: s.spoke_slug,
                    tier: s.tier,
                    risk: s.risk,
                    entry_surface: 'host-only',
                    execution_mode: 'agent-native',
                    owner_runtime: 'host-agent',
                    authority_path: s.authority_path,
                    active_in_runtime: false,
                    validation: s.validation,
                    validation_reason: s.validation_reason,
                    shadows_hub_id: s.shadows_hub_id,
                    name: s.name,
                    description: s.description,
                }));
                const merged = [...hubCapabilities, ...spokeCapabilities].sort((a, b) => String(a.id).localeCompare(String(b.id)));
                process.stdout.write(`${JSON.stringify({ scope, spoke: options.spoke ?? null, capabilities: merged }, null, 2)}\n`);
                return;
            }

            // Text rendering: hub lines first (existing renderer), then spoke entries
            if (hubPayload) {
                for (const line of renderCapabilityManifestLines(hubPayload)) {
                    console.log(line);
                }
            }
            if (spokeEntries.length > 0) {
                console.log('');
                console.log(chalk.cyan('◤ SPOKE-LOCAL SKILLS ◢'));
                console.log(chalk.dim('━'.repeat(60)));
                for (const s of spokeEntries) {
                    const flag = s.validation === 'ok' ? chalk.green('●') : (s.validation === 'quarantined' ? chalk.yellow('▲') : chalk.red('✗'));
                    console.log(`${flag} ${chalk.bold(s.id.padEnd(40))} ${chalk.dim(s.tier.padEnd(7))} ${chalk.dim(s.risk)}`);
                    if (s.validation !== 'ok' && s.validation_reason !== undefined) {
                        console.log(`    ${chalk.dim(s.validation_reason)}`);
                    }
                }
                console.log(chalk.dim('━'.repeat(60)));
            }
        },
        skillInfo: (name: string, options: SkillInfoCommandOptions) => {
            if (name.includes(':')) {
                const sep = name.indexOf(':');
                const parsedSlug = name.slice(0, sep);
                const bareId = name.slice(sep + 1);
                const slug = options.spoke ?? parsedSlug;
                const candidates = walkSpokeSkills(slug, { includeQuarantined: true });
                const found = candidates.find((s) => s.bare_id === bareId);
                if (!found) {
                    console.error(chalk.red(`Spoke skill '${name}' not found.`));
                    process.exit(1);
                }
                const payload = {
                    capability: {
                        id: found.id,
                        bare_id: found.bare_id,
                        source: 'spoke',
                        source_spoke: found.spoke_slug,
                        tier: found.tier,
                        risk: found.risk,
                        entry_surface: 'host-only',
                        execution_mode: 'agent-native',
                        owner_runtime: 'host-agent',
                        authority_path: found.authority_path,
                        validation: found.validation,
                        validation_reason: found.validation_reason,
                        shadows_hub_id: found.shadows_hub_id,
                        name: found.name,
                        description: found.description,
                    },
                    documentation: {
                        kind: 'markdown',
                        path: found.authority_path,
                        readable: true,
                        content: found.documentation,
                    },
                    invocation: {
                        agent_hint: 'any-host-agent',
                        working_dir: found.spoke_root,
                        command: null,
                        logic_protocol_anchor: 'see SKILL.md "LOGIC PROTOCOL" section',
                    },
                };
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
                    return;
                }
                console.log(chalk.cyan(`\n◤ ${found.id} ◢`));
                console.log(chalk.dim('━'.repeat(60)));
                console.log(`${chalk.bold('tier       ')}: ${found.tier}`);
                console.log(`${chalk.bold('risk       ')}: ${found.risk}`);
                console.log(`${chalk.bold('spoke      ')}: ${found.spoke_slug}`);
                console.log(`${chalk.bold('validation ')}: ${found.validation}`);
                if (found.validation_reason !== undefined) {
                    console.log(`${chalk.bold('reason     ')}: ${found.validation_reason}`);
                }
                console.log(`${chalk.bold('authority  ')}: ${found.authority_path}`);
                console.log(`${chalk.bold('description')}: ${found.description}`);
                console.log(chalk.dim('━'.repeat(60)));
                console.log(`\n${found.documentation}`);
                return;
            }
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

    // BEAD-CSTAR-SPOKE-DISCOVERY-001 — `cstar spoke journal <slug>` subcommand.
    const spokeCmd = program.commands.find((c) => c.name() === 'spoke');
    if (spokeCmd) {
        spokeCmd
            .command('journal <slug>')
            .description('Show the four-file journal state for a registered spoke (memory.md, tasks.md, wireframe.md, DEV_JOURNAL.md)')
            .option('--json', 'Emit machine-readable JSON instead of formatted text')
            .action((slug: string, options: { json?: boolean }) => {
                const report = walkSpokeJournal(slug);
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
                    return;
                }
                if (report.validation === 'spoke_not_found') {
                    console.error(chalk.red(`Spoke '${slug}' is not registered.`));
                    process.exit(1);
                }
                console.log(chalk.cyan(`\n◤ SPOKE JOURNAL — ${report.spoke} ◢`));
                console.log(chalk.dim('━'.repeat(60)));
                if (report.validation === 'mount_status_drift') {
                    console.log(chalk.red(`mount_status_drift: ${report.root_path} no longer exists on disk`));
                    console.log(chalk.dim('━'.repeat(60)));
                    return;
                }
                console.log(`${chalk.bold('root_path  ')}: ${report.root_path}`);
                console.log(chalk.dim('─'.repeat(60)));
                for (const [key, file] of Object.entries(report.files)) {
                    const flag = file.present ? (file.validation === 'ok' ? chalk.green('●') : chalk.yellow('▲')) : chalk.red('✗');
                    console.log(`${flag} ${chalk.bold(key.padEnd(15))} ${file.path}`);
                    if (file.summary !== undefined) {
                        console.log(`    ${chalk.dim('summary    ')}: ${file.summary}`);
                    }
                    if (file.open_tasks !== undefined) {
                        console.log(`    ${chalk.dim('open_tasks ')}: ${file.open_tasks}`);
                    }
                    if (file.prominent_functions !== undefined && file.prominent_functions.length > 0) {
                        console.log(`    ${chalk.dim('functions  ')}: ${file.prominent_functions.slice(0, 5).join(', ')}${file.prominent_functions.length > 5 ? '…' : ''}`);
                    }
                    if (file.last_entry_timestamp !== undefined) {
                        console.log(`    ${chalk.dim('last_entry ')}: ${file.last_entry_timestamp}`);
                    }
                    if (file.validation !== 'ok' && file.validation_reason !== undefined) {
                        console.log(`    ${chalk.red(file.validation_reason)}`);
                    }
                }
                console.log(chalk.dim('━'.repeat(60)));
            });
    }

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
