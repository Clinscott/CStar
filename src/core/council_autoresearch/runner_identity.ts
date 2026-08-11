import fs from 'node:fs';
import path from 'node:path';

import type { ArtifactManifest, RunnerPublicationBinding } from './contracts.js';
import {
    assertSha256,
    canonicalJson,
    fail,
} from './contracts.js';
import { repositoryRoot } from './git_trust.js';
import {
    REQUIRED_RUNNER_PUBLICATION_PATHS,
    executingRunnerRepositoryRoot,
    verifyRunnerPublication,
    verifyRunnerPublicationCheckpointStructure,
} from './publication.js';
import { attestSource } from './source_attestation.js';

export interface RunnerCheckoutAttestation {
    root: string;
    head: string;
    required_files: Record<string, string>;
    manifest: ArtifactManifest;
}

interface RunnerFileIdentity {
    sha256: string;
    mode: number;
}

function sortedPaths(paths: readonly string[]): string[] {
    return [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function manifestFiles(
    manifest: ArtifactManifest,
    label: string,
): Record<string, RunnerFileIdentity> {
    const expectedPaths = sortedPaths(REQUIRED_RUNNER_PUBLICATION_PATHS);
    if (!manifest || !Array.isArray(manifest.included_paths)
        || canonicalJson(sortedPaths(manifest.included_paths)) !== canonicalJson(expectedPaths)
        || !Array.isArray(manifest.entries)
        || manifest.entries.length !== expectedPaths.length) {
        fail(`${label} must contain the exact canonical runner path set`);
    }
    const files: Record<string, RunnerFileIdentity> = {};
    for (const entry of manifest.entries) {
        if (!entry || typeof entry.path !== 'string' || files[entry.path] !== undefined) {
            fail(`${label} contains a duplicate or invalid path`);
        }
        assertSha256(entry.sha256, `${label}.${entry.path}.sha256`);
        if (entry.mode !== 0o644) fail(`${label} runner files must use mode 0644`);
        files[entry.path] = { sha256: entry.sha256, mode: entry.mode };
    }
    if (canonicalJson(sortedPaths(Object.keys(files))) !== canonicalJson(expectedPaths)) {
        fail(`${label} must contain the exact canonical runner file set`);
    }
    return files;
}

function requiredFiles(files: Record<string, RunnerFileIdentity>): Record<string, string> {
    return Object.fromEntries(sortedPaths(Object.keys(files)).map((file) => [
        file,
        files[file].sha256,
    ]));
}

function assertPathAbsent(file: string, label: string): void {
    try {
        fs.lstatSync(file);
        fail(`${label} is forbidden: ${file}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

function assertNoRunnerResolutionOverrides(root: string): void {
    const checkedDirectories = new Set<string>();
    for (const file of REQUIRED_RUNNER_PUBLICATION_PATHS) {
        if (file.endsWith('.ts')) {
            assertPathAbsent(
                path.join(root, ...`${file.slice(0, -3)}.js`.split('/')),
                'noncanonical runner resolver shadow',
            );
        }
        let directory = path.posix.dirname(file);
        while (directory !== '.') {
            if (!checkedDirectories.has(directory)) {
                checkedDirectories.add(directory);
                for (const control of ['package.json', 'tsconfig.json']) {
                    const relative = path.posix.join(directory, control);
                    if (!REQUIRED_RUNNER_PUBLICATION_PATHS.includes(
                        relative as typeof REQUIRED_RUNNER_PUBLICATION_PATHS[number],
                    )) {
                        assertPathAbsent(
                            path.join(root, ...relative.split('/')),
                            'noncanonical runner resolution control file',
                        );
                    }
                }
            }
            directory = path.posix.dirname(directory);
        }
    }
}

export function attestRunnerCheckout(repoRootInput: string): RunnerCheckoutAttestation {
    const root = repositoryRoot(repoRootInput);
    assertNoRunnerResolutionOverrides(root);
    const attestation = attestSource(
        root,
        [...REQUIRED_RUNNER_PUBLICATION_PATHS],
        'runner-publication',
    );
    const files = manifestFiles(attestation.manifest, 'runner checkout manifest');
    assertNoRunnerResolutionOverrides(root);
    return {
        root,
        head: attestation.head,
        required_files: requiredFiles(files),
        manifest: attestation.manifest,
    };
}

function assertLocalBinding(
    binding: RunnerPublicationBinding,
    bundleManifest: ArtifactManifest,
    repoRoot: string,
): RunnerCheckoutAttestation {
    verifyRunnerPublicationCheckpointStructure(binding.checkpoint);
    const local = attestRunnerCheckout(repoRoot);
    const localFiles = Object.fromEntries(Object.entries(local.required_files).map(
        ([file, digest]) => [file, { sha256: digest, mode: 0o644 }],
    ));
    const bundledFiles = manifestFiles(bundleManifest, 'runner bundle manifest');
    if (binding.checkpoint.commit !== local.head
        || canonicalJson(binding.checkpoint.required_files)
            !== canonicalJson(local.required_files)
        || canonicalJson(bundledFiles) !== canonicalJson(localFiles)
        || canonicalJson(bundleManifest) !== canonicalJson(local.manifest)) {
        fail('runner checkpoint and bundle do not bind the attested checkout');
    }
    return local;
}

export function verifyRunnerCheckoutPublication(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
    executionRepoRoot: string;
    publicationRepoRoot: string;
}): void {
    const executionRoot = repositoryRoot(input.executionRepoRoot);
    const publicationRoot = repositoryRoot(input.publicationRepoRoot);
    if (executionRoot !== publicationRoot) {
        fail('runner publication repository is not the attested checkout');
    }
    const before = assertLocalBinding(input.binding, input.bundleManifest, executionRoot);
    const verified = verifyRunnerPublication({
        repoRoot: publicationRoot,
        repository: input.binding.checkpoint.repository,
        expectedRepositoryUrl: input.binding.checkpoint.repository_url,
        branch: input.binding.checkpoint.branch,
        commit: input.binding.checkpoint.commit,
        requiredFiles: input.binding.checkpoint.required_files,
    });
    if (canonicalJson(verified) !== canonicalJson(input.binding.checkpoint)) {
        fail('runner publication remote verification changed');
    }
    const after = assertLocalBinding(input.binding, input.bundleManifest, executionRoot);
    if (canonicalJson(before) !== canonicalJson(after)) {
        fail('attested runner checkout changed during remote verification');
    }
}

// The caller must supply the already-loaded, structurally verified bundle manifest.
// Packet integration will bind that manifest to binding.manifest before invoking this API.
export function verifyRunnerCheckoutLocally(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
    executionRepoRoot: string;
}): void {
    assertLocalBinding(input.binding, input.bundleManifest, input.executionRepoRoot);
}

export function attestExecutingRunnerCheckout(): RunnerCheckoutAttestation {
    return attestRunnerCheckout(executingRunnerRepositoryRoot());
}

export function verifyExecutingRunnerPublication(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
    publicationRepoRoot: string;
}): void {
    const executionRoot = repositoryRoot(executingRunnerRepositoryRoot());
    const publicationRoot = repositoryRoot(input.publicationRepoRoot);
    if (executionRoot !== publicationRoot) {
        fail('runner publication repository is not the executing checkout');
    }
    verifyRunnerCheckoutPublication({
        ...input,
        executionRepoRoot: executionRoot,
        publicationRepoRoot: publicationRoot,
    });
}

export function verifyExecutingRunnerLocally(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
}): void {
    verifyRunnerCheckoutLocally({
        ...input,
        executionRepoRoot: executingRunnerRepositoryRoot(),
    });
}
