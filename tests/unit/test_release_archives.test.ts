import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeDistributions } from '../../src/packaging/distributions.js';
import { writeReleaseArchives } from '../../src/packaging/release_archives.js';

function createProjectRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-release-archives-'));
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

describe('release archive generation', () => {
    it('creates versioned tarballs and manifest from host distributions', () => {
        const projectRoot = createProjectRoot();
        const result = writeReleaseArchives(projectRoot);
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'releases', 'corvus-star-gemini-extension-v2.4.6.tar.gz')),
            true,
        );
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'releases', 'corvus-star-codex-plugin-v2.4.6.tar.gz')),
            true,
        );

        const manifest = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'dist', 'releases', 'manifest.json'), 'utf-8'),
        ) as {
            schema_version?: number;
            version?: string;
            generated_at?: string;
            archives?: Array<{
                name?: string;
                archive?: string;
                bytes?: number;
                sha256?: string;
                source_sha256?: string;
                runtime_binding?: { integration_mode?: string; kernel_bundled?: boolean };
            }>;
        };

        assert.equal(result.version, '2.4.6');
        assert.equal(manifest.schema_version, 1);
        assert.equal(manifest.version, '2.4.6');
        assert.equal(manifest.generated_at, undefined);
        assert.deepEqual(
            manifest.archives?.map((entry) => entry.archive),
            [
                'dist/releases/corvus-star-gemini-extension-v2.4.6.tar.gz',
                'dist/releases/corvus-star-codex-plugin-v2.4.6.tar.gz',
            ],
        );

        for (const archive of manifest.archives ?? []) {
            const archivePath = path.join(projectRoot, archive.archive ?? '');
            const content = fs.readFileSync(archivePath);
            assert.equal(archive.bytes, content.length);
            assert.equal(archive.sha256, createHash('sha256').update(content).digest('hex'));
            assert.match(archive.source_sha256 ?? '', /^[a-f0-9]{64}$/);
            assert.equal(archive.runtime_binding?.kernel_bundled, false);
        }

        const codexArchive = manifest.archives?.find((entry) => entry.name === 'codex-plugin');
        assert.equal(codexArchive?.runtime_binding?.integration_mode, 'skill-only');
        const listing = spawnSync(
            'tar',
            ['-tzf', path.join(projectRoot, codexArchive?.archive ?? '')],
            { encoding: 'utf-8' },
        );
        assert.equal(listing.status, 0, listing.stderr);
        assert.match(listing.stdout, /\.\/plugins\/corvus-star\/lineage\.json/);
        assert.match(listing.stdout, /\.\/plugins\/corvus-star\/\.codex-plugin\/plugin\.json/);
        assert.match(listing.stdout, /\.\/\.agents\/plugins\/marketplace\.json/);
        assert.doesNotMatch(listing.stdout, /\.mcp\.json/);
        assert.doesNotMatch(listing.stdout, /hooks(?:\.json|\/hooks\.json)/);

        const geminiArchive = manifest.archives?.find((entry) => entry.name === 'gemini-extension');
        const geminiListing = spawnSync(
            'tar',
            ['-tzf', path.join(projectRoot, geminiArchive?.archive ?? '')],
            { encoding: 'utf-8' },
        );
        assert.equal(geminiListing.status, 0, geminiListing.stderr);
        assert.match(geminiListing.stdout, /\.\/scripts\/cstar_external_runtime_mcp\.mjs/);
    });

    it('rejects a path-like invalid package version before writing host or release outputs', () => {
        const projectRoot = createProjectRoot();
        const packagePath = path.join(projectRoot, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { version: string };
        packageJson.version = 'x/../../escape';
        fs.writeFileSync(packagePath, JSON.stringify(packageJson), 'utf-8');

        assert.throws(
            () => writeReleaseArchives(projectRoot),
            /Invalid strict SemVer package version: x\/\.\.\/\.\.\/escape/,
        );
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'escape.tar.gz')), false);
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions')), false);
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'releases')), false);
    });

    it('ignores hostile tar environment and PATH overrides, then verifies archive contents', () => {
        const projectRoot = createProjectRoot();
        const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-fake-tar-'));
        const fakeTar = path.join(fakeBin, 'tar');
        const fakeSentinel = path.join(fakeBin, 'invoked');
        fs.writeFileSync(
            fakeTar,
            `#!/usr/bin/env bash\nprintf invoked > ${JSON.stringify(fakeSentinel)}\nexit 99\n`,
            { encoding: 'utf-8', mode: 0o755 },
        );
        const previousPath = process.env.PATH;
        const previousTarOptions = process.env.TAR_OPTIONS;
        const previousGzip = process.env.GZIP;

        try {
            process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
            process.env.TAR_OPTIONS = '--exclude=*';
            process.env.GZIP = '--fast';
            const result = writeReleaseArchives(projectRoot);
            assert.equal(result.archives.length, 2);
        } finally {
            if (previousPath === undefined) delete process.env.PATH;
            else process.env.PATH = previousPath;
            if (previousTarOptions === undefined) delete process.env.TAR_OPTIONS;
            else process.env.TAR_OPTIONS = previousTarOptions;
            if (previousGzip === undefined) delete process.env.GZIP;
            else process.env.GZIP = previousGzip;
        }

        assert.equal(fs.existsSync(fakeSentinel), false);
        const codexArchive = path.join(
            projectRoot,
            'dist',
            'releases',
            'corvus-star-codex-plugin-v2.4.6.tar.gz',
        );
        const listing = spawnSync('/usr/bin/tar', ['-tzf', codexArchive], { encoding: 'utf-8' });
        assert.equal(listing.status, 0, listing.stderr);
        assert.match(listing.stdout, /\.\/plugins\/corvus-star\/lineage\.json/);
        assert.match(listing.stdout, /\.\/INSTALL\.md/);
    });

    it('preserves unresolved release recovery state before rebuilding host outputs', () => {
        const projectRoot = createProjectRoot();
        const recoveryRoot = path.join(projectRoot, 'dist', '.releases.rollback-orphan');
        const sentinel = path.join(recoveryRoot, 'sentinel.txt');
        fs.mkdirSync(recoveryRoot, { recursive: true });
        fs.writeFileSync(sentinel, 'preserve\n', 'utf-8');

        assert.throws(
            () => writeReleaseArchives(projectRoot),
            /Unresolved release recovery artifacts require operator review/,
        );
        assert.equal(fs.readFileSync(sentinel, 'utf-8'), 'preserve\n');
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'host-distributions')), false);
        assert.equal(fs.existsSync(path.join(projectRoot, 'dist', 'releases')), false);
    });
});
