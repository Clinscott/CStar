import { createHash } from 'node:crypto';
import {
    parseCanonicalPersona,
    type CanonicalPersona,
} from '../../core/persona_contract.js';

export const PERSONA_PROJECTION_SCHEMA = 'cstar.persona_projection.v2';
export const PERSONA_PROJECTION_INTEGRITY = 'sha256_self_consistency';
export const LEGACY_PERSONA_PROJECTION_SCHEMA = 'cstar.persona_projection.v1';
const LEGACY_PERSONA_PROJECTION_AUTHORITY = 'cstar_status';
const LEGACY_PERSONA_PROJECTION_VERIFICATION = 'kernel_projection';

export type PersonaProjectionConsistencyStatus =
    | 'self_consistent_unverified'
    | 'legacy_self_consistent_unverified'
    | 'unavailable';

interface PersonaProjectionAttestation {
    schema?: unknown;
    integrity?: unknown;
    authority?: unknown;
    verification?: unknown;
    value_sha256?: unknown;
}

function personaDigest(persona: CanonicalPersona): string {
    return createHash('sha256').update(persona, 'utf8').digest('hex');
}

export function buildPersonaProjectionMetadata(persona: string): Record<string, unknown> {
    const canonical = parseCanonicalPersona(persona);
    if (!canonical) throw new Error('persona_projection_canonical_value_required');
    return {
        persona_projection: {
            schema: PERSONA_PROJECTION_SCHEMA,
            integrity: PERSONA_PROJECTION_INTEGRITY,
            value_sha256: personaDigest(canonical),
        },
    };
}

export function personaProjectionConsistencyStatus(
    metadata: Record<string, unknown> | undefined,
    projectedPersonaScalar?: string | null,
): PersonaProjectionConsistencyStatus {
    const persona = parseCanonicalPersona(projectedPersonaScalar);
    if (!persona) return 'unavailable';
    const attestation = metadata?.persona_projection;
    if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
        return 'unavailable';
    }
    const record = attestation as PersonaProjectionAttestation;
    if (record.value_sha256 !== personaDigest(persona)) return 'unavailable';
    if (record.schema === PERSONA_PROJECTION_SCHEMA
        && record.integrity === PERSONA_PROJECTION_INTEGRITY) {
        return 'self_consistent_unverified';
    }
    if (record.schema === LEGACY_PERSONA_PROJECTION_SCHEMA
        && record.authority === LEGACY_PERSONA_PROJECTION_AUTHORITY
        && record.verification === LEGACY_PERSONA_PROJECTION_VERIFICATION) {
        return 'legacy_self_consistent_unverified';
    }
    return 'unavailable';
}

export function isPersonaProjectionSelfConsistent(
    metadata: Record<string, unknown> | undefined,
    projectedPersonaScalar?: string | null,
): boolean {
    return personaProjectionConsistencyStatus(metadata, projectedPersonaScalar) !== 'unavailable';
}
