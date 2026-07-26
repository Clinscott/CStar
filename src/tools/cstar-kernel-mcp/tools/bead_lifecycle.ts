import type { HallBeadStatus } from '../../../types/hall.js';
import { TERMINAL_HALL_BEAD_STATUSES } from './shared.js';

export function assertNewBeadAllowed(
    operation: string,
    beadId: string,
    initialStatus: HallBeadStatus,
    alreadyExists: boolean,
): void {
    if (TERMINAL_HALL_BEAD_STATUSES.has(initialStatus)) {
        throw new Error(`${operation} cannot use terminal initial status '${initialStatus}'.`);
    }
    if (alreadyExists) {
        throw new Error(`Bead already exists: ${beadId}`);
    }
}
