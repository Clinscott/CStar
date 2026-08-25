export const RETIRED_STARTUP_CEREMONY_ERROR =
    'legacy_startup_ceremony_retired_use_cstar_status';

/**
 * The startup ceremony was a display surface that also woke legacy runtime
 * organs and inspected local state. Status is now read through cstar_status.
 */
export async function runStartupCeremony(): Promise<never> {
    throw new Error(RETIRED_STARTUP_CEREMONY_ERROR);
}
