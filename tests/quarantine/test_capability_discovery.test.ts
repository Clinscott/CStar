import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildCapabilityInfoPayload,
    buildCapabilityManifestPayload,
    renderCapabilityInfoLines,
    renderCapabilityManifestLines,
} from '../../src/node/core/commands/capability_discovery.js';

function withCapabilityProject<T>(callback: (root: string) => T): T {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-capability-discovery-'));
    const agentsRoot = path.join(root, '.agents');
    const skillRoot = path.join(agentsRoot, 'skills', 'agent-skill');
    const contractRoot = path.join(agentsRoot, 'skills', 'contract-skill');
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.mkdirSync(contractRoot, { recursive: true });
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# Agent Skill\n\nSynthetic host workflow.\n');
    fs.writeFileSync(
        path.join(contractRoot, 'contract.feature'),
        'Feature: Contract skill\n  Scenario: It remains bounded\n    Then no direct effect runs\n',
    );
    fs.writeFileSync(path.join(sourceRoot, 'source_weave.ts'), 'export const sourceWeave = true;\n');
    fs.writeFileSync(
        path.join(agentsRoot, 'skill_registry.json'),
        JSON.stringify({
            generated_at: 1_700_000_000_000,
            entries: {
                status: {
                    tier: 'PRIME',
                    description: 'Synthetic status reader.',
                    viability: 'ACTIVE',
                    risk: 'low',
                    entry_surface: 'cli',
                    execution: { mode: 'deterministic', cli: 'cstar status' },
                },
                'agent-skill': {
                    tier: 'SKILL',
                    description: 'Synthetic host-owned skill.',
                    viability: 'ACTIVE',
                    risk: 'medium',
                    entry_surface: 'host-only',
                    instruction_path: '.agents/skills/agent-skill/SKILL.md',
                    authority_path: '.agents/skills/agent-skill',
                    execution: {
                        mode: 'agent-native',
                        adapter_id: 'agent-skill',
                        ownership_model: 'host-workflow',
                    },
                },
                'source-weave': {
                    tier: 'WEAVE',
                    description: 'Synthetic source-only compatibility entry.',
                    viability: 'ACTIVE',
                    risk: 'medium',
                    entry_surface: 'compatibility',
                    entrypoint_path: 'src/source_weave.ts',
                    authority_path: 'src/source_weave.ts',
                    execution: { mode: 'compatibility', adapter_id: 'weave:source-weave' },
                },
                'contract-skill': {
                    tier: 'SKILL',
                    description: 'Synthetic Gherkin-backed skill.',
                    viability: 'ACTIVE',
                    risk: 'low',
                    entry_surface: 'host-only',
                    contracts: ['.agents/skills/contract-skill/contract.feature'],
                    execution: { mode: 'agent-native' },
                },
            },
        }),
    );

    try {
        return callback(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

describe('Capability discovery', () => {
    it('builds a machine-readable manifest from a bounded synthetic registry', () => {
        withCapabilityProject((root) => {
            const payload = buildCapabilityManifestPayload(root, ['status', 'agent-skill', 'weave:source-weave']);
            assert.equal(payload.generated_at, 1_700_000_000_000);
            assert.deepEqual(payload.capabilities.map((entry) => entry.id), [
                'agent-skill',
                'contract-skill',
                'source-weave',
                'status',
            ]);

            const status = payload.capabilities.find((capability) => capability.id === 'status');
            assert.equal(status?.entry_surface, 'cli');
            assert.equal(status?.shell_command, 'cstar status');
            assert.equal(status?.active_in_runtime, true);
            assert.equal(status?.invoke.source, 'commander');
            assert.equal(status?.invoke.supports_json, true);

            const agentSkill = payload.capabilities.find((capability) => capability.id === 'agent-skill');
            assert.equal(agentSkill?.entry_surface, 'host-only');
            assert.equal(agentSkill?.shell_command, null);
            assert.equal(agentSkill?.active_in_runtime, true);
            assert.equal(agentSkill?.invoke.source, 'unavailable');

            const sourceWeave = payload.capabilities.find((capability) => capability.id === 'source-weave');
            assert.equal(sourceWeave?.runtime_adapter_id, 'weave:source-weave');
            assert.equal(sourceWeave?.active_in_runtime, true);
        });
    });

    it('reads bounded markdown and Gherkin contracts without treating source as documentation', () => {
        withCapabilityProject((root) => {
            const markdown = buildCapabilityInfoPayload(root, 'agent-skill', ['agent-skill']);
            assert.equal(markdown?.documentation.kind, 'markdown');
            assert.equal(markdown?.documentation.path, '.agents/skills/agent-skill/SKILL.md');
            assert.match(markdown?.documentation.content ?? '', /Synthetic host workflow/);

            const gherkin = buildCapabilityInfoPayload(root, 'contract-skill');
            assert.equal(gherkin?.documentation.kind, 'gherkin');
            assert.equal(gherkin?.documentation.path, '.agents/skills/contract-skill/contract.feature');

            const source = buildCapabilityInfoPayload(root, 'source-weave');
            assert.equal(source?.documentation.kind, 'source');
            assert.equal(source?.documentation.path, 'src/source_weave.ts');
            assert.equal(source?.documentation.readable, false);
            assert.equal(source?.documentation.content, null);
        });
    });

    it('resolves ids case-insensitively and returns null for absent capabilities', () => {
        withCapabilityProject((root) => {
            assert.equal(buildCapabilityInfoPayload(root, 'AGENT-SKILL')?.capability.id, 'agent-skill');
            assert.equal(buildCapabilityInfoPayload(root, 'missing'), null);
            assert.equal(buildCapabilityInfoPayload(root, '   '), null);
        });
    });

    it('renders deterministic operator lines from already-built payloads', () => {
        withCapabilityProject((root) => {
            const manifest = buildCapabilityManifestPayload(root, ['status']);
            const manifestLines = renderCapabilityManifestLines(manifest).join('\n');
            assert.match(manifestLines, /CAPABILITY MANIFEST/);
            assert.match(manifestLines, /status/);
            assert.match(manifestLines, /ACTIVE/);

            const info = buildCapabilityInfoPayload(root, 'source-weave');
            assert.ok(info);
            const infoLines = renderCapabilityInfoLines(info).join('\n');
            assert.match(infoLines, /CAPABILITY: SOURCE-WEAVE/);
            assert.match(infoLines, /documentation=source-authority:src\/source_weave\.ts/);
        });
    });
});
