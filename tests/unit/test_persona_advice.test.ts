import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildPersonaAdvice,
    buildProjectedPersonaAdvice,
    formatPersonaAdviceLines,
} from '../../src/core/persona_advice.ts';

describe('persona_advice', () => {
    it('returns only ODIN presentation style for the resolved intent category', () => {
        const advice = buildPersonaAdvice('REPAIR', 'O.D.I.N.');
        assert.ok(advice);
        assert.equal(advice.persona, 'O.D.I.N.');
        assert.equal(advice.intent_category, 'REPAIR');
        assert.match(advice.tone_directive, /concise, forceful voice/i);
        assert.equal(advice.authority, 'style_only');
        assert.equal(advice.source, 'hall_self_consistent_record');
        assert.equal('direction' in advice, false);
    });

    it('returns only ALFRED presentation style for the resolved intent category', () => {
        const advice = buildPersonaAdvice('BUILD', 'A.L.F.R.E.D.');
        assert.ok(advice);
        assert.equal(advice.persona, 'A.L.F.R.E.D.');
        assert.equal(advice.intent_category, 'BUILD');
        assert.match(advice.tone_directive, /measured, courteous voice/i);
        assert.equal(advice.authority, 'style_only');
        assert.equal('planning_stance' in advice, false);
        assert.equal('repair_bias' in advice, false);
    });

    it('accepts only exact dotted canonical persona names', () => {
        assert.equal(buildPersonaAdvice('VERIFY', 'A.L.F.R.E.D.')?.persona, 'A.L.F.R.E.D.');
        assert.equal(buildPersonaAdvice('VERIFY', 'O.D.I.N.')?.persona, 'O.D.I.N.');
        for (const invalid of [
            'ALFRED', 'ODIN', 'alfred', 'odin', ' A.L.F.R.E.D.', 'O.D.I.N. ',
            'NOT-ODIN-ADMIN', 'ALFRED-OVERRIDE', 'O.D.İ.N.', 'O.D.I.N.\0CANARY',
            `O.D.I.N.${'X'.repeat(4_096)}`,
        ]) {
            assert.equal(buildPersonaAdvice('VERIFY', invalid), null);
        }
    });

    it('coerces blank or missing intent categories to ORCHESTRATE', () => {
        const advice = buildPersonaAdvice('', 'A.L.F.R.E.D.');
        assert.ok(advice);
        assert.equal(advice.intent_category, 'ORCHESTRATE');
    });

    it('does not synthesize a persona when the projection is missing or unrecognized', () => {
        assert.equal(buildPersonaAdvice('REPAIR', undefined), null);
        assert.equal(buildPersonaAdvice('REPAIR', 'NOT-A-PERSONA'), null);
    });

    it('omits projected advice when the bounded persona field is unavailable', () => {
        assert.equal(buildProjectedPersonaAdvice('REPAIR', undefined), null);
        assert.equal(buildProjectedPersonaAdvice('REPAIR', '  '), null);
    });

    it('formats only a presentation-tone line for the steering block', () => {
        const advice = buildPersonaAdvice('BUILD', 'O.D.I.N.');
        assert.ok(advice);
        const lines = formatPersonaAdviceLines(advice);
        assert.equal(lines.length, 1);
        assert.match(lines[0], /^Persona Tone: /);
    });
});
