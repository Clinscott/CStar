import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';

import { registerPythonSpokes } from '../../src/node/core/commands/python.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('legacy skill-acquisition routing', () => {
    it('does not publish the retired skill-learning command', () => {
        const program = new Command();

        registerPythonSpokes(program, PROJECT_ROOT);

        const commandNames = program.commands.map((command) => command.name());
        assert.equal(commandNames.includes('skill'), false);
        assert.equal(commandNames.includes('lore'), false);
        assert.equal(commandNames.includes('recreate'), false);
        const source = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/node/core/commands/python.ts'),
            'utf-8',
        );
        assert.doesNotMatch(source, /SkillLearning|Skill Management & Acquisition|taliesin_main|recreate_chapter/);
    });

    it('does not instruct host research to clone or invoke Wild Hunt', () => {
        const source = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/node/core/runtime/host_workflows/research.ts'),
            'utf-8',
        );

        assert.doesNotMatch(source, /WildHunt|wild_hunt\.py|--ingest/);
        assert.match(source, /Do not clone, install, execute, or promote external repositories/);
        assert.match(source, /current host skill-first workflow and CStar lifecycle/);
    });
});
