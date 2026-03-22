import { ChildProcess } from 'node:child_process';

export const deps = {
    kill: (pid: number, signal: string | number) => process.kill(pid, signal),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
};

/**
 * [Ω] ORCHESTRATOR PROCESS MANAGER
 * Purpose: Robust PGID tracking and aggressive worker reaping.
 * Mandate: No zombies. Aggressive SIGKILL escalation.
 */
export class OrchestratorProcessManager {
    private activeGroups: Set<number> = new Set();

    /**
     * Registers a new process group for tracking.
     */
    public registerGroup(pgid: number): void {
        this.activeGroups.add(pgid);
    }

    /**
     * Removes a group from tracking (e.g. after clean exit).
     */
    public unregisterGroup(pgid: number): void {
        this.activeGroups.delete(pgid);
    }

    /**
     * Reaps a specific process group with escalation.
     */
    public async reapGroup(pgid: number): Promise<void> {
        if (!this.activeGroups.has(pgid)) return;

        try {
            // 1. SIGTERM: Graceful request
            deps.kill(-pgid, 'SIGTERM');
            
            // 2. Wait 2 seconds
            await new Promise(resolve => deps.setTimeout(resolve as () => void, 2000));

            // 3. Escalation: SIGKILL
            if (this.isGroupAlive(pgid)) {
                deps.kill(-pgid, 'SIGKILL');
            }
        } catch (err: any) {
            if (err.code !== 'ESRCH') {
                console.error(`[PROCESS-MANAGER]: Failed to reap group ${pgid}: ${err.message}`);
            }
        } finally {
            this.activeGroups.delete(pgid);
        }
    }

    /**
     * Reaps ALL tracked process groups.
     */
    public async reapAll(): Promise<void> {
        const groups = Array.from(this.activeGroups);
        await Promise.all(groups.map(pgid => this.reapGroup(pgid)));
    }

    private isGroupAlive(pgid: number): boolean {
        try {
            deps.kill(-pgid, 0); // Check if any process in group exists
            return true;
        } catch {
            return false;
        }
    }
}
