import { execSync } from 'node:child_process';

/**
 * System Health Module
 */

export function getMemoryUsage(): { rss: number; heapTotal: number; heapUsed: number } {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed
    };
}

export function getDiskUsage(): { total: number; used: number; available: number } {
    try {
        const output = execSync('df -B1 .').toString();
        const lines = output.split('\n');
        const parts = lines[1].split(/\s+/);
        return {
            total: parseInt(parts[1], 10),
            used: parseInt(parts[2], 10),
            available: parseInt(parts[3], 10)
        };
    } catch {
        return { total: 0, used: 0, available: 0 };
    }
}

export function checkOverallHealth(): { status: 'healthy' | 'degraded' | 'critical'; components: { memory: any; disk: any } } {
    const memory = getMemoryUsage();
    const disk = getDiskUsage();
    return {
        status: 'healthy',
        components: {
            memory,
            disk
        }
    };
}
