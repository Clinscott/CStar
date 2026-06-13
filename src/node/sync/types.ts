/**
 * Shared contracts for the host-side sync worker (mirror export ↓ + intent drain ↑).
 *
 * These types mirror the exact wire contracts the cstar-console (cloud mailbox)
 * relies on. `pennyone.db` stays authoritative; Mongo is only a mailbox. The
 * worker writes `proposal_mirror` and reads/updates `intent_queue`.
 */

/** The closed set of operator actions the pipeline CLI understands. */
export const INTENT_ACTIONS = ['accept', 'decline', 'refine', 'dispatch', 'edit'] as const;

/** A single operator action queued by the console. */
export type IntentAction = (typeof INTENT_ACTIONS)[number];

/** Lifecycle states an intent moves through. The console writes `pending`; the worker owns the rest. */
export type IntentStatus = 'pending' | 'processing' | 'applied' | 'failed';

/**
 * An `intent_queue` document. The console appends these with `status: 'pending'`;
 * the worker transitions them to `processing` → `applied` | `failed`.
 */
export interface IntentDoc {
    /** Mongo document id, opaque to the worker (used only to target updates). */
    _id?: unknown;
    /** The operator action; validated against {@link INTENT_ACTIONS} before shelling. */
    action: string;
    /** The target proposal's stable id (matches `hall_research_proposals.proposal_id`). */
    proposal_id: string;
    /** Action-specific payload (notes, or an edit spec); may be null. */
    payload?: unknown;
    /** Optional operator identity; not used by the CLI mapping. */
    actor?: string | null;
    /** Current lifecycle state. */
    status: IntentStatus;
    /** Creation timestamp; the worker drains oldest-first by this field. */
    created_at: Date;
    /** Last-modified timestamp. */
    updated_at?: Date;
    /** When the worker atomically claimed the intent. */
    claimed_at?: Date;
    /** When the CLI applied the intent successfully. */
    applied_at?: Date;
    /** When the intent was marked failed. */
    failed_at?: Date;
    /** The CLI's parsed JSON result (or raw stdout) on success. */
    result?: unknown;
    /** Captured stderr / failure reason on failure. */
    error?: string;
}

/** Normalized result of one pipeline CLI invocation. */
export interface CliResult {
    /** True when the CLI exited zero. */
    ok: boolean;
    /** The process exit code (null if it never started cleanly). */
    code: number | null;
    /** Captured stdout. */
    stdout: string;
    /** Captured stderr. */
    stderr: string;
    /** Parsed JSON from stdout, or null when stdout was not valid JSON. */
    json: unknown;
}

/** The narrow `intent_queue` collection surface the worker depends on. */
export interface IntentQueueCollection {
    /**
     * Atomically claim/return a document.
     * @param filter - Match filter (e.g. `{ status: 'pending' }`).
     * @param update - Update document (e.g. `$set` of `processing`).
     * @param options - Driver options (sort + returnDocument).
     * @returns The post-update document, or null when nothing matched.
     */
    findOneAndUpdate(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options: Record<string, unknown>,
    ): Promise<IntentDoc | null>;
    /**
     * Update a single document.
     * @param filter - Match filter (targets the claimed `_id`).
     * @param update - Update document.
     * @returns Driver result (ignored by the worker).
     */
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
}

/** The narrow `proposal_mirror` collection surface the worker depends on. */
export interface MirrorCollection {
    /**
     * Apply a batch of upserts.
     * @param ops - Bulk write operations (upsert-by-proposal_id).
     * @param options - Driver options (e.g. `{ ordered: false }`).
     * @returns Driver result (ignored by the worker).
     */
    bulkWrite(ops: unknown[], options?: Record<string, unknown>): Promise<unknown>;
    /**
     * Remove documents matching a filter (used to reconcile deletions).
     * @param filter - Match filter.
     * @returns Driver result (ignored by the worker).
     */
    deleteMany(filter: Record<string, unknown>): Promise<unknown>;
}

/** A pipeline-CLI runner. Implemented by {@link PipelineCli}; faked in tests. */
export interface CliRunner {
    /**
     * Run the pipeline CLI with an explicit argv array (never a shell string).
     * @param argv - The subcommand + flags (no executable, no script path).
     * @returns The normalized {@link CliResult}.
     */
    run(argv: string[]): Promise<CliResult>;
}

/** Minimal structured logger. Defaults to stderr; never receives the Mongo URI. */
export interface Logger {
    /**
     * Emit an informational event.
     * @param event - Short event name.
     * @param fields - Structured context (must not contain secrets).
     */
    info(event: string, fields?: Record<string, unknown>): void;
    /**
     * Emit an error event.
     * @param event - Short event name.
     * @param fields - Structured context (must not contain secrets).
     */
    error(event: string, fields?: Record<string, unknown>): void;
}
