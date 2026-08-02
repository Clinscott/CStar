import fs from 'node:fs';
import path from 'node:path';

export interface SourceWatcherOptions {
    max_events?: number;
    max_duration_ms?: number;
    debounce_ms?: number;
    maxEvents?: number;
    maxDurationMs?: number;
    debounceMs?: number;
}

export const SOURCE_WATCHER_DEFAULTS = {
    max_events: 1,
    max_duration_ms: 30_000,
    debounce_ms: 50,
} as const;

const SOURCE_WATCHER_MAX_EVENTS = 32;
const SOURCE_WATCHER_MAX_DURATION_MS = 60_000;
type WatcherEnvironment = NodeJS.ProcessEnv;
type WatcherEnvironmentOrOptions = WatcherEnvironment | SourceWatcherOptions;

function isEnvironment(value: WatcherEnvironmentOrOptions): value is WatcherEnvironment {
    return !(
        'max_events' in value
        || 'max_duration_ms' in value
        || 'debounce_ms' in value
        || 'maxEvents' in value
        || 'maxDurationMs' in value
        || 'debounceMs' in value
    );
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(1, Math.floor(value as number)));
}

function watcherOptions(options: SourceWatcherOptions): Required<Pick<
    SourceWatcherOptions,
    'max_events' | 'max_duration_ms' | 'debounce_ms'
>> {
    return {
        max_events: boundedInteger(
            options.max_events ?? options.maxEvents,
            SOURCE_WATCHER_DEFAULTS.max_events,
            SOURCE_WATCHER_MAX_EVENTS,
        ),
        max_duration_ms: boundedInteger(
            options.max_duration_ms ?? options.maxDurationMs,
            SOURCE_WATCHER_DEFAULTS.max_duration_ms,
            SOURCE_WATCHER_MAX_DURATION_MS,
        ),
        debounce_ms: boundedInteger(
            options.debounce_ms ?? options.debounceMs,
            SOURCE_WATCHER_DEFAULTS.debounce_ms,
            SOURCE_WATCHER_MAX_DURATION_MS,
        ),
    };
}

function noOpClose(): () => Promise<void> {
    return async () => { /* watcher disabled */ };
}

/**
 * Attach a bounded, event-driven source observer.  It reports an invalidation
 * reason to the host callback; it does not reload, activate, poll, or mutate
 * the kernel.  The legacy third argument remains the environment injection
 * used by the MCP bootstrap; options may be supplied as a fourth argument or
 * in place of that environment for focused tests.
 */
export async function attachSourceWatcher(
    projectRoot: string,
    onExit: (reason: string) => void,
    envOrOptions: WatcherEnvironmentOrOptions = process.env,
    suppliedOptions: SourceWatcherOptions = {},
): Promise<() => Promise<void>> {
    const env = isEnvironment(envOrOptions) ? envOrOptions : process.env;
    const options = watcherOptions(isEnvironment(envOrOptions) ? suppliedOptions : envOrOptions);
    if (env.CSTAR_KERNEL_ENABLE_WATCH !== '1' || env.CSTAR_KERNEL_DISABLE_WATCH === '1') {
        return noOpClose();
    }

    let chokidarMod: typeof import('chokidar');
    try {
        chokidarMod = await import('chokidar');
    } catch (err) {
        console.error(`[cstar-kernel] chokidar unavailable; source invalidation disabled: ${(err as Error).message}`);
        return noOpClose();
    }

    const watchRoot = path.join(projectRoot, 'src');
    if (!fs.existsSync(watchRoot) || !fs.statSync(watchRoot).isDirectory()) {
        console.error(`[cstar-kernel] watch root ${watchRoot} not found; source invalidation disabled`);
        return noOpClose();
    }

    const chokidar = chokidarMod.default ?? chokidarMod;
    const watcher = chokidar.watch(watchRoot, {
        ignored: [/(^|[\\/])\../, '**/node_modules/**', '**/.stats/**'],
        depth: 32,
        persistent: false,
        ignoreInitial: true,
        followSymlinks: false,
        usePolling: false,
    });
    let closed = false;
    let eventCount = 0;
    let pending: NodeJS.Timeout | null = null;
    let closePromise: Promise<void> | undefined;
    let deadline: NodeJS.Timeout;

    const close = async (): Promise<void> => {
        if (closePromise) return closePromise;
        closed = true;
        if (pending) {
            clearTimeout(pending);
            pending = null;
        }
        clearTimeout(deadline);
        closePromise = Promise.resolve(watcher.close()).then(() => undefined);
        await closePromise;
    };

    deadline = setTimeout(() => {
        void close();
    }, options.max_duration_ms);
    deadline.unref?.();

    const trigger = (filePath: string): void => {
        if (closed || eventCount >= options.max_events || !/\.tsx?$/.test(filePath)) return;
        eventCount += 1;
        const relativePath = path.relative(projectRoot, filePath) || path.basename(filePath);
        const reason = `source change in ${relativePath}`;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
            pending = null;
            void close().then(() => onExit(reason));
        }, options.debounce_ms);
        pending.unref?.();
    };

    watcher.on('change', trigger);
    watcher.on('add', trigger);
    watcher.on('unlink', trigger);
    watcher.on('error', (error: unknown) => {
        if (!closed) console.error(`[cstar-kernel] source watcher error: ${String(error)}`);
    });
    return close;
}
