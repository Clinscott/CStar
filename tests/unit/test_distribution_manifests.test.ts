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

const GENERATED_DISTRIBUTION_PATHS = [
    'gemini-extension.json',
    'GEMINI.md',
    'plugins/corvus-star/.codex-plugin/plugin.json',
    'plugins/corvus-star/skills/corvus-star/SKILL.md',
    'plugins/corvus-star/README.md',
    'plugins/corvus-star/lineage.json',
    '.agents/plugins/marketplace.json',
    'distributions/README.md',
] as const;

function validateNativeMaterializations(projectRoot: string): string[] {
    return buildDistributions(projectRoot).files.flatMap((file) => {
        const absolutePath = path.join(projectRoot, file.relativePath);
        if (!fs.existsSync(absolutePath)) return [`${file.relativePath}: missing`];
        return fs.readFileSync(absolutePath, 'utf-8') === file.content
            ? [] : [`${file.relativePath}: stale`];
    });
}

function portablePath(relativePath: string): string {
    return relativePath.replaceAll('\\', '/');
}

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
                calculus: {
                    id: 'calculus',
                    tier: 'PRIME',
                    description: 'Explicit compatibility only',
                    runtime_trigger: 'calculus',
                    entry_surface: 'compatibility',
                    execution: {
                        mode: 'compatibility',
                        ownership_model: 'kernel-primitive',
                    },
                    host_support: {
                        gemini: 'unsupported',
                        codex: 'unsupported',
                    },
                },
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
        assert.equal(
            build.geminiCapabilities.some((entry) => entry.id === 'calculus'),
            false,
        );
        assert.equal(
            build.codexCapabilities.some((entry) => entry.id === 'calculus'),
            false,
        );
        assert.deepEqual(
            build.files.map((file) => portablePath(file.relativePath)),
            GENERATED_DISTRIBUTION_PATHS,
        );
    });

    it('renders install surfaces with launcher and marketplace metadata', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);

        const geminiManifest = JSON.parse(build.files[0]?.content ?? '{}') as {
            contextFileName?: string;
            version?: string;
            mcpServers?: Record<string, { command?: string; args?: string[]; cwd?: string; note?: string }>;
        };
        assert.equal(geminiManifest.contextFileName, 'GEMINI.md');
        assert.equal(geminiManifest.version, '2.4.6');
        assert.equal(geminiManifest.mcpServers?.['cstar-kernel']?.command, 'node');
        assert.deepEqual(geminiManifest.mcpServers?.['cstar-kernel']?.args, ['bin/cstar-kernel-mcp.js']);
        assert.deepEqual(Object.keys(geminiManifest.mcpServers ?? {}), ['cstar-kernel']);
        assert.match(geminiManifest.mcpServers?.['cstar-kernel']?.note ?? '', /35-tool surface/);

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
        assert.match(geminiContext, /Kernel MCP Tools \(35\)/);
        for (const name of ['plan', 'status', 'update', 'complete', 'cancel']) {
            assert.match(geminiContext, new RegExp(`cstar_forge_swarm_${name}`));
        }

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
        assert.match(codexSkill, /Current Forge uses `cstar_forge_request -> cstar_forge_authorize/);
        assert.match(codexSkill, /requested model and reasoning are immutable packet inputs/);
        assert.match(codexSkill, /separate direct sibling/);
        assert.match(codexSkill, /Historical Codex-host state-only handoffs/);
        assert.doesNotMatch(codexSkill, /Current Forge v3 persists a Codex-host state-only handoff/);
        assert.doesNotMatch(codexSkill, /After `host_handoff_queued`/);
        assert.doesNotMatch(codexSkill, /Choose Luna, Terra, or Sol/);

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
        assert.equal(lineage.tool_catalog?.count, 35);
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
        assert.match(pluginReadme, /Current Forge uses `cstar_forge_request -> cstar_forge_authorize/);
        assert.match(pluginReadme, /forge-native-codex-swarm-v1/);
        assert.match(pluginReadme, /consume:forge-host-handoff.*generation-tombstoned historical evidence only/);
        assert.doesNotMatch(pluginReadme, /Current Forge v3 host handoffs require/);

        const distReadme = build.files[7]?.content ?? '';
        assert.match(distReadme, /npm run build:distributions/);
        assert.match(distReadme, /never hand-edit Codex plugin caches or marketplace state/);
        assert.match(distReadme, /Current Forge uses `cstar_forge_request -> cstar_forge_authorize/);
        assert.match(distReadme, /forge-native-codex-swarm-v1/);
        assert.match(distReadme, /consume:forge-host-handoff.*generation-tombstoned historical evidence only/);
        assert.doesNotMatch(distReadme, /Current Forge v3 host handoffs require/);
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
        assert.deepEqual(validateNativeMaterializations(process.cwd()), []);
    });

    it('pins every generated materialization to LF and emits no CR bytes', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);
        const generatedPaths = build.files.map((file) => portablePath(file.relativePath));
        const attributes = fs.readFileSync(path.join(process.cwd(), '.gitattributes'), 'utf-8');

        assert.equal(attributes.includes('\r'), false);
        assert.deepEqual(
            attributes.trimEnd().split('\n'),
            [
                '.gitattributes text eol=lf',
                ...generatedPaths.map((relativePath) => `${relativePath} text eol=lf`),
            ],
        );
        assert.deepEqual(generatedPaths, GENERATED_DISTRIBUTION_PATHS);

        for (const file of build.files) {
            assert.equal(
                Buffer.from(file.content, 'utf-8').includes(0x0d),
                false,
                `${file.relativePath} generator output contains CR bytes`,
            );
            assert.equal(
                fs.readFileSync(path.join(process.cwd(), file.relativePath)).includes(0x0d),
                false,
                `${file.relativePath} materialization contains CR bytes`,
            );
        }
    });

    it('keeps exact-byte validation strict for CRLF drift', () => {
        const projectRoot = createProjectRoot();
        writeDistributions(projectRoot);
        const target = path.join(projectRoot, 'GEMINI.md');
        const content = fs.readFileSync(target, 'utf-8');
        fs.writeFileSync(target, content.replaceAll('\n', '\r\n'), 'utf-8');

        assert.deepEqual(validateDistributions(projectRoot), ['GEMINI.md: stale']);
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
