import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    getCapabilityExecutionMode,
    getCapabilityHostSupport,
} from '../../src/core/host_session.js';
import {
    getSkillRegistryEntries,
    isSkillRegistryEntryMap,
} from '../../src/core/skill_registry.js';
import { buildCapabilityManifestPayload } from '../../src/node/core/commands/capability_discovery.js';
import { loadRegistryEntries } from '../../src/node/core/runtime/entry_surface.js';
import { getRegistryEntries as getChantRegistryEntries } from '../../src/node/core/runtime/host_workflows/chant_parser.js';

describe('skill registry shape', () => {
    it('accepts capability-id keyed entry objects', () => {
        const entries = getSkillRegistryEntries<{ execution?: { adapter_id?: string } }>({
            entries: {
                calculus: {
                    execution: { adapter_id: 'prime:calculus' },
                },
            },
        });

        assert.equal(entries.calculus?.execution?.adapter_id, 'prime:calculus');
    });

    it('fails closed on array entries without falling back to legacy skills', () => {
        const entries = getSkillRegistryEntries({
            entries: [{ id: 'autobot', execution: { adapter_id: 'host-native:autobot' } }],
            skills: {
                unsafe_fallback: {},
            },
        });

        assert.deepEqual(entries, {});
        assert.equal(entries['0'], undefined);
    });

    it('rejects arrays and non-object values in the legacy skills map', () => {
        assert.deepEqual(getSkillRegistryEntries({ skills: [{ id: 'autobot' }] }), {});
        assert.equal(isSkillRegistryEntryMap({ calculus: null }), false);
        assert.equal(isSkillRegistryEntryMap({ calculus: [] }), false);
        assert.equal(isSkillRegistryEntryMap({ '': {} }), false);
    });

    it('prevents numeric capabilities across live registry readers', () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-registry-shape-'));
        fs.mkdirSync(path.join(projectRoot, '.agents'), { recursive: true });
        const manifest = {
            entries: [
                { id: 'mimir-harvester' },
                { id: 'autobot', execution: { adapter_id: 'host-native:autobot' } },
            ],
        };
        fs.writeFileSync(
            path.join(projectRoot, '.agents', 'skill_registry.json'),
            JSON.stringify(manifest),
            'utf-8',
        );

        assert.deepEqual(loadRegistryEntries(projectRoot), {});
        assert.deepEqual(getChantRegistryEntries(manifest), {});
        assert.deepEqual(buildCapabilityManifestPayload(projectRoot).capabilities, []);
        assert.equal(getCapabilityHostSupport(projectRoot, '1', 'codex'), null);
        assert.equal(getCapabilityExecutionMode(projectRoot, '1'), 'unknown');
    });

    it('keeps the checked-in registry keyed and identity-consistent', () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), '.agents', 'skill_registry.json'), 'utf-8'),
        ) as {
            entries?: unknown;
        };

        assert.equal(isSkillRegistryEntryMap(manifest.entries), true);
        const entries = getSkillRegistryEntries<{ id?: string }>(manifest);
        assert.ok(Object.hasOwn(entries, 'autobot'));
        assert.ok(Object.hasOwn(entries, 'mimir-harvester'));
        assert.ok(Object.hasOwn(entries, 'calculus'));
        for (const [capabilityId, entry] of Object.entries(entries)) {
            if (entry.id !== undefined) {
                assert.equal(entry.id, capabilityId);
            }
        }
        assert.equal(entries.calculus?.id, 'calculus');
    });
});
