import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCanonicalIntent } from '../../../src/core/intent_analysis.js';
import { scoreCouncilExpertCandidates } from '../../../src/core/council_experts.js';
import { INTENT_CATEGORIES } from '../../../src/node/core/runtime/host_workflows/chant_parser.js';
import { handleIntentRoute } from '../../../src/tools/cstar-kernel-mcp/tools/intent_route.js';
import {
    detectAuguryTargetDivergence,
    resolveAuguryCanonicalIntent,
} from '../../../src/tools/cstar-kernel-mcp/tools/augury_routing.js';

const REGRESSION_MISSION = 'Audit and repair CStar for 5.6; this is not a scoring task.';

describe('CStar Augury semantic safety boundary', () => {
    it('routes compound audit-and-repair to REPAIR while retaining negated SCORE evidence', () => {
        const analysis = analyzeCanonicalIntent({
            prompt: REGRESSION_MISSION,
            grammar: INTENT_CATEGORIES,
        });

        assert.equal(analysis.primary?.category, 'REPAIR');
        assert.equal(analysis.primary?.default_path, 'cstar_forge_request');
        const score = analysis.matches.find((match) => match.category === 'SCORE');
        assert.ok(score);
        assert.equal(score.suppressed, true);
        assert.ok(score.suppression_reasons.includes('category_triggers_explicitly_negated:score'));
        assert.ok(analysis.negations_detected.length > 0);
    });

    it('is invariant to case, punctuation, repetition, and inferred prose duplication', () => {
        const variants = [
            REGRESSION_MISSION,
            'AUDIT!!! REPAIR??? CStar 5.6 -- NOT A SCORING TASK.',
            'audit audit audit repair repair repair CStar 5.6; not a scoring task',
        ];
        for (const prompt of variants) {
            const analysis = analyzeCanonicalIntent({
                prompt,
                inferred_intent: 'score score score score score',
                grammar: INTENT_CATEGORIES,
            });
            assert.equal(analysis.primary?.category, 'REPAIR', prompt);
            assert.equal(analysis.matches.find((match) => match.category === 'REPAIR')?.match_count, 1);
        }
    });

    it('keeps pure explicit scoring missions on SCORE', () => {
        for (const prompt of ['score the Gungnir result', 'GRADE and benchmark this implementation']) {
            const analysis = analyzeCanonicalIntent({ prompt, grammar: INTENT_CATEGORIES });
            assert.equal(analysis.primary?.category, 'SCORE', prompt);
            assert.equal(analysis.primary?.default_path, 'cstar_record_result');
        }
    });

    it('routes audit-only missions to VERIFY rather than SCORE', () => {
        const analysis = analyzeCanonicalIntent({
            prompt: 'Audit the current control-plane boundary.',
            grammar: INTENT_CATEGORIES,
        });
        assert.equal(analysis.primary?.category, 'VERIFY');
        assert.equal(analysis.matches.some((match) => match.category === 'SCORE'), false);
    });

    it('does not let inferred hints reactivate any explicitly negated category', () => {
        const cases: Array<[string, string]> = [
            ['REPAIR', 'do not repair'],
            ['HARDEN', 'without hardening'],
            ['BUILD', 'do not build'],
            ['VERIFY', 'without auditing'],
            ['SCORE', 'not scoring'],
            ['OBSERVE', 'without scanning'],
            ['EXPAND', 'without deploying'],
            ['EVOLVE', 'without evolving'],
            ['ORCHESTRATE', 'do not orchestrate'],
            ['GUARD', 'without guarding'],
            ['DOCUMENT', 'do not document'],
        ];
        for (const [category, prompt] of cases) {
            const analysis = analyzeCanonicalIntent({ prompt, inferred_intent: category, grammar: INTENT_CATEGORIES });
            const match = analysis.matches.find((entry) => entry.category === category);
            assert.equal(match?.suppressed, true, `${category}: ${prompt}`);
            assert.notEqual(analysis.primary?.category, category, `${category}: ${prompt}`);
        }
    });

    it('keeps the public intent route and Augury deterministic resolver in agreement', async () => {
        const publicResult = await handleIntentRoute({ prompt: REGRESSION_MISSION });
        assert.equal(publicResult.isError, undefined, publicResult.content[0].text);
        const publicRoute = JSON.parse(publicResult.content[0].text);
        const auguryRoute = resolveAuguryCanonicalIntent(
            REGRESSION_MISSION,
            'SCORE SCORE SCORE',
            INTENT_CATEGORIES,
        );

        assert.equal(publicRoute.intent_category, 'REPAIR');
        assert.equal(publicRoute.default_path, 'cstar_forge_request');
        assert.equal(auguryRoute?.category, publicRoute.intent_category);
        assert.equal(auguryRoute?.default_path, publicRoute.default_path);
    });

    it('explains secondary evidence without promoting it', async () => {
        const result = await handleIntentRoute({ prompt: REGRESSION_MISSION, action: 'explain' });
        const body = JSON.parse(result.content[0].text);
        const repair = body.matches.find((match: any) => match.intent_category === 'REPAIR');
        const score = body.matches.find((match: any) => match.intent_category === 'SCORE');

        assert.equal(repair.primary, true);
        assert.equal(score.primary, false);
        assert.equal(score.suppressed, true);
    });

    it('makes target coverage directional', () => {
        const root = '/home/morderith/Corvus/CStar';
        const requestedRoot = detectAuguryTargetDivergence([root], [`${root}/src/core/file.ts`], root);
        const requestedChild = detectAuguryTargetDivergence([`${root}/src/core/file.ts`], [root], root);

        assert.equal(requestedRoot.diverged, true, 'a session child cannot cover the repository root');
        assert.equal(requestedChild.diverged, false, 'a session root may cover a requested child');
    });

    it('does not double-count the derived category in Council keyword scoring', () => {
        const candidates = scoreCouncilExpertCandidates({
            intent_category: 'REPAIR',
            intent: 'Repair the Augury model-routing boundary and preserve deterministic agent behavior.',
            selection_tier: 'SKILL',
            selection_name: 'cstar_forge_request',
            mimirs_well: ['src/tools/cstar-kernel-mcp/tools/augury.ts'],
        });
        const ids = candidates.map((candidate) => candidate.id);

        assert.ok(ids.includes('karpathy'));
        assert.equal(ids.includes('linscott'), false);
    });
});
