import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { findCommandCatalogEntry, getCommandCatalog } from '../../src/node/core/commands/command_catalog.js';

describe('Command catalog', () => {
    it('is pure metadata for the explicit cstar.ts command surface', () => {
        assert.deepEqual(
            getCommandCatalog().map((entry) => entry.name),
            [
                'status',
                'manifest',
                'skill-info',
                'trace',
                'augury',
                'run-skill',
                'orchestrate',
                'evolve',
                'evolve-temporal',
                'forge',
            ],
        );

        const source = fs.readFileSync(
            new URL('../../src/node/core/commands/command_catalog.ts', import.meta.url),
            'utf-8',
        );
        assert.doesNotMatch(source, /from ['"]commander['"]/);
        assert.doesNotMatch(source, /register[A-Z][A-Za-z]+Command/);
        assert.doesNotMatch(source, /new Command\s*\(/);
    });

    it('does not advertise inactive action-bearing registrars', () => {
        const names = new Set(getCommandCatalog().map((entry) => entry.name));
        for (const retired of [
            'dominion', 'odin', 'dormancy', 'skill', 'lore', 'recreate',
            'vitals', 'one-mind', 'hall-doc', 'spoke', 'os', 'oracle', 'tui',
            'pennyone', 'ravens', 'start', 'bifrost', 'bead', 'profile',
        ]) {
            assert.equal(names.has(retired), false, retired);
        }
    });

    it('preserves status, manifest, skill-info, trace, and Augury metadata', () => {
        assert.equal(findCommandCatalogEntry('status')?.supports_json, true);
        assert.equal(findCommandCatalogEntry('manifest')?.supports_json, true);
        assert.equal(findCommandCatalogEntry('skill-info')?.arguments[0]?.placeholder, '<name>');

        const trace = findCommandCatalogEntry('trace');
        assert.deepEqual(trace?.subcommands.map((entry) => entry.name), ['status', 'handoff', 'failures']);
        assert.equal(trace?.subcommands.every((entry) => entry.supports_json), true);

        const augury = findCommandCatalogEntry('augury');
        assert.deepEqual(
            augury?.subcommands.map((entry) => entry.name),
            ['status', 'handoff', 'failures', 'doctor', 'explain'],
        );
        assert.equal(augury?.subcommands.every((entry) => entry.supports_json), true);
    });

    it('returns defensive copies instead of shared mutable catalog state', () => {
        const first = getCommandCatalog();
        first[0].name = 'mutated';
        first[0].options.length = 0;

        const second = getCommandCatalog();
        assert.equal(second[0].name, 'status');
        assert.equal(second[0].supports_json, true);
        assert.equal(second[0].options.length, 1);
    });
});
