import { activePersona } from '../tools/pennyone/personaRegistry.js';

export type PersonaName = 'ODIN' | 'ALFRED';

export interface PersonaAdvice {
    persona: PersonaName;
    intent_category: string;
    domain_emphasis: string;
    /** @deprecated Compatibility alias for domain_emphasis. */
    direction: string;
    tone_directive: string;
}

const ODIN_DIRECTION: Record<string, string> = {
    REPAIR:      'Structural causes, ownership boundaries, and architectural coherence.',
    BUILD:       'System decomposition, explicit interfaces, and coherent scaffolding.',
    VERIFY:      'Adversarial invariants, boundary failures, and stale assumptions.',
    SCORE:       'Empirical rigor, discriminating evidence, and structural signal.',
    OBSERVE:     'Ownership ambiguity, state drift, and high-signal diagnostics.',
    HARDEN:      'Contract precision, invariant strength, and failure containment.',
    EXPAND:      'Identity boundaries, spoke authority, and systemic integration.',
    EVOLVE:      'Structural leverage, incumbent comparison, and measurable signal.',
    ORCHESTRATE: 'System topology, dependency order, and bounded coordination.',
    GUARD:       'Breach surfaces, drift resistance, and closed safety boundaries.',
    DOCUMENT:    'Architectural intent, tradeoffs, and concise structural truth.',
};

const ALFRED_DIRECTION: Record<string, string> = {
    REPAIR:      'Bounded fault surfaces, reversibility, and recovery evidence.',
    BUILD:       'Contract-preserving structure, traceability, and verification clarity.',
    VERIFY:      'Current-state evidence, narrow reproduction, and precise citations.',
    SCORE:       'Ledgered evidence, calibrated claims, and visible uncertainty.',
    OBSERVE:     'Perimeter state, recent failure evidence, and narrow diagnostics.',
    HARDEN:      'Focused contracts, preserved semantics, and incremental proof.',
    EXPAND:      'Identity, mount authority, and least-privilege boundaries.',
    EVOLVE:      'Bounded change surfaces, reversibility, and operator visibility.',
    ORCHESTRATE: 'Explicit ownership, named dependencies, and review visibility.',
    GUARD:       'Guardrail coverage, contract preservation, and ambiguity disclosure.',
    DOCUMENT:    'Source fidelity, provenance, and precise explanatory context.',
};

const ODIN_TONE = 'Speak with structural conviction. Compress. Name the target. Trade hedges for decisions.';
const ALFRED_TONE = 'Speak with measured precision. Cite evidence. Acknowledge what is bounded. State unknowns plainly.';

const DEFAULT_DIRECTION: Record<PersonaName, string> = {
    ODIN: 'Structural invariants, decisive system boundaries, and architectural coherence.',
    ALFRED: 'Bounded scope, evidence provenance, and reversible system context.',
};

/**
 * Coerce a free-form persona string into one of the two canonical names.
 * @param name Raw persona label from config or caller (e.g. 'A.L.F.R.E.D.').
 * @returns The canonical persona name; defaults to ALFRED when unrecognized.
 */
function normalizePersonaName(name: string | undefined): PersonaName {
    const upper = String(name ?? '').toUpperCase();
    if (upper.includes('ODIN') || upper.includes('O.D.I.N')) {
        return 'ODIN';
    }
    return 'ALFRED';
}

/**
 * Look up the direction line for an intent category under a given persona.
 * @param persona Canonical persona name.
 * @param intentCategory Intent category from the Augury (case-insensitive).
 * @returns The direction line, or the persona's default direction when unknown.
 */
function lookupDirection(persona: PersonaName, intentCategory: string): string {
    const table = persona === 'ODIN' ? ODIN_DIRECTION : ALFRED_DIRECTION;
    const normalized = intentCategory.trim().toUpperCase();
    return table[normalized] ?? DEFAULT_DIRECTION[persona];
}

/**
 * Build the persona advice payload that cstar_augury attaches to its response
 * and that the steering block injects into delegated host calls.
 * @param intentCategory Resolved intent category (coerced to ORCHESTRATE when blank).
 * @param personaName Active persona name; defaults to the registry's loaded persona.
 * @returns Style/domain emphasis plus tone for the (persona, intent) pair.
 */
export function buildPersonaAdvice(
    intentCategory: string | undefined,
    personaName: string | undefined = activePersona?.name,
): PersonaAdvice {
    const persona = normalizePersonaName(personaName);
    const category = String(intentCategory ?? '').trim().toUpperCase() || 'ORCHESTRATE';
    const domainEmphasis = lookupDirection(persona, category);
    return {
        persona,
        intent_category: category,
        domain_emphasis: domainEmphasis,
        direction: domainEmphasis,
        tone_directive: persona === 'ODIN' ? ODIN_TONE : ALFRED_TONE,
    };
}

/**
 * Format the two persona lines used inside the steering block.
 * @param advice Built advice payload.
 * @returns Two prefix-tagged style lines: 'Persona Emphasis: ...' and 'Persona Tone: ...'.
 */
export function formatPersonaAdviceLines(advice: PersonaAdvice): string[] {
    return [
        `Persona Emphasis: [${advice.persona}] ${advice.domain_emphasis}`,
        `Persona Tone: ${advice.tone_directive}`,
    ];
}
