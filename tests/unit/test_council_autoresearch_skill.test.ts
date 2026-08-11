import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const skillPath = path.join(root, '.agents/skills/council-autoresearch/SKILL.md');
const featurePath = path.join(root, '.agents/skills/council-autoresearch/council-autoresearch.feature');
const registryPath = path.join(root, '.agents/skill_registry.json');

describe('Council autoresearch skill contract', () => {
    it('lands as an unregistered reference skill until independent promotion', () => {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const skill = fs.readFileSync(skillPath, 'utf8');
        const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
        assert.notEqual(frontmatter, null);
        const frontmatterKeys = frontmatter![1]
            .split('\n')
            .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
            .map((line) => line.slice(0, line.indexOf(':')));
        assert.deepEqual(frontmatterKeys, ['name', 'description']);
        assert.equal(registry.entries['council-autoresearch'], undefined);
        assert.equal(fs.existsSync(skillPath), true);
        assert.equal(fs.existsSync(featurePath), true);
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
            'unregistered',
        ]) assert.match(skill, new RegExp(phrase, 'i'));
        assert.match(feature, /A second generation is requested/);
        assert.match(feature, /non-actionable, non-steering, and write-disabled/);
        assert.match(feature, /failed contender cannot remove/);
    });
});
