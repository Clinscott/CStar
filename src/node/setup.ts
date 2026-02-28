import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chalk from 'chalk';
import { execa } from 'execa';

// Resolve project root dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'config.json');

/**
 * Loads the active persona from the config file.
 * @param fsMock - Optional fs mock for testing.
 * @returns The active persona name.
 */
async function getActivePersona(fsMock: any = fs): Promise<string> {
    try {
        const configData = await fsMock.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configData);
        return config.system?.persona || 'ALFRED';
    } catch (_err: unknown) {
        return 'ALFRED'; // Fallback
    }
}

/**
 * Themed logger for the Genesis sequence.
 * @param persona - Active persona (ODIN/ALFRED)
 * @param level - Log level (INFO, SUCCESS, WARN, FAIL)
 * @param message - Message body
 */
function personaLog(persona: string, level: string, message: string): void {
    const isOdin = persona === 'ODIN';
    const prefix = isOdin ? '[O.D.I.N.]' : 'ALFRED:';

    let color = chalk.cyan;
    if (level === 'SUCCESS') color = chalk.green;
    if (level === 'WARN') color = chalk.yellow;
    if (level === 'FAIL') color = chalk.red;

    const formattedMessage = isOdin ? message : `'${message}'`;
    console.log(color(`${prefix} ${formattedMessage}`));
}

/**
 * Pure function to construct the OS-specific path to the python virtual environment
 * executable binaries (like pip).
 * @param platform - The OS platform (e.g. process.platform)
 * @param projectRoot - The absolute path to the project root
 * @param binaryName - The name of the binary (e.g. 'pip' or 'python')
 * @returns The absolute path to the binary
 */
export function getVenvBinaryPath(platform: string, projectRoot: string, binaryName: string): string {
    if (platform === 'win32') {
        const bin = binaryName === 'python' ? 'python.exe' : `${binaryName}.exe`;
        return path.join(projectRoot, '.venv', 'Scripts', bin);
    }
    return path.join(projectRoot, '.venv', 'bin', binaryName);
}

/**
 * Executes the autonomous Corvus Star (C*) Bootstrap genesis sequence.
 * This establishes the isolated Python compute plane and globally links the Node.js Gungnir CLI.
 * @param platform - injected OS platform
 * @param execFunction - Dependency-injected execution function for testing.
 * @param fsMock - Dependency-injected fs/promises for testing.
 */
export async function executeGenesisSequence(
    platform: string = process.platform, 
    execFunction: any = execa, 
    fsMock: any = fs
): Promise<void> {
    const persona = await getActivePersona(fsMock);

    try {
        personaLog(persona, 'INFO', `Initiating Genesis sequence at ${PROJECT_ROOT}...`);
        const venvPath = path.join(PROJECT_ROOT, '.venv');

        // Step 1: The Virtual Environment
        let venvExists = false;
        try {
            await fsMock.access(venvPath);
            venvExists = true;
            personaLog(persona, 'INFO', 'Python Compute Plane (.venv) already exists. Skipping creation.');
        } catch (_err: unknown) {
            // ENOENT - .venv does not exist
        }

        if (!venvExists) {
            personaLog(persona, 'INFO', 'Forging Python Compute Plane (venv)...');
            await execFunction('python', ['-m', 'venv', '.venv'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
        }

        // Step 2: The Dependencies
        personaLog(persona, 'INFO', 'Installing synaptic weights (requirements.txt)...');
        const pipPath = getVenvBinaryPath(platform, PROJECT_ROOT, 'pip');

        // Ensure requirements.txt exists before running pip install
        try {
            await fsMock.access(path.join(PROJECT_ROOT, 'requirements.txt'));
            // Pass stdio: 'inherit' to show live progress of pip downloads
            await execFunction(pipPath, ['install', '-r', 'requirements.txt'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
        } catch (err: any) {
            throw new Error(`Failed to locate or install requirements.txt: ${err.message}`, { cause: err });
        }

        // Step 3: The Global Link
        if (process.env.CI) {
            personaLog(persona, 'WARN', 'CI Environment Detected. Skipping global npm link.');
        } else if (process.env.CSTAR_SKIP_LINK) {
            personaLog(persona, 'WARN', 'Recursion guard active. Skipping nested npm link.');
        } else {
            personaLog(persona, 'INFO', 'Binding Gungnir Control Plane (npm link)...');
            try {
                await execFunction('npm', ['link'], {
                    cwd: PROJECT_ROOT,
                    stdio: ['ignore', 'inherit', 'inherit'],
                    env: { ...process.env, CSTAR_SKIP_LINK: '1' }
                });
            } catch (_err: unknown) {
                personaLog(persona, 'WARN', 'Warning - Binding failed (npm link).');
                const remedy = 'Run "npm link" in an elevated terminal or use "node bin/cstar.js" directly.';
                console.log(chalk.yellow(`\n >> PROMPT: ${remedy}`));
            }
        }

        // Step 4: Completion
        personaLog(persona, 'SUCCESS', 'Genesis sequence complete. System is armed.');

    } catch (err: any) {
        // Strict Error Wrapping
        console.error(chalk.red('\n[SYSTEM FAILURE] Critical Failure during Genesis Bootstrap.'));
        console.error(chalk.red(`Details: ${err.message}\n`));
        throw err; // Re-throw to allow CLI wrapper to catch and set exit code 1
    }
}

// Automatically execute if run directly via Node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    executeGenesisSequence().catch(() => process.exit(1));
}
