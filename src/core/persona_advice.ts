import { activePersona, resolvePersonaPolicy, type PersonaOperatingPolicy } from '../tools/pennyone/personaRegistry.js';

export type PersonaName = 'ODIN' | 'ALFRED';

export interface PersonaAdvice {
    persona: PersonaName;
    intent_category: string;
    direction: string;
    tone_directive: string;
    planning_stance: string;
    investigation_stance: string;
    risk_tolerance: 'low' | 'medium' | 'high';
    execution_gate: string;
    repair_bias: string;
}

const ODIN_DIRECTION: Record<string, string> = {
    REPAIR:      'Strike at root cause. Restructure when the breach reproduces. Patches earn no points.',
    BUILD:       'Decompose into parallelizable beads with sovereign scope. Favor decisive scaffolding over incremental ceremony.',
    VERIFY:      'Adversarially attack invariants, ownership boundaries, and stale assumptions before checking happy paths.',
    SCORE:       'Score harshly. Reject easy passes. Demand structural correction where evidence shows recurring weakness.',
    OBSERVE:     'Hunt for ownership ambiguity and stale assumptions first; surface symptoms only after the breach surface is named.',
    HARDEN:      'Tighten contracts aggressively. Reject loose Gherkin. Raise the floor, not the ceiling.',
    EXPAND:      'Mount boldly when authority is established. Verify identity at the boundary. Trust the projector.',
    EVOLVE:      'Propose structural rewrites. SPRT-bench against incumbent. Promote only on clear signal.',
    ORCHESTRATE: 'Strike with bounded sovereignty. Confirm named verification gates exist before dispatch.',
    GUARD:       'Lock the breach surface. Do not negotiate with drift. Fail closed on ambiguity.',
    DOCUMENT:    'Document the why and the trade. Strip ceremony. Signal structural truth, not pleasant prose.',
};

const ALFRED_DIRECTION: Record<string, string> = {
    REPAIR:      'Bound the fault surface first. Smallest reversible bead. Name the rollback path.',
    BUILD:       'Smallest reversible scaffolding that preserves contracts. Document the verification path before extending it.',
    VERIFY:      'Inspect current state and recent failure evidence before broadening scope. Cite before asserting.',
    SCORE:       'Score deliberately. Require ledgered evidence. Flag drift without overreacting.',
    OBSERVE:     'Perimeter-first triage. Gather state, recent failure evidence, and narrow repro paths before hypothesizing.',
    HARDEN:      'Add focused Gherkin. Preserve existing contract semantics. Verify incrementally.',
    EXPAND:      'Verify identity, mount, and authority before extending spoke privilege. Default to read_only.',
    EVOLVE:      'Conservative refactor with bounded blast radius. Require operator-visible review.',
    ORCHESTRATE: 'Require operator-visible review before broad dispatch. Favor a single named bead over a multi-strike plan.',
    GUARD:       'Confirm guardrail coverage. Do not loosen contracts to unblock work.',
    DOCUMENT:    'Preserve existing prose voice. Cite registry and runtime over inferred truth.',
};

const ODIN_TONE = 'Speak with structural conviction. Compress. Name the target. Trade hedges for decisions.';
const ALFRED_TONE = 'Speak with measured precision. Cite evidence. Acknowledge what is bounded. State unknowns plainly.';

const DEFAULT_DIRECTION: Record<PersonaName, string> = {
    ODIN: 'Default ODIN direction: attack the strongest invariant; refuse incremental hedging when sovereignty is established.',
    ALFRED: 'Default ALFRED direction: confirm scope, name the verification surface, and proceed only with a reversible step.',
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
 * @returns Direction + tone + policy summary for the (persona, intent) pair.
 */
export function buildPersonaAdvice(
    intentCategory: string | undefined,
    personaName: string | undefined = activePersona?.name,
): PersonaAdvice {
    const persona = normalizePersonaName(personaName);
    const policy: PersonaOperatingPolicy = resolvePersonaPolicy(personaName);
    const category = String(intentCategory ?? '').trim().toUpperCase() || 'ORCHESTRATE';
    return {
        persona,
        intent_category: category,
        direction: lookupDirection(persona, category),
        tone_directive: persona === 'ODIN' ? ODIN_TONE : ALFRED_TONE,
        planning_stance: policy.planning.stance,
        investigation_stance: policy.investigation.stance,
        risk_tolerance: policy.planning.riskTolerance,
        execution_gate: policy.planning.executionGate,
        repair_bias: policy.investigation.repairBias,
    };
}

/**
 * Format the two persona lines used inside the steering block.
 * @param advice Built advice payload.
 * @returns Two prefix-tagged lines: 'Persona Advice: ...' and 'Persona Tone: ...'.
 */
export function formatPersonaAdviceLines(advice: PersonaAdvice): string[] {
    return [
        `Persona Advice: [${advice.persona}] ${advice.direction}`,
        `Persona Tone: ${advice.tone_directive}`,
    ];
}
