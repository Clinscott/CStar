import chalk from 'chalk';
import { activePersona } from '../../tools/pennyone/personaRegistry.js';
import { StateRegistry } from  './state.js';

/**
 * Autonomic Nervous System (ANS)
 * Purpose: Record explicit waking and sleeping runtime-state transitions.
 * This boundary never starts daemons, scans repositories, invokes models,
 * writes memory, creates beads, or dispatches implementation.
 */
export class ANS {
    /**
     * Wakes the runtime without resident daemons.
     */
    static async wake() {
        StateRegistry.updateFramework({
            status: 'AWAKE',
            last_awakening: Date.now()
        });
    }

    /**
     * Puts the entire system to sleep (Dormancy)
     */
    static async sleep() {
        console.error(chalk.cyan(`
${activePersona.prefix}: "Initiating global dormancy protocol..."`));
        
        await this.stopPennyOne();
        StateRegistry.updateFramework({
            status: 'DORMANT'
        });
    }

    /**
     * Compatibility no-op. PennyOne scans require an explicit operator action.
     */
    static async ensurePennyOne() {
        console.error(chalk.dim(`${activePersona.prefix} 'PennyOne remains on-demand; no scan was started.'`));
    }

    /**
     * There is no resident PennyOne daemon in kernel mode.
     */
    static async stopPennyOne() {
        console.error(chalk.dim(`${activePersona.prefix} 'PennyOne is already on-demand in kernel mode.'`));
    }
}
