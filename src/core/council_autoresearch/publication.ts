import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    RunnerPublicationCheckpoint,
    TOKEN_PATH_QUARANTINE,
    TokenPathQuarantine,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    assertTokenPath,
    canonicalJson,
    fail,
    sha256,
} from './contracts.js';

export interface PublicationReceipt {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    packet_sha256: string;
    ratings_sha256: string;
    mapping_reveal_sha256: string;
    decision_sha256: string;
    repository: string;
    remote_url_sha256: string;
    branch: string;
    commit: string;
    required_files: Record<string, string>;
    verified_remote_ref: string;
    token_path: TokenPathQuarantine;
    publication_sha256: string;
}

function runGit(repoRoot: string, args: string[], encoding: BufferEncoding | 'buffer' = 'utf8'): string | Buffer {
    const result = spawnSync('git', args, {
        cwd: repoRoot,
        encoding: encoding === 'buffer' ? null : encoding,
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) fail('Git publication verification failed');
    return result.stdout as string | Buffer;
}

function assertRepositoryPath(file: string): void {
    const segments = file.split('/');
    if (!file || path.isAbsolute(file) || file.includes('\\') || file.includes('\0')
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(`publication path escapes the repository: ${file}`);
    }
}

function publicationDigest(receipt: Omit<PublicationReceipt, 'publication_sha256'>): string {
    return sha256(canonicalJson(receipt));
}

function checkpointDigest(checkpoint: Omit<RunnerPublicationCheckpoint, 'checkpoint_sha256'>): string {
    return sha256(canonicalJson(checkpoint));
}

function assertCoordinates(repository: string, branch: string, commit: string): void {
    if (!/^[a-f0-9]{40}$/.test(commit)) fail('publication commit must be a full Git SHA');
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes('..')) {
        fail('publication branch is invalid');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(repository)) {
        fail('publication repository must be a configured Git remote name');
    }
}

function remoteUrlIdentity(repoRoot: string, repository: string): string {
    const raw = String(runGit(repoRoot, ['remote', 'get-url', repository])).trim();
    if (!raw || raw.includes('\n') || raw.includes('\0')) fail('publication remote URL is invalid');
    let normalized = raw;
    try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.hostname = parsed.hostname.toLowerCase();
        normalized = parsed.toString();
    } catch {
        // Git also accepts SCP-like and local-path remotes. Their exact configured
        // value is the repository identity and is hashed rather than disclosed.
    }
    return sha256(normalized);
}

function verifyRemoteFiles(input: {
    repoRoot: string;
    repository: string;
    branch: string;
    commit: string;
    requiredFiles: Record<string, string>;
}): { ref: string; files: Array<[string, string]>; remoteUrlSha256: string } {
    assertCoordinates(input.repository, input.branch, input.commit);
    const remoteUrlSha256 = remoteUrlIdentity(input.repoRoot, input.repository);
    const files = Object.entries(input.requiredFiles).sort(([left], [right]) => left.localeCompare(right));
    if (files.length < 1 || files.length > 256) fail('publication requires one to 256 files');
    const ref = `refs/heads/${input.branch}`;
    const output = String(runGit(input.repoRoot, ['ls-remote', '--refs', input.repository, ref])).trim();
    const lines = output ? output.split(/\r?\n/) : [];
    if (lines.length !== 1) fail('remote branch did not resolve uniquely');
    const remote = lines[0].trim().split(/\s+/);
    if (remote.length !== 2 || remote[0] !== input.commit || remote[1] !== ref) {
        fail('remote branch does not resolve to the required commit');
    }
    runGit(input.repoRoot, ['cat-file', '-e', `${input.commit}^{commit}`]);
    for (const [file, digest] of files) {
        assertRepositoryPath(file);
        assertSha256(digest, `required_files.${file}`);
        const content = runGit(input.repoRoot, ['show', `${input.commit}:${file}`], 'buffer') as Buffer;
        if (sha256(content) !== digest) fail(`published file hash mismatch: ${file}`);
    }
    return { ref, files, remoteUrlSha256 };
}

export function verifyRunnerPublication(input: {
    repoRoot: string;
    repository: string;
    branch: string;
    commit: string;
    requiredFiles: Record<string, string>;
}): RunnerPublicationCheckpoint {
    const verified = verifyRemoteFiles(input);
    const base: Omit<RunnerPublicationCheckpoint, 'checkpoint_sha256'> = {
        repository: input.repository,
        remote_url_sha256: verified.remoteUrlSha256,
        branch: input.branch,
        commit: input.commit,
        required_files: Object.fromEntries(verified.files),
        verified_remote_ref: verified.ref,
    };
    return { ...base, checkpoint_sha256: checkpointDigest(base) };
}

