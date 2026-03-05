import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { deployCandidate } from './deployment.ts';
import { CortexLink } from './cortex_link.ts';
import { activePersona } from '../tools/pennyone/personaRegistry.ts';

interface CortexAskPayload {
    status: string;
    data: string | { data: { raw: string } };
}

interface CortexVerifyPayload {
    status: string;
    message?: string;
}

/**
 * Orchestrates the 7-step Gungnir Flight Cycle to modify and verify a target file.
 * @param {string} targetFile - The code file the agent should analyze/refactor.
 * @param {string} ledgerDirectory - The path to the working knowledge/ledger vault.
 * @param {string} taskDescription - The high-level directive for the compute plane.
 * @param {CortexLink} cortexLink - Instantiated TCP bridge to the Python daemon.
 * @param {Function} deployExec - Dependency-injected execution function (defaults to internal deployCandidate).
 */
export async function executeCycle(
    targetFile: string,
    ledgerDirectory: string,
    taskDescription: string,
    cortexLink: CortexLink,
    deployExec: (_target: string, _candidate: string, _msg: string) => Promise<void> = deployCandidate,
    isLoki: boolean = false
): Promise<void> {
    // 1. Extract Directives
    console.log(chalk.cyan(`${activePersona.prefix} 'Consulting the Archives...'`));
    try {
        await fs.readFile(path.join(ledgerDirectory, 'ledger.json'), 'utf8');
    } catch {
        // Fallback to empty context if no explicit ledger config exists
    }

    if (isLoki) {
        console.log(chalk.red.bold(`\n[HEIMDALL] LOKI MODE ENGAGED. AUTONOMOUS VELOCITY ACTIVE.\n`));
    }

    // 2. Read Target Code
    try {
        await fs.readFile(targetFile, 'utf8');
    } catch (error) {
        console.error(chalk.bgRed.white.bold(' [SYSTEM FAILURE] '));
        console.error(chalk.red(`Critical Failure: Target file not found: ${targetFile}\n`));
        throw new Error(`Target file not found: ${targetFile}`, { cause: error });
    }

    // 3. Construct Prompt -> Handled automatically by Daemon orchestration

    // 4. Agent Call
    console.log(chalk.cyan(`${activePersona.prefix} 'Transmitting constraints...'`));
    
    // Pass LOKI mode explicitly in the ask payload args
    const payloadArgs = [taskDescription, targetFile, isLoki ? 'LOKI_MODE' : 'STANDARD'];
    const response = await cortexLink.sendCommand('ask', payloadArgs);
    const askPayload = response as unknown as CortexAskPayload;

    if (!askPayload || (askPayload.status !== 'success' && askPayload.status !== 'uplink_success')) {
        throw new Error(`Execution aborted: Cortex Daemon reported failure during 'ask' step. Details: ${JSON.stringify(askPayload)}`);
    }

    // [Ω] Normalize data extraction (handle nested 'uplink' payloads)
    const forgedCode = askPayload.status === 'uplink_success' 
        ? (askPayload.data as { data: { raw: string } }).data.raw 
        : askPayload.data as string;

    // 5. Save Candidate
    console.log(chalk.cyan(`${activePersona.prefix} 'Candidate forged...'`));
    const parsedPath = path.parse(targetFile);
    const candidatePath = path.join(parsedPath.dir, `${parsedPath.name}_candidate${parsedPath.ext}`);

    // [Ω] Extract code from markdown block if present
    const cleanCode = forgedCode.includes('```python')
        ? forgedCode.split('```python')[1].split('```')[0].trim()
        : forgedCode.trim();

    // [🔱] PRECOGNITIVE VIGILANCE: Intercept mutation before disk-commit
    await cortexLink.interceptWrite(targetFile, cleanCode);

    await fs.writeFile(candidatePath, cleanCode, 'utf8');

    // 6. Invoke Gungnir Strike
    console.log(chalk.cyan(`${activePersona.prefix} 'Summoning the Raven for judgment...'`));
    const verifyResponse = await cortexLink.sendCommand('verify', [candidatePath, ledgerDirectory]);
    const verifyPayload = verifyResponse as unknown as CortexVerifyPayload;

    if (!verifyPayload || verifyPayload.status !== 'success') {
        throw new Error(`Verification failed: Cortex Daemon rejected the candidate. Details: ${JSON.stringify(verifyPayload)}`);
    }

    // 7. Deploy to Mainline
    await deployExec(targetFile, candidatePath, 'C* Auto-Refactor: ' + taskDescription);

    // 8. Sterling Verification (PROJECT: ALFRED'S WATCH)
    console.log(chalk.cyan(`${activePersona.prefix} 'Performing Sterling Audit...'`));
    console.log(chalk.dim(`${activePersona.prefix} 'Too much mind, Master. Trust the standard.'`));
    
    const auditRes = await cortexLink.sendCommand('verify_sterling_compliance', { filepaths: [targetFile] });
    console.log(auditRes.data?.raw || JSON.stringify(auditRes));

    // 9. Complete
    console.log(chalk.green(`${activePersona.prefix} 'Cycle complete. The stars await...'`));
}
