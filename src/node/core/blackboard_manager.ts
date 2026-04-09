import { StateRegistry, BlackboardEntry } from './state.js';
import { requestHostText } from '../../core/host_intelligence.js';
import { registry } from '../../tools/pennyone/pathRegistry.js';

export const blackboardManagerDeps = {
    stateRegistry: StateRegistry,
    registry,
    requestHostText,
};

/**
 * [🔱] BLACKBOARD MANAGER
 * Purpose: Manage shared state endurance through periodic compaction.
 * Standard: Linscott Protocol (Memory Tiering).
 */
export class BlackboardManager {
    /**
     * Compacts the blackboard if it exceeds a certain threshold.
     * Rolls up old entries into a single "Battle Summary" engram.
     */
    public static async compactIfNecessary(): Promise<void> {
        const { stateRegistry, registry, requestHostText } = blackboardManagerDeps;
        const state = stateRegistry.get();
        const blackboard = state.blackboard || [];

        // Threshold: 20 entries. If more, compact the oldest 15.
        if (blackboard.length < 20) {
            return;
        }

        const toCompact = blackboard.slice(0, 15);
        const remaining = blackboard.slice(15);

        try {
            const workspaceRoot = registry.getRoot();
            const summaryPrompt = [
                'You are the War Room Witness.',
                'Summarize the following sequence of agent handoffs and events into a single tactical "Episodic Memory" engram.',
                'Focus on key findings, state changes, and current blockers.',
                '',
                'EVENTS TO COMPACT:',
                JSON.stringify(toCompact, null, 2)
            ].join('\n');

            const result = await requestHostText({
                prompt: summaryPrompt,
                systemPrompt: 'Keep summaries concise and tactical.',
                projectRoot: workspaceRoot,
                source: 'war-room:compactor'
            });

            const summaryEntry: BlackboardEntry = {
                at: Date.now(),
                from: 'Witness',
                message: `[COMPACTION] Tactical Summary: ${result.text}`,
                type: 'INFO'
            };

            state.blackboard = [summaryEntry, ...remaining];
            stateRegistry.save(state);

            stateRegistry.pushTerminalLog('[Witness] Blackboard compaction complete. Old engrams archived.');
        } catch (err: any) {
            stateRegistry.pushTerminalLog(`[Witness:ERR] Compaction failed: ${err.message}`);
        }
    }
}
