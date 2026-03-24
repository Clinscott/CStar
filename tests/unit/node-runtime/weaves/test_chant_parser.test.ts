import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    tokenize,
    normalizeIntent,
    hasAnyToken,
    loadSkillTriggers,
    resolveBuiltInWeave,
    resolveSkillInvocation,
    resolveIntentCategory,
    resolveByIntentCategory,
    deps,
} from '../../../../src/node/core/runtime/weaves/chant_parser.ts';

describe('Chant Parser Unit Tests', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('tokenize splits query by whitespace and filters empty strings', () => {
        assert.deepEqual(tokenize('  ravens   status  '), ['ravens', 'status']);
        assert.deepEqual(tokenize(''), []);
    });

    it('normalizeIntent trims and collapses whitespace', () => {
        assert.equal(normalizeIntent('  hello    world  '), 'hello world');
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

    it('resolveBuiltInWeave handles ravens commands', () => {
        const payload = { query: 'ravens status', project_root: '.', cwd: '.' };
        const res = resolveBuiltInWeave(['ravens', 'status'], payload, 'ravens status');
        assert.equal(res?.kind, 'weave');
        assert.equal(res?.trigger, 'ravens');
        assert.equal((res?.invocation?.payload as any).action, 'status');
    });

    it('resolveBuiltInWeave handles pennyone commands', () => {
        const payload = { query: 'scan', project_root: '.', cwd: '.' };
        const res = resolveBuiltInWeave(['scan'], payload, 'scan');
        assert.equal(res?.kind, 'weave');
        assert.equal(res?.trigger, 'pennyone');
        assert.equal((res?.invocation?.payload as any).action, 'scan');
    });

    it('resolveBuiltInWeave handles start commands', () => {
        const payload = { query: 'start something', project_root: '.', cwd: '.' };
        const res = resolveBuiltInWeave(['start', 'something'], payload, 'start something');
        assert.equal(res?.kind, 'weave');
        assert.equal(res?.trigger, 'start');
        assert.equal(res?.invocation?.weave_id, 'weave:start');
    });

    it('resolveSkillInvocation resolves explicit skill calls', () => {
        const skills = new Set(['test-skill']);
        const payload = { query: 'use test-skill', project_root: '.', cwd: '.' };
        const res = resolveSkillInvocation(['use', 'test-skill'], payload, skills);
        assert.equal(res?.kind, 'skill');
        assert.equal(res?.trigger, 'test-skill');
        assert.equal((res?.invocation?.payload as any).command, 'test-skill');
    });

    it('resolveSkillInvocation resolves inline skill calls', () => {
        const skills = new Set(['test-skill']);
        const payload = { query: 'do test-skill now', project_root: '.', cwd: '.' };
        const res = resolveSkillInvocation(['do', 'test-skill', 'now'], payload, skills);
        assert.equal(res?.kind, 'skill');
        assert.equal(res?.trigger, 'test-skill');
    });

    it('resolveSkillInvocation identifies missing capabilities', () => {
        const skills = new Set(['installed-skill']);
        const payload = { query: 'use missing-skill', project_root: '.', cwd: '.' };
        const res = resolveSkillInvocation(['use', 'missing-skill'], payload, skills);
        assert.equal(res?.kind, 'missing_capability');
        assert.equal(res?.trigger, 'missing-skill');
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

    it('resolveByIntentCategory returns a valid weave invocation for a matched category', () => {
        const payload = { query: 'fix it', project_root: '/tmp/test', cwd: '/tmp/test' };
        const res = resolveByIntentCategory(['fix', 'it'], payload);
        
        assert.equal(res?.kind, 'weave');
        assert.equal(res?.trigger, 'restoration');
        assert.equal(res?.invocation.weave_id, 'weave:restoration');
        assert.equal(res?.invocation.payload !== undefined, true);
    });
});
