import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findCommandCatalogEntry, getCommandCatalog } from '../../src/node/core/commands/command_catalog.js';

describe('Command catalog', () => {
    it('discovers commander-backed command families for machine-readable API use', () => {
        const catalog = getCommandCatalog();

        assert.ok(catalog.some((entry) => entry.name === 'manifest'));
        assert.ok(catalog.some((entry) => entry.name === 'skill-info'));
        assert.ok(catalog.some((entry) => entry.name === 'one-mind'));
    });

    it('captures aliases, json support, and subcommands for one-mind', () => {
        const oneMind = findCommandCatalogEntry('one-mind');

        assert.ok(oneMind);
        assert.equal(oneMind?.command_path.join(' '), 'one-mind');
        assert.equal(oneMind?.subcommands.some((entry) => entry.name === 'status' && entry.supports_json), true);
        assert.equal(oneMind?.subcommands.some((entry) => entry.name === 'events' && entry.supports_json), true);
        assert.equal(oneMind?.subcommands.some((entry) => entry.name === 'agents' && entry.supports_json), true);
    });

    it('captures top-level aliases and json options for pennyone and skill-info', () => {
        const pennyone = findCommandCatalogEntry('pennyone');
        const skillInfo = findCommandCatalogEntry('skill-info');

        assert.ok(pennyone);
        assert.deepEqual(pennyone?.aliases, ['p1']);
        assert.equal(pennyone?.supports_json, true);

        assert.ok(skillInfo);
        assert.equal(skillInfo?.supports_json, true);
        assert.equal(skillInfo?.arguments[0]?.placeholder, '<name>');
    });
});
