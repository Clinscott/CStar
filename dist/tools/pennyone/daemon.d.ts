/**
 * P1 Daemon: The Autonomic Nervous System
 * Purpose: Background file watching, incremental scanning, and matrix compilation.
 */
export declare class P1Daemon {
    private watcher;
    private targetPath;
    private statsDir;
    private pidFile;
    private isScanning;
    private debounceTimer;
    private pendingChanges;
    constructor(targetPath: string);
    /**
     * Start the background intelligence loop
     */
    start(): Promise<void>;
    /**
     * Targeted indexing of a single modified sector
     */
    private triggerSectorIndex;
    /**
     * Trigger an incremental scan and matrix compilation
     */
    private triggerScan;
    /**
     * Stop the daemon and cleanup
     */
    stop(): void;
    /**
     * Check if the daemon is already running
     * @returns {boolean} True if running
     */
    isRunning(): boolean;
}
