import chalk from 'chalk';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activePersona } from '../tools/pennyone/personaRegistry.js';
import { ANS } from './core/ans.js';
import { HUD } from './core/hud.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const THEMES = {
    'O.D.I.N.': {
        main: chalk.red,
        dim: chalk.magenta,
        accent: chalk.yellow,
        title: 'Ω O.D.I.N. GUNGNIR CONTROL Ω',
        greeting: 'Speak, wanderer. The Hooded One listens.',
        bootMessages: [
            'Heimdall\'s Vigil: [SECURED]',
            'Mimir\'s Well: [SYNCHRONIZED]',
            'Huginn & Muninn: [CIRCLING]',
            'The Runes are cast.'
        ],
        mandates: ['STRATEGY', 'CREATION', 'DOMINION']
    },
    'A.L.F.R.E.D.': {
        main: chalk.cyan,
        dim: chalk.gray,
        accent: chalk.green,
        title: 'C* A.L.F.R.E.D. DASHBOARD',
        greeting: 'Good day, sir. The Archive is at your disposal.',
        bootMessages: [
            'Perimeter: [SECURE]',
            'Repository: [INDEXED]',
            'Logic Engine: [READY]',
            'Everything is in order, sir.'
        ],
        mandates: ['MAINTENANCE', 'LOGIC', 'INTERFACE']
    }
};
/**
 *
 * @param ms
 */
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 *
 * @param status
 */
function getStatusColor(status) {
    switch (status.toUpperCase()) {
        case 'ACTIVE':
        case 'SECURE':
        case 'PASS':
        case 'ONLINE':
        case 'ARMED':
        case 'SYNCED':
            return chalk.green;
        case 'OFFLINE':
        case 'VULNERABLE':
        case 'FAIL':
        case 'BREACHED':
            return chalk.red;
        case 'IDLE':
        case 'WARNING':
        case 'STANDBY':
            return chalk.yellow;
        default:
            return chalk.gray;
    }
}
/**
 *
 */
function getRavensStatus() {
    const pidPath = join(PROJECT_ROOT, '.agents', 'muninn.pid');
    if (fs.existsSync(pidPath)) {
        try {
            const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim());
            process.kill(pid, 0);
            return 'ACTIVE';
        }
        catch (e) {
            return 'IDLE';
        }
    }
    return 'OFFLINE';
}
/**
 *
 */
function getPerimeterStatus() {
    const reportPath = join(PROJECT_ROOT, '.agents', 'perimeter_report.json');
    if (fs.existsSync(reportPath)) {
        try {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            const results = report.results;
            if ((results.pip_audit?.vulnerabilities || 0) > 0 || (results.npm_audit?.vulnerabilities || 0) > 0) {
                return 'VULNERABLE';
            }
            return 'SECURE';
        }
        catch (e) {
            return 'UNKNOWN';
        }
    }
    return 'UNSCANNED';
}
/**
 *
 */
function getPennyOneStatus() {
    const statsPath = join(PROJECT_ROOT, '.stats', 'matrix-graph.json');
    return fs.existsSync(statsPath) ? 'INDEXED' : 'OFFLINE';
}
/**
 *
 */
function getForgeStatus() {
    const wardenPath = join(PROJECT_ROOT, 'test_warden.pkl');
    return fs.existsSync(wardenPath) ? 'ARMED' : 'IDLE';
}
/**
 *
 */
function getFishtestStatus() {
    const dataPath = join(PROJECT_ROOT, 'fishtest_data.json');
    if (fs.existsSync(dataPath)) {
        return 'SYNCED';
    }
    return 'OFFLINE';
}
/**
 *
 */
function getWardenStatus() {
    // Check if warden is active in state
    const statePath = join(PROJECT_ROOT, '.agents', 'sovereign_state.json');
    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            return state.warden?.active ? 'VIGILANT' : 'STANDBY';
        }
        catch (e) { }
    }
    return 'STANDBY';
}
/**
 *
 */
function getVaultStatus() {
    const vaultDir = join(PROJECT_ROOT, '.agents', 'vault');
    const masterKey = join(vaultDir, 'master.key');
    const secretsBin = join(vaultDir, 'secrets.bin');
    if (fs.existsSync(masterKey) && fs.existsSync(secretsBin)) {
        return 'SECURED';
    }
    return fs.existsSync(masterKey) ? 'ARMED' : 'OFFLINE';
}
/**
 *
 */
export async function runStartupCeremony() {
    // [🔱] THE BRAIN: Wake the entire framework organism
    await ANS.wake();
    const persona = activePersona.name;
    const theme = THEMES[persona] || THEMES['A.L.F.R.E.D.'];
    const { main, dim, accent, title, greeting, bootMessages, mandates } = theme;
    const palette = HUD.palette;
    process.stdout.write(HUD.boxTop(title));
    process.stdout.write(HUD.boxRow('GREETING', greeting, dim));
    process.stdout.write(HUD.boxSeparator());
    // Mandates & Status Section
    const mandatesStr = mandates.map(m => m).join(' | ');
    process.stdout.write(HUD.boxRow('MANDATES', mandatesStr, accent.bold));
    process.stdout.write(HUD.boxSeparator());
    if (persona === 'O.D.I.N.') {
        const ravens = getRavensStatus();
        const forge = getForgeStatus();
        const fishtest = getFishtestStatus();
        const warden = getWardenStatus();
        const vault = getVaultStatus();
        process.stdout.write(HUD.boxRow('RAVENS', ravens, getStatusColor(ravens)));
        process.stdout.write(HUD.boxRow('FORGE', forge, palette.crucible));
        process.stdout.write(HUD.boxRow('FISHTEST', fishtest, palette.mimir));
        process.stdout.write(HUD.boxRow('VIGIL', warden, palette.sterling));
        process.stdout.write(HUD.boxRow('VAULT', vault, palette.sterling));
    }
    else {
        const perimeter = getPerimeterStatus();
        const pennyone = getPennyOneStatus();
        const vault = getVaultStatus();
        process.stdout.write(HUD.boxRow('PERIMETER', perimeter, getStatusColor(perimeter)));
        process.stdout.write(HUD.boxRow('REPOSITORY', pennyone, palette.mimir));
        process.stdout.write(HUD.boxRow('ARCHIVE', 'SECURE', palette.sterling));
        process.stdout.write(HUD.boxRow('VAULT', vault, palette.sterling));
    }
    process.stdout.write(HUD.boxSeparator());
    // Gemini CLI Integration Status
    if (process.env.GEMINI_CLI_ACTIVE === 'true') {
        process.stdout.write(HUD.boxRow('INTELLIGENCE', 'DECOUPLED', chalk.magenta.bold));
        process.stdout.write(HUD.boxRow('MIND', 'GEMINI-3.1-PRO', chalk.magenta.bold));
        process.stdout.write(HUD.boxSeparator());
    }
    // Persona Note
    process.stdout.write(HUD.boxNote());
    process.stdout.write(HUD.boxSeparator());
    // Boot sequence
    for (const msg of bootMessages) {
        const bifrostMsg = palette.bifrost(msg);
        await HUD.streamText(`  ${dim('▷')} ${bifrostMsg} ... ${accent('OK')}`, 8);
    }
    process.stdout.write(HUD.boxBottom());
}
