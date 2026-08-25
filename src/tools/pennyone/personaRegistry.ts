import { parseCanonicalPersona } from '../../core/persona_contract.js';

/**
 * Explicit, style-only persona compatibility data.
 *
 * This module has no active/default persona. A caller must pass the bounded
 * scalar returned by cstar_status; missing or unknown input resolves to null.
 */
export interface PersonaStyle {
    name: 'O.D.I.N.' | 'A.L.F.R.E.D.';
    prefix: '[O.D.I.N.]' | '[A.L.F.R.E.D.]';
    loreFile: 'odin.qmd' | 'alfred.qmd';
    authority: 'style_only';
}

export function resolvePersonaStyle(name: string | undefined): PersonaStyle | null {
    const canonical = parseCanonicalPersona(name);
    if (canonical === 'O.D.I.N.') {
        return {
            name: 'O.D.I.N.',
            prefix: '[O.D.I.N.]',
            loreFile: 'odin.qmd',
            authority: 'style_only',
        };
    }
    if (canonical === 'A.L.F.R.E.D.') {
        return {
            name: 'A.L.F.R.E.D.',
            prefix: '[A.L.F.R.E.D.]',
            loreFile: 'alfred.qmd',
            authority: 'style_only',
        };
    }
    return null;
}
