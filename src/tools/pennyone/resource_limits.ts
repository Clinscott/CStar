import fs from 'node:fs/promises';

import { crawlRepository } from './crawler.js';

export interface PennyOneResourceLimits {
    max_files: number;
    max_file_bytes: number;
    max_aggregate_bytes: number;
}

export interface PennyOneScanManifest {
    files: string[];
    aggregate_bytes: number;
    limits: PennyOneResourceLimits;
}

/**
 * Hard ceilings for source material admitted to a PennyOne scan. Callers may
 * lower these values for a narrower operation, but cannot raise them.
 */
export const PENNYONE_RESOURCE_LIMITS: Readonly<PennyOneResourceLimits> = Object.freeze({
    max_files: 2_000,
    max_file_bytes: 1_048_576,
    max_aggregate_bytes: 33_554_432,
});

export class PennyOneResourceLimitError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'PennyOneResourceLimitError';
    }
}

function boundedPositiveInteger(
    label: keyof PennyOneResourceLimits,
    requested: number | undefined,
    ceiling: number,
): number {
    if (requested === undefined) return ceiling;
    if (!Number.isSafeInteger(requested) || requested <= 0) {
        throw new PennyOneResourceLimitError(`PennyOne ${label} must be a positive safe integer.`);
    }
    if (requested > ceiling) {
        throw new PennyOneResourceLimitError(
            `PennyOne ${label}=${requested} exceeds the hard ceiling ${ceiling}.`,
        );
    }
    return requested;
}

export function resolvePennyOneResourceLimits(
    requested: Partial<PennyOneResourceLimits> = {},
): PennyOneResourceLimits {
    return {
        max_files: boundedPositiveInteger(
            'max_files',
            requested.max_files,
            PENNYONE_RESOURCE_LIMITS.max_files,
        ),
        max_file_bytes: boundedPositiveInteger(
            'max_file_bytes',
            requested.max_file_bytes,
            PENNYONE_RESOURCE_LIMITS.max_file_bytes,
        ),
        max_aggregate_bytes: boundedPositiveInteger(
            'max_aggregate_bytes',
            requested.max_aggregate_bytes,
            PENNYONE_RESOURCE_LIMITS.max_aggregate_bytes,
        ),
    };
}

export async function preflightPennyOneFiles(
    files: string[],
    requestedLimits: Partial<PennyOneResourceLimits> = {},
): Promise<PennyOneScanManifest> {
    const limits = resolvePennyOneResourceLimits(requestedLimits);
    if (files.length > limits.max_files) {
        throw new PennyOneResourceLimitError(
            `PennyOne file-count limit exceeded: ${files.length} > ${limits.max_files}. Narrow the explicit scan path.`,
        );
    }

    let aggregateBytes = 0;
    for (const file of files) {
        const stats = await fs.lstat(file).catch(() => null);
        if (!stats?.isFile() || stats.isSymbolicLink()) {
            throw new PennyOneResourceLimitError(
                `PennyOne only scans existing regular files; rejected ${file}.`,
            );
        }
        if (stats.size > limits.max_file_bytes) {
            throw new PennyOneResourceLimitError(
                `PennyOne per-file byte limit exceeded for ${file}: ${stats.size} > ${limits.max_file_bytes}.`,
            );
        }
        aggregateBytes += stats.size;
        if (aggregateBytes > limits.max_aggregate_bytes) {
            throw new PennyOneResourceLimitError(
                `PennyOne aggregate byte limit exceeded: ${aggregateBytes} > ${limits.max_aggregate_bytes}. Narrow the explicit scan path.`,
            );
        }
    }

    return {
        files: [...files],
        aggregate_bytes: aggregateBytes,
        limits,
    };
}

export async function buildPennyOneScanManifest(
    targetPath: string,
    requestedLimits: Partial<PennyOneResourceLimits> = {},
): Promise<PennyOneScanManifest> {
    const limits = resolvePennyOneResourceLimits(requestedLimits);
    const files = await crawlRepository(targetPath, limits.max_files + 1);
    return preflightPennyOneFiles(files, limits);
}

/**
 * Read one preflighted sector without an unbounded readFile allocation. The
 * extra byte detects growth after the manifest stat and fails closed.
 */
export async function readBoundedPennyOneSource(
    filePath: string,
    requestedMaxBytes = PENNYONE_RESOURCE_LIMITS.max_file_bytes,
): Promise<string> {
    const limits = resolvePennyOneResourceLimits({ max_file_bytes: requestedMaxBytes });
    const handle = await fs.open(filePath, 'r');
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > limits.max_file_bytes) {
            throw new PennyOneResourceLimitError(
                `PennyOne per-file byte limit exceeded for ${filePath}: ${stats.size} > ${limits.max_file_bytes}.`,
            );
        }

        const capacity = Math.min(stats.size + 1, limits.max_file_bytes + 1);
        const buffer = Buffer.allocUnsafe(capacity);
        let offset = 0;
        while (offset < capacity) {
            const { bytesRead } = await handle.read(buffer, offset, capacity - offset, offset);
            if (bytesRead === 0) break;
            offset += bytesRead;
        }
        if (offset > stats.size || offset > limits.max_file_bytes) {
            throw new PennyOneResourceLimitError(
                `PennyOne source changed during bounded read of ${filePath}; retry after the file is stable.`,
            );
        }
        return buffer.subarray(0, offset).toString('utf8');
    } finally {
        await handle.close();
    }
}
