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

function toPortablePath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/');
}

function readTarVersionOutput(projectRoot: string): string {
    const result = spawnSync('tar', ['--version'], {
        cwd: projectRoot,
        encoding: 'utf-8',
    });

    if (result.status !== 0) {
        return '';
    }

    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

export function buildTarArguments(
    tarVersionOutput: string,
    bundleRoot: string,
    archivePath: string,
): string[] {
    const portableArguments = [
        '-czf',
        archivePath,
        '-C',
        bundleRoot,
        '.',
    ];

    if (!/\bGNU tar\b/i.test(tarVersionOutput)) {
        return portableArguments;
    }

    return [
        '--sort=name',
        '--mtime=UTC 1970-01-01',
        '--owner=0',
        '--group=0',
        '--numeric-owner',
        ...portableArguments,
    ];
}

function readPackageVersion(projectRoot: string): string {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as PackageMetadata;
    return packageJson.version ?? '0.0.0';
}

function runTar(
    projectRoot: string,
    bundleRoot: string,
    archivePath: string,
    tarVersionOutput: string,
): void {
    const result = spawnSync(
        'tar',
        buildTarArguments(tarVersionOutput, bundleRoot, archivePath),
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
    const tarVersionOutput = readTarVersionOutput(resolvedRoot);

    fs.rmSync(releasesRoot, { recursive: true, force: true });
    fs.mkdirSync(releasesRoot, { recursive: true });

    const archives = bundles.map((bundle) => {
        const archiveName = `corvus-star-${bundle.name}-v${version}.tar.gz`;
        const archivePath = path.join(releasesRoot, archiveName);
        const bundleRoot = path.join(resolvedRoot, bundle.rootDir);
        runTar(resolvedRoot, bundleRoot, archivePath, tarVersionOutput);
        return {
            name: bundle.name,
            archive: toPortablePath(path.relative(resolvedRoot, archivePath)),
            source: toPortablePath(bundle.rootDir),
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
