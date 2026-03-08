export interface GitChurn {
    commits30d: number;
    lines7d: number;
    lastModified: number;
}
/**
 * Git Chronograph
 * Purpose: Extract temporal telemetry from the repository history.
 */
export declare const GitChronograph: {
    /**
     * Get churn metrics for a specific file
     * @param {string} filepath - The file to analyze
     * @returns {Promise<GitChurn>} Churn data
     */
    getFileChurn(filepath: string): Promise<GitChurn>;
    /**
     * Identify the top "Temporal Hotspots" (high churn files)
     * @param {number} limit - The maximum number of hotspots to return
     * @returns {Promise<{ path: string, churn: number }[]>} High churn files
     */
    getHotspots(limit?: number): Promise<{
        path: string;
        churn: number;
    }[]>;
};
