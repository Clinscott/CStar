import type { HallMountedSpokeRecord } from '../../../types/hall.js';

export const PENNYONE_IMPORT_RETIRED =
    'legacy_pennyone_import_retired_use_cstar_kernel';

/** Retired before directory creation, Git clone, scan, StateRegistry, or Hall write. */
export async function importRepositoryIntoEstate(
    _source: string,
    _options: Record<string, unknown> = {},
): Promise<HallMountedSpokeRecord> {
    throw new Error(PENNYONE_IMPORT_RETIRED);
}
