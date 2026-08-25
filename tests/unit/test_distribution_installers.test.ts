import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeDistributions } from '../../src/packaging/distributions.js';
import { installCodexPlugin, installGeminiExtension } from '../../src/packaging/installers.js';

function createProjectRoot(version = '2.4.6'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-install-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version,
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

function createHome(): { homeDir: string; marketplacePath: string } {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-'));
    const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(
        marketplacePath,
        `${JSON.stringify({
            name: 'corvus-local',
            interface: { displayName: 'Corvus Local Plugins' },
            plugins: [
                {
                    name: 'unrelated-plugin',
                    source: { source: 'local', path: './plugins/unrelated-plugin' },
                    policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
                    category: 'Developer Tools',
                },
                {
                    name: 'corvus-star',
                    source: { source: 'local', path: './plugins/corvus-star' },
                    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
                    category: 'Developer Tools',
                },
            ],
        }, null, 2)}\n`,
        'utf-8',
    );
    return { homeDir, marketplacePath };
}

function snapshotFiles(root: string, current = root): Record<string, string> {
    const records: Array<[string, string]> = [];
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            Object.entries(snapshotFiles(root, absolutePath)).forEach((record) => records.push(record));
        } else if (entry.isFile()) {
            records.push([
                path.relative(root, absolutePath).split(path.sep).join('/'),
                createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
            ]);
        }
    }
    return Object.fromEntries(records.sort(([left], [right]) => left.localeCompare(right)));
}

