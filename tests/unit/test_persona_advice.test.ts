import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPersonaAdvice, formatPersonaAdviceLines } from '../../src/core/persona_advice.ts';
import { activePersona } from '../../src/tools/pennyone/personaRegistry.ts';

describe('persona_advice', () => {
    it('returns ODIN style and domain emphasis without authority fields', () => {
        const advice = buildPersonaAdvice('REPAIR', 'ODIN');
        assert.equal(advice.persona, 'ODIN');
        assert.equal(advice.intent_category, 'REPAIR');
        assert.match(advice.domain_emphasis, /structural causes/i);
        assert.equal(advice.direction, advice.domain_emphasis);
        assert.match(advice.tone_directive, /structural conviction/i);
        assert.deepEqual(Object.keys(advice).sort(), [
            'direction', 'domain_emphasis', 'intent_category', 'persona', 'tone_directive',
        ]);
    });

    it('returns ALFRED style and domain emphasis without risk policy', () => {
        const advice = buildPersonaAdvice('BUILD', 'ALFRED');
        assert.equal(advice.persona, 'ALFRED');
        assert.equal(advice.intent_category, 'BUILD');
        assert.match(advice.domain_emphasis, /contract-preserving|verification/i);
        assert.match(advice.tone_directive, /measured precision/i);
        assert.equal('risk_tolerance' in advice, false);
        assert.equal('execution_gate' in advice, false);
    });

    it('normalizes dotted persona names (A.L.F.R.E.D. / O.D.I.N.)', () => {
        assert.equal(buildPersonaAdvice('VERIFY', 'A.L.F.R.E.D.').persona, 'ALFRED');
        assert.equal(buildPersonaAdvice('VERIFY', 'O.D.I.N.').persona, 'ODIN');
    });

    it('falls back to a persona default direction when the intent category is unknown', () => {
        const odinAdvice = buildPersonaAdvice('FREESTYLE', 'ODIN');
        const alfredAdvice = buildPersonaAdvice('FREESTYLE', 'ALFRED');
        assert.match(odinAdvice.domain_emphasis, /structural invariants/i);
        assert.match(alfredAdvice.domain_emphasis, /bounded scope/i);
    });

    it('coerces blank or missing intent categories to ORCHESTRATE', () => {
        const advice = buildPersonaAdvice('', 'ALFRED');
        assert.equal(advice.intent_category, 'ORCHESTRATE');
        assert.match(advice.domain_emphasis, /explicit ownership/i);
    });

    it('uses the active registry persona when missing and ALFRED when unrecognized', () => {
        const active = buildPersonaAdvice('REPAIR', activePersona?.name).persona;
        assert.equal(buildPersonaAdvice('REPAIR', undefined).persona, active);
        assert.equal(buildPersonaAdvice('REPAIR', 'NOT-A-PERSONA').persona, 'ALFRED');
    });

    it('formats two prefix-tagged lines for the steering block', () => {
        const advice = buildPersonaAdvice('BUILD', 'ODIN');
        const lines = formatPersonaAdviceLines(advice);
        assert.equal(lines.length, 2);
        assert.match(lines[0], /^Persona Emphasis: \[ODIN\] /);
        assert.match(lines[1], /^Persona Tone: /);
    });
});
