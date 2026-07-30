import {
    parseCanonicalPersona,
    type CanonicalPersona,
} from './persona_contract.js';

export type PersonaName = CanonicalPersona;
export type PersonaAdviceSource =
    | 'bounded_active_persona_projection'
    | 'hall_active_persona_projection';

export interface PersonaAdvice {
    persona: PersonaName;
    authority: 'non_authoritative_process_guidance';
    source: PersonaAdviceSource;
    intent_category: string;
    development_posture: 'build_run_repair' | 'secure_harden';
    process_directive: string;
    tone_directive: string;
}

const ODIN_TONE = 'Use a concise, forceful voice without changing scope, authority, routing, risk, or execution gates.';
const ALFRED_TONE = 'Use a measured, courteous voice without changing scope, authority, routing, risk, or execution gates.';
const ODIN_PROCESS = 'Build the bounded implementation, run it, repair recoverable failures, and continue to validation; do not turn local mechanical failures into operator gates.';
const ALFRED_PROCESS = 'Establish working behavior, then examine trust boundaries, abuse cases, failure containment, hardening, and validation before release.';

/**
 * Build non-authoritative tone and development-process guidance for Augury.
 * @param intentCategory Resolved intent category (coerced to ORCHESTRATE when blank).
 * @param personaName Bounded canonical persona scalar.
 * @param source Provenance of the scalar used for this guidance.
 * @returns Process guidance that never changes operational policy or authority.
 */
export function buildPersonaAdvice(
    intentCategory: string | undefined,
    personaName?: string,
    source: PersonaAdviceSource = 'bounded_active_persona_projection',
): PersonaAdvice | null {
    const persona = parseCanonicalPersona(personaName);
    if (!persona) {
        return null;
    }
    const category = String(intentCategory ?? '').trim().toUpperCase() || 'ORCHESTRATE';
    return {
        persona,
        authority: 'non_authoritative_process_guidance',
        source,
        intent_category: category,
        development_posture: persona === 'O.D.I.N.' ? 'build_run_repair' : 'secure_harden',
        process_directive: persona === 'O.D.I.N.' ? ODIN_PROCESS : ALFRED_PROCESS,
        tone_directive: persona === 'O.D.I.N.' ? ODIN_TONE : ALFRED_TONE,
    };
}

/** Return no persona advice when no bounded projected persona is available. */
export function buildProjectedPersonaAdvice(
    intentCategory: string | undefined,
    personaName: string | undefined,
    source: PersonaAdviceSource = 'bounded_active_persona_projection',
): PersonaAdvice | null {
    return buildPersonaAdvice(intentCategory, personaName, source);
}

/**
 * Format optional non-authoritative persona guidance inside a steering block.
 * @param advice Built advice payload.
 * @returns One prefix-tagged persona tone line.
 */
export function formatPersonaAdviceLines(advice: PersonaAdvice): string[] {
    return [
        `Persona Tone: ${advice.tone_directive}`,
        `Development Posture (${advice.development_posture}): ${advice.process_directive}`,
    ];
}