describe('distribution installers', () => {
    it('links the project root into the local Gemini extensions directory', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-gemini-'));

        const result = installGeminiExtension({ projectRoot, homeDir });
        const stat = fs.lstatSync(result.linkPath);

        assert.equal(stat.isSymbolicLink(), true);
        assert.equal(path.resolve(path.dirname(result.linkPath), fs.readlinkSync(result.linkPath)), projectRoot);
        assert.equal(installGeminiExtension({ projectRoot, homeDir }).linkPath, result.linkPath);
    });

    it('preserves a foreign Gemini extension path instead of deleting it', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-gemini-existing-'));
        const existingPath = path.join(homeDir, '.gemini', 'extensions', 'corvus-star');
        const sentinel = path.join(existingPath, 'sentinel.txt');
        fs.mkdirSync(existingPath, { recursive: true });
        fs.writeFileSync(sentinel, 'preserve\n', 'utf-8');

        assert.throws(
            () => installGeminiExtension({ projectRoot, homeDir }),
            /Refusing to replace existing Gemini extension path without an explicit recovery decision/,
        );
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'preserve\n');
        assert.equal(fs.lstatSync(existingPath).isDirectory(), true);
    });

    it('stages a byte-identical skill-only plugin without rewriting unrelated marketplace state', () => {
        const projectRoot = createProjectRoot();
        const { homeDir, marketplacePath } = createHome();
        const marketplaceBefore = fs.readFileSync(marketplacePath);

        const result = installCodexPlugin({ projectRoot, homeDir });

        assert.equal(result.changed, true);
        assert.deepEqual(
            snapshotFiles(result.pluginPath),
            snapshotFiles(path.join(projectRoot, 'plugins', 'corvus-star')),
        );
        assert.equal(fs.existsSync(path.join(result.pluginPath, '.mcp.json')), false);
        assert.deepEqual(fs.readFileSync(marketplacePath), marketplaceBefore);
    });

    it('is idempotent when the immutable version and lineage already match', () => {
        const projectRoot = createProjectRoot();
        const { homeDir, marketplacePath } = createHome();
        const first = installCodexPlugin({ projectRoot, homeDir });
        const before = snapshotFiles(first.pluginPath);

        const second = installCodexPlugin({ projectRoot, homeDir });

        assert.equal(second.changed, false);
        assert.deepEqual(snapshotFiles(second.pluginPath), before);
        assert.equal(
            fs.readdirSync(path.dirname(second.pluginPath)).some((entry) => entry.startsWith('.corvus-star.')),
            false,
        );
        const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8')) as {
            plugins?: Array<{ name?: string }>;
        };
        assert.equal(marketplace.plugins?.filter((entry) => entry.name === 'corvus-star').length, 1);
    });

    it('rejects same-version content with a different lineage before mutation', () => {
        const projectRoot = createProjectRoot();
        const { homeDir } = createHome();
        const installed = installCodexPlugin({ projectRoot, homeDir });
        const lineagePath = path.join(installed.pluginPath, 'lineage.json');
        const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf-8')) as {
            tool_catalog?: { sha256?: string };
        };
        assert.ok(lineage.tool_catalog);
        lineage.tool_catalog.sha256 = '0'.repeat(64);
        fs.writeFileSync(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf-8');
        const before = snapshotFiles(installed.pluginPath);

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /same-version Corvus Star plugin replacement.*different lineage/,
        );
        assert.deepEqual(snapshotFiles(installed.pluginPath), before);
    });

    it('rolls back the previous plugin if the atomic replacement cannot complete', () => {
        const oldRoot = createProjectRoot('2.4.5');
        const newRoot = createProjectRoot('2.4.6');
        const { homeDir, marketplacePath } = createHome();
        const marketplaceBefore = fs.readFileSync(marketplacePath);
        const installed = installCodexPlugin({ projectRoot: oldRoot, homeDir });
        const before = snapshotFiles(installed.pluginPath);
        const originalRename = fs.renameSync;
        let pluginRenameCount = 0;
        const pluginParent = path.dirname(installed.pluginPath);

        fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
            if (
                path.dirname(String(oldPath)) === pluginParent
                || path.dirname(String(newPath)) === pluginParent
            ) {
                pluginRenameCount += 1;
                if (pluginRenameCount === 2) {
                    throw new Error('injected replacement failure');
                }
            }
            return originalRename(oldPath, newPath);
        }) as typeof fs.renameSync;

        try {
            assert.throws(
                () => installCodexPlugin({ projectRoot: newRoot, homeDir }),
                /injected replacement failure/,
            );
        } finally {
            fs.renameSync = originalRename;
        }

        assert.deepEqual(snapshotFiles(installed.pluginPath), before);
        assert.deepEqual(fs.readFileSync(marketplacePath), marketplaceBefore);
        assert.equal(
            fs.readdirSync(pluginParent).some((entry) => entry.startsWith('.corvus-star.')),
            false,
        );
    });

    it('preserves a recovery directory when replacement and rollback both fail', () => {
        const oldRoot = createProjectRoot('2.4.5');
        const newRoot = createProjectRoot('2.4.6');
        const { homeDir } = createHome();
        const installed = installCodexPlugin({ projectRoot: oldRoot, homeDir });
        const before = snapshotFiles(installed.pluginPath);
        const pluginParent = path.dirname(installed.pluginPath);
        const originalRename = fs.renameSync;
        let pluginRenameCount = 0;

        fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
            if (
                path.dirname(String(oldPath)) === pluginParent
                || path.dirname(String(newPath)) === pluginParent
            ) {
                pluginRenameCount += 1;
                if (pluginRenameCount === 2) throw new Error('injected replacement failure');
                if (pluginRenameCount === 3) throw new Error('injected rollback failure');
            }
            return originalRename(oldPath, newPath);
        }) as typeof fs.renameSync;

        try {
            assert.throws(
                () => installCodexPlugin({ projectRoot: newRoot, homeDir }),
                /rollback was incomplete.*Recovery copy preserved at/,
            );
        } finally {
            fs.renameSync = originalRename;
        }

        assert.equal(fs.existsSync(installed.pluginPath), false);
        const recoveryRoots = fs.readdirSync(pluginParent)
            .filter((entry) => entry.startsWith('.corvus-star.rollback-'));
        assert.equal(recoveryRoots.length, 1);
        assert.deepEqual(
            snapshotFiles(path.join(pluginParent, recoveryRoots[0]!, 'corvus-star')),
            before,
        );
        assert.equal(
            fs.readdirSync(pluginParent).some((entry) => entry.startsWith('.corvus-star.stage-')),
            false,
        );
        assert.equal(fs.existsSync(path.join(pluginParent, '.corvus-star.install.lock')), false);
    });

    it('refuses a semantic-version downgrade before mutating the installed plugin', () => {
        const newerRoot = createProjectRoot('3.0.0');
        const olderRoot = createProjectRoot('2.9.9');
        const { homeDir } = createHome();
        const installed = installCodexPlugin({ projectRoot: newerRoot, homeDir });
        const before = snapshotFiles(installed.pluginPath);

        assert.throws(
            () => installCodexPlugin({ projectRoot: olderRoot, homeDir }),
            /Refusing Corvus Star plugin downgrade from 3\.0\.0 to 2\.9\.9/,
        );
        assert.deepEqual(snapshotFiles(installed.pluginPath), before);
    });

    it('rejects an unavailable marketplace policy without rewriting its bytes', () => {
        const projectRoot = createProjectRoot();
        const { homeDir, marketplacePath } = createHome();
        const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8')) as {
            plugins: Array<{ name: string; policy: { installation: string } }>;
        };
        const entry = marketplace.plugins.find((plugin) => plugin.name === 'corvus-star');
        assert.ok(entry);
        entry.policy.installation = 'NOT_AVAILABLE';
        fs.writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, 'utf-8');
        const before = fs.readFileSync(marketplacePath);

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /entry is unavailable or has invalid policy\/category metadata/,
        );
        assert.deepEqual(fs.readFileSync(marketplacePath), before);
        assert.equal(fs.existsSync(path.join(homeDir, 'plugins', 'corvus-star')), false);
    });

    it('fails closed on orphaned recovery state instead of silently deleting it', () => {
        const projectRoot = createProjectRoot();
        const { homeDir } = createHome();
        const orphan = path.join(homeDir, 'plugins', '.corvus-star.rollback-orphan', 'corvus-star');
        fs.mkdirSync(orphan, { recursive: true });
        fs.writeFileSync(path.join(orphan, 'sentinel.txt'), 'preserve\n', 'utf-8');

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /Unresolved Corvus Star install recovery artifacts require operator review/,
        );
        assert.equal(fs.readFileSync(path.join(orphan, 'sentinel.txt'), 'utf-8'), 'preserve\n');
        assert.equal(fs.existsSync(path.join(homeDir, 'plugins', '.corvus-star.install.lock')), false);
    });

    it('labels local scripts and generated guidance as staging rather than activation proof', () => {
        const projectRoot = createProjectRoot();
        const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
        const codexScript = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'install_codex_plugin.ts'), 'utf-8');
        const geminiScript = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'install_gemini_extension.ts'), 'utf-8');
        const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf-8')) as {
            scripts?: Record<string, string>;
        };
        const generatedReadme = fs.readFileSync(path.join(projectRoot, 'plugins', 'corvus-star', 'README.md'), 'utf-8');

        assert.match(codexScript, /Staged verified local Codex plugin source/);
        assert.match(codexScript, /activation: not performed/);
        assert.doesNotMatch(codexScript, /Installed local Codex plugin/);
        assert.match(geminiScript, /Placed local Gemini extension source link/);
        assert.match(geminiScript, /live pickup and proof are deferred/);
        assert.equal(packageJson.scripts?.['install:hosts-local'], undefined);
        assert.equal(fs.existsSync(path.join(repositoryRoot, 'scripts', 'install_host_integrations.ts')), false);
        assert.match(generatedReadme, /Source staging only/);
        assert.match(generatedReadme, /does not run `codex plugin add`/);
    });

    it('fails closed when the personal marketplace activation is missing', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-no-marketplace-'));

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /Personal Codex marketplace source entry is not prepared.*Prepare it separately before staging/,
        );
        assert.equal(fs.existsSync(path.join(homeDir, 'plugins', 'corvus-star')), false);
    });
});
