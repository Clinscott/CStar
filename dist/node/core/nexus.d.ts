/**
 * 🔱 Synaptic Nexus (v1.0)
 * Lore: "There is no spoon. There is only the flow."
 * Purpose: The unified real-time hub for the One Mind's influence.
 */
export declare class SynapticNexus {
    private static neuralHealth;
    private static activeIntents;
    private static bifrostStable;
    /**
     * [🔱] Pulse the Nexus.
     * Updates the system's neural health and broadcasts the pulse to the HUD.
     */
    static pulse(delta?: number): void;
    /**
     * [🔱] Record a Synaptic Intent.
     * Logs the flow of intelligence through the matrix.
     */
    static recordIntent(intent: string): void;
    /**
     * [🔱] Get Matrix Stability.
     * Returns a semantic status based on neural health.
     */
    static getStability(): string;
    /**
     * [🔱] Materialize Dominion View.
     * Renders a dedicated HUD box for the Nexus status.
     */
    static materializeDominion(): void;
    private static renderHealthBar;
}
