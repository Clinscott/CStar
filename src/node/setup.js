import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chalk from 'chalk';
import { execa } from 'execa';

// Resolve project root dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Pure function to construct the OS-specific path to the python virtual environment
 * executable binaries (like pip).
 * 
 * @param {string} platform - The OS platform (e.g. process.platform)
 * @param {string} projectRoot - The absolute path to the project root
 * @param {string} binaryName - The name of the binary (e.g. 'pip' or 'python')
 * @returns {string} The absolute path to the binary
 */
export function getVenvBinaryPath(platform, projectRoot, binaryName) {
    if (platform === 'win32') {
        const bin = binaryName === 'python' ? 'python.exe' : `${binaryName}.exe`;
        return path.join(projectRoot, '.venv', 'Scripts', bin);
    }
    return path.join(projectRoot, '.venv', 'bin', binaryName);
}

/**
 * Executes the autonomous Corvus Star (C*) Bootstrap genesis sequence.
 * This establishes the isolated Python compute plane and globally links the Node.js Gungnir CLI.
 * 
 * @param {string} platform - injected OS platform
 * @param {Function} execFunction - Dependency-injected execution function for testing.
 * @param {Object} fsMock - Dependency-injected fs/promises for testing.
 */
export async function executeGenesisSequence(platform = process.platform, execFunction = execa, fsMock = fs) {
    try {
        console.log(chalk.cyan(`ALFRED: 'Initiating Genesis sequence at ${PROJECT_ROOT}...'`));
        const venvPath = path.join(PROJECT_ROOT, '.venv');

        // Step 1: The Virtual Environment
        let venvExists = false;
        try {
            await fsMock.access(venvPath);
            venvExists = true;
            console.log(chalk.cyan(`ALFRED: 'Python Compute Plane (.venv) already exists. Skipping creation.'`));
        } catch (err) {
            // ENOENT - .venv does not exist
        }

        if (!venvExists) {
            console.log(chalk.cyan(`ALFRED: 'Forging Python Compute Plane (venv)...'`));
            await execFunction('python', ['-m', 'venv', '.venv'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
        }

        // Step 2: The Dependencies
        console.log(chalk.cyan(`ALFRED: 'Installing synaptic weights (requirements.txt)...'`));
        const pipPath = getVenvBinaryPath(platform, PROJECT_ROOT, 'pip');

        // Ensure requirements.txt exists before running pip install
        try {
            await fsMock.access(path.join(PROJECT_ROOT, 'requirements.txt'));
            // Pass stdio: 'inherit' to show live progress of pip downloads
            await execFunction(pipPath, ['install', '-r', 'requirements.txt'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
        } catch (err) {
            throw new Error(`Failed to locate or install requirements.txt: ${err.message}`);
        }

        // Step 3: The Global Link
        if (process.env.CI) {
            console.log(chalk.yellow(`ALFRED: 'CI Environment Detected. Skipping global npm link.'`));
        } else if (process.env.CSTAR_SKIP_LINK) {
            console.log(chalk.yellow(`ALFRED: 'Recursion guard active. Skipping nested npm link.'`));
        } else {
            console.log(chalk.cyan(`ALFRED: 'Binding Gungnir Control Plane (npm link)...'`));
            try {
                await execFunction('npm', ['link'], {
                    cwd: PROJECT_ROOT,
                    stdio: ['ignore', 'inherit', 'inherit'],
                    env: { ...process.env, CSTAR_SKIP_LINK: '1' }
                });
            } catch (linkErr) {
                console.log(chalk.yellow(`ALFRED: 'Warning - npm link failed. You may need to link manually: npm link'`));
            }
        }

        // Step 4: Completion
        console.log(chalk.green(`ALFRED: 'Genesis sequence complete. System is armed.'`));

    } catch (err) {
        // Strict Error Wrapping
        console.error(chalk.red(`\n[SYSTEM FAILURE] Critical Failure during Genesis Bootstrap.`));
        console.error(chalk.red(`Details: ${err.message}\n`));
        throw err; // Re-throw to allow CLI wrapper to catch and set exit code 1
    }
}

// Automatically execute if run directly via Node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    executeGenesisSequence().catch(() => process.exit(1));
}
