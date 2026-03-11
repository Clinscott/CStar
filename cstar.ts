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
import { registerPennyOneCommand } from './src/node/core/commands/pennyone.ts';
import { registerRavenCommand } from './src/node/core/commands/ravens.ts';
import { registerDispatcher } from './src/node/core/commands/dispatcher.ts';
import { registerVitalsCommand } from './src/node/core/commands/vitals.ts';
import { registerRunSkillCommand } from './src/node/core/commands/run-skill.ts';
import { bootstrapRuntime } from './src/node/core/runtime/bootstrap.ts';
import { RuntimeDispatcher } from './src/node/core/runtime/dispatcher.ts';

import { registerMcpCommand } from './src/node/core/commands/mcp.ts';
import { registerTuiCommand } from './src/node/core/commands/tui.ts';
import { registerSpokeCommand } from './src/node/core/commands/spoke.ts';
import { getLaunchCwd, installWorkspaceSelectionHook, selectWorkspaceRoot } from './src/node/core/launcher.ts';
import { StateRegistry } from './src/node/core/state.ts';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';
import { registry } from './src/tools/pennyone/pathRegistry.ts';
import { runOperatorTui, shouldLaunchOperatorTui } from './src/node/core/tui/operator_tui.ts';
import { getHostProviderBanner, isHostSessionActive, resolveHostProvider } from './src/core/host_session.ts';

/**
 * 🔱 GUNGNIR CONTROL PLANE (v2.0)
 * Purpose: Sovereign entry point for Corvus Star. 
 * Standard: Linscott Protocol ([L] > 4.0 Compliance).
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = __dirname;
const pkgPath = join(PROJECT_ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const launchCwd = getLaunchCwd();
const selectedWorkspaceRoot = selectWorkspaceRoot(process.argv.slice(2), launchCwd);

const program = new Command();

function buildOraclePrompt(prompt: string, systemPrompt?: string): string {
    if (!systemPrompt) {
        return prompt;
    }
    return `SYSTEM:\n${systemPrompt}\n\nUSER:\n${prompt}`;
}

function invokeCodexOracle(prompt: string): string {
    const response = execFileSync(
        'codex',
        ['exec', prompt],
        {
            cwd: registry.getRoot(),
            env: { ...process.env },
            encoding: 'utf-8',
        },
    ).trim();

    if (!response) {
        throw new Error('Codex returned no output.');
    }

    return response;
}

function resolveOracleResponse(prompt: string, allowPromptFallback = false): string {
    const provider = resolveHostProvider();

    if (provider === 'codex') {
        return invokeCodexOracle(prompt);
    }

    if (provider === 'gemini') {
        return `[SAMPLING_REQUEST]\n${prompt}`;
    }

    if (allowPromptFallback) {
        return prompt;
    }

    throw new Error('Host Agent session inactive.');
}

(async () => {
    const isHelpOrVersion = process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--version') || process.argv.includes('-V');
    const isStart = process.argv.includes('start');
    const isSilent = process.argv.includes('--silent');
    const shouldStartTui = !isHelpOrVersion && shouldLaunchOperatorTui(process.argv.slice(2));
    const hostSessionActive = isHostSessionActive();
    const hostProvider = resolveHostProvider();

    if (!shouldStartTui && !isHelpOrVersion && isStart && !isSilent) {
        await runStartupCeremony();
    }

    if (hostSessionActive && !isHelpOrVersion && !isSilent) {
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
  mcp              Manage the Corvus Control & PennyOne MCP servers.
  spoke            Link, unlink, and inspect mounted estate spokes.
  oracle           Consult the One Mind Host Agent via direct sampling.
  [skill]          Directly invoke any evolved skill from the ecosystem (e.g., 'cstar memory').
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
    registerDispatcher(program, () => registry.getRoot());
    registerVitalsCommand(program);
    registerMcpCommand(program);
    registerRunSkillCommand(program);
    registerTuiCommand(program);
    registerSpokeCommand(program, () => registry.getRoot());

    program
        .command('status')
        .description('Retrieve system vitals and current framework state')
        .action(() => {
            const snapshot = StateRegistry.get();
            const state = snapshot.framework;
            console.log(chalk.cyan('\n ◤ FRAMEWORK STATE REPORT ◢ '));
            console.log(chalk.dim('━'.repeat(40)));
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
        .action(() => {
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
        .command('oracle <prompt_or_id>')
        .description('Consult the One Mind Host Agent via direct sampling')
        .option('-s, --system <prompt>', 'Override system prompt')
        .option('--silent', 'Suppress all headers and banners for programmatic use')
        .option('--out <file>', 'Write raw response to file')
        .option('--db', 'Use Synapse Database for exchange (id as first arg)')
        .action(async (target: string, options: { system?: string, silent?: boolean, out?: string, db?: boolean }) => {
            try {
                let prompt = target;
                let db_id = 0;
                
                if (options.db) {
                    db_id = parseInt(target);
                    const dbPath = join(PROJECT_ROOT, '.agents', 'synapse.db');
                    
                    if (!fs.existsSync(dbPath)) {
                        throw new Error(`Synapse Database not found at ${dbPath}`);
                    }

                    // [🔱] THE ONE MIND: In-process SQLite interaction via better-sqlite3
                    try {
                        const db = new Database(dbPath);
                        
                        const row = db.prepare('SELECT prompt FROM synapse WHERE id = ?').get(db_id) as { prompt: string } | undefined;
                        
                        if (!row || !row.prompt) {
                            db.close();
                            throw new Error(`No record found in Synapse for ID: ${db_id}`);
                        }

                        const samplingResponse = resolveOracleResponse(row.prompt, options.silent === true);
                        
                        // Write response back to DB
                        db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?').run(samplingResponse, 'COMPLETED', db_id);
                        db.close();
                        
                        if (!options.silent) console.log(samplingResponse);
                        return;
                    } catch (err: any) {
                        throw new Error(`Database operation failed: ${err.message}`);
                    }
                }

                if (fs.existsSync(target)) {
                    prompt = fs.readFileSync(target, 'utf-8');
                }

                prompt = buildOraclePrompt(prompt, options.system);
                
                // [🔱] THE ONE MIND: Execute direct sampling strike
                if (hostSessionActive) {
                    const response = resolveOracleResponse(prompt, options.silent === true);
                    if (options.out) {
                        fs.writeFileSync(options.out, response, 'utf-8');
                    } else {
                        console.log(response); 
                    }
                } else if (options.silent) {
                    // Fallback for programmatic use outside active session
                    process.stdout.write(prompt);
                } else {
                    console.log('Error: Host Agent session inactive.');
                    process.exit(1);
                }
            } catch (e: any) {
                if (!options.silent) console.error(`Oracle failed: ${e.message}`);
                process.exit(1);
            }
        });

    try {
        program.parse(process.argv);
    } catch (error: any) {
        process.exit(1);
    }
})();
