import fs from 'node:fs';

export interface MemoryUsage {
    rss: number;
    heapTotal: number;
    heapUsed: number;
}

export interface DiskUsage {
    total: number;
    used: number;
    available: number;
}

export function getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
    };
}

/** Read filesystem capacity without spawning a shell or inheriting shell state. */
export function getDiskUsage(target = '.'): DiskUsage {
    try {
        const stats = fs.statfsSync(target);
        const blockSize = Number(stats.bsize);
        const total = Math.max(0, Number(stats.blocks) * blockSize);
        const available = Math.max(0, Number(stats.bavail) * blockSize);
        return {
            total,
            used: Math.max(0, total - available),
            available,
        };
    } catch {
        return { total: 0, used: 0, available: 0 };
    }
}

export function checkOverallHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    components: { memory: MemoryUsage; disk: DiskUsage };
} {
    const memory = getMemoryUsage();
    const disk = getDiskUsage();
    const availableRatio = disk.total > 0 ? disk.available / disk.total : 0;
    const status = disk.total === 0 || availableRatio < 0.02
        ? 'critical'
        : availableRatio < 0.1
            ? 'degraded'
            : 'healthy';
    return { status, components: { memory, disk } };
}
