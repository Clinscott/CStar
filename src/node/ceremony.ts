import chalk, { ChalkInstance } from 'chalk';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activePersona } from '../tools/pennyone/personaRegistry.js';

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

const THEMES: Record<string, PersonaTheme> = {
    "O.D.I.N.": {
        main: chalk.red,
        dim: chalk.magenta,
        accent: chalk.yellow,
        title: "Ω O.D.I.N. GUNGNIR CONTROL Ω",
        greeting: "Speak, wanderer. The Hooded One listens.",
        bootMessages: [
            "Heimdall's Vigil: [SECURED]",
            "Mimir's Well: [SYNCHRONIZED]",
            "Huginn & Muninn: [CIRCLING]",
            "The Runes are cast."
        ],
        mandates: ["STRATEGY", "CREATION", "DOMINION"]
    },
    "A.L.F.R.E.D.": {
        main: chalk.cyan,
        dim: chalk.gray,
        accent: chalk.green,
        title: "C* A.L.F.R.E.D. DASHBOARD",
        greeting: "Good day, sir. The Archive is at your disposal.",
        bootMessages: [
            "Perimeter: [SECURE]",
            "Repository: [INDEXED]",
            "Logic Engine: [READY]",
            "Everything is in order, sir."
        ],
        mandates: ["MAINTENANCE", "LOGIC", "INTERFACE"]
    }
};

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

function getRavensStatus(): string {
    const pidPath = join(PROJECT_ROOT, '.agent', 'muninn.pid');
    if (fs.existsSync(pidPath)) {
        try {
            const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim());
            process.kill(pid, 0);
            return 'ACTIVE';
        } catch (e) {
            return 'IDLE';
        }
    }
    return 'OFFLINE';
}

function getPerimeterStatus(): string {
    const reportPath = join(PROJECT_ROOT, '.agent', 'perimeter_report.json');
    if (fs.existsSync(reportPath)) {
        try {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
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

function getPennyOneStatus(): string {
    const statsPath = join(PROJECT_ROOT, '.stats', 'matrix-graph.json');
    return fs.existsSync(statsPath) ? 'INDEXED' : 'OFFLINE';
}

function getForgeStatus(): string {
    const wardenPath = join(PROJECT_ROOT, 'test_warden.pkl');
    return fs.existsSync(wardenPath) ? 'ARMED' : 'IDLE';
}

function getFishtestStatus(): string {
    const dataPath = join(PROJECT_ROOT, 'fishtest_data.json');
    if (fs.existsSync(dataPath)) {
        return 'SYNCED';
    }
    return 'OFFLINE';
}

function getWardenStatus(): string {
    // Check if warden is active in state
    const statePath = join(PROJECT_ROOT, '.agent', 'sovereign_state.json');
    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            return state.warden?.active ? 'VIGILANT' : 'STANDBY';
        } catch (e) { }
    }
    return 'STANDBY';
}

function getVaultStatus(): string {
    const vaultDir = join(PROJECT_ROOT, '.agent', 'vault');
    const masterKey = join(vaultDir, 'master.key');
    const secretsBin = join(vaultDir, 'secrets.bin');
    if (fs.existsSync(masterKey) && fs.existsSync(secretsBin)) {
        return 'SECURED';
    }
    return fs.existsSync(masterKey) ? 'ARMED' : 'OFFLINE';
}

export async function runStartupCeremony() {
    const persona = activePersona.name;

    const theme = THEMES[persona] || THEMES["A.L.F.R.E.D."];
    const { main, dim, accent, title, greeting, bootMessages, mandates } = theme;

    const width = 64;
    const bar = "━".repeat(width);

    console.log(`\n${main(bar)}`);

    // Title Box
    const tLen = title.length;
    const pad = Math.max(0, Math.floor((width - tLen - 4) / 2));

    console.log(`${main("┏")}${main("━".repeat(pad))} ${chalk.bold(title)} ${main("━".repeat(width - tLen - 4 - pad))}${main("┓")}`);
    console.log(`${main("┃")}${" ".repeat(width - 2)}${main("┃")}`);

    // Greeting
    const gPad = Math.max(0, width - 6 - greeting.length);
    console.log(`${main("┃")}  ${dim(greeting)}${" ".repeat(gPad)}  ${main("┃")}`);

    console.log(`${main("┃")}${" ".repeat(width - 2)}${main("┃")}`);
    console.log(`${main("┗")}${main("━".repeat(width - 2))}${main("┛")}`);

    // Mandates & Status Section
    console.log(` ${dim("ACTIVE MANDATES:")} ${mandates.map(m => accent.bold(m)).join(dim(" | "))}`);
    console.log(` ${main("─".repeat(width - 2))}`);

    if (persona === 'O.D.I.N.') {
        const ravens = getRavensStatus();
        const forge = getForgeStatus();
        const fishtest = getFishtestStatus();
        const warden = getWardenStatus();
        const vault = getVaultStatus();

        console.log(`   ${dim("◈")} RAVENS:    ${getStatusColor(ravens)(ravens.padEnd(10))} ${dim("◈")} FORGE:     ${getStatusColor(forge)(forge.padEnd(10))}`);
        console.log(`   ${dim("◈")} FISHTEST:  ${getStatusColor(fishtest)(fishtest.padEnd(10))} ${dim("◈")} VIGIL:     ${getStatusColor(warden)(warden.padEnd(10))}`);
        console.log(`   ${dim("◈")} VAULT:     ${getStatusColor(vault)(vault.padEnd(10))}`);
    } else {
        const perimeter = getPerimeterStatus();
        const pennyone = getPennyOneStatus();
        const vault = getVaultStatus();

        console.log(`   ${dim("◈")} PERIMETER: ${getStatusColor(perimeter)(perimeter.padEnd(10))} ${dim("◈")} REPOSITORY: ${getStatusColor(pennyone)(pennyone.padEnd(10))}`);
        console.log(`   ${dim("◈")} ARCHIVE:   ${chalk.green("SECURE    ")} ${dim("◈")} VAULT:      ${getStatusColor(vault)(vault.padEnd(10))}`);
    }

    console.log(` ${main("─".repeat(width - 2))}`);

    // Gemini CLI Integration Status
    if (process.env.GEMINI_CLI_ACTIVE === 'true') {
        const mind = "GEMINI-3.1-PRO"; // This could be dynamic in the future
        console.log(`   ${dim("◈")} INTELLIGENCE: ${chalk.magenta.bold("DECOUPLED")} ${dim("◈")} MIND: ${chalk.magenta.bold(mind)}`);
        console.log(`   ${main("─".repeat(width - 2))}`);
    }

    // Boot sequence
    for (const msg of bootMessages) {
        process.stdout.write(`  ${dim("▷")} ${msg}`);
        await sleep(100);
        console.log(` ${accent("OK")}`);
    }

    console.log(`${main(bar)}\n`);
}