export function verifyRunnerPublicationCheckpointStructure(checkpoint: RunnerPublicationCheckpoint): void {
    assertExactObjectKeys(checkpoint, [
        'repository', 'remote_url_sha256', 'branch', 'commit', 'required_files',
        'verified_remote_ref', 'checkpoint_sha256',
    ], 'runner publication checkpoint');
    assertCoordinates(checkpoint.repository, checkpoint.branch, checkpoint.commit);
    assertSha256(checkpoint.remote_url_sha256, 'runner publication remote URL');
    if (checkpoint.verified_remote_ref !== `refs/heads/${checkpoint.branch}`) {
        fail('runner publication ref is invalid');
    }
    const files = Object.entries(checkpoint.required_files);
    if (files.length < 1 || files.length > 256) fail('runner publication requires one to 256 files');
    for (const [file, digest] of files) {
        assertRepositoryPath(file);
        assertSha256(digest, `runner_publication.required_files.${file}`);
    }
    const { checkpoint_sha256: claimed, ...base } = checkpoint;
    assertSha256(claimed, 'runner_publication.checkpoint_sha256');
    if (checkpointDigest(base) !== claimed) fail('runner publication checkpoint hash mismatch');
}

export function verifyPublication(input: {
    repoRoot: string;
    runId: string;
    packetSha256: string;
    ratingsSha256: string;
    mappingRevealSha256: string;
    decisionSha256: string;
    repository: string;
    branch: string;
    commit: string;
    requiredFiles: Record<string, string>;
}): PublicationReceipt {
    assertRunId(input.runId);
    assertSha256(input.packetSha256, 'packet_sha256');
    assertSha256(input.ratingsSha256, 'ratings_sha256');
    assertSha256(input.mappingRevealSha256, 'mapping_reveal_sha256');
    assertSha256(input.decisionSha256, 'decision_sha256');
    const verified = verifyRemoteFiles(input);
    const base: Omit<PublicationReceipt, 'publication_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: input.runId,
        generation: 1,
        packet_sha256: input.packetSha256,
        ratings_sha256: input.ratingsSha256,
        mapping_reveal_sha256: input.mappingRevealSha256,
        decision_sha256: input.decisionSha256,
        repository: input.repository,
        remote_url_sha256: verified.remoteUrlSha256,
        branch: input.branch,
        commit: input.commit,
        required_files: Object.fromEntries(verified.files),
        verified_remote_ref: verified.ref,
        token_path: TOKEN_PATH_QUARANTINE,
    };
    return { ...base, publication_sha256: publicationDigest(base) };
}

export function verifyPublicationReceiptStructure(receipt: PublicationReceipt): void {
    assertExactObjectKeys(receipt, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'packet_sha256',
        'ratings_sha256', 'mapping_reveal_sha256', 'decision_sha256', 'repository',
        'remote_url_sha256', 'branch', 'commit', 'required_files', 'verified_remote_ref', 'token_path',
        'publication_sha256',
    ], 'publication receipt');
    if (receipt.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || receipt.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || receipt.generation !== 1) fail('publication receipt version or generation is invalid');
    assertTokenPath(receipt.token_path, 'publication.token_path');
    assertRunId(receipt.run_id);
    for (const [label, digest] of Object.entries({
        packet_sha256: receipt.packet_sha256,
        ratings_sha256: receipt.ratings_sha256,
        mapping_reveal_sha256: receipt.mapping_reveal_sha256,
        decision_sha256: receipt.decision_sha256,
        publication_sha256: receipt.publication_sha256,
    })) assertSha256(digest, label);
    assertCoordinates(receipt.repository, receipt.branch, receipt.commit);
    assertSha256(receipt.remote_url_sha256, 'publication remote URL');
    if (receipt.verified_remote_ref !== `refs/heads/${receipt.branch}`) fail('publication ref is invalid');
    const files = Object.entries(receipt.required_files);
    if (files.length < 1 || files.length > 256) fail('publication receipt requires one to 256 files');
    for (const [file, digest] of files) {
        assertRepositoryPath(file);
        assertSha256(digest, `required_files.${file}`);
    }
    const { publication_sha256: claimed, ...base } = receipt;
    if (publicationDigest(base) !== claimed) fail('publication receipt hash mismatch');
}
