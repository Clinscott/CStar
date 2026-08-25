import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export interface ActivePersonaProjectionState {
    active_persona: CanonicalPersona | null;
    projection_status: PersonaProjectionConsistencyStatus
        | 'bounded_config_projection'
        | 'bounded_config_invalid'
        | 'bounded_config_reader_unavailable';
}

export interface BoundedConfiguredPersonaState {
    active_persona: CanonicalPersona | null;
    status: 'projected' | 'absent' | 'invalid' | 'reader_unavailable';
}

const BOUNDED_PERSONA_READER = fileURLToPath(
    new URL('../../../scripts/read_active_persona.py', import.meta.url),
);
const SYSTEM_PYTHON = '/usr/bin/python3';

function resolveIsolatedSystemPython(): string | null {
    if (process.platform !== 'linux') return null;
    try {
        const resolved = fs.realpathSync(SYSTEM_PYTHON);
        const stat = fs.statSync(resolved);
        if (path.dirname(resolved) !== '/usr/bin'
            || !/^python3(?:\.\d+)*$/.test(path.basename(resolved))
            || !stat.isFile() || stat.uid !== 0
            || (stat.mode & 0o111) === 0 || (stat.mode & 0o022) !== 0) return null;
        return resolved;
    } catch {
        return null;
    }
}

/** Run the secret-bearing parser in an isolated process and classify only stable outcomes. */
export function readBoundedConfiguredPersonaState(
    controlRoot: string,
): BoundedConfiguredPersonaState {
    const interpreter = resolveIsolatedSystemPython();
    if (!interpreter) return { active_persona: null, status: 'reader_unavailable' };
    const result = spawnSync(
        interpreter,
        ['-I', '-S', '-B', BOUNDED_PERSONA_READER, controlRoot],
        {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
        maxBuffer: 64,
            cwd: '/',
            env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
        },
    );
    if (result.error) return { active_persona: null, status: 'reader_unavailable' };
    if (result.status === 3) return { active_persona: null, status: 'absent' };
    if (result.status === 2) return { active_persona: null, status: 'invalid' };
    if (result.status !== 0) return { active_persona: null, status: 'reader_unavailable' };
    const activePersona = parseCanonicalPersona(result.stdout);
    return activePersona
        ? { active_persona: activePersona, status: 'projected' }
        : { active_persona: null, status: 'invalid' };
}

/** Compatibility scalar accessor; callers needing provenance use the state form. */
export function readBoundedConfiguredPersona(controlRoot: string): CanonicalPersona | null {
    return readBoundedConfiguredPersonaState(controlRoot).active_persona;
}

/** Config is the active source; a marked Hall row remains a compatibility fallback. */
export function readActivePersonaProjectionState(
    repositoryRoot: string,
    hallRoot: string = registry.getRoot(),
): ActivePersonaProjectionState {
    const configured = readBoundedConfiguredPersonaState(hallRoot);
    if (configured.status === 'projected') return {
        active_persona: configured.active_persona,
        projection_status: 'bounded_config_projection',
    };
    if (configured.status === 'invalid') return {
        active_persona: null,
        projection_status: 'bounded_config_invalid',
    };
    if (configured.status === 'reader_unavailable') return {
        active_persona: null,
        projection_status: 'bounded_config_reader_unavailable',
    };
    return readHallPersonaProjectionState(repositoryRoot, hallRoot);
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
