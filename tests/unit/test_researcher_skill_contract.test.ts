import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const skillPath = path.join(repoRoot, '.agents', 'skills', 'researcher', 'SKILL.md');
const schemaPath = path.join(repoRoot, 'docs', 'schemas', 'researcher-stats-v0.1.md');
const registryPath = path.join(repoRoot, '.agents', 'skill_registry.json');

describe('Researcher skill contract', () => {
    it('registers Researcher as a bounded Corvus skill', () => {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        const entry = registry.entries.find((candidate: { id?: string }) => candidate.id === 'researcher');

        assert.ok(entry, 'researcher skill registry entry is required');
        assert.equal(entry.tier, 'SKILL');
        assert.equal(entry.execution.entry_point, '.agents/skills/researcher/SKILL.md');
        assert.deepEqual(entry.intent_categories, ['DOCUMENT', 'VERIFY']);
        assert.equal(entry.contract.output_schema.schema_version, 'researcher.stats.v1');
    });

    it('codifies active scope, stats, and live-dispatch guardrails', () => {
        const skill = fs.readFileSync(skillPath, 'utf-8');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        for (const phrase of [
            'researcher.stats.v1',
            'Gungnir',
            'CStar, Kernel, Researcher, Forge, Skills, XO, Moonshot',
            'No live Researcher dispatch',
            'Focus Charter',
            'statistical analysis',
        ]) {
            assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }

        assert.match(schema, /researcher\.stats\.v1/);
        assert.match(schema, /Gungnir v1\.0/);
        assert.match(schema, /features/);
        assert.match(schema, /statistical analysis/);
    });
});
