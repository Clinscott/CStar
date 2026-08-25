export const RETIRED_SOVEREIGN_LOOP_FAILURE =
    'legacy_sovereign_heartbeat_loop_retired_use_cstar_kernel';

/**
 * Import-compatible tombstone for the former autonomous timer/file-watch loop.
 * Both lifecycle methods are deterministic and start no timer, listener,
 * filesystem access, callback, provider, process, or state mutation.
 */
export class SovereignLoop {
    public static async initiate(): Promise<never> {
        throw new Error(RETIRED_SOVEREIGN_LOOP_FAILURE);
    }

    public static stop(): void {
        // There is no resident loop to stop. Keep stop idempotent for callers
        // cleaning up historical boot paths.
    }
}
