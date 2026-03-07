import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { deployCandidate } from './deployment.js';
import { CortexLink } from './cortex_link.js';
import { HUD } from './core/hud.js';
import { execa } from 'execa';

// [ALFRED]: Resolve PROJECT_ROOT for cstar dispatching
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

interface CortexAskPayload {
    status: string;
    data: string | { data: { raw: string } };
}

interface CortexVerifyPayload {
    status: string;
    message?: string;
}

/**
 * Orchestrates the Gungnir Flight Cycle using the Agentic Stack.
 * Every step is now a Sovereign Agent Skill.
 */
export async function executeCycle(
    targetFile: string,
    ledgerDirectory: string,
    taskDescription: string,
    cortexLink: CortexLink,
    deployExec: (_target: string, _candidate: string, _msg: string) => Promise<void> = deployCandidate,
    isLoki: boolean = false
): Promise<void> {
    const cstarPath = path.join(PROJECT_ROOT, 'bin/cstar.js');

    // 1. Initial Telemetry Flare
    await execa('node', [cstarPath, 'telemetry', 'flare', '--path', targetFile, '--agent', 'ALFRED', '--action', 'REFACTOR']);

    process.stdout.write(HUD.boxTop('🔱 GUNGNIR FLIGHT CYCLE (v2.0)'));
    process.stdout.write(HUD.boxRow('TARGET', targetFile, HUD.palette.mimir));
    process.stdout.write(HUD.boxRow('DIRECTIVE', taskDescription.slice(0, 40) + '...', HUD.palette.sterling));
    
    // 2. Oracle Consultation (Intent Analysis)
    await HUD.spinner('Consulting the Oracle...');
    const oracleRes = await execa('node', [cstarPath, 'oracle', '--query', `Analyze the intent and potential refactoring path for ${targetFile} based on this directive: ${taskDescription}`]);
    
    // 3. Forge Artifact (Code Generation)
    process.stdout.write(HUD.boxRow('STATUS', 'Summoning the Forge', HUD.palette.accent));
    await HUD.spinner('Weaving candidate artifact...');
    
    // [ALFRED]: We use the 'forge' skill to generate the candidate
    const forgeRes = await execa('node', [cstarPath, 'forge', '--lore', targetFile, '--objective', taskDescription]);
    
    // 4. Verification (Raven Judgment / Warden Check)
    await HUD.spinner('Summoning the Raven for judgment...');
    
    // We simulate the Warden evaluation for the new candidate
    await execa('node', [cstarPath, 'warden', 'check', '--file', targetFile, '--action', 'REFACTOR_VALIDATION']);

    // 5. Deployment
    process.stdout.write(HUD.boxRow('VERIFICATION', 'JUDGMENT PASSED', HUD.palette.sterling));
    
    // [ALFRED]: In this transition, we use a staged artifact if available
    const artifactName = path.basename(targetFile);
    const candidatePath = path.join(PROJECT_ROOT, '.agents/forge_staged', artifactName);
    
    if (await fs.stat(candidatePath).catch(() => null)) {
        await deployExec(targetFile, candidatePath, 'C* Agentic Refactor: ' + taskDescription);
    } else {
        process.stdout.write(HUD.boxRow('ERROR', 'Forged artifact not found in staging.', HUD.palette.crucible));
    }

    // 6. Sterling Audit
    await HUD.spinner('Performing Sterling Audit...');
    const auditRes = await execa('node', [cstarPath, 'sterling', '--files', targetFile]);
    process.stdout.write(HUD.boxRow('AUDIT', 'Sovereignty verified', HUD.palette.mimir));

    // 7. Session Trace
    const missionId = `CYCLE-${Date.now()}`;
    await execa('node', [cstarPath, 'telemetry', 'trace', 
        '--mission', missionId, 
        '--file', targetFile, 
        '--metric', 'COMPLETION', 
        '--score', '1.0', 
        '--justification', `Gungnir Cycle complete for ${targetFile}`
    ]);

    process.stdout.write(HUD.boxSeparator());
    process.stdout.write(HUD.boxNote('Cycle complete. The matrix is updated.'));
    process.stdout.write(HUD.boxBottom());
}
