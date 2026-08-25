import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SkillRegistryContractError } from '../../src/core/skill_registry_contract.js';
import { buildDistributions, validateDistributions, writeDistributions } from '../../src/packaging/distributions.js';
import { CSTAR_KERNEL_TOOL_NAMES } from '../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';

function contentFor(build: ReturnType<typeof buildDistributions>, relativePath: string): string {
    const file = build.files.find((entry) => entry.relativePath === relativePath);
    assert.ok(file, `missing generated file: ${relativePath}`);
    return file.content;
}

function createProjectRoot(version = '2.4.6'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-distributions-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version,
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
    it('rejects array-form registry entries instead of exporting numeric capability ids', () => {
        const projectRoot = createProjectRoot();
        fs.writeFileSync(
            path.join(projectRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: [
                    {
                        id: 'mimir-harvester',
                        tier: 'SKILL',
                        host_support: { codex: 'supported' },
                    },
                ],
            }),
            'utf-8',
        );

        assert.throws(
            () => buildDistributions(projectRoot),
            (error: unknown) => error instanceof SkillRegistryContractError
                && error.message === '[skill-registry] entries must be a plain object.',
        );
    });

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
        assert.deepEqual(build.obsoletePaths, [
            path.join('plugins', 'corvus-star', '.mcp.json'),
            path.join('plugins', 'corvus-star', 'hooks.json'),
            path.join('plugins', 'corvus-star', 'hooks'),
            path.join('plugins', 'corvus-star', 'scripts', 'cstar_codex_post_write.sh'),
        ]);
    });

    it('renders install surfaces with launcher and marketplace metadata', () => {
        const projectRoot = createProjectRoot();
        const build = buildDistributions(projectRoot);

        const geminiManifest = JSON.parse(contentFor(build, 'gemini-extension.json')) as {
            contextFileName?: string;
            version?: string;
            mcpServers?: Record<string, { command?: string; args?: string[]; cwd?: string }>;
        };
        assert.equal(geminiManifest.contextFileName, 'GEMINI.md');
        assert.equal(geminiManifest.version, '2.4.6');
        assert.equal(geminiManifest.mcpServers?.['cstar-kernel']?.command, 'node');
        assert.deepEqual(geminiManifest.mcpServers?.['cstar-kernel']?.args, ['bin/cstar-kernel-mcp.js']);
        assert.deepEqual(Object.keys(geminiManifest.mcpServers ?? {}), ['cstar-kernel']);

        const geminiContext = contentFor(build, 'GEMINI.md');
        assert.match(geminiContext, /node bin\/cstar\.js <command>/);
        assert.match(geminiContext, /Exported Gemini Capabilities \(3\)/);
        assert.match(geminiContext, /Host-native Gemini CLI extension/);
        assert.match(geminiContext, /host session when the registry marks a capability host-executable/);
        assert.match(geminiContext, /host-owned cognition\/workflow surfaces and `kernel-primitive` entries/);
        assert.match(geminiContext, /Corvus Star Augury \[Ω\]/);
        assert.match(geminiContext, /reuse fresh mission state otherwise/);
        assert.match(geminiContext, /Council experts are advisory critique lenses/);
        assert.match(geminiContext, /`hall` \(PRIME, native-session, host-workflow, kernel fallback allowed\)/);
        assert.doesNotMatch(geminiContext, /cstar_autobot/);

        const codexPlugin = JSON.parse(contentFor(
            build,
            path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
        )) as {
            name?: string;
            skills?: string;
            hooks?: string;
            mcpServers?: unknown;
            interface?: { displayName?: string; capabilities?: string[]; shortDescription?: string };
        };
        assert.equal(codexPlugin.name, 'corvus-star');
        assert.equal(codexPlugin.skills, './skills/');
        assert.equal(codexPlugin.hooks, undefined);
        assert.equal(codexPlugin.mcpServers, undefined);
        assert.deepEqual(codexPlugin.interface?.capabilities, ['Interactive', 'Write']);
        assert.equal(codexPlugin.interface?.shortDescription, 'Corvus Star Augury and Hall integration for Codex.');

        const codexSkill = contentFor(
            build,
            path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
        );
        assert.match(codexSkill, /Corvus Star Augury \[Ω\]/);
        assert.match(codexSkill, /Mimir's Well/);
        assert.match(codexSkill, /Council experts are advisory critique lenses/);
        assert.match(codexSkill, /nearest `AGENTS\.md` or `AGENTS\.qmd`/);
        assert.match(codexSkill, /docs\/integrations\/codex_mcp_contract\.md/);
        assert.match(codexSkill, /Live Forge uses durable request\/attempt rows/);
        assert.match(codexSkill, /Adapter delivery remains pending until independent validation/);
        assert.match(codexSkill, /An already-running host must reload repaired source/);
        assert.doesNotMatch(codexSkill, /Every handler is deterministic/);
        assert.doesNotMatch(codexSkill, /Silent Hook|PostToolUse|last-post-write/);
        assert.doesNotMatch(codexSkill, /CoS -> Corvus - MM ->/);
        assert.doesNotMatch(codexSkill, /PMT owns worker assignment/);
        assert.doesNotMatch(codexSkill, /cstar_autobot/);

        const marketplace = JSON.parse(contentFor(
            build,
            path.join('.agents', 'plugins', 'marketplace.json'),
        )) as {
            plugins?: Array<{ source?: { path?: string } }>;
        };
        assert.equal(marketplace.plugins?.[0]?.source?.path, './plugins/corvus-star');

        const pluginReadme = contentFor(build, path.join('plugins', 'corvus-star', 'README.md'));
        assert.match(pluginReadme, /repo-local plugin lives under `plugins\/corvus-star\/`/);
        assert.match(pluginReadme, /same registry-backed host\/kernel split as Gemini/);
        assert.match(pluginReadme, /bounded, on-demand Corvus Star Augury routing/);
        assert.match(pluginReadme, /fail closed when the host session is unavailable/);
        assert.match(pluginReadme, /skill-only/);
        assert.match(pluginReadme, /intentionally contains no hooks, `\.mcp\.json`, or bundled kernel/);
        assert.match(pluginReadme, /Source staging only/);
        assert.match(pluginReadme, /does not run `codex plugin add`/);

        const distReadme = contentFor(build, path.join('distributions', 'README.md'));
        assert.match(distReadme, /npm run build:distributions/);
        assert.match(distReadme, /external-runtime-dependent host overlays/);
        assert.match(distReadme, /separately operator-gated supported host activation flow/);

        const lineage = JSON.parse(contentFor(
            build,
            path.join('plugins', 'corvus-star', 'lineage.json'),
        )) as {
            plugin?: { name?: string; version?: string };
            runtime_binding?: { integration_mode?: string; kernel_registration?: string; kernel_bundled?: boolean };
            tool_catalog?: { count?: number; sha256?: string };
            capability_exports?: { sha256?: string };
            files?: Record<string, { bytes?: number; sha256?: string }>;
        };
        assert.deepEqual(lineage.plugin, { name: 'corvus-star', version: '2.4.6' });
        assert.equal(lineage.runtime_binding?.integration_mode, 'skill-only');
        assert.equal(lineage.runtime_binding?.kernel_registration, 'host-global');
        assert.equal(lineage.runtime_binding?.kernel_bundled, false);
        assert.equal(lineage.tool_catalog?.count, CSTAR_KERNEL_TOOL_NAMES.length);
        assert.match(lineage.tool_catalog?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.match(lineage.capability_exports?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.equal(lineage.files?.['.mcp.json'], undefined);
        assert.equal(lineage.files?.['hooks.json'], undefined);
        assert.equal(lineage.files?.['hooks/hooks.json'], undefined);
        assert.equal(lineage.files?.['scripts/cstar_codex_post_write.sh'], undefined);
        for (const [relativePath, record] of Object.entries(lineage.files ?? {})) {
            const content = contentFor(build, path.join('plugins', 'corvus-star', relativePath));
            assert.equal(record.bytes, Buffer.byteLength(content, 'utf-8'));
            assert.equal(record.sha256, createHash('sha256').update(content).digest('hex'));
        }
    });

    it('emits root-neutral stable lineage and replaces the generated plugin with an exact file set', () => {
        const firstRoot = createProjectRoot();
        const secondRoot = createProjectRoot();
        const lineagePath = path.join('plugins', 'corvus-star', 'lineage.json');

        const first = buildDistributions(firstRoot);
        const second = buildDistributions(secondRoot);
        assert.equal(contentFor(first, lineagePath), contentFor(second, lineagePath));

        const obsoletePath = path.join(firstRoot, 'plugins', 'corvus-star', '.mcp.json');
        fs.mkdirSync(path.dirname(obsoletePath), { recursive: true });
        fs.writeFileSync(obsoletePath, '{}\n', 'utf-8');
        const stalePath = path.join(firstRoot, 'plugins', 'corvus-star', 'stale-secret.txt');
        fs.writeFileSync(stalePath, 'stale\n', 'utf-8');
        const oldHookPath = path.join(firstRoot, 'plugins', 'corvus-star', 'hooks', 'hooks.json');
        fs.mkdirSync(path.dirname(oldHookPath), { recursive: true });
        fs.writeFileSync(oldHookPath, '{}\n', 'utf-8');
        assert.match(validateDistributions(firstRoot).join('\n'), /stale-secret\.txt: unexpected/);
        writeDistributions(firstRoot);
        assert.equal(fs.existsSync(obsoletePath), false);
        assert.equal(fs.existsSync(stalePath), false);
        assert.equal(fs.existsSync(oldHookPath), false);
        assert.deepEqual(validateDistributions(firstRoot), []);
    });

    it('rejects invalid package SemVer before creating any generated artifact', () => {
        const projectRoot = createProjectRoot('x/../../escape');

        assert.throws(
            () => writeDistributions(projectRoot),
            /Invalid strict SemVer package version: x\/\.\.\/\.\.\/escape/,
        );
        assert.equal(fs.existsSync(path.join(projectRoot, 'gemini-extension.json')), false);
        assert.equal(fs.existsSync(path.join(projectRoot, 'plugins', 'corvus-star')), false);
    });

    it('fails closed before writes when a generated root or ancestor is symlinked', () => {
        const pluginRootProject = createProjectRoot();
        const pluginOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-plugin-outside-'));
        fs.mkdirSync(path.join(pluginRootProject, 'plugins'), { recursive: true });
        fs.writeFileSync(path.join(pluginOutside, '.mcp.json'), 'sentinel\n', 'utf-8');
        fs.symlinkSync(pluginOutside, path.join(pluginRootProject, 'plugins', 'corvus-star'), 'dir');

        assert.throws(
            () => writeDistributions(pluginRootProject),
            /symbolic-link path component/,
        );
        assert.equal(fs.readFileSync(path.join(pluginOutside, '.mcp.json'), 'utf-8'), 'sentinel\n');
        assert.equal(fs.existsSync(path.join(pluginOutside, 'lineage.json')), false);

        const ancestorProject = createProjectRoot();
        const marketplaceOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-marketplace-outside-'));
        fs.symlinkSync(marketplaceOutside, path.join(ancestorProject, '.agents', 'plugins'), 'dir');
        assert.throws(
            () => writeDistributions(ancestorProject),
            /symbolic-link path component/,
        );
        assert.equal(fs.existsSync(path.join(ancestorProject, 'gemini-extension.json')), false);
        assert.deepEqual(fs.readdirSync(marketplaceOutside), []);
    });

    it('preserves unresolved distribution recovery artifacts and refuses a new promotion', () => {
        const projectRoot = createProjectRoot();
        const recoveryRoot = path.join(projectRoot, '.cstar-distributions.rollback-orphan');
        const sentinel = path.join(recoveryRoot, 'sentinel.txt');
        fs.mkdirSync(recoveryRoot, { recursive: true });
        fs.writeFileSync(sentinel, 'preserve\n', 'utf-8');

        assert.throws(
            () => writeDistributions(projectRoot),
            /Unresolved generated distribution recovery artifacts require operator review/,
        );
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'preserve\n');
        assert.equal(fs.existsSync(path.join(projectRoot, 'gemini-extension.json')), false);
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
});
