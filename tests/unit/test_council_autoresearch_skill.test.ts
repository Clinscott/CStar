import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildDistributions } from '../../src/packaging/distributions.js';

const root = process.cwd();
const skillPath = path.join(root, '.agents/skills/council-autoresearch/SKILL.md');
const featurePath = path.join(root, '.agents/skills/council-autoresearch/council-autoresearch.feature');
const registryPath = path.join(root, '.agents/skill_registry.json');

describe('Council autoresearch skill contract', () => {
    it('registers one explicit terminal-required exec bridge', () => {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const entry = registry.entries['council-autoresearch'];
        assert.equal(entry.id, 'council-autoresearch');
        assert.equal(entry.tier, 'SKILL');
        assert.equal(entry.entry_surface, 'cli');
        assert.equal(entry.owner_runtime, 'host-agent');
        assert.equal(entry.recursion_policy, 'bounded-orchestrator');
        assert.deepEqual(new Set(Object.values(entry.host_support)), new Set(['exec-bridge']));
        assert.equal(entry.execution.mode, 'agent-native');
        assert.equal(entry.execution.requires_terminal, true);
        assert.equal(entry.execution.terminal_contract, 'required');
        assert.equal(entry.execution.allow_kernel_fallback, false);
        assert.equal(entry.execution.cli, 'node scripts/run-tsx.mjs src/tools/council-autoresearch.ts');
        assert.equal(fs.existsSync(skillPath), true);
        assert.equal(fs.existsSync(featurePath), true);
        assert.doesNotMatch(fs.readFileSync(skillPath, 'utf8'), /registry_status:/);
        const rebuilt = buildDistributions(root);
        assert.equal(rebuilt.codexCapabilities.some(({ id }) => id === 'council-autoresearch'), true);
        assert.equal(rebuilt.geminiCapabilities.some(({ id }) => id === 'council-autoresearch'), true);
    });

    it('preserves effect gates, exactly one generation, and Token-Path quarantine', () => {
        const skill = fs.readFileSync(skillPath, 'utf8');
        const feature = fs.readFileSync(featurePath, 'utf8');
        for (const phrase of [
            'exactly one generation',
            'Token-Path',
            'quarantined',
            'Forge',
            'publication',
            'There is no generation-two',
            'signed',
            'registered',
        ]) assert.match(skill, new RegExp(phrase, 'i'));
        assert.match(feature, /A second generation is requested/);
        assert.match(feature, /non-actionable, non-steering, and write-disabled/);
        assert.match(feature, /failed contender cannot remove/);
    });
});
