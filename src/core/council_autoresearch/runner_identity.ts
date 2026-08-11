import fs from 'node:fs';

import {
    ArtifactManifest,
    RunnerPublicationBinding,
    canonicalJson,
    fail,
} from './contracts.js';
import { verifyRunnerPublication } from './publication.js';
import { assertSourceClean, attestSource, repositoryRoot } from './source_attestation.js';

export const COUNCIL_AUTORESEARCH_PUBLICATION_PATHS = Object.freeze([
    '.agents/skills/council-autoresearch/PROVENANCE.md',
    '.agents/skills/council-autoresearch/SKILL.md',
    '.agents/skills/council-autoresearch/council-autoresearch.feature',
    'docs/operations/council-autoresearch.md',
    'package-lock.json',
    'package.json',
    'scripts/run-tsx.mjs',
    'scripts/runtime-env.mjs',
    'src/core/council_autoresearch/artifact_manifest.ts',
    'src/core/council_autoresearch/contracts.ts',
    'src/core/council_autoresearch/coordinator.ts',
    'src/core/council_autoresearch/frozen_bundle.ts',
    'src/core/council_autoresearch/index.ts',
    'src/core/council_autoresearch/packet.ts',
    'src/core/council_autoresearch/publication.ts',
    'src/core/council_autoresearch/rating.ts',
    'src/core/council_autoresearch/receipt_seal.ts',
    'src/core/council_autoresearch/repository_lease.ts',
    'src/core/council_autoresearch/repository_lease_contract.ts',
    'src/core/council_autoresearch/runner_identity.ts',
    'src/core/council_autoresearch/source_attestation.ts',
    'src/tools/council-autoresearch.ts',
    'tsconfig.json',
] as const);

function manifestFiles(manifest: ArtifactManifest): Record<string, string> {
    return Object.fromEntries(manifest.entries.map((entry) => [entry.path, entry.sha256]));
}

export function attestRunnerCheckout(repoRootInput: string): {
    root: string;
    head: string;
    requiredFiles: Record<string, string>;
} {
    const root = repositoryRoot(repoRootInput);
    assertSourceClean(root);
    const attestation = attestSource(root, [...COUNCIL_AUTORESEARCH_PUBLICATION_PATHS], 'runner-publication');
    assertSourceClean(root);
    const paths = attestation.manifest.entries.map((entry) => entry.path);
    if (canonicalJson(paths) !== canonicalJson([...COUNCIL_AUTORESEARCH_PUBLICATION_PATHS].sort())) {
        fail('executing runner publication file set is incomplete');
    }
    return { root, head: attestation.head, requiredFiles: manifestFiles(attestation.manifest) };
}

function assertLocalBinding(
    binding: RunnerPublicationBinding,
    bundleManifest: ArtifactManifest,
    repoRoot: string,
): ReturnType<typeof attestRunnerCheckout> {
    const local = attestRunnerCheckout(repoRoot);
    const bundled = manifestFiles(bundleManifest);
    if (binding.checkpoint.commit !== local.head
        || canonicalJson(binding.checkpoint.required_files) !== canonicalJson(local.requiredFiles)
        || canonicalJson(bundled) !== canonicalJson(local.requiredFiles)) {
        fail('published runner checkpoint does not bind the executing checkout');
    }
    return local;
}

export function verifyExecutingRunnerPublication(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
    executionRepoRoot: string;
    publicationRepoRoot: string;
}): void {
    const executionRoot = fs.realpathSync(input.executionRepoRoot);
    if (executionRoot !== fs.realpathSync(input.publicationRepoRoot)) {
        fail('runner publication repository is not the executing checkout');
    }
    const before = assertLocalBinding(input.binding, input.bundleManifest, executionRoot);
    const verified = verifyRunnerPublication({
        repoRoot: before.root,
        repository: input.binding.checkpoint.repository,
        branch: input.binding.checkpoint.branch,
        commit: input.binding.checkpoint.commit,
        requiredFiles: input.binding.checkpoint.required_files,
    });
    if (canonicalJson(verified) !== canonicalJson(input.binding.checkpoint)) {
        fail('runner publication remote verification changed');
    }
    const after = assertLocalBinding(input.binding, input.bundleManifest, executionRoot);
    if (canonicalJson(before) !== canonicalJson(after)) fail('executing runner changed during remote verification');
}

export function verifyExecutingRunnerLocally(input: {
    binding: RunnerPublicationBinding;
    bundleManifest: ArtifactManifest;
    executionRepoRoot: string;
}): void {
    assertLocalBinding(input.binding, input.bundleManifest, input.executionRepoRoot);
}
