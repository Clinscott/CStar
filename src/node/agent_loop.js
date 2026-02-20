import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { deployCandidate } from './deployment.js';

/**
 * Orchestrates the 7-step Gungnir Flight Cycle to modify and verify a target file.
 * 
 * @param {string} targetFile - The code file the agent should analyze/refactor.
 * @param {string} ledgerDirectory - The path to the working knowledge/ledger vault.
 * @param {string} taskDescription - The high-level directive for the compute plane.
 * @param {CortexLink} cortexLink - Instantiated TCP bridge to the Python daemon.
 * @param {Function} deployExec - Dependency-injected execution function (defaults to internal deployCandidate).
 */
export async function executeCycle(targetFile, ledgerDirectory, taskDescription, cortexLink, deployExec = deployCandidate) {
    // 1. Extract Directives
    console.log(chalk.cyan("ALFRED: 'Consulting the Archives...'"));
    let ledgerConfig = "";
    try {
        ledgerConfig = await fs.readFile(path.join(ledgerDirectory, 'ledger.json'), 'utf8');
    } catch (err) {
        // Fallback to empty context if no explicit ledger config exists
        ledgerConfig = "";
    }

    // 2. Read Target Code
    let targetData = "";
    try {
        targetData = await fs.readFile(targetFile, 'utf8');
    } catch (err) {
        console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
        console.error(chalk.red(`Critical Failure: Target file not found: ${targetFile}\n`));
        throw new Error(`Target file not found: ${targetFile}`);
    }

    // 3. Construct Prompt -> Handled automatically by Daemon orchestration

    // 4. Agent Call
    console.log(chalk.cyan("ALFRED: 'Transmitting constraints...'"));
    const askPayload = await cortexLink.sendCommand('ask', [taskDescription, targetFile]);

    if (!askPayload || askPayload.status !== 'success') {
        throw new Error(`Execution aborted: Cortex Daemon reported failure during 'ask' step. Details: ${JSON.stringify(askPayload)}`);
    }

    // 5. Save Candidate
    console.log(chalk.cyan("ALFRED: 'Candidate forged...'"));
    const parsedPath = path.parse(targetFile);
    const candidatePath = path.join(parsedPath.dir, `${parsedPath.name}_candidate${parsedPath.ext}`);
    await fs.writeFile(candidatePath, askPayload.data, 'utf8');

    // 6. Invoke Gungnir Strike
    console.log(chalk.cyan("ALFRED: 'Summoning the Raven for judgment...'"));
    const verifyPayload = await cortexLink.sendCommand('verify', [candidatePath, ledgerDirectory]);

    if (!verifyPayload || verifyPayload.status !== 'success') {
        throw new Error(`Verification failed: Cortex Daemon rejected the candidate. Details: ${JSON.stringify(verifyPayload)}`);
    }

    // 8. Deploy to Mainline
    await deployExec(targetFile, candidatePath, "C* Auto-Refactor: " + taskDescription);

    // 9. Complete
    console.log(chalk.green("ALFRED: 'Cycle complete. The stars await...'"));
}
