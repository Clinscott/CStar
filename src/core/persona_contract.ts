export const CANONICAL_PERSONAS = ['O.D.I.N.', 'A.L.F.R.E.D.'] as const;

export type CanonicalPersona = typeof CANONICAL_PERSONAS[number];

/** Exact scalar contract: no trimming, aliases, case folding, or substring matching. */
export function parseCanonicalPersona(value: unknown): CanonicalPersona | null {
    return value === 'O.D.I.N.' || value === 'A.L.F.R.E.D.' ? value : null;
}
