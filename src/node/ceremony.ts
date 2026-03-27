import chalk, { ChalkInstance } from 'chalk';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activePersona } from '../tools/pennyone/personaRegistry.js';
import { getHallOneMindBroker, getHallSummary } from  '../tools/pennyone/intel/database.js';
import { registry } from '../tools/pennyone/pathRegistry.js';
import { ANS } from './core/ans.js';
import { HUD } from './core/hud.js';
import { StateRegistry } from  './core/state.js';
import { getHostMindLabel, isHostSessionActive, resolveHostProvider } from  '../core/host_session.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

interface PersonaTheme {
    main: ChalkInstance;
    dim: ChalkInstance;
    accent: ChalkInstance;
    title: string;
    greeting: string;
    bootMessages: string[];
    mandates: string[];
}

interface PerimeterReport {
    results: {
        pip_audit?: { vulnerabilities: number };
        npm_audit?: { vulnerabilities: number };
    };
}

const THEMES: Record<string, PersonaTheme> = {
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
async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 *
 * @param status
 */
function getStatusColor(status: string): ChalkInstance {
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
function getRavensStatus(): string {
    const cyclePath = join(PROJECT_ROOT, 'src', 'sentinel', 'ravens_cycle.py');
    if (fs.existsSync(cyclePath)) {
        return 'STANDBY';
    }
    return 'OFFLINE';
}

/**
 *
 */
function getPerimeterStatus(): string {
    const reportPath = join(PROJECT_ROOT, '.agents', 'perimeter_report.json');
    if (fs.existsSync(reportPath)) {
        try {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as PerimeterReport;
            const results = report.results;
            if ((results.pip_audit?.vulnerabilities || 0) > 0 || (results.npm_audit?.vulnerabilities || 0) > 0) {
                return 'VULNERABLE';
            }
            return 'SECURE';
        } catch (e) {
            return 'UNKNOWN';
        }
    }
    return 'UNSCANNED';
}

/**
 *
 */
function getPennyOneStatus(): string {
    const summary = getHallSummary(PROJECT_ROOT);
    return summary?.last_scan_id ? 'INDEXED' : 'OFFLINE';
}

/**
 *
 */
function getForgeStatus(): string {
    const wardenPath = join(PROJECT_ROOT, 'test_warden.pkl');
    return fs.existsSync(wardenPath) ? 'ARMED' : 'IDLE';
}

/**
 *
 */
function getFishtestStatus(): string {
    const dataPath = join(PROJECT_ROOT, 'fishtest_data.json');
    if (fs.existsSync(dataPath)) {
        return 'SYNCED';
    }
    return 'OFFLINE';
}

/**
 *
 */
function getWardenStatus(): string {
    const state = StateRegistry.get();
    const warden = state.warden as { active?: boolean } | undefined;
    return warden?.active ? 'VIGILANT' : 'STANDBY';
}

/**
 *
 */
function getVaultStatus(): string {
    const vaultDir = join(PROJECT_ROOT, '.agents', 'vault');
    const masterKey = join(vaultDir, 'master.key');
    const secretsBin = join(vaultDir, 'secrets.bin');
    if (fs.existsSync(masterKey) && fs.existsSync(secretsBin)) {
        return 'SECURED';
    }
    return fs.existsSync(masterKey) ? 'ARMED' : 'OFFLINE';
}

function getOneMindBrokerStatus(): string {
    const state = getHallOneMindBroker(registry.getRoot());
    if (!state) {
        return 'OFFLINE';
    }
    if (!state.fulfillment_ready) {
        return 'UNBOUND';
    }
    return state.binding_state === 'BOUND' ? 'BOUND' : 'UNBOUND';
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
    } else {
        const perimeter = getPerimeterStatus();
        const pennyone = getPennyOneStatus();
        const vault = getVaultStatus();

        process.stdout.write(HUD.boxRow('PERIMETER', perimeter, getStatusColor(perimeter)));
        process.stdout.write(HUD.boxRow('REPOSITORY', pennyone, palette.mimir));
        process.stdout.write(HUD.boxRow('ARCHIVE', 'SECURE', palette.sterling));
        process.stdout.write(HUD.boxRow('VAULT', vault, palette.sterling));
    }

    process.stdout.write(HUD.boxSeparator());

    // Host Session Integration Status
    if (isHostSessionActive(process.env)) {
        const hostProvider = resolveHostProvider(process.env);
        process.stdout.write(HUD.boxRow('INTELLIGENCE', 'DECOUPLED', chalk.magenta.bold));
        process.stdout.write(HUD.boxRow('MIND', getHostMindLabel(hostProvider), chalk.magenta.bold));
        process.stdout.write(HUD.boxRow('BROKER', getOneMindBrokerStatus(), chalk.magenta.bold));
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
