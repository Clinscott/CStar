import type Database from 'better-sqlite3';

import {
    assertForgeMissionGrantProviderEligibility,
    failCloseForgeMissionGrantProviderStart,
} from './forge_mission_grant_reservation_guard.js';

export interface ForgeProviderStartOptions {
    now?: number;
    /** Deterministic adversarial-test seam; production callers omit it. */
    beforeProviderStart?: () => void;
}

function optionsFrom(
    value: number | ForgeProviderStartOptions,
): Required<Pick<ForgeProviderStartOptions, 'now'>> & ForgeProviderStartOptions {
    return typeof value === 'number' ? { now: value } : {
        ...value,
        now: value.now ?? Date.now(),
    };
}

export function transitionForgeAttemptStarted(
    db: Database.Database,
    attemptId: string,
    nowOrOptions: number | ForgeProviderStartOptions = Date.now(),
): void {
    const options = optionsFrom(nowOrOptions);
    const guardedStart = db.transaction(() => {
        assertForgeMissionGrantProviderEligibility(db, attemptId, options.now);
        options.beforeProviderStart?.();
        assertForgeMissionGrantProviderEligibility(db, attemptId, options.now);
        const changed = db.prepare(`
            UPDATE hall_forge_attempts
            SET status = 'STARTED', spawn_started_at = ?, updated_at = ?
            WHERE attempt_id = ? AND status = 'RESERVED'
        `).run(options.now, options.now, attemptId);
        if (Number(changed.changes) !== 1) {
            throw new Error('forge_attempt_start_transition_invalid');
        }
        assertForgeMissionGrantProviderEligibility(db, attemptId, options.now);
    });
    const atomicStart = db.transaction((): Error | null => {
        try {
            guardedStart();
            return null;
        } catch (error) {
            const failure = error as Error;
            failCloseForgeMissionGrantProviderStart(
                db, attemptId, failure, options.now,
            );
            return failure;
        }
    });
    const failure = atomicStart.immediate();
    if (failure) throw failure;
}
