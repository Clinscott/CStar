import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    parseTraceSelectionGate,
    tokenize,
    normalizeIntent,
    validateTraceSelectionGate,
    hasAnyToken,
    loadRegistryManifest,
    loadSkillTriggers,
    resolveBuiltInWeave,
    resolveRegistryInvocation,
    resolveSkillInvocation,
    resolveIntentCategory,
    resolveIntentCategoryFromGrammar,
    resolveByIntentCategory,
    deps,
} from '../../../../src/node/core/runtime/host_workflows/chant_parser.ts';

describe('Chant Parser Unit Tests', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    function assertResolvedWeave(
        resolution: ReturnType<typeof resolveBuiltInWeave> | ReturnType<typeof resolveRegistryInvocation> | ReturnType<typeof resolveByIntentCategory>,
    ) {
        assert.ok(resolution);
        assert.equal(resolution.kind, 'weave');
        return resolution;
    }

    function assertResolvedSkill(
        resolution: ReturnType<typeof resolveSkillInvocation> | ReturnType<typeof resolveRegistryInvocation>,
    ) {
        assert.ok(resolution);
        assert.equal(resolution.kind, 'skill');
        return resolution;
    }

    it('tokenize splits query by whitespace and filters empty strings', () => {
        assert.deepEqual(tokenize('  ravens   status  '), ['ravens', 'status']);
        assert.deepEqual(tokenize(''), []);
    });

    it('normalizeIntent trims and collapses whitespace', () => {
        assert.equal(normalizeIntent('  hello    world  '), 'hello world');
    });

    it('normalizeIntent strips the Augury block before routing on the real intent body', () => {
        const input = `// Corvus Star Augury [Ω]
Intent Category: ORCHESTRATE
Intent: Build the thing
Selection: WEAVE: orchestrate
Trajectory: STABLE: reason
Mimir's Well: ◈ a | ◈ b
Gungnir Verdict: [L: 4.0 | S: 4.0 | I: 4.0 | Ω: 80%]
Confidence: 0.9

Plan XO implementation beads for phase 1`;

        assert.equal(normalizeIntent(input), 'Plan XO implementation beads for phase 1');
    });

    it('normalizeIntent falls back to the declared Augury intent when no freeform body exists', () => {
        const input = `// Corvus Star Augury [Ω]
Intent Category: BUILD
Intent: Begin XO implementation planning
Selection: WEAVE: creation_loop
Trajectory: STABLE: The weave remains the right intake shell.
Mimir's Well: ◈ CStar/AGENTS.qmd | ◈ src/node/core/runtime/host_workflows/chant.ts
Gungnir Verdict: [L: 4.0 | S: 4.0 | I: 4.0 | Ω: 80%]
Confidence: 0.9`;

        assert.equal(normalizeIntent(input), 'Begin XO implementation planning');
    });

    it('parseTraceSelectionGate extracts the structured Augury designation contract', () => {
        const input = `// Corvus Star Augury [Ω]
Intent Category: ORCHESTRATE
Intent: Make chant the only intake gate
Selection: WEAVE: orchestrate
Trajectory: STABLE: Persist the designation instead of discarding it.
Mimir's Well: ◈ CStar/AGENTS.qmd | ◈ src/node/core/runtime/dispatcher.ts
Gungnir Verdict: [L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]
Confidence: 0.94

Seed the Hall contract for the scheduler migration.`;

        const trace = parseTraceSelectionGate(input);
        assert.equal(trace?.intent_category, 'ORCHESTRATE');
        assert.equal(trace?.intent, 'Make chant the only intake gate');
        assert.equal(trace?.selection_tier, 'WEAVE');
        assert.equal(trace?.selection_name, 'orchestrate');
        assert.equal(trace?.trajectory_status, 'STABLE');
        assert.equal(trace?.trajectory_reason, 'Persist the designation instead of discarding it.');
        assert.deepEqual(trace?.mimirs_well, ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts']);
        assert.equal(trace?.gungnir_verdict, '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]');
        assert.equal(trace?.confidence, 0.94);
        assert.equal(trace?.confidence_source, 'explicit');
        assert.equal(trace?.body, 'Seed the Hall contract for the scheduler migration.');
        assert.equal(trace?.canonical_intent, 'Seed the Hall contract for the scheduler migration.');
        assert.deepEqual(trace?.issues, []);
    });

    it('accepts missing confidence while marking the source as missing', () => {
        const input = `// Corvus Star Augury [Ω]
Intent Category: ORCHESTRATE
Intent: Plan without an invented confidence
Selection: WEAVE: orchestrate
Trajectory: STABLE: Confidence can be learned later.
Mimir's Well: ◈ CStar/AGENTS.qmd
Gungnir Verdict: Proceed.`;

        const trace = parseTraceSelectionGate(input);
        assert.equal(trace?.confidence, undefined);
        assert.equal(trace?.confidence_source, 'missing');
        assert.deepEqual(trace?.issues, []);
    });

    it('accepts the legacy Corvus Star Trace header during migration', () => {
        const input = `// Corvus Star Trace [Ω]
Intent Category: ORCHESTRATE
Intent: Migrate old trace block wording
Selection: WEAVE: orchestrate
Trajectory: STABLE: Legacy documents still parse during migration.
Mimir's Well: ◈ CStar/AGENTS.qmd
Gungnir Verdict: [L: 4.0 | S: 4.0 | I: 4.0 | Ω: 80%]
Confidence: 0.8`;

        const trace = parseTraceSelectionGate(input);
        assert.equal(trace?.intent_category, 'ORCHESTRATE');
        assert.equal(trace?.intent, 'Migrate old trace block wording');
        assert.deepEqual(trace?.issues, []);
    });

    it('validateTraceSelectionGate reports missing and malformed fields', () => {
        const input = `// Corvus Star Augury [Ω]
Intent: malformed Augury
Selection: orchestrate
Trajectory: STABLE
Confidence: 1.8`;

        const validation = validateTraceSelectionGate(input);
        assert.equal(validation.valid, false);
        assert.match(validation.errors.join(' '), /Missing Intent Category\./);
        assert.match(validation.errors.join(' '), /Missing Mimir's Well\./);
        assert.match(validation.errors.join(' '), /Selection must follow/);
        assert.match(validation.errors.join(' '), /Trajectory must follow/);
        assert.match(validation.errors.join(' '), /Confidence must be a number between 0.0 and 1.0/);
    });

    it('hasAnyToken returns true if any token matches', () => {
        assert.ok(hasAnyToken(['a', 'b', 'c'], ['b', 'd']));
        assert.ok(!hasAnyToken(['a', 'c'], ['b', 'd']));
    });

    it('loadSkillTriggers returns empty set if manifest does not exist', () => {
        mock.method(deps.fs, 'existsSync', () => false);
        const result = loadSkillTriggers('/fake/root');
        assert.equal(result.size, 0);
    });

    it('loadSkillTriggers returns skill keys from manifest', () => {
        mock.method(deps.fs, 'existsSync', () => true);
        mock.method(deps.fs, 'readFileSync', () => '{"entries":{"SkillA":{},"SkillB":{}}}');
        const result = loadSkillTriggers('/fake/root');
        assert.ok(result.has('skilla'));
        assert.ok(result.has('skillb'));
        assert.equal(result.size, 2);
    });

    it('loadRegistryManifest returns parsed registry data', () => {
        mock.method(deps.fs, 'existsSync', () => true);
        mock.method(deps.fs, 'readFileSync', () => '{"entries":{"chant":{"tier":"WEAVE"}}}');
        const manifest = loadRegistryManifest('/fake/root');
        assert.equal(manifest?.entries?.chant?.tier, 'WEAVE');
    });

    it('resolveBuiltInWeave handles ravens commands', () => {
        const payload = { query: 'ravens status', project_root: '.', cwd: '.' };
        const res = assertResolvedWeave(resolveBuiltInWeave(['ravens', 'status'], payload, 'ravens status'));
        assert.equal(res.trigger, 'ravens');
        assert.equal((res.invocation.payload as any).action, 'status');
    });

    it('resolveBuiltInWeave handles pennyone commands', () => {
        const payload = { query: 'scan', project_root: '.', cwd: '.' };
        const res = assertResolvedWeave(resolveBuiltInWeave(['scan'], payload, 'scan'));
        assert.equal(res.trigger, 'pennyone');
        assert.equal((res.invocation.payload as any).action, 'scan');
    });

    it('resolveBuiltInWeave handles start commands', () => {
        const payload = { query: 'start something', project_root: '.', cwd: '.' };
        const res = assertResolvedWeave(resolveBuiltInWeave(['start', 'something'], payload, 'start something'));
        assert.equal(res.trigger, 'start');
        assert.equal(res.invocation.weave_id, 'weave:start');
    });

    it('resolveSkillInvocation resolves explicit skill calls', () => {
        const skills = new Set(['test-skill']);
        const payload = { query: 'use test-skill', project_root: '.', cwd: '.' };
        const res = assertResolvedSkill(resolveSkillInvocation(['use', 'test-skill'], payload, skills));
        assert.equal(res.trigger, 'test-skill');
        assert.equal((res.invocation.params as any).command, 'test-skill');
    });

    it('resolveSkillInvocation resolves inline skill calls', () => {
        const skills = new Set(['test-skill']);
        const payload = { query: 'do test-skill now', project_root: '.', cwd: '.' };
        const res = assertResolvedSkill(resolveSkillInvocation(['do', 'test-skill', 'now'], payload, skills));
        assert.equal(res.trigger, 'test-skill');
    });

    it('resolveSkillInvocation identifies missing capabilities', () => {
        const skills = new Set(['installed-skill']);
        const payload = { query: 'use missing-skill', project_root: '.', cwd: '.' };
        const res = resolveSkillInvocation(['use', 'missing-skill'], payload, skills);
        assert.equal(res?.kind, 'missing_capability');
        assert.equal(res?.trigger, 'missing-skill');
    });

    it('resolveRegistryInvocation routes registry-backed weaves directly', () => {
        const payload = { query: 'use restoration', project_root: '.', cwd: '.' };
        const manifest = {
            entries: {
                restoration: {
                    tier: 'WEAVE',
                    execution: { adapter_id: 'weave:restoration' },
                },
            },
        };
        const res = assertResolvedWeave(resolveRegistryInvocation(['use', 'restoration'], payload, manifest));
        assert.equal(res.trigger, 'restoration');
        assert.equal(res.invocation.weave_id, 'weave:restoration');
    });

    it('resolveRegistryInvocation routes registry-backed skills through skill beads', () => {
        const payload = { query: 'use hall', project_root: '.', cwd: '.' };
        const manifest = {
            entries: {
                hall: {
                    tier: 'PRIME',
                    execution: { mode: 'agent-native', cli: 'cstar hall' },
                },
            },
        };
        const res = assertResolvedSkill(resolveRegistryInvocation(['use', 'hall'], payload, manifest));
        assert.equal((res.invocation.params as any).command, 'hall');
    });

    it('resolveRegistryInvocation rejects policy-only spells as direct runtime commands', () => {
        const payload = { query: 'use silver_shield', project_root: '.', cwd: '.' };
        const manifest = {
            entries: {
                silver_shield: {
                    tier: 'SPELL',
                    spell_classification: 'policy-only',
                    host_support: {
                        codex: 'policy-only',
                    },
                },
            },
        };
        const res = resolveRegistryInvocation(['use', 'silver_shield'], payload, manifest, 'codex');
        assert.equal(res?.kind, 'policy_only');
        assert.equal(res?.trigger, 'silver_shield');
    });

    it('resolveRegistryInvocation surfaces unsupported host metadata from the registry', () => {
        const payload = { query: 'use hall', project_root: '.', cwd: '.' };
        const manifest = {
            entries: {
                hall: {
                    tier: 'PRIME',
                    execution: { mode: 'agent-native', cli: 'cstar hall' },
                    host_support: {
                        codex: 'unsupported',
                    },
                },
            },
        };
        const res = resolveRegistryInvocation(['use', 'hall'], payload, manifest, 'codex');
        assert.equal(res?.kind, 'unsupported_host');
        assert.equal(res?.trigger, 'hall');
        assert.equal((res as any)?.host_support_status, 'unsupported');
    });

    it('resolveIntentCategory maps triggers to correct grammatical categories', () => {
        const repairMatch = resolveIntentCategory(['fix', 'the', 'bug']);
        assert.equal(repairMatch?.category, 'REPAIR');
        assert.equal(repairMatch?.default_path, 'restoration');
        assert.equal(repairMatch?.tier, 'WEAVE');

        const scoreMatch = resolveIntentCategory(['score', 'the', 'code']);
        assert.equal(scoreMatch?.category, 'SCORE');
        assert.equal(scoreMatch?.default_path, 'calculus');
        assert.equal(scoreMatch?.tier, 'PRIME');

        const buildMatch = resolveIntentCategory(['build', 'a', 'feature']);
        assert.equal(buildMatch?.category, 'BUILD');
        assert.equal(buildMatch?.default_path, 'creation_loop');

        const noMatch = resolveIntentCategory(['do', 'something', 'random']);
        assert.equal(noMatch, null);
    });

    it('resolveIntentCategoryFromGrammar uses registry grammar when provided', () => {
        const match = resolveIntentCategoryFromGrammar(
            ['repair', 'this'],
            {
                REPAIR: {
                    triggers: ['repair'],
                    default_path: 'restoration',
                    tier: 'WEAVE',
                },
            },
        );
        assert.equal(match?.category, 'REPAIR');
        assert.equal(match?.matched_trigger, 'repair');
    });

    it('resolveByIntentCategory returns a valid weave invocation for a matched category', () => {
        const payload = { query: 'fix it', project_root: '/tmp/test', cwd: '/tmp/test' };
        const res = assertResolvedWeave(resolveByIntentCategory(['fix', 'it'], payload));
        assert.equal(res.trigger, 'restoration');
        assert.equal(res.invocation.weave_id, 'weave:restoration');
        assert.equal(res.invocation.payload !== undefined, true);
    });
});
