import type { FileData } from './types.js';

export const PENNYONE_SCAN_RETIRED =
    'legacy_pennyone_scan_retired_use_cstar_kernel';

export interface RunScanOptions {
    hostTextInvoker?: unknown;
    hostSessionActive?: boolean;
    ingestHistory?: boolean;
    throttleMs?: number;
}

/** Retired before file reads, host-model requests, Hall writes, or artifacts. */
export async function indexSector(
    _filePath: string,
    _hostTextInvoker?: unknown,
): Promise<FileData | null> {
    throw new Error(PENNYONE_SCAN_RETIRED);
}

/** Retired before crawl, history ingestion, model use, Hall writes, or telemetry. */
export async function runScan(
    _targetPath: string,
    _force = false,
    _options: RunScanOptions = {},
): Promise<FileData[]> {
    throw new Error(PENNYONE_SCAN_RETIRED);
}
