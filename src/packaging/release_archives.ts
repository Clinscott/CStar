import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
    buildReleaseBundleManifest,
    buildReleaseBundles,
    type RuntimeBinding,
    writeReleaseBundles,
} from './distributions.js';
import {
    assertManagedPathSafe,
    assertNoRecoveryArtifacts,
    assertRegularTree,
    listRegularFiles,
    parseStrictSemver,
    resolveCanonicalDirectory,
} from './packaging_safety.js';

interface PackageMetadata {
    version?: string;
}

interface ExpectedArchiveFile {
    path: string;
    bytes: number;
    sha256: string;
}

const TRUSTED_GNU_TAR = '/usr/bin/tar';
const TAR_ENVIRONMENT_KEYS = [
    'TAR_OPTIONS',
    'TAPE',
    'GZIP',
    'GZIP_OPT',
    'BZIP2',
    'BZIP2_OPT',
    'XZ_OPT',
    'ZSTD_CLEVEL',
    'ZSTD_NBTHREADS',
    'RSH',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'POSIXLY_CORRECT',
] as const;

export interface ReleaseArchiveRecord {
    name: string;
    archive: string;
    source: string;
    bytes: number;
    sha256: string;
    source_sha256: string;
    runtime_binding: RuntimeBinding;
}

function readPackageVersion(projectRoot: string): string {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as PackageMetadata;
    return parseStrictSemver(packageJson.version, 'package version').raw;
}

function safeTarEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of TAR_ENVIRONMENT_KEYS) delete env[key];
    env.PATH = '/usr/bin:/bin';
    env.LC_ALL = 'C';
    env.LANG = 'C';
    env.TZ = 'UTC';
    return env;
}

function runTrustedTar(args: string[], projectRoot: string): ReturnType<typeof spawnSync> {
    const result = spawnSync(TRUSTED_GNU_TAR, args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        env: safeTarEnvironment(),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `GNU tar failed: ${args.join(' ')}`);
    }
    return result;
}

function requireTrustedGnuTar(projectRoot: string): void {
    const stat = fs.lstatSync(TRUSTED_GNU_TAR);
    if (
        stat.isSymbolicLink()
        || !stat.isFile()
        || fs.realpathSync(TRUSTED_GNU_TAR) !== TRUSTED_GNU_TAR
        || stat.uid !== 0
        || (stat.mode & 0o022) !== 0
    ) {
        throw new Error(`Trusted GNU tar path has unsafe provenance or permissions: ${TRUSTED_GNU_TAR}`);
    }
    const result = runTrustedTar(['--version'], projectRoot);
    if (!String(result.stdout).startsWith('tar (GNU tar) ')) {
        throw new Error(`Release packaging requires GNU tar at ${TRUSTED_GNU_TAR}`);
    }
}

function runTar(projectRoot: string, bundleRoot: string, archivePath: string): void {
    const result = spawnSync(
        TRUSTED_GNU_TAR,
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
            env: safeTarEnvironment(),
        },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `tar failed for ${archivePath}`);
    }
}

