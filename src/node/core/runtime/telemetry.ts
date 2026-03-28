import { database } from  '../../../tools/pennyone/intel/database.js';

const deps = {
    getDb: (rootPath: string) => database.getDb(rootPath),
};

export { deps };

/**
 * [Ω] ORCHESTRATOR TELEMETRY BRIDGE
 * Purpose: Record swarm metrics and maintain heartbeats.
 * Mandate: Non-blocking, physical persistence of worker vitals.
 */
export class OrchestratorTelemetryBridge {
    constructor(private readonly projectRoot: string) {}

    /**
     * Updates the heartbeat for an active bead.
     */
    public async pulse(beadId: string): Promise<void> {
        const db = deps.getDb(this.projectRoot);
        db.prepare(`
            UPDATE hall_beads
            SET updated_at = ?
            WHERE bead_id = ?
        `).run(Date.now(), beadId);
    }

    /**
     * Records final metrics for a worker execution.
     */
    public async recordExecution(beadId: string, outcome: {
        status: string;
        exit_code?: number;
        duration_ms?: number;
    }): Promise<void> {
        const db = deps.getDb(this.projectRoot);
        
        // Find existing validation run or create a new one for this execution
        const validationId = `orch-run:${beadId}:${Date.now()}`;
        
        // Fetch repo_id for the project
        const repoRow = db.prepare('SELECT repo_id FROM hall_repositories LIMIT 1').get() as { repo_id: string };
        
        db.prepare(`
            INSERT INTO hall_validation_runs (
                validation_id, repo_id, bead_id, verdict, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            validationId,
            repoRow.repo_id,
            beadId,
            outcome.status,
            `Orchestrator Execution: Duration ${outcome.duration_ms}ms, Exit ${outcome.exit_code}`,
            Date.now()
        );
    }
}
