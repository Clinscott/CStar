import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    SkillRegistryContractError,
    resolveSkillRegistryEntries,
} from '../../src/core/skill_registry_contract.js';
import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
} from '../../src/node/core/commands/capability_discovery.js';
import { bootstrapRuntime } from '../../src/node/core/runtime/bootstrap.js';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { loadRegistryEntries } from '../../src/node/core/runtime/entry_surface.js';
import { handleManifest, handleSkillInfo } from '../../src/tools/cstar-kernel-mcp/tools/capability.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

function createProjectRoot(manifest: unknown): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-skill-registry-contract-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
    );
    return root;
}

function closeoutManifest(): Record<string, unknown> {
    return {
        generated_at: 1_783_821_053_806,
        entries: {
            'cstar-closeout': {
                id: 'cstar-closeout',
                title: 'CStar Closeout',
                description: 'Prepare a gated handoff and closeout packet.',
                tier: 'SKILL',
                execution: {
                    mode: 'agent-native',
                    ownership_model: 'host-workflow',
                },
            },
        },
    };
}

function assertRegistryError(action: () => unknown, expectedMessage: string): void {
    assert.throws(action, (error: unknown) => {
        assert.ok(error instanceof SkillRegistryContractError);
        assert.equal(error.message, `[skill-registry] ${expectedMessage}`);
        return true;
    });
}

function parseMcpPayload(response: { content: Array<{ text: string }> }): any {
    return JSON.parse(response.content[0]?.text ?? '{}');
}

describe('keyed skill registry contract', () => {
    it('accepts a keyed object and preserves the canonical capability key', () => {
        const manifest = closeoutManifest();
        const entries = (manifest as { entries: Record<string, object> }).entries;

        const resolved = resolveSkillRegistryEntries(manifest);

        assert.strictEqual(resolved, entries);
        assert.deepEqual(Object.keys(resolved), ['cstar-closeout']);
    });

    it('rejects malformed present entries instead of falling back to legacy skills', () => {
        const legacySkills = { legacy: { id: 'legacy' } };
        const malformedCases: Array<{
            label: string;
            entries: unknown;
            message: string;
        }> = [
            {
                label: 'array',
                entries: [{ id: 'cstar-closeout' }],
                message: 'entries must be a plain object.',
            },
            {
                label: 'null',
                entries: null,
                message: 'entries must be a plain object.',
            },
            {
                label: 'primitive entry',
                entries: { 'cstar-closeout': 'not-an-entry' },
                message: 'entries.cstar-closeout must be a plain object.',
            },
            {
                label: 'blank key',
                entries: { '   ': {} },
                message: 'entries contains a blank capability key.',
            },
            {
                label: 'key/id mismatch',
                entries: { 'cstar-closeout': { id: 'closeout' } },
                message: "entries.cstar-closeout.id must match capability key 'cstar-closeout'.",
            },
            {
                label: 'present null id',
                entries: { 'cstar-closeout': { id: null } },
                message: "entries.cstar-closeout.id must match capability key 'cstar-closeout'.",
            },
        ];

        for (const malformed of malformedCases) {
            assertRegistryError(
                () => resolveSkillRegistryEntries({
                    entries: malformed.entries,
                    skills: legacySkills,
                }),
                malformed.message,
            );
        }
    });

    it('uses legacy skills only when entries is genuinely absent', () => {
        const skills = { legacy: { id: 'legacy' } };
        assert.strictEqual(resolveSkillRegistryEntries({ skills }), skills);

        assertRegistryError(
            () => resolveSkillRegistryEntries({ entries: undefined, skills }),
            'entries must be a plain object.',
        );
    });

    it('allows an absent optional manifest but rejects malformed manifest roots', () => {
        assert.deepEqual(resolveSkillRegistryEntries(null), {});
        assert.deepEqual(resolveSkillRegistryEntries(undefined), {});

        assertRegistryError(
            () => resolveSkillRegistryEntries([]),
            'manifest must be a plain object.',
        );
        assertRegistryError(
            () => resolveSkillRegistryEntries('not-a-manifest'),
            'manifest must be a plain object.',
        );
    });

    it('makes the entry-surface loader fail closed on arrays and retain named keyed entries', () => {
        const root = createProjectRoot(closeoutManifest());
        try {
            const entries = loadRegistryEntries(root);
            assert.deepEqual(Object.keys(entries), ['cstar-closeout']);
            assert.equal(entries['cstar-closeout']?.execution?.mode, 'agent-native');

            fs.writeFileSync(
                path.join(root, '.agents', 'skill_registry.json'),
                JSON.stringify({
                    entries: [{ id: 'cstar-closeout' }],
                    skills: { legacy: { id: 'legacy' } },
                }),
                'utf-8',
            );

            assertRegistryError(
                () => loadRegistryEntries(root),
                'entries must be a plain object.',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not swallow a registry schema violation during runtime bootstrap', () => {
        const root = createProjectRoot({ entries: [{ id: 'cstar-closeout' }] });
        const previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        process.env.CSTAR_PROJECT_ROOT = root;
        try {
            assertRegistryError(
                () => bootstrapRuntime(RuntimeDispatcher.createIsolated()),
                'entries must be a plain object.',
            );
        } finally {
            if (previousProjectRoot === undefined) {
                delete process.env.CSTAR_PROJECT_ROOT;
            } else {
                process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
            }
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('exposes cstar-closeout by name through discovery and cstar-kernel skill-info', async () => {
        const root = createProjectRoot(closeoutManifest());
        const previousRoot = registry.getRoot();
        registry.setRoot(root);
        try {
            const manifest = buildCapabilityManifestPayload(root);
            assert.deepEqual(manifest.capabilities.map((entry) => entry.id), ['cstar-closeout']);
            assert.equal(manifest.capabilities.some((entry) => entry.id === '0'), false);
            assert.equal(manifest.capabilities[0]?.runtime_adapter_id, 'cstar-closeout');

            const info = buildCapabilityInfoPayload(root, 'cstar-closeout');
            assert.equal(info?.capability.id, 'cstar-closeout');
            assert.equal(info?.capability.runtime_adapter_id, 'cstar-closeout');

            const mcpManifestResponse = await handleManifest({ scope: 'hub' });
            assert.equal(mcpManifestResponse.isError, undefined);
            const mcpManifest = parseMcpPayload(mcpManifestResponse) as {
                capabilities?: Array<{ id?: string; runtime_adapter_id?: string }>;
            };
            assert.deepEqual(mcpManifest.capabilities?.map((entry) => entry.id), ['cstar-closeout']);
            assert.equal(mcpManifest.capabilities?.some((entry) => entry.id === '0'), false);

            const mcpInfoResponse = await handleSkillInfo({ id: 'cstar-closeout' });
            assert.equal(mcpInfoResponse.isError, undefined);
            const mcpInfo = parseMcpPayload(mcpInfoResponse) as {
                capability?: { id?: string; runtime_adapter_id?: string };
            };
            assert.equal(mcpInfo.capability?.id, 'cstar-closeout');
            assert.equal(mcpInfo.capability?.runtime_adapter_id, 'cstar-closeout');
        } finally {
            registry.setRoot(previousRoot);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
