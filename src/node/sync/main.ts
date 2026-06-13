/**
 * Daemon entry for the host-side sync worker.
 *
 * Usage:
 *   node bin/cstar-sync-worker.js            # daemon (loops every CSTAR_SYNC_INTERVAL_MS, default 15s)
 *   node bin/cstar-sync-worker.js --once     # single tick (cron / systemd-timer)
 *
 * Shuts down cleanly on SIGINT/SIGTERM. The interval timer is `.unref()`ed so it
 * never wedges shutdown; the live Mongo client keeps the process alive between ticks.
 */

import { MongoClient } from 'mongodb';

import { loadConfig, MissingConfigError, redactedConfig, stderrLogger } from './config.js';
import { PipelineCli } from './cli.js';
import { SyncWorker } from './worker.js';
import type { IntentQueueCollection, MirrorCollection } from './types.js';

/**
 * Boot and run the worker.
 * @returns Resolves when a `--once` run completes; never resolves in daemon mode (runs until a signal).
 */
async function main(): Promise<void> {
    const once = process.argv.includes('--once');
    const logger = stderrLogger;

    let config;
    try {
        config = loadConfig();
    } catch (err) {
        if (err instanceof MissingConfigError) {
            logger.error('config.missing', { reason: err.message });
            process.exitCode = 2;
            return;
        }
        throw err;
    }

    const client = new MongoClient(config.mongoUri, {
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
    });
    await client.connect();

    const db = client.db(config.dbName);
    // The mongodb driver's Collection satisfies our narrow surfaces structurally; cast through unknown.
    const intentQueue = db.collection(config.intentCollection) as unknown as IntentQueueCollection;
    const mirror = db.collection(config.mirrorCollection) as unknown as MirrorCollection;

    const worker = new SyncWorker({
        intentQueue,
        mirror,
        cli: new PipelineCli({
            consoleDir: config.consoleDir,
            pythonBin: config.pythonBin,
            scriptPath: config.scriptPath,
            timeoutMs: config.cliTimeoutMs,
        }),
        config: {
            runSync: config.runSync,
            reconcile: config.reconcile,
            maxIntentsPerTick: config.maxIntentsPerTick,
        },
        logger,
    });

    let stopping = false;
    let timer: NodeJS.Timeout | undefined;

    const shutdown = async (signal: string): Promise<void> => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info('shutdown', { signal });
        if (timer) {
            clearTimeout(timer);
        }
        await client.close().catch(() => undefined);
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    if (once) {
        try {
            const summary = await worker.tick();
            logger.info('tick.complete', { ...summary.drain, exported: summary.export.exported });
        } finally {
            await client.close().catch(() => undefined);
        }
        return;
    }

    logger.info('started', redactedConfig(config));

    const loop = async (): Promise<void> => {
        if (stopping) {
            return;
        }
        try {
            const summary = await worker.tick();
            logger.info('tick.complete', { ...summary.drain, exported: summary.export.exported });
        } catch (err) {
            // A tick failure (e.g. transient export error) is logged and retried next interval.
            logger.error('tick.failed', { error: err instanceof Error ? err.message : String(err) });
        }
        if (stopping) {
            return;
        }
        timer = setTimeout(() => void loop(), config.intervalMs);
        timer.unref?.();
    };

    await loop();
}

main().catch((err) => {
    stderrLogger.error('fatal', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
