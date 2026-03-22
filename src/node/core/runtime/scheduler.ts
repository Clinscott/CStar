import { database } from '../../../tools/pennyone/intel/database.ts';
import { buildHallRepositoryId, normalizeHallPath, HallBeadStatus } from '../../../types/hall.ts';
import { registry } from '../../../tools/pennyone/pathRegistry.ts';
import { SovereignBead } from '../../../types/bead.ts';

/**
 * [Ω] ORCHESTRATOR SCHEDULER
 * Purpose: Deterministic bead selection and zombie reclamation.
 * Mandate: Plan-First (Only SET beads).
 */
export class OrchestratorScheduler {
    private readonly repoId: string;

    constructor(private readonly projectRoot: string) {
        this.repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
    }

    /**
     * Reclaims beads that are IN_PROGRESS but have stale heartbeats.
     * Logic: If updated_at > 10 minutes ago, reset to SET.
     */
    public async reclaimZombies(): Promise<number> {
        const db = database.getDb(this.projectRoot);
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        
        const result = db.prepare(`
            UPDATE hall_beads 
            SET status = 'SET', 
                assigned_agent = NULL,
                triage_reason = 'Orchestrator: Reclaimed zombie bead (stale heartbeat).'
            WHERE repo_id = ? 
              AND status = 'IN_PROGRESS' 
              AND updated_at < ?
        `).run(this.repoId, tenMinutesAgo);

        return result.changes;
    }

    /**
     * Fetches the next batch of beads to process.
     * Priority Logic: Beads targeting low-Gungnir sectors are prioritized to stabilize the system.
     * Calculated as: (10.0 - Gungnir Baseline) * Strategic Weight.
     */
    public async getNextBatch(limit: number): Promise<SovereignBead[]> {
        const db = database.getDb(this.projectRoot);
        
        // Fetch beads in SET state
        const rows = db.prepare(`
            SELECT * FROM hall_beads
            WHERE repo_id = ? AND status = 'SET'
        `).all(this.repoId) as any[];

        // Perform in-memory sorting based on Gungnir baseline
        const materialized = rows.map(row => {
            const bead = {
                id: row.bead_id,
                status: row.status as HallBeadStatus,
                rationale: row.rationale,
                target_path: row.target_path,
                assigned_agent: row.assigned_agent,
                baseline_scores: JSON.parse(row.baseline_scores_json || '{}'),
                created_at: row.created_at
            } as any;

            // Calculate priority score: (10 - overall)
            // If no baseline, treat as 0 (highest priority for new sectors)
            const overall = bead.baseline_scores.overall || 0;
            bead.priority_score = (10.0 - overall);
            
            return bead;
        });

        // Sort: Highest priority first, then oldest first
        materialized.sort((a, b) => {
            if (b.priority_score !== a.priority_score) {
                return b.priority_score - a.priority_score;
            }
            return a.created_at - b.created_at;
        });

        return materialized.slice(0, limit).map(m => ({
            id: m.id,
            status: m.status,
            rationale: m.rationale,
            target_path: m.target_path,
            assigned_agent: m.assigned_agent
        } as unknown as SovereignBead));
    }
}
