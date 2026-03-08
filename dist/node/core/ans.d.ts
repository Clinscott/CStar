/**
 * Autonomic Nervous System (ANS)
 * Purpose: Synchronize the waking and sleeping of all framework organs.
 * Mandate: Unified Consciousness (Oracle + PennyOne + Ravens)
 */
export declare class ANS {
    /**
     * Wakes the entire system (Oracle + PennyOne)
     */
    static wake(): Promise<void>;
    private static _checkPort;
    /**
     * Puts the entire system to sleep (Dormancy)
     */
    static sleep(): Promise<void>;
    /**
     * Ensures P1 Daemon is running
     */
    static ensurePennyOne(): Promise<void>;
    /**
     * Stops P1 Daemon
     */
    static stopPennyOne(): Promise<void>;
}
