/**
 * 🔱 Sovereign Loop (v1.0)
 * Lore: "The magic never sleeps. The loop is eternal."
 * Purpose: The autonomous heartbeat of Corvus Star.
 */
export declare class SovereignLoop {
    private static isRunning;
    private static lastScanTime;
    /**
     * [🔱] Initiate the Heartbeat.
     * Starts the autonomous loop.
     */
    static initiate(): Promise<void>;
    private static pulseCycle;
    private static watchCycle;
    private static handleNewChant;
    static stop(): void;
}
