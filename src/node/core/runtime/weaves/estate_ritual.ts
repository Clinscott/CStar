import { 
    RuntimeAdapter, 
    RuntimeContext, 
    RuntimeDispatchPort, 
    WeaveInvocation, 
    WeaveResult 
} from '../contracts.ts';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface EstateRitualPayload {
    include_spokes?: boolean;
    auto_execute?: boolean;
}

/**
 * [Ω] ESTATE RITUAL WEAVE
 * Purpose: Orchestrate the daily maintenance ritual under host supervision.
 * Mandate: "Update, Ingest, Weave."
 */
export class EstateRitualWeave implements RuntimeAdapter<EstateRitualPayload> {
    public readonly id = 'weave:estate-ritual';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<EstateRitualPayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const results: string[] = [];
        const projectRoot = context.workspace_root;

        // 1. UPDATE (Kernel Primitives)
        results.push('--- [STAGE 1: THE UPDATE] ---');
        const updateResult = this.updateEstate(projectRoot, invocation.payload.include_spokes !== false);
        results.push(updateResult);

        // 2. INGEST (Bookmark Weaver)
        results.push('\n--- [STAGE 2: THE INGEST] ---');
        const ingestResult = await this.dispatchPort.dispatch({
            skill_id: 'bookmark-weaver',
            target_path: projectRoot,
            intent: 'Daily bookmark ingestion ritual.',
            params: {},
            status: 'PENDING',
            priority: 1
        } as any);
        results.push(ingestResult.status === 'SUCCESS' ? (ingestResult.output || 'Ingestion complete.') : `Ingestion failed: ${ingestResult.error}`);

        // 3. THE SWARM (Host Governor Resume)
        if (invocation.payload.auto_execute !== false) {
            results.push('\n--- [STAGE 3: THE SWARM] ---');
            const governorResult = await this.dispatchPort.dispatch({
                weave_id: 'weave:host-governor',
                payload: {
                    task: 'Daily autonomous maintenance swarm.',
                    auto_execute: true,
                    auto_replan_blocked: true,
                    max_parallel: 1,
                    project_root: projectRoot,
                    cwd: projectRoot,
                    source: 'ritual',
                },
                session: invocation.session,
            });
            results.push(governorResult.status === 'SUCCESS' ? (governorResult.output || 'Swarm initiated.') : `Swarm failed: ${governorResult.error}`);
        }

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: results.join('\n'),
        };
    }

    private updateEstate(projectRoot: string, includeSpokes: boolean): string {
        const outputs: string[] = [];
        
        // Update CStar
        outputs.push('• Updating CStar...');
        const cstarUpdate = spawnSync('git', ['pull'], { cwd: projectRoot, encoding: 'utf-8' });
        outputs.push(cstarUpdate.stdout || cstarUpdate.stderr || 'No output.');

        if (includeSpokes) {
            const statePath = path.join(projectRoot, '.agents', 'sovereign_state.json');
            if (fs.existsSync(statePath)) {
                try {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                    const spokes = state.managed_spokes || [];
                    for (const spoke of spokes) {
                        if (spoke.root_path && fs.existsSync(path.join(spoke.root_path, '.git'))) {
                            outputs.push(`• Updating Spoke: ${spoke.slug}...`);
                            const spokeUpdate = spawnSync('git', ['pull'], { cwd: spoke.root_path, encoding: 'utf-8' });
                            outputs.push(spokeUpdate.stdout || spokeUpdate.stderr || 'No output.');
                        }
                    }
                } catch (e: any) {
                    outputs.push(`Error parsing spokes: ${e.message}`);
                }
            }
        }

        return outputs.join('\n');
    }
}
