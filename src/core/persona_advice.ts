import {
    parseCanonicalPersona,
    type CanonicalPersona,
} from './persona_contract.js';

export type PersonaName = CanonicalPersona;

export interface PersonaAdvice {
    persona: PersonaName;
    authority: 'style_only';
    source: 'hall_self_consistent_record';
    intent_category: string;
    tone_directive: string;
}

const ODIN_TONE = 'Use a concise, forceful voice without changing scope, authority, routing, risk, or execution gates.';
const ALFRED_TONE = 'Use a measured, courteous voice without changing scope, authority, routing, risk, or execution gates.';

/**
 * Build the style-only persona payload that cstar_augury may attach.
 * @param intentCategory Resolved intent category (coerced to ORCHESTRATE when blank).
 * @param personaName Bounded persona scalar supplied by the Hall projection.
 * @returns Presentation tone only; never operational policy or authority.
 */
export function buildPersonaAdvice(
    intentCategory: string | undefined,
    personaName?: string,
): PersonaAdvice | null {
    const persona = parseCanonicalPersona(personaName);
    if (!persona) {
        return null;
    }
    const category = String(intentCategory ?? '').trim().toUpperCase() || 'ORCHESTRATE';
    return {
        persona,
        authority: 'style_only',
        source: 'hall_self_consistent_record',
        intent_category: category,
        tone_directive: persona === 'O.D.I.N.' ? ODIN_TONE : ALFRED_TONE,
    };
}

/** Return no persona advice when no bounded projected persona is available. */
export function buildProjectedPersonaAdvice(
    intentCategory: string | undefined,
    personaName: string | undefined,
): PersonaAdvice | null {
    return buildPersonaAdvice(intentCategory, personaName);
}

/**
 * Format the optional presentation-tone line used inside a steering block.
 * @param advice Built advice payload.
 * @returns One prefix-tagged persona tone line.
 */
export function formatPersonaAdviceLines(advice: PersonaAdvice): string[] {
    return [
        `Persona Tone: ${advice.tone_directive}`,
    ];
}
