import type { runScan } from '../index.js';
import type { SubspaceRelay } from './socket.js';
import { PENNYONE_LIVE_RETIRED } from './recorder.js';

/** Retired before chokidar allocation, timers, scans, or broadcasts. */
export function startWatcher(
    _targetPath: string,
    _relay: SubspaceRelay,
    _scanRunner?: typeof runScan,
): never {
    throw new Error(PENNYONE_LIVE_RETIRED);
}
