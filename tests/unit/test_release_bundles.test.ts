import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildReleaseBundles, writeDistributions, writeReleaseBundles } from '../../src/packaging/distributions.js';

function createProjectRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-release-bundles-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version: '2.4.6',
            description: 'Kernel-first runtime.',
            homepage: 'https://example.com/cstar',
            repository: { url: 'https://example.com/cstar.git' },
            license: 'MIT',
            author: { name: 'Corvus Star' },
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'config.json'),
        JSON.stringify({ system: { persona: 'O.D.I.N.' } }, null, 2),
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
                    host_support: {
                        gemini: 'native-session',
                        codex: 'exec-bridge',
                    },
                },
            },
        }, null, 2),
        'utf-8',
    );
    writeDistributions(root);
    return root;
}

describe('release bundle generation', () => {
    it('creates deterministic gemini and codex bundle definitions', () => {
        const projectRoot = createProjectRoot();
        const bundles = buildReleaseBundles(projectRoot);

        assert.deepEqual(
            bundles.map((bundle) => bundle.name),
            ['gemini-extension', 'codex-plugin'],
        );
        assert.deepEqual(
            bundles[0]?.files.map((file) => file.relativePath),
            [
                'gemini-extension.json',
                'GEMINI.md',
                path.join('scripts', 'cstar_external_runtime_mcp.mjs'),
                'INSTALL.md',
            ],
        );
        assert.deepEqual(
            bundles[1]?.files.map((file) => file.relativePath),
            [
                path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
                path.join('plugins', 'corvus-star', 'README.md'),
                path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
                path.join('plugins', 'corvus-star', 'lineage.json'),
                path.join('.agents', 'plugins', 'marketplace.json'),
                'INSTALL.md',
            ],
        );
        assert.deepEqual(bundles[1]?.runtimeBinding, {
            host: 'codex',
            integration_mode: 'skill-only',
            kernel_registration: 'host-global',
            kernel_bundled: false,
            kernel_requirement: 'external-cstar-runtime',
        });
        assert.equal(bundles[1]?.files.some((file) => file.relativePath === '.mcp.json'), false);

        const codexFiles = new Map(
            bundles[1]?.files.map((file) => [file.relativePath.split(path.sep).join('/'), file.content]),
        );
        const marketplace = JSON.parse(codexFiles.get('.agents/plugins/marketplace.json') ?? '{}') as {
            plugins?: Array<{ source?: { path?: string } }>;
        };
        const sourcePath = marketplace.plugins?.[0]?.source?.path?.replace(/^\.\//, '');
        assert.equal(sourcePath, 'plugins/corvus-star');
        assert.equal(codexFiles.has(`${sourcePath}/.codex-plugin/plugin.json`), true);
        assert.match(codexFiles.get('INSTALL.md') ?? '', /codex plugin marketplace add <bundle-root>/);
        assert.match(codexFiles.get('INSTALL.md') ?? '', /codex plugin add corvus-star@corvus-star/);
        assert.match(codexFiles.get('INSTALL.md') ?? '', /Start a new Codex task/);
        assert.equal([...codexFiles.keys()].some((file) => file.includes('hooks')), false);

        const geminiFiles = new Map(
            bundles[0]?.files.map((file) => [file.relativePath.split(path.sep).join('/'), file.content]),
        );
        const geminiManifest = JSON.parse(geminiFiles.get('gemini-extension.json') ?? '{}') as {
            mcpServers?: Record<string, { args?: string[] }>;
        };
        const geminiLauncher = geminiManifest.mcpServers?.['cstar-kernel']?.args?.[0];
        assert.equal(geminiLauncher, 'scripts/cstar_external_runtime_mcp.mjs');
        assert.equal(geminiFiles.has(geminiLauncher ?? ''), true);
        const launcherContent = geminiFiles.get(geminiLauncher ?? '') ?? '';
        assert.match(launcherContent, /CSTAR_ROOT must be an absolute path/);
        assert.match(launcherContent, /process\.on\(signal, handler\)/);
        assert.match(launcherContent, /child\.kill\('SIGKILL'\)/);
        assert.match(launcherContent, /forceTimer\.unref/);
        assert.match(geminiFiles.get('INSTALL.md') ?? '', /not a standalone CStar runtime/);
    });

    it('writes release bundles into dist/host-distributions', () => {
        const projectRoot = createProjectRoot();
        const retiredFile = path.join(projectRoot, 'dist', 'host-distributions', 'retired-bundle', 'stale.txt');
        fs.mkdirSync(path.dirname(retiredFile), { recursive: true });
        fs.writeFileSync(retiredFile, 'stale\n', 'utf-8');
        const bundles = writeReleaseBundles(projectRoot);

        for (const bundle of bundles) {
            const bundleRoot = path.join(projectRoot, bundle.rootDir);
            assert.equal(fs.existsSync(bundleRoot), true);
        }

        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'gemini-extension', 'gemini-extension.json')),
            true,
        );
        const externalLauncher = path.join(
            projectRoot,
            'dist',
            'host-distributions',
            'gemini-extension',
            'scripts',
            'cstar_external_runtime_mcp.mjs',
        );
        const launcherEnv = { ...process.env };
        delete launcherEnv.CSTAR_ROOT;
        delete launcherEnv.CORVUS_CSTAR_ROOT;
        const launcherProbe = spawnSync(process.execPath, [externalLauncher], {
            env: launcherEnv,
            encoding: 'utf-8',
        });
        assert.equal(launcherProbe.status, 78, launcherProbe.stderr);
        assert.match(launcherProbe.stderr, /CSTAR_ROOT must be an absolute path/);
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'codex-plugin', 'plugins', 'corvus-star', '.codex-plugin', 'plugin.json')),
            true,
        );
        assert.equal(fs.existsSync(retiredFile), false);
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'codex-plugin', '.mcp.json')),
            false,
        );

        const manifest = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'dist', 'host-distributions', 'manifest.json'), 'utf-8'),
        ) as {
            schema_version?: number;
            version?: string;
            bundles?: Array<{
                name?: string;
                sha256?: string;
                runtime_binding?: { integration_mode?: string; kernel_bundled?: boolean };
                files?: Array<{ path?: string; bytes?: number; sha256?: string }>;
            }>;
        };
        assert.equal(manifest.schema_version, 1);
        assert.equal(manifest.version, '2.4.6');
        const codexManifest = manifest.bundles?.find((entry) => entry.name === 'codex-plugin');
        assert.match(codexManifest?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.equal(codexManifest?.runtime_binding?.integration_mode, 'skill-only');
        assert.equal(codexManifest?.runtime_binding?.kernel_bundled, false);
        assert.equal(codexManifest?.files?.some((file) => file.path === '.mcp.json'), false);
        for (const file of codexManifest?.files ?? []) {
            const content = fs.readFileSync(
                path.join(projectRoot, 'dist', 'host-distributions', 'codex-plugin', file.path ?? ''),
            );
            assert.equal(file.bytes, content.length);
            assert.equal(file.sha256, createHash('sha256').update(content).digest('hex'));
        }
    });

    it('rejects a symlinked dist ancestor without touching the external target', () => {
        const projectRoot = createProjectRoot();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-release-outside-'));
        const sentinel = path.join(outside, 'sentinel.txt');
        fs.writeFileSync(sentinel, 'preserve\n', 'utf-8');
        fs.symlinkSync(outside, path.join(projectRoot, 'dist'), 'dir');

        assert.throws(
            () => writeReleaseBundles(projectRoot),
            /symbolic-link path component/,
        );
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'preserve\n');
        assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
    });

    it('preserves unresolved host-distribution recovery state', () => {
        const projectRoot = createProjectRoot();
        const recoveryRoot = path.join(projectRoot, 'dist', '.host-distributions.rollback-orphan');
        const sentinel = path.join(recoveryRoot, 'sentinel.txt');
        fs.mkdirSync(recoveryRoot, { recursive: true });
        fs.writeFileSync(sentinel, 'preserve\n', 'utf-8');

        assert.throws(
            () => writeReleaseBundles(projectRoot),
            /Unresolved host-distribution recovery artifacts require operator review/,
        );
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'preserve\n');
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions')), false);
    });
});
