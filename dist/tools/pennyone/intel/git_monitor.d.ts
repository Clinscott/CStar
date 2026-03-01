export interface GitChurn {
    commits30d: number;
    lines7d: number;
    lastModified: number;
}
/**
 * Git Chronograph
 * Purpose: Extract temporal telemetry from the repository history.
 */
export declare class GitChronograph {
    /**
     * Get churn metrics for a specific file
     * @param {string} filepath - The file to analyze
     * @returns {Promise<GitChurn>} Churn data
     */
    static getFileChurn(filepath: string): Promise<GitChurn>;
    /**
     * Identify the top "Temporal Hotspots" (high churn files)
     */
    static getHotspots(limit?: number): Promise<{
        path: string;
        churn: number;
    }[]>;
}
