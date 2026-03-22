import { execa } from 'execa';
import { registry } from  '../pathRegistry.js';
import path from 'node:path';

export interface GitChurn {
    commits30d: number;
    lines7d: number;
    lastModified: number;
}

/**
 * Git Chronograph
 * Purpose: Extract temporal telemetry from the repository history.
 */
export const GitChronograph = {
    /**
     * Get churn metrics for a specific file
     * @param {string} filepath - The file to analyze
     * @returns {Promise<GitChurn>} Churn data
     */
    async getFileChurn(filepath: string): Promise<GitChurn> {
        const root = registry.getRoot();
        const relPath = path.relative(root, filepath).replace(/\\/g, '/');

        try {
            // 1. Get commit count in the last 30 days (W2 metric)
            const { stdout: commitStdout } = await execa('git', [
                'rev-list', '--count', '--since', '30 days ago', 'HEAD', '--', relPath
            ], { cwd: root });

            // 2. Get lines changed (diff summary) in the last 7 days (W3 metric)
            const { stdout: diffStdout } = await execa('git', [
                'log', '--since', '7 days ago', '--format=', '--shortstat', '--', relPath
            ], { cwd: root });

            // 3. Get last modified timestamp
            const { stdout: timeStdout } = await execa('git', [
                'log', '-1', '--format=%at', '--', relPath
            ], { cwd: root });

            let lines7d = 0;
            const stats = diffStdout.match(/(\d+) insertions?|(\d+) deletions?/g);
            if (stats) {
                lines7d = stats.reduce((acc, curr) => {
                    const match = curr.match(/\d+/);
                    return acc + (match ? parseInt(match[0]) : 0);
                }, 0);
            }

            return {
                commits30d: parseInt(commitStdout) || 0,
                lines7d,
                lastModified: (parseInt(timeStdout) || 0) * 1000
            };
        } catch {
            return { commits30d: 0, lines7d: 0, lastModified: 0 };
        }
    },

    /**
     * Identify the top "Temporal Hotspots" (high churn files)
     * @param {number} limit - The maximum number of hotspots to return
     * @returns {Promise<{ path: string, churn: number }[]>} High churn files
     */
    async getHotspots(limit: number = 10): Promise<{ path: string, churn: number }[]> {
        const root = registry.getRoot();
        try {
            const { stdout } = await execa('git', [
                'log', '--since', '30 days ago', '--name-only', '--format='
            ], { cwd: root });

            const counts: Record<string, number> = {};
            stdout.split('\n').filter(Boolean).forEach(file => {
                counts[file] = (counts[file] || 0) + 1;
            });

            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([filePath, churn]) => ({ path: registry.normalize(filePath), churn }));
        } catch {
            return [];
        }
    }
};


