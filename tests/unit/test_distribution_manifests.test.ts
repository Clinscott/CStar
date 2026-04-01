import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildDistributions } from '../../src/packaging/distributions.js';

function createProjectRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-distributions-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version: '2.4.6',
            description: 'Kernel-first runtime.',
            homepage: 'https://example.com/cstar',
            repository: {
                url: 'https://example.com/cstar.git',
            },
            license: 'MIT',
            author: {
                name: 'Corvus Star',
                email: 'odin@example.com',
                url: 'https://example.com/team',
            },
            keywords: ['corvus', 'kernel'],
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'config.json'),
        JSON.stringify({
            system: {
                persona: 'O.D.I.N.',
            },
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify({
            entries: {
                hall: {
                    tier: 'PRIME',
                    description: 'Hall lookup',
                    runtime_trigger: 'hall',
                    execution: {
                        ownership_model: 'host-workflow',
                    },
                    host_support: {
                        gemini: 'native-session',
                        codex: 'exec-bridge',
                    },
                },
                chant: {
                    tier: 'WEAVE',
                    description: 'Chant routing',
                    runtime_trigger: 'chant',
                    execution: {
                        ownership_model: 'host-workflow',
                        allow_kernel_fallback: false,
                    },
                    host_support: {
                        gemini: 'supported',
                        codex: 'supported',
                    },
                },
                silver_shield: {
                    tier: 'SPELL',
                    description: 'Policy only',
                    runtime_trigger: 'silver_shield',
                    host_support: {
                        gemini: 'policy-only',
                        codex: 'policy-only',
                    },
                },
                oracle: {
                    tier: 'SKILL',
                    description: 'Unsupported for codex',
                    runtime_trigger: 'oracle',
                    execution: {
                        ownership_model: 'kernel-primitive',
                    },
                    host_support: {
                        gemini: 'supported',
                        codex: 'unsupported',
                    },
                },
            },
        }, null, 2),
        'utf-8',
    );

    return root;
}

describe('distribution generator', () => {
    it('filters exported capabilities by host support and emits canonical file set', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);

        assert.deepEqual(
            build.geminiCapabilities.map((entry) => entry.id),
            ['chant', 'hall', 'oracle'],
        );
        assert.deepEqual(
            build.codexCapabilities.map((entry) => entry.id),
            ['chant', 'hall'],
        );
        assert.deepEqual(
            build.files.map((file) => file.relativePath),
            [
                'gemini-extension.json',
                'GEMINI.md',
                path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
                path.join('plugins', 'corvus-star', '.mcp.json'),
                path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
                path.join('plugins', 'corvus-star', 'README.md'),
                path.join('.agents', 'plugins', 'marketplace.json'),
                path.join('distributions', 'README.md'),
            ],
        );
    });

    it('renders install surfaces with launcher and marketplace metadata', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);

        const geminiManifest = JSON.parse(build.files[0]?.content ?? '{}') as {
            contextFileName?: string;
            version?: string;
            mcpServers?: Record<string, { command?: string; args?: string[]; cwd?: string }>;
        };
        assert.equal(geminiManifest.contextFileName, 'GEMINI.md');
        assert.equal(geminiManifest.version, '2.4.6');
        assert.equal(geminiManifest.mcpServers?.pennyone?.command, 'node');
        assert.deepEqual(geminiManifest.mcpServers?.['corvus-control']?.args, ['scripts/run-tsx.mjs', 'src/tools/corvus-control-mcp.ts']);

        const geminiContext = build.files[1]?.content ?? '';
        assert.match(geminiContext, /node bin\/cstar\.js <command>/);
        assert.match(geminiContext, /Exported Gemini Capabilities \(3\)/);
        assert.match(geminiContext, /Host-native Gemini CLI extension/);
        assert.match(geminiContext, /host session when the registry marks a capability host-executable/);
        assert.match(geminiContext, /host-owned cognition\/workflow surfaces and `kernel-primitive` entries/);
        assert.match(geminiContext, /`hall` \(PRIME, native-session, host-workflow, kernel fallback allowed\)/);

        const codexPlugin = JSON.parse(build.files[2]?.content ?? '{}') as {
            name?: string;
            skills?: string;
            mcpServers?: string;
            interface?: { displayName?: string; capabilities?: string[]; shortDescription?: string };
        };
        assert.equal(codexPlugin.name, 'corvus-star');
        assert.equal(codexPlugin.skills, './skills/');
        assert.equal(codexPlugin.mcpServers, './.mcp.json');
        assert.deepEqual(codexPlugin.interface?.capabilities, ['Interactive', 'Write']);
        assert.equal(codexPlugin.interface?.shortDescription, 'Host-native Corvus integration for Codex.');

        const codexMcp = JSON.parse(build.files[3]?.content ?? '{}') as {
            mcpServers?: Record<string, { cwd?: string }>;
        };
        assert.equal(codexMcp.mcpServers?.pennyone?.cwd, '../..');

        const marketplace = JSON.parse(build.files[6]?.content ?? '{}') as {
            plugins?: Array<{ source?: { path?: string } }>;
        };
        assert.equal(marketplace.plugins?.[0]?.source?.path, './plugins/corvus-star');

        const pluginReadme = build.files[5]?.content ?? '';
        assert.match(pluginReadme, /repo-local plugin lives under `plugins\/corvus-star\/`/);
        assert.match(pluginReadme, /same registry-backed host\/kernel split as Gemini/);
        assert.match(pluginReadme, /fail closed when the host session is unavailable/);

        const distReadme = build.files[7]?.content ?? '';
        assert.match(distReadme, /npm run build:distributions/);
        assert.match(distReadme, /Sync local `~\/\.gemini` and `~\/\.codex` installs/);
    });
});
