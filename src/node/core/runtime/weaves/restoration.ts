import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    RestorationWeavePayload,
    RuntimeDispatchPort,
    EvolveWeavePayload,
    CompressWeavePayload
} from '../contracts.ts';
import { getHallBeadsByStatus, getHallBeadsByEpic } from  '../../../../tools/pennyone/intel/database.js';
import chalk from 'chalk';

/**
 * 🔱 RESTORATION WEAVE
 * Logic: Identify (Hall) -> Implement (Evolve) -> Verify (Trace) -> Remember (Compress)
 */
export class RestorationWeave implements RuntimeAdapter<RestorationWeavePayload> {
    public readonly id = 'weave:restoration';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<RestorationWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const repoId = `repo:${projectRoot}`;

        // 1. Identify Beads
        let beads = [];
        if (payload.bead_ids && payload.bead_ids.length > 0) {
            beads = payload.bead_ids.map(id => ({ id }));
        } else if (payload.epic) {
            beads = getHallBeadsByEpic(repoId, payload.epic);
        } else {
            beads = getHallBeadsByStatus(repoId, 'SET');
        }

        if (beads.length === 0) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: '[ALFRED]: No sectors requiring restoration identified in the Hall.',
            };
        }

        const limit = payload.max_beads || 1;
        const targetBeads = beads.slice(0, limit);
        const outcomes: any[] = [];

        console.log(chalk.cyan(`\n ◤ RESTORATION WEAVE: ADVANCING ${targetBeads.length} SECTOR(S) ◢ `));

        for (const bead of targetBeads) {
            console.log(chalk.dim(`\n◈ Sector: ${bead.id}`));

            // 2. Implement (Evolve)
            console.log(chalk.dim('  ↳ Implementing evolution...'));
            const evolveResult = await this.dispatchPort.dispatch<EvolveWeavePayload>({
                weave_id: 'weave:evolve',
                payload: {
                    action: 'promote',
                    bead_id: bead.id,
                    project_root: projectRoot,
                    cwd: context.workspace_root,
                    simulate: false
                }
            });

            if (evolveResult.status !== 'SUCCESS') {
                console.error(chalk.red(`  [!] Evolution failed: ${evolveResult.error}`));
                outcomes.push({ bead_id: bead.id, status: 'FAILED', stage: 'EVOLVE' });
                continue;
            }

            // 3. Remember (Compress)
            console.log(chalk.dim('  ↳ Compressing episodic memory...'));
            const compressResult = await this.dispatchPort.dispatch<CompressWeavePayload>({
                weave_id: 'weave:distill',
                payload: {
                    bead_id: bead.id,
                    bead_intent: evolveResult.output,
                    project_root: projectRoot,
                    cwd: context.workspace_root,
                    metadata: evolveResult.metadata
                }
            });

            outcomes.push({ 
                bead_id: bead.id, 
                status: 'SUCCESS', 
                memory_id: compressResult.metadata?.memory_id 
            });
        }

        const successCount = outcomes.filter(o => o.status === 'SUCCESS').length;

        return {
            weave_id: this.id,
            status: successCount === targetBeads.length ? 'SUCCESS' : 'TRANSITIONAL',
            output: `[ALFRED]: Restoration complete. Successfully advanced ${successCount}/${targetBeads.length} sectors.`,
            metadata: { outcomes }
        };
    }
}
