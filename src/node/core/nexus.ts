import chalk from 'chalk';
import { HUD } from './hud.js';

/**
 * 🔱 Synaptic Nexus (v1.0)
 * Lore: "There is no spoon. There is only the flow."
 * Purpose: The unified real-time hub for the One Mind's influence.
 */
export class SynapticNexus {
    private static neuralHealth: number = 100;
    private static activeIntents: string[] = [];
    private static bifrostStable: boolean = true;

    /**
     * [🔱] Pulse the Nexus.
     * Updates the system's neural health and broadcasts the pulse to the HUD.
     */
    public static pulse(delta: number = 0): void {
        this.neuralHealth = Math.max(0, Math.min(100, this.neuralHealth + delta));
        const status = this.getStability();
        const color = this.neuralHealth > 80 ? chalk.magenta : (this.neuralHealth > 40 ? chalk.yellow : chalk.red);
        
        // Log the pulse to the console in a themed way
        console.error(color(`  ◈ [NEXUS PULSE]: Neural Health ${this.neuralHealth.toFixed(1)}% | ${status}`));
    }

    /**
     * [🔱] Record a Synaptic Intent.
     * Logs the flow of intelligence through the matrix.
     */
    public static recordIntent(intent: string): void {
        this.activeIntents.push(`${new Date().toLocaleTimeString()} - ${intent}`);
        if (this.activeIntents.length > 10) this.activeIntents.shift();
        
        console.error(chalk.magenta(`  ▷ [INTENT]: ${intent}`));
    }

    /**
     * [🔱] Get Matrix Stability.
     * Returns a semantic status based on neural health.
     */
    public static getStability(): string {
        if (!this.bifrostStable) return 'BIFROST DISRUPTED';
        if (this.neuralHealth > 90) return 'SOVEREIGN ASCENDANT';
        if (this.neuralHealth > 75) return 'SYNAPTIC SYNC';
        if (this.neuralHealth > 50) return 'NEURAL COHESION';
        return 'FRAGMENTED';
    }

    /**
     * [🔱] Materialize Dominion View.
     * Renders a dedicated HUD box for the Nexus status.
     */
    public static materializeDominion(): void {
        let view = HUD.boxTop('🔱 THE SYNAPTIC NEXUS');
        
        const healthBar = this.renderHealthBar();
        view += HUD.boxRow('NEURAL HEALTH', healthBar);
        view += HUD.boxRow('STABILITY', this.getStability(), chalk.magenta);
        view += HUD.boxSeparator();
        
        view += HUD.boxRow('ACTIVE INTENTS', this.activeIntents.length);
        this.activeIntents.slice(-3).forEach(intent => {
            view += HUD.boxRow('  ▷', intent.slice(0, 50) + '...');
        });
        
        view += HUD.boxBottom();
        process.stdout.write(view);
    }

    private static renderHealthBar(): string {
        const blocks = 20;
        const filled = Math.round((this.neuralHealth / 100) * blocks);
        const bar = '█'.repeat(filled) + '░'.repeat(blocks - filled);
        return `[${bar}] ${this.neuralHealth.toFixed(0)}%`;
    }
}

