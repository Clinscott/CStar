import { createHash } from 'node:crypto';

import { StateRegistry, type BlackboardEntry } from './state.js';

export const blackboardManagerDeps = {
    stateRegistry: StateRegistry,
};

/** Deterministic, non-model compaction for the volatile operator blackboard. */
export class BlackboardManager {
    private static compacting = false;

    public static async compactIfNecessary(): Promise<void> {
        if (this.compacting) return;
        this.compacting = true;

        const { stateRegistry } = blackboardManagerDeps;
        try {
            const state = stateRegistry.get();
            const blackboard = state.blackboard || [];
            if (blackboard.length < 20) return;

            const toCompact = blackboard.slice(0, 15);
            const remaining = blackboard.slice(15);
            const digest = createHash('sha256')
                .update(JSON.stringify(toCompact))
                .digest('hex');
            const firstAt = toCompact.at(0)?.at ?? 0;
            const lastAt = toCompact.at(-1)?.at ?? firstAt;
            const summaryEntry: BlackboardEntry = {
                at: Date.now(),
                from: 'CStar',
                message: `[COMPACTION] Rolled up ${toCompact.length} entries; range=${firstAt}-${lastAt}; sha256=${digest}.`,
                type: 'INFO',
            };
            const nextBlackboard = [summaryEntry, ...remaining];
            stateRegistry.save({ ...state, blackboard: nextBlackboard });
            state.blackboard = nextBlackboard;
            stateRegistry.pushTerminalLog(
                '[CStar] Blackboard compacted deterministically; no model or external lane was invoked.',
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stateRegistry.pushTerminalLog(`[CStar:ERR] Blackboard compaction failed: ${message}`);
        } finally {
            this.compacting = false;
        }
    }
}
