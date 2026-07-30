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
            bundles.map((bundle) => bundle.rootDir),
            [
                'dist/host-distributions/gemini-extension',
                'dist/host-distributions/codex-plugin',
            ],
        );
        assert.deepEqual(
            bundles[0]?.files.map((file) => file.relativePath),
            ['gemini-extension.json', 'GEMINI.md', 'INSTALL.md'],
        );
        assert.deepEqual(
            bundles[1]?.files.map((file) => file.relativePath),
            [
                '.codex-plugin/plugin.json',
                'README.md',
                'skills/corvus-star/SKILL.md',
                'lineage.json',
                'INSTALL.md',
            ],
        );
        for (const bundle of bundles) {
            assert.doesNotMatch(bundle.rootDir, /\\/);
            for (const file of bundle.files) {
                assert.doesNotMatch(file.relativePath, /\\/);
            }
        }

        const lineageFile = bundles[1]?.files.find((file) => file.relativePath === 'lineage.json');
        assert.ok(lineageFile);
        const lineage = JSON.parse(lineageFile.content) as {
            schema_version?: number;
            plugin?: { name?: string; version?: string };
            runtime_binding?: { integration_mode?: string; kernel_bundled?: boolean };
            files?: Record<string, unknown>;
        };
        assert.equal(lineage.schema_version, 1);
        assert.deepEqual(lineage.plugin, { name: 'corvus-star', version: '2.4.6' });
        assert.equal(lineage.runtime_binding?.integration_mode, 'skill-only');
        assert.equal(lineage.runtime_binding?.kernel_bundled, false);
        assert.deepEqual(Object.keys(lineage.files ?? {}).sort(), [
            '.codex-plugin/plugin.json',
            'README.md',
            'skills/corvus-star/SKILL.md',
        ]);
    });

    it('writes release bundles into dist/host-distributions', () => {
        const projectRoot = createProjectRoot();
        const bundles = writeReleaseBundles(projectRoot);

        for (const bundle of bundles) {
            const bundleRoot = path.join(projectRoot, bundle.rootDir);
            assert.equal(fs.existsSync(bundleRoot), true);
        }

        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'gemini-extension', 'gemini-extension.json')),
            true,
        );
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'codex-plugin', '.codex-plugin', 'plugin.json')),
            true,
        );
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions', 'codex-plugin', 'lineage.json')),
            true,
        );
    });
});
