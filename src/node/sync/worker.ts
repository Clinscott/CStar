/**
 * The host-side sync worker orchestrator.
 *
 * Each tick:
 *   1. drain `intent_queue` (up): atomically claim each pending intent
 *      oldest-first, shell the pipeline CLI, mark `applied` | `failed`.
 *   2. optionally `sync` so freshly proposed items land in `pennyone.db`.
 *   3. export the mirror (down): `list --history` → upsert `proposal_mirror`.
 *
 * Invariants enforced here:
 *   - intents are claimed atomically (so each runs exactly once),
 *   - one failing intent never aborts the loop or blocks the others,
 *   - the worker never opens `pennyone.db`; it only shells the CLI runner,
 *   - mirror export failure is non-fatal (the console's mirror reads never block on us).
 */

import { mapIntentToArgv } from './intent.js';
import { extractProposals, mirrorBulkOps, reconcileFilter } from './mirror.js';
import type {
    CliRunner,
    IntentDoc,
    IntentQueueCollection,
    Logger,
    MirrorCollection,
} from './types.js';

/** Tunable behavior for {@link SyncWorker}. */
export interface SyncWorkerConfig {
    /** Run `sync` before exporting the mirror (default true). */
    runSync: boolean;
    /** Remove mirror docs absent from the latest export (default false). */
    reconcile: boolean;
    /** Hard cap on intents drained per tick, to bound a single tick (default 500). */
    maxIntentsPerTick: number;
}

/** Constructor dependencies for {@link SyncWorker}. */
export interface SyncWorkerDeps {
    /** The `intent_queue` collection surface. */
    intentQueue: IntentQueueCollection;
    /** The `proposal_mirror` collection surface. */
    mirror: MirrorCollection;
    /** The pipeline CLI runner. */
    cli: CliRunner;
    /** Behavior config. */
    config: SyncWorkerConfig;
    /** Structured logger (secret-free). */
    logger: Logger;
}

/** Outcome of one drain pass. */
export interface DrainSummary {
    /** Number of intents atomically claimed. */
    claimed: number;
    /** Number marked `applied`. */
    applied: number;
    /** Number marked `failed`. */
    failed: number;
}

/** Outcome of one mirror export pass. */
export interface ExportSummary {
    /** Number of proposals upserted into the mirror. */
    exported: number;
    /** Whether reconcile (stale deletion) ran. */
    reconciled: boolean;
}

/** Outcome of one full tick. */
export interface TickSummary {
    /** Drain (up) outcome. */
    drain: DrainSummary;
    /** Export (down) outcome. */
    export: ExportSummary;
}

