import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildDistributions,
    validateDistributions,
    writeDistributions,
} from '../../src/packaging/distributions.js';

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
                path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
                path.join('plugins', 'corvus-star', 'README.md'),
                path.join('plugins', 'corvus-star', 'lineage.json'),
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
        assert.equal(geminiManifest.mcpServers?.['cstar-kernel']?.command, 'node');
        assert.deepEqual(geminiManifest.mcpServers?.['cstar-kernel']?.args, ['bin/cstar-kernel-mcp.js']);
        assert.deepEqual(Object.keys(geminiManifest.mcpServers ?? {}), ['cstar-kernel']);

        const geminiContext = build.files[1]?.content ?? '';
        assert.match(geminiContext, /node bin\/cstar\.js <command>/);
        assert.match(geminiContext, /Exported Gemini Capabilities \(3\)/);
        assert.match(geminiContext, /Host-native Gemini CLI extension/);
        assert.match(geminiContext, /host session when the registry marks a capability host-executable/);
        assert.match(geminiContext, /host-owned cognition\/workflow surfaces and `kernel-primitive` entries/);
        assert.match(geminiContext, /Corvus Star Augury \[Ω\]/);
        assert.match(geminiContext, /read-only typed route explanation/);
        assert.doesNotMatch(geminiContext, /Mode: (?:full|lite)/);
        assert.match(geminiContext, /Omit numeric confidence unless an independently validated scorer/);
        assert.match(geminiContext, /Start or resume one host goal for every non-trivial mission/);
        assert.match(geminiContext, /cstar-goal-driven-daily-bootstrap\.md/);
        assert.match(geminiContext, /`hall` \(PRIME, native-session, host-workflow, kernel fallback forbidden\)/);

        const codexPlugin = JSON.parse(build.files[2]?.content ?? '{}') as {
            name?: string;
            skills?: string;
            mcpServers?: unknown;
            hooks?: unknown;
            interface?: { displayName?: string; capabilities?: string[]; shortDescription?: string };
        };
        assert.equal(codexPlugin.name, 'corvus-star');
        assert.equal(codexPlugin.skills, './skills/');
        assert.equal(codexPlugin.mcpServers, undefined);
        assert.equal(codexPlugin.hooks, undefined);
        assert.deepEqual(codexPlugin.interface?.capabilities, ['Interactive', 'Write']);
        assert.equal(codexPlugin.interface?.shortDescription, 'Corvus Star Augury and Hall integration for Codex.');

        const codexSkill = build.files[3]?.content ?? '';
        assert.match(codexSkill, /Corvus Star Augury \[Ω\]/);
        assert.match(codexSkill, /Council experts are advisory critique lenses/);
        assert.match(codexSkill, /skill-only/);
        assert.match(codexSkill, /Omit numeric confidence unless an independently validated scorer/);
        assert.match(codexSkill, /Start or resume one host goal for every non-trivial mission/);
        assert.match(codexSkill, /cstar-goal-driven-daily-bootstrap\.md/);
        assert.doesNotMatch(codexSkill, /`cstar_autobot`/);

        const materializedGemini = fs.readFileSync(path.join(process.cwd(), 'GEMINI.md'), 'utf-8');
        const materializedCodexSkill = fs.readFileSync(
            path.join(process.cwd(), 'plugins/corvus-star/skills/corvus-star/SKILL.md'),
            'utf-8',
        );
        for (const materialized of [materializedGemini, materializedCodexSkill]) {
            assert.match(materialized, /numeric confidence/i);
            assert.doesNotMatch(materialized, /Confidence belongs in learning metadata/);
        }

        const lineage = JSON.parse(build.files[5]?.content ?? '{}') as {
            schema_version?: number;
            plugin?: { name?: string; version?: string };
            runtime_binding?: { integration_mode?: string; kernel_bundled?: boolean };
            tool_catalog?: { count?: number; sha256?: string };
            capability_exports?: { codex_count?: number; gemini_count?: number; sha256?: string };
            files?: Record<string, { bytes?: number; sha256?: string }>;
        };
        assert.equal(lineage.schema_version, 1);
        assert.deepEqual(lineage.plugin, { name: 'corvus-star', version: '2.4.6' });
        assert.equal(lineage.runtime_binding?.integration_mode, 'skill-only');
        assert.equal(lineage.runtime_binding?.kernel_bundled, false);
        assert.ok((lineage.tool_catalog?.count ?? 0) > 0);
        assert.match(lineage.tool_catalog?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.equal(lineage.capability_exports?.codex_count, 2);
        assert.equal(lineage.capability_exports?.gemini_count, 3);
        assert.match(lineage.capability_exports?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.deepEqual(Object.keys(lineage.files ?? {}).sort(), [
            '.codex-plugin/plugin.json',
            'README.md',
            'skills/corvus-star/SKILL.md',
        ]);
        for (const record of Object.values(lineage.files ?? {})) {
            assert.ok((record.bytes ?? 0) > 0);
            assert.match(record.sha256 ?? '', /^[a-f0-9]{64}$/);
        }

        const marketplace = JSON.parse(build.files[6]?.content ?? '{}') as {
            plugins?: Array<{ source?: { path?: string } }>;
        };
        assert.equal(marketplace.plugins?.[0]?.source?.path, './plugins/corvus-star');

        const pluginReadme = build.files[4]?.content ?? '';
        assert.match(pluginReadme, /source plugin under `plugins\/corvus-star\/` is skill-only/);
        assert.match(pluginReadme, /host-global CStar kernel is managed independently/);
        assert.match(pluginReadme, /lineage\.json` binds the immutable version/);
        assert.match(pluginReadme, /Source staging only/);
        assert.match(pluginReadme, /does not run `codex plugin add`/);
        assert.match(pluginReadme, /Augury as an advisory route explanation/);
        assert.match(pluginReadme, /fail closed when the host session is unavailable/);

        const distReadme = build.files[7]?.content ?? '';
        assert.match(distReadme, /npm run build:distributions/);
        assert.match(distReadme, /never hand-edit Codex plugin caches or marketplace state/);
    });

    it('guards generated host surfaces against legacy Trace display drift', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);
        // Match genuine old-format output; allow "Trace" in migration notes and code examples
        const forbiddenDisplayPatterns = [
            // TRACE SELECTION and similar structural artifacts of old display format
            /TRACE SELECTION/,
            // Confidence with zero-value placeholder in old learning metadata
            /Confidence: \[0\.0/,
            // Old handoff invocation style
            /Use the CStar trace handoff/,
        ];

        for (const file of build.files) {
            for (const pattern of forbiddenDisplayPatterns) {
                assert.doesNotMatch(file.content, pattern, `${file.relativePath} matched ${pattern}`);
            }
        }
    });

    it('keeps checked-in distribution materializations synchronized', () => {
        assert.deepEqual(validateDistributions(process.cwd()), []);
    });

    it('does not rewrite already synchronized materializations', () => {
        const projectRoot = createProjectRoot();
        writeDistributions(projectRoot);
        const target = path.join(projectRoot, 'GEMINI.md');
        const preservedTime = new Date('2020-01-01T00:00:00.000Z');
        fs.utimesSync(target, preservedTime, preservedTime);

        writeDistributions(projectRoot);

        assert.equal(fs.statSync(target).mtimeMs, preservedTime.getTime());
    });
});
