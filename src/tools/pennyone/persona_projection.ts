import { getHallRepositoryRecord } from './intel/database.js';
import { registry } from './pathRegistry.js';
import { parseCanonicalPersona, type CanonicalPersona } from '../../core/persona_contract.js';
import {
    isPersonaProjectionSelfConsistent,
    personaProjectionConsistencyStatus,
    type PersonaProjectionConsistencyStatus,
} from './persona_provenance.js';

export {
    buildPersonaProjectionMetadata,
    isPersonaProjectionSelfConsistent,
    personaProjectionConsistencyStatus,
} from './persona_provenance.js';

export interface HallPersonaProjectionState {
    active_persona: CanonicalPersona | null;
    projection_status: PersonaProjectionConsistencyStatus;
}

function readRepositoryIfPresent(repositoryRoot: string, hallRoot: string) {
    try {
        return getHallRepositoryRecord(repositoryRoot, hallRoot);
    } catch (error) {
        if (error instanceof Error && error.message === 'hall_store_missing') {
            return null;
        }
        throw error;
    }
}

/**
 * Resolve an already-projected persona for a Hall repository write.
 * Never synthesize an active value from the inert compatibility default.
 */
export function resolveHallPersonaForWrite(
    targetRoot: string,
    controlRoot: string = registry.getRoot(),
): CanonicalPersona {
    return resolveHallPersonaProjectionForWrite(targetRoot, controlRoot).active_persona;
}

export function resolveHallPersonaProjectionForWrite(
    targetRoot: string,
    controlRoot: string = registry.getRoot(),
): { active_persona: CanonicalPersona; metadata: Record<string, unknown>; projection_status: Exclude<PersonaProjectionConsistencyStatus, 'unavailable'> } {
    for (const repositoryRoot of [targetRoot, controlRoot]) {
        const record = readRepositoryIfPresent(repositoryRoot, controlRoot);
        const metadata = record?.metadata as Record<string, unknown> | undefined;
        const persona = parseCanonicalPersona(record?.active_persona);
        const projectionStatus = personaProjectionConsistencyStatus(metadata, persona);
        if (persona && projectionStatus !== 'unavailable') {
            return {
                active_persona: persona,
                metadata: { persona_projection: metadata?.persona_projection },
                projection_status: projectionStatus,
            };
        }
    }
    {
        throw new Error('active_persona_projection_unavailable');
    }
}

/** Read only an existing, non-bootstrap Hall persona projection. */
export function readHallPersonaProjection(
    repositoryRoot: string,
    hallRoot: string = registry.getRoot(),
): CanonicalPersona | null {
    return readHallPersonaProjectionState(repositoryRoot, hallRoot).active_persona;
}

export function readHallPersonaProjectionState(
    repositoryRoot: string,
    hallRoot: string = registry.getRoot(),
): HallPersonaProjectionState {
    const record = readRepositoryIfPresent(repositoryRoot, hallRoot);
    if (!record) return { active_persona: null, projection_status: 'unavailable' };
    const metadata = record.metadata as Record<string, unknown> | undefined;
    const persona = parseCanonicalPersona(record.active_persona);
    const projectionStatus = personaProjectionConsistencyStatus(metadata, persona);
    return projectionStatus === 'unavailable' || !persona
        ? { active_persona: null, projection_status: 'unavailable' }
        : { active_persona: persona, projection_status: projectionStatus };
}
