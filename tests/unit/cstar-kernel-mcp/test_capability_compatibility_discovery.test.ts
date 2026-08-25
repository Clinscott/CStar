import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
} from '../../../src/node/core/commands/capability_discovery.js';
import {
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
    getCstarKernelToolCatalogEntry,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { handleSkillInfo } from '../../../src/tools/cstar-kernel-mcp/tools/capability.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

function writeRegistry(entries: Record<string, Record<string, unknown>>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-compatibility-discovery-'));
    fs.mkdirSync(path.join(root, '.agents'));
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify({ entries }),
    );
    return root;
}

describe('SET-04 catalog and router parity', () => {
    it('keeps the default operator manifest smaller while preserving exact compatibility info', async () => {
        const manifest = buildCapabilityManifestPayload(PROJECT_ROOT);
        assert.deepEqual(
            manifest.capabilities.map((capability) => capability.id),
            ['corvus-forge', 'cstar-closeout', 'cstar-reliability-loop', 'researcher'],
        );
        assert.ok(manifest.capabilities.every((capability) => capability.entry_surface !== 'compatibility'));

        const info = await handleSkillInfo({ id: 'calculus' });
        const payload = JSON.parse(info.content[0].text) as {
            capability?: { id?: string; entry_surface?: string };
        };
        assert.equal(payload.capability?.id, 'calculus');
        assert.equal(payload.capability?.entry_surface, 'compatibility');
    });

    it('keeps explicitly named legacy compatibility entries discoverable', () => {
        const root = writeRegistry({
            'operator-skill': {
                id: 'operator-skill',
                tier: 'SKILL',
                entry_surface: 'host-only',
                description: 'Current operator guidance',
            },
            'legacy-capability': {
                id: 'legacy-capability',
                tier: 'PRIME',
                entry_surface: 'compatibility',
                runtime_trigger: 'legacy-capability',
                description: 'Explicit compatibility lookup only',
            },
        });
        try {
            assert.deepEqual(
                buildCapabilityManifestPayload(root).capabilities.map((capability) => capability.id),
                ['operator-skill'],
            );
            assert.equal(
                buildCapabilityInfoPayload(root, 'legacy-capability')?.capability.id,
                'legacy-capability',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps the public kernel count and authorization description truthful', () => {
        const names = new Set(CSTAR_KERNEL_TOOL_NAMES);
        assert.equal(CSTAR_KERNEL_TOOL_CATALOG.length, 30);
        assert.equal(names.size, 30);
        assert.ok(names.has('cstar_forge_authorize'));
        assert.ok(names.has('cstar_mission'));
        assert.ok(names.has('cstar_forge_host_complete'));
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_forge_authorize').description,
            /explicit root-user build instruction or immutable CStar goal-continuation receipt/i,
        );
    });

    it('keeps router invariants compact and free of retired routing surfaces', () => {
        const agents = fs.readFileSync(path.join(PROJECT_ROOT, 'AGENTS.md'), 'utf8');
        const router = fs.readFileSync(path.join(PROJECT_ROOT, '.agents', 'AGENTS.feature'), 'utf8');
        const integrationDoc = fs.readFileSync(
            path.join(PROJECT_ROOT, 'docs', 'integrations', 'cstar-kernel-mcp.md'),
            'utf8',
        );

        assert.match(agents, /CoS coordinates\. Forge implements\. Researcher researches\./);
        assert.match(agents, /request -> authorize -> execute -> independent record_result/);
        assert.match(agents, /ordinary[\s\S]*operator language[\s\S]*robot-language prompts/i);
        assert.match(router, /cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute/);
        assert.match(router, /independent cstar_record_result/);
        assert.match(router, /ordinary Forge and Researcher use remains coordinator-decided/);
        assert.doesNotMatch(router, /One Mind|Weave Protocol|dispatchPort\.dispatch/i);
        assert.match(integrationDoc, /gpt-5\.6-luna.*reasoning `max`/s);
        assert.match(integrationDoc, /one-use validator ticket/);
        assert.match(integrationDoc, /no runtime activation/);
    });
});
