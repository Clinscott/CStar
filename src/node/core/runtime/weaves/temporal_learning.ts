import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult,
    TemporalLearningWeavePayload,
    TemporalLearningWeaveMetadata
} from '../contracts.ts';
import { getDb, upsertHallBead } from '../../../../tools/pennyone/intel/database.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.ts';
import path from 'node:path';
import chalk from 'chalk';

/**
 * [Ω] TEMPORAL LEARNING WEAVE
 * Purpose: Bridge Chronos history into the Evolve learning loop.
 * Mandate: Learn from Churn.
 */
export class TemporalLearningWeave implements RuntimeAdapter<TemporalLearningWeavePayload> {
    public readonly id = 'weave:temporal-learning';

    public async execute(
        invocation: WeaveInvocation<TemporalLearningWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = context.workspace_root;
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const db = getDb();

        const lookbackMs = (payload.lookback_days || 30) * 24 * 60 * 60 * 1000;
        const since = Date.now() - lookbackMs;
        const minChurn = payload.min_churn || 3;
        const limit = payload.limit || 5;

        console.error(chalk.cyan(`[ALFRED] Analyzing temporal churn for ${repoId} (Since: ${new Date(since).toLocaleDateString()})...`));

        // 1. Identify "Hot" Sectors (High Churn)
        const hotSectors = db.prepare(`
            SELECT file_path, COUNT(*) as churn_count
            FROM hall_git_diffs
            JOIN hall_git_commits ON hall_git_diffs.commit_hash = hall_git_commits.commit_hash
            WHERE hall_git_diffs.repo_id = ? AND hall_git_commits.committed_at > ?
            GROUP BY file_path
            HAVING churn_count >= ?
            ORDER BY churn_count DESC
            LIMIT ?
        `).all(repoId, since, minChurn, limit) as { file_path: string, churn_count: number }[];

        const emittedBeads: string[] = [];

        for (const sector of hotSectors) {
            const absolutePath = path.resolve(projectRoot, sector.file_path);
            const beadId = `bead:evolve:temporal:${sector.file_path.replace(/[^a-z0-9]/gi, '-')}`;
            
            // 2. Generate Evolutionary Bead
            upsertHallBead({
                bead_id: beadId,
                repo_id: repoId,
                target_kind: 'FILE',
                target_path: absolutePath,
                rationale: `Temporal Learning identified this as a high-churn sector (${sector.churn_count} commits in ${payload.lookback_days || 30} days). Use Karpathy's Auto Researcher (Evolve) to stabilize and optimize the logic.`,
                acceptance_criteria: '- The target file must maintain structural integrity after the optimization cycle.\n- Evolutionary changes must show a statistically significant improvement in the target Gungnir axis.',
                status: 'OPEN',
                source_kind: 'TEMPORAL_LEARNING',
                created_at: Date.now(),
                updated_at: Date.now(),
                contract_refs: ['contract:evolve'],
                baseline_scores: { overall: 7.0 } // Default baseline
            });

            emittedBeads.push(beadId);
            console.error(chalk.green(`- Emitted: ${beadId} for ${sector.file_path} (Churn: ${sector.churn_count})`));
        }

        const metadata: TemporalLearningWeaveMetadata = {
            identified_sectors: hotSectors.length,
            emitted_beads: emittedBeads,
        };

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `Temporal learning analyzed the Hall. Identified ${hotSectors.length} sectors for evolutionary optimization.`,
            metadata
        };
    }
}
