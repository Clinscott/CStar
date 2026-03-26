import { database } from  '../../../tools/pennyone/intel/database.js';
import { WorkerResult } from  './worker_bridge.js';

/**
 * [Ω] ORCHESTRATOR REAPER
 * Purpose: Map worker outcomes to bead lifecycle states.
 * Mandate: Automated triage and clean failure detection.
 */
export class OrchestratorReaper {
    constructor(private readonly projectRoot: string) {}

    /**
     * Maps worker exit code and output to a final Hall status.
     */
    public async mapOutcome(beadId: string, result: WorkerResult): Promise<string> {
        const db = database.getDb(this.projectRoot);
        let finalStatus = 'BLOCKED';
        let triageReason = '';
        let assignedAgent: string | null = null;

        const beadRow = db.prepare(`
            SELECT status, assigned_agent, triage_reason
            FROM hall_beads
            WHERE bead_id = ?
        `).get(beadId) as { status?: string, assigned_agent?: string, triage_reason?: string } | undefined;
        
        const hallStatus = typeof beadRow?.status === 'string' ? beadRow.status : undefined;
        const currentAgent = typeof beadRow?.assigned_agent === 'string' ? beadRow.assigned_agent : undefined;

        if (result.timedOut || result.exitCode === 124) {
            triageReason = 'Orchestrator: Worker timed out during deep reasoning.';
            
            // TIMEOUT ESCALATION: If local worker times out, elevate to Host Worker immediately
            if (!currentAgent || currentAgent === 'SOVEREIGN-WORKER') {
                finalStatus = 'SET';
                assignedAgent = 'HOST-WORKER';
                triageReason = `[Escalation Protocol] Local worker timed out. Escalating to HOST-WORKER to ensure completion.`;
            } else {
                finalStatus = 'BLOCKED';
            }
        } else if (result.exitCode === 0) {
            if (hallStatus === 'RESOLVED' || hallStatus === 'READY_FOR_REVIEW') {
                finalStatus = hallStatus;
            } else {
                // Success - Move to review
                finalStatus = 'READY_FOR_REVIEW';
            }
            
            // Clean Failure Detection (V1: Simple check if logs are empty but success claimed)
            if (result.stdout.trim().length < 10) {
                finalStatus = 'NEEDS_TRIAGE';
                triageReason = 'Orchestrator: Worker exited with 0 but provided no meaningful output.';
            }
        } else {
            // General Failure
            finalStatus = 'BLOCKED';
            const lastLines = result.stderr.split('\n').slice(-5).join(' ');
            triageReason = `Orchestrator: Worker failed (exit ${result.exitCode}). Last log: ${lastLines}`;

            // ESCALATION PROTOCOL:
            // If the local worker failed, escalate to the Host Worker instead of blocking indefinitely.
            // [🔱] THE KERNEL TRAP: Auto-trigger Phoenix Loop for self-healing
            if (!currentAgent || currentAgent === 'SOVEREIGN-WORKER') {
                finalStatus = 'RECAST';
                assignedAgent = 'PHOENIX';
                triageReason = `[Kernel Trap] Worker failed. Triggering 'spell:phoenix_loop' for autonomous self-healing.`;
            } else {
                finalStatus = 'BLOCKED';
            }
        }

        // Update Hall of Records
        if (assignedAgent) {
             db.prepare(`
                 UPDATE hall_beads
                 SET status = ?,
                     assigned_agent = ?,
                     triage_reason = ?,
                     updated_at = ?
                 WHERE bead_id = ?
             `).run(finalStatus, assignedAgent, triageReason || null, Date.now(), beadId);
        } else {
             db.prepare(`
                 UPDATE hall_beads
                 SET status = ?,
                     triage_reason = ?,
                     updated_at = ?
                 WHERE bead_id = ?
             `).run(finalStatus, triageReason || null, Date.now(), beadId);
        }

        return finalStatus;
    }
}
