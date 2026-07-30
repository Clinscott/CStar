import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    getSkillRegistryEntries,
    isSkillRegistryEntryMap,
    isSafeSkillRegistryId,
} from '../../src/core/skill_registry.js';
import { buildCapabilityManifestPayload } from '../../src/node/core/commands/capability_discovery.js';
import { loadRegistryEntries } from '../../src/node/core/runtime/entry_surface.js';
import { getRegistryEntries as getChantRegistryEntries } from '../../src/node/core/runtime/host_workflows/chant_parser.js';

describe('skill registry shape', () => {
    it('accepts canonical keyed entries with matching identities', () => {
        const entries = getSkillRegistryEntries<{ id?: string; execution?: { adapter_id?: string } }>({
            entries: {
                calculus: {
                    id: 'calculus',
                    execution: { adapter_id: 'prime:calculus' },
                },
            },
        });

        assert.equal(entries.calculus?.execution?.adapter_id, 'prime:calculus');
        assert.equal(isSkillRegistryEntryMap(entries), true);
    });

    it('fails malformed canonical entries closed without legacy fallback', () => {
        assert.deepEqual(getSkillRegistryEntries({
            entries: [{ id: 'legacy' }],
            skills: { unsafe_fallback: {} },
        }), {});
        assert.deepEqual(getSkillRegistryEntries({
            entries: { calculus: { id: 'other' } },
            skills: { unsafe_fallback: {} },
        }), {});
        assert.equal(isSkillRegistryEntryMap({ Calculus: {} }), false);
        assert.equal(isSkillRegistryEntryMap({ '../escape': {} }), false);
        assert.equal(isSkillRegistryEntryMap({ calculus: null }), false);
    });

    it('accepts the legacy skills object only when canonical entries are absent', () => {
        const legacy = getSkillRegistryEntries({ skills: { legacy: {} } });
        assert.deepEqual(Object.keys(legacy), ['legacy']);
        assert.equal(isSafeSkillRegistryId('prime:calculus'), true);
        assert.equal(isSafeSkillRegistryId('weave/escape'), false);
    });

    it('prevents array-derived numeric capabilities across owned readers', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-registry-shape-'));
        try {
            fs.mkdirSync(path.join(root, '.agents'));
            const manifest = {
                entries: [
                    { id: 'legacy' },
                    { id: 'calculus', execution: { adapter_id: 'prime:calculus' } },
                ],
            };
            fs.writeFileSync(
                path.join(root, '.agents', 'skill_registry.json'),
                JSON.stringify(manifest),
            );

            assert.deepEqual(loadRegistryEntries(root), {});
            assert.deepEqual(getChantRegistryEntries(manifest as never), {});
            assert.deepEqual(buildCapabilityManifestPayload(root).capabilities, []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps the checked-in registry keyed, identity-consistent, and explicit', () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), '.agents', 'skill_registry.json'), 'utf-8'),
        ) as { entries?: unknown };
        assert.equal(isSkillRegistryEntryMap(manifest.entries), true);

        const entries = getSkillRegistryEntries<{
            id?: string;
            entry_surface?: string;
            host_support?: Record<string, string>;
        }>(manifest);
        for (const [capabilityId, entry] of Object.entries(entries)) {
            if (entry.id !== undefined) assert.equal(entry.id, capabilityId);
        }
        assert.equal(entries.calculus?.entry_surface, 'compatibility');
        assert.deepEqual(
            new Set(Object.values(entries.calculus?.host_support ?? {})),
            new Set(['unsupported']),
        );
    });
});