/** Truncate long text for storage in failure records / logs. */
function truncate(text: string, max = 4000): string {
    return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/** Orchestrates the bidirectional sync between Mongo (mailbox) and the host pipeline. */
export class SyncWorker {
    private readonly intentQueue: IntentQueueCollection;
    private readonly mirror: MirrorCollection;
    private readonly cli: CliRunner;
    private readonly config: SyncWorkerConfig;
    private readonly logger: Logger;

    /**
     * @param deps - {@link SyncWorkerDeps} (collections, CLI runner, config, logger).
     */
    constructor(deps: SyncWorkerDeps) {
        this.intentQueue = deps.intentQueue;
        this.mirror = deps.mirror;
        this.cli = deps.cli;
        this.config = deps.config;
        this.logger = deps.logger;
    }

    /**
     * Drain pending intents: claim oldest-first, apply via the CLI, mark outcome.
     * @returns A {@link DrainSummary} of how many were claimed / applied / failed.
     */
    async drainIntents(): Promise<DrainSummary> {
        const summary: DrainSummary = { claimed: 0, applied: 0, failed: 0 };

        while (summary.claimed < this.config.maxIntentsPerTick) {
            const claimed = await this.claimNext();
            if (!claimed) {
                break;
            }
            summary.claimed += 1;
            await this.applyOne(claimed, summary);
        }

        return summary;
    }

    /**
     * Atomically claim the oldest pending intent.
     * @returns The claimed document (now `processing`), or null when none remain.
     */
    private async claimNext(): Promise<IntentDoc | null> {
        const now = new Date();
        return this.intentQueue.findOneAndUpdate(
            { status: 'pending' },
            { $set: { status: 'processing', claimed_at: now, updated_at: now } },
            { sort: { created_at: 1 }, returnDocument: 'after' },
        );
    }

    /**
     * Apply one claimed intent through the CLI and record the outcome. Never throws.
     * @param intent - The claimed (processing) intent.
     * @param summary - Running drain summary, mutated in place.
     */
    private async applyOne(intent: IntentDoc, summary: DrainSummary): Promise<void> {
        try {
            const argv = mapIntentToArgv(intent);
            const result = await this.cli.run(argv);
            if (result.ok) {
                await this.markApplied(intent, result.json ?? result.stdout);
                summary.applied += 1;
                this.logger.info('intent.applied', { proposal_id: intent.proposal_id, action: intent.action });
            } else {
                const reason = result.stderr || result.stdout || `cli exited ${result.code}`;
                await this.markFailed(intent, truncate(reason));
                summary.failed += 1;
                this.logger.error('intent.failed', {
                    proposal_id: intent.proposal_id,
                    action: intent.action,
                    code: result.code,
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await this.markFailed(intent, truncate(message));
            summary.failed += 1;
            this.logger.error('intent.failed', {
                proposal_id: intent.proposal_id,
                action: intent.action,
                error: message,
            });
        }
    }

    /**
     * Persist a successful application. Swallows write errors so the loop survives.
     * @param intent - The claimed intent.
     * @param result - The CLI's JSON result (or raw stdout).
     */
    private async markApplied(intent: IntentDoc, result: unknown): Promise<void> {
        const now = new Date();
        try {
            await this.intentQueue.updateOne(
                { _id: intent._id },
                { $set: { status: 'applied', result, applied_at: now, updated_at: now } },
            );
        } catch (err) {
            this.logger.error('intent.mark_applied_failed', {
                proposal_id: intent.proposal_id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Persist a failed application. Swallows write errors so the loop survives.
     * @param intent - The claimed intent.
     * @param error - The captured failure reason (stderr / message).
     */
    private async markFailed(intent: IntentDoc, error: string): Promise<void> {
        const now = new Date();
        try {
            await this.intentQueue.updateOne(
                { _id: intent._id },
                { $set: { status: 'failed', error, failed_at: now, updated_at: now } },
            );
        } catch (err) {
            this.logger.error('intent.mark_failed_failed', {
                proposal_id: intent.proposal_id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Export the host's proposals into `proposal_mirror` (upsert by `proposal_id`).
     * @returns An {@link ExportSummary}.
     */
    async exportMirror(): Promise<ExportSummary> {
        const result = await this.cli.run(['list', '--history']);
        if (!result.ok) {
            throw new Error(`list --history failed: ${truncate(result.stderr || result.stdout)}`);
        }

        const proposals = extractProposals(result.json);
        const ops = mirrorBulkOps(proposals);
        if (ops.length > 0) {
            await this.mirror.bulkWrite(ops, { ordered: false });
        }

        let reconciled = false;
        if (this.config.reconcile) {
            if (proposals.length === 0) {
                this.logger.error('mirror.reconcile_skipped_empty_export', {
                    reason: 'empty export would delete all mirror documents',
                });
            } else {
                await this.mirror.deleteMany(reconcileFilter(proposals));
                reconciled = true;
            }
        }

        return { exported: proposals.length, reconciled };
    }

    /**
     * Run one full tick: drain (up) → optional `sync` → export (down).
     * @returns A {@link TickSummary}.
     */
    async tick(): Promise<TickSummary> {
        const drain = await this.drainIntents();

        if (this.config.runSync) {
            const sync = await this.cli.run(['sync']);
            if (!sync.ok) {
                // Non-fatal: a failed source refresh just means the mirror lags one tick.
                this.logger.error('sync.failed', { code: sync.code });
            }
        }

        const exported = await this.exportMirror();
        return { drain, export: exported };
    }
}
