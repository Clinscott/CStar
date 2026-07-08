import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPersonaAdvice, formatPersonaAdviceLines } from '../../src/core/persona_advice.ts';

describe('persona_advice', () => {
    it('returns ODIN direction tuned for the resolved intent category', () => {
        const advice = buildPersonaAdvice('REPAIR', 'ODIN');
        assert.equal(advice.persona, 'ODIN');
        assert.equal(advice.intent_category, 'REPAIR');
        assert.match(advice.direction, /root cause/i);
        assert.match(advice.tone_directive, /structural conviction/i);
        assert.equal(advice.risk_tolerance, 'high');
    });

    it('returns ALFRED direction tuned for the resolved intent category', () => {
        const advice = buildPersonaAdvice('BUILD', 'ALFRED');
        assert.equal(advice.persona, 'ALFRED');
        assert.equal(advice.intent_category, 'BUILD');
        assert.match(advice.direction, /reversible|contracts|verification/i);
        assert.match(advice.tone_directive, /measured precision/i);
        assert.equal(advice.risk_tolerance, 'low');
    });

    it('normalizes dotted persona names (A.L.F.R.E.D. / O.D.I.N.)', () => {
        assert.equal(buildPersonaAdvice('VERIFY', 'A.L.F.R.E.D.').persona, 'ALFRED');
        assert.equal(buildPersonaAdvice('VERIFY', 'O.D.I.N.').persona, 'ODIN');
    });

    it('falls back to a persona default direction when the intent category is unknown', () => {
        const odinAdvice = buildPersonaAdvice('FREESTYLE', 'ODIN');
        const alfredAdvice = buildPersonaAdvice('FREESTYLE', 'ALFRED');
        assert.match(odinAdvice.direction, /Default ODIN/);
        assert.match(alfredAdvice.direction, /Default ALFRED/);
    });

    it('coerces blank or missing intent categories to ORCHESTRATE', () => {
        const advice = buildPersonaAdvice('', 'ALFRED');
        assert.equal(advice.intent_category, 'ORCHESTRATE');
        assert.match(advice.direction, /operator-visible review/i);
    });

    it('defaults to ALFRED when the persona name is missing or unrecognized', () => {
        assert.equal(buildPersonaAdvice('REPAIR', undefined).persona, 'ALFRED');
        assert.equal(buildPersonaAdvice('REPAIR', 'NOT-A-PERSONA').persona, 'ALFRED');
    });

    it('formats two prefix-tagged lines for the steering block', () => {
        const advice = buildPersonaAdvice('BUILD', 'ODIN');
        const lines = formatPersonaAdviceLines(advice);
        assert.equal(lines.length, 2);
        assert.match(lines[0], /^Persona Advice: \[ODIN\] /);
        assert.match(lines[1], /^Persona Tone: /);
    });
});
