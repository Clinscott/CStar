import type { HallRepositoryRecord } from '../../../types/hall.js';

export const RETIRED_LEGACY_HALL_MIGRATION_ERROR =
    'legacy_hall_migration_retired_requires_cstar_lifecycle';

export function migrateLegacyHallRecords(rootPath?: string): {
    repository: HallRepositoryRecord;
    scans: number;
    beads: number;
    validation_runs: number;
} {
    void rootPath;
    throw new Error(RETIRED_LEGACY_HALL_MIGRATION_ERROR);
}
