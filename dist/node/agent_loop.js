import fs from 'node:fs/promises';
import path from 'node:path';
import { deployCandidate } from './deployment.js';
import { HUD } from './core/hud.js';
/**
 * Orchestrates the 7-step Gungnir Flight Cycle to modify and verify a target file.
 * @param {string} targetFile - The code file the agent should analyze/refactor.
 * @param {string} ledgerDirectory - The path to the working knowledge/ledger vault.
 * @param {string} taskDescription - The high-level directive for the compute plane.
 * @param {CortexLink} cortexLink - Instantiated TCP bridge to the Python daemon.
 * @param {Function} deployExec - Dependency-injected execution function (defaults to internal deployCandidate).
 */
export async function executeCycle(targetFile, ledgerDirectory, taskDescription, cortexLink, deployExec = deployCandidate, isLoki = false) {
    // 1. Extract Directives
    process.stdout.write(HUD.boxTop('🔱 GUNGNIR FLIGHT CYCLE'));
    process.stdout.write(HUD.boxRow('TARGET', targetFile, HUD.palette.mimir));
    process.stdout.write(HUD.boxRow('DIRECTIVE', taskDescription.slice(0, 40) + '...', HUD.palette.sterling));
    await HUD.spinner('Consulting the Archives...');
    try {
        await fs.readFile(path.join(ledgerDirectory, 'ledger.json'), 'utf8');
    }
    catch {
        // Fallback to empty context if no explicit ledger config exists
    }
    if (isLoki) {
        process.stdout.write(HUD.boxRow('MODE', 'LOKI (AUTONOMOUS)', HUD.palette.crucible));
    }
    // 2. Read Target Code
    try {
        await fs.readFile(targetFile, 'utf8');
    }
    catch (error) {
        process.stdout.write(HUD.boxRow('CRITICAL FAILURE', 'Target file not found', HUD.palette.crucible));
        process.stdout.write(HUD.boxBottom());
        throw new Error(`Target file not found: ${targetFile}`, { cause: error });
    }
    // 4. Agent Call
    await HUD.spinner('Transmitting constraints...');
    const payloadArgs = [taskDescription, targetFile, isLoki ? 'LOKI_MODE' : 'STANDARD'];
    const response = await cortexLink.sendCommand('ask', payloadArgs);
    const askPayload = response;
    if (!askPayload || (askPayload.status !== 'success' && askPayload.status !== 'uplink_success')) {
        process.stdout.write(HUD.boxRow('UPLINK FAILURE', 'Cortex Daemon rejected request', HUD.palette.crucible));
        process.stdout.write(HUD.boxBottom());
        throw new Error(`Execution aborted: Cortex Daemon reported failure during 'ask' step. Details: ${JSON.stringify(askPayload)}`);
    }
    const forgedCode = askPayload.status === 'uplink_success'
        ? askPayload.data.data.raw
        : askPayload.data;
    // 5. Save Candidate
    process.stdout.write(HUD.boxRow('STATUS', 'Candidate forged', HUD.palette.accent));
    const parsedPath = path.parse(targetFile);
    const candidatePath = path.join(parsedPath.dir, `${parsedPath.name}_candidate${parsedPath.ext}`);
    const cleanCode = forgedCode.includes('```python')
        ? forgedCode.split('```python')[1].split('```')[0].trim()
        : forgedCode.trim();
    await cortexLink.interceptWrite(targetFile, cleanCode);
    await fs.writeFile(candidatePath, cleanCode, 'utf8');
    // 6. Invoke Gungnir Strike
    await HUD.spinner('Summoning the Raven for judgment...');
    const verifyResponse = await cortexLink.sendCommand('verify', [candidatePath, ledgerDirectory]);
    const verifyPayload = verifyResponse;
    if (!verifyPayload || verifyPayload.status !== 'success') {
        process.stdout.write(HUD.boxRow('VERIFICATION', 'JUDGMENT FAILED', HUD.palette.crucible));
        process.stdout.write(HUD.boxBottom());
        throw new Error(`Verification failed: Cortex Daemon rejected the candidate. Details: ${JSON.stringify(verifyPayload)}`);
    }
    // 7. Deploy to Mainline
    process.stdout.write(HUD.boxRow('VERIFICATION', 'JUDGMENT PASSED', HUD.palette.sterling));
    await deployExec(targetFile, candidatePath, 'C* Auto-Refactor: ' + taskDescription);
    // 8. Sterling Verification
    await HUD.spinner('Performing Sterling Audit...');
    const auditRes = await cortexLink.sendCommand('verify_sterling_compliance', { filepaths: [targetFile] });
    // 9. Complete
    process.stdout.write(HUD.boxSeparator());
    process.stdout.write(HUD.boxNote('Cycle complete. The stars await...'));
    process.stdout.write(HUD.boxBottom());
}
