import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildReleaseBundles, writeReleaseBundles } from './distributions.js';

interface PackageMetadata {
    version?: string;
}

export interface ReleaseArchiveRecord {
    name: string;
    archive: string;
    source: string;
}

function readPackageVersion(projectRoot: string): string {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as PackageMetadata;
    return packageJson.version ?? '0.0.0';
}

function runTar(projectRoot: string, bundleRoot: string, archivePath: string): void {
    const result = spawnSync(
        'tar',
        [
            '--sort=name',
            '--mtime=UTC 1970-01-01',
            '--owner=0',
            '--group=0',
            '--numeric-owner',
            '-czf',
            archivePath,
            '-C',
            bundleRoot,
            '.',
        ],
        {
            cwd: projectRoot,
            encoding: 'utf-8',
        },
    );

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `tar failed for ${archivePath}`);
    }
}

export function writeReleaseArchives(projectRoot: string): {
    version: string;
    archives: ReleaseArchiveRecord[];
    manifestPath: string;
} {
    const resolvedRoot = path.resolve(projectRoot);
    const distRoot = path.join(resolvedRoot, 'dist');
    const releasesRoot = path.join(distRoot, 'releases');

    writeReleaseBundles(resolvedRoot);
    const bundles = buildReleaseBundles(resolvedRoot);
    const version = readPackageVersion(resolvedRoot);

    fs.rmSync(releasesRoot, { recursive: true, force: true });
    fs.mkdirSync(releasesRoot, { recursive: true });

    const archives = bundles.map((bundle) => {
        const archiveName = `corvus-star-${bundle.name}-v${version}.tar.gz`;
        const archivePath = path.join(releasesRoot, archiveName);
        const bundleRoot = path.join(resolvedRoot, bundle.rootDir);
        runTar(resolvedRoot, bundleRoot, archivePath);
        return {
            name: bundle.name,
            archive: path.relative(resolvedRoot, archivePath),
            source: bundle.rootDir,
        };
    });

    const manifestPath = path.join(releasesRoot, 'manifest.json');
    fs.writeFileSync(
        manifestPath,
        `${JSON.stringify({
            generated_at: new Date().toISOString(),
            version,
            archives,
        }, null, 2)}\n`,
        'utf-8',
    );

    return {
        version,
        archives,
        manifestPath,
    };
}