function hashFile(filePath: string): string {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyArchive(
    projectRoot: string,
    archivePath: string,
    expectedFiles: ExpectedArchiveFile[],
): void {
    const listing = String(runTrustedTar(['--list', '--gzip', '--file', archivePath], projectRoot).stdout);
    for (const rawEntry of listing.split('\n').filter(Boolean)) {
        const entry = rawEntry.replace(/^\.\//, '').replace(/\/$/, '');
        if (!entry) continue;
        if (path.posix.isAbsolute(entry) || entry.split('/').includes('..')) {
            throw new Error(`Release archive contains an unsafe path: ${rawEntry}`);
        }
    }

    const verificationRoot = fs.mkdtempSync(path.join(path.dirname(archivePath), '.archive-verify-'));
    try {
        runTrustedTar([
            '--extract',
            '--gzip',
            '--file',
            archivePath,
            '--directory',
            verificationRoot,
            '--no-same-owner',
            '--no-same-permissions',
        ], projectRoot);
        assertRegularTree(verificationRoot, 'Extracted release verification tree');
        const expectedPaths = expectedFiles.map((file) => file.path).sort((left, right) => left.localeCompare(right));
        const actualPaths = listRegularFiles(verificationRoot);
        if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
            throw new Error('Release archive file set does not match its source bundle manifest.');
        }
        for (const expected of expectedFiles) {
            const extractedPath = path.join(verificationRoot, expected.path);
            const content = fs.readFileSync(extractedPath);
            if (content.length !== expected.bytes || hashFile(extractedPath) !== expected.sha256) {
                throw new Error(`Release archive content does not match its source bundle manifest: ${expected.path}`);
            }
        }
    } finally {
        fs.rmSync(verificationRoot, { recursive: true, force: true });
    }
}

export function writeReleaseArchives(projectRoot: string): {
    version: string;
    archives: ReleaseArchiveRecord[];
    manifestPath: string;
} {
    const resolvedRoot = resolveCanonicalDirectory(projectRoot, 'CStar project root');
    const version = readPackageVersion(resolvedRoot);
    const distRoot = path.join(resolvedRoot, 'dist');
    const releasesRoot = path.join(distRoot, 'releases');
    assertManagedPathSafe(resolvedRoot, distRoot, 'Distribution output root');
    assertManagedPathSafe(resolvedRoot, releasesRoot, 'Release output root');
    if (fs.existsSync(distRoot) && !fs.lstatSync(distRoot).isDirectory()) {
        throw new Error(`Distribution output root must be a real directory: ${distRoot}`);
    }
    assertRegularTree(releasesRoot, 'Existing release tree');
    assertNoRecoveryArtifacts(
        distRoot,
        ['.releases.stage-', '.releases.rollback-'],
        'release',
    );
    requireTrustedGnuTar(resolvedRoot);

    writeReleaseBundles(resolvedRoot);
    const bundles = buildReleaseBundles(resolvedRoot);
    const bundleManifest = buildReleaseBundleManifest(resolvedRoot, bundles);
    fs.mkdirSync(distRoot, { recursive: true });
    const stagingRoot = fs.mkdtempSync(path.join(distRoot, '.releases.stage-'));
    const rollbackRoot = fs.mkdtempSync(path.join(distRoot, '.releases.rollback-'));
    const rollbackTree = path.join(rollbackRoot, 'releases');
    let previousMoved = false;
    let stagedPromoted = false;
    let preserveRollback = false;
    let archives: ReleaseArchiveRecord[] = [];

    try {
        archives = bundles.map((bundle) => {
            const archiveName = `corvus-star-${bundle.name}-v${version}.tar.gz`;
            const stagedArchivePath = path.join(stagingRoot, archiveName);
            const finalArchivePath = path.join(releasesRoot, archiveName);
            assertManagedPathSafe(stagingRoot, stagedArchivePath, `Staged release archive ${archiveName}`);
            assertManagedPathSafe(resolvedRoot, finalArchivePath, `Release archive ${archiveName}`);
            const bundleRoot = path.join(resolvedRoot, bundle.rootDir);
            const sourceRecord = bundleManifest.bundles.find((entry) => entry.name === bundle.name);
            if (!sourceRecord) {
                throw new Error(`Missing release bundle manifest record for ${bundle.name}`);
            }
            runTar(resolvedRoot, bundleRoot, stagedArchivePath);
            verifyArchive(resolvedRoot, stagedArchivePath, sourceRecord.files);
            return {
                name: bundle.name,
                archive: path.relative(resolvedRoot, finalArchivePath),
                source: bundle.rootDir,
                bytes: fs.statSync(stagedArchivePath).size,
                sha256: hashFile(stagedArchivePath),
                source_sha256: sourceRecord.sha256,
                runtime_binding: bundle.runtimeBinding,
            };
        });

        fs.writeFileSync(
            path.join(stagingRoot, 'manifest.json'),
            `${JSON.stringify({
                schema_version: 1,
                version,
                archives,
            }, null, 2)}\n`,
            'utf-8',
        );
        assertRegularTree(stagingRoot, 'Staged release tree');

        if (fs.existsSync(releasesRoot)) {
            fs.renameSync(releasesRoot, rollbackTree);
            previousMoved = true;
        }
        fs.renameSync(stagingRoot, releasesRoot);
        stagedPromoted = true;
    } catch (error) {
        const recoveryErrors: unknown[] = [];
        if (stagedPromoted) {
            try {
                fs.rmSync(releasesRoot, { recursive: true, force: true });
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        if (previousMoved) {
            try {
                fs.renameSync(rollbackTree, releasesRoot);
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        if (recoveryErrors.length > 0) {
            preserveRollback = true;
            throw new Error(
                `Release promotion failed and rollback was incomplete. Recovery tree preserved at ${rollbackRoot}`,
                { cause: new AggregateError([error, ...recoveryErrors]) },
            );
        }
        throw error;
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        if (!preserveRollback) {
            fs.rmSync(rollbackRoot, { recursive: true, force: true });
        }
    }

    const manifestPath = path.join(releasesRoot, 'manifest.json');

    return {
        version,
        archives,
        manifestPath,
    };
}
