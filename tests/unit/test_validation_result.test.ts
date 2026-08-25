import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createBenchmarkResult,
    createSprtVerdict,
    createValidationResult,
    toHallValidationRun,
} from '../../src/types/validation.ts';

describe('Validation contract (CS-P1-07)', () => {
    it('accepts candidates when protected axes hold and checks pass', () => {
        const result = createValidationResult({
            before: { logic: 8, style: 7, sovereignty: 7.5, overall: 7.5 },
            after: { logic: 8.3, style: 7.2, sovereignty: 7.5, overall: 7.8 },
            benchmark: createBenchmarkResult({
                status: 'PASS',
                summary: 'Latency within envelope.',
                trials: 3,
                avg_latency_ms: 85.2,
            }),
            sprt: createSprtVerdict({
                verdict: 'ACCEPTED',
                summary: 'PASS (Accepted)',
                llr: 3.2,
                passed: 10,
                total: 10,
                lower_bound: -2.9,
                upper_bound: 2.9,
            }),
            checks: [{ name: 'crucible', status: 'PASS' }],
            evidence: {
                validator_identity: 'independent:test-validator',
                evidence_sha256: 'a'.repeat(64),
                independent_of_execution: true,
                evaluated_checks: 1,
            },
        });

        assert.equal(result.verdict, 'ACCEPTED');
        assert.deepEqual(result.blocking_reasons, []);
        assert.deepEqual(result.evidence_gaps, []);
        assert.equal(result.score_delta.delta.logic, 0.3);
        assert.equal(toHallValidationRun(result, 'repo:test').authority_class, 'reported');
    });

    it('rejects candidates when logic, style, or sovereignty regresses', () => {
        const result = createValidationResult({
            before: { logic: 8, style: 8, sovereignty: 8, overall: 8 },
            after: { logic: 7.5, style: 8, sovereignty: 8, overall: 7.8 },
            checks: [{ name: 'crucible', status: 'PASS' }],
            evidence: {
                validator_identity: 'independent:test-validator',
                evidence_sha256: 'b'.repeat(64),
                independent_of_execution: true,
                evaluated_checks: 1,
            },
        });

        assert.equal(result.verdict, 'REJECTED');
        assert.match(result.blocking_reasons[0] ?? '', /logic/);
    });

    it('keeps the promotion gate inconclusive when SPRT is unresolved', () => {
        const result = createValidationResult({
            before: { logic: 8, style: 8, sovereignty: 8, overall: 8 },
            after: { logic: 8.1, style: 8, sovereignty: 8, overall: 8.05 },
            sprt: createSprtVerdict({
                verdict: 'INCONCLUSIVE',
                summary: 'Need more games.',
                llr: 0.1,
                passed: 6,
                total: 10,
                lower_bound: -2.9,
                upper_bound: 2.9,
            }),
            checks: [{ name: 'crucible', status: 'PASS' }],
        });

        assert.equal(result.verdict, 'INCONCLUSIVE');
        assert.deepEqual(result.blocking_reasons, []);
    });

    it('keeps a passing but evidence-free result inconclusive', () => {
        const result = createValidationResult({
            checks: [{ name: 'focused-tests', status: 'PASS' }],
        });

        assert.equal(result.verdict, 'INCONCLUSIVE');
        assert.match(result.evidence_gaps.join(' '), /evidence is missing/i);
    });

    it('keeps zero-denominator evidence inconclusive', () => {
        const result = createValidationResult({
            checks: [{ name: 'focused-tests', status: 'PASS' }],
            sprt: createSprtVerdict({
                verdict: 'ACCEPTED',
                summary: 'Caller claimed acceptance without observations.',
                llr: 0,
                passed: 0,
                total: 0,
                lower_bound: -1,
                upper_bound: 1,
            }),
            evidence: {
                validator_identity: 'independent:test-validator',
                evidence_sha256: 'c'.repeat(64),
                independent_of_execution: true,
                evaluated_checks: 1,
            },
        });

        assert.equal(result.verdict, 'INCONCLUSIVE');
        assert.match(result.evidence_gaps.join(' '), /zero sample denominator/i);
    });
});
