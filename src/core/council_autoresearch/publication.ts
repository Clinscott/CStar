import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    readRegularFileNoFollow,
    sha256,
} from './contracts.js';
import { runTrustedGit, runTrustedGitWithoutRepository } from './git_trust.js';
import { assertRepositoryObjectTopology } from './source_attestation.js';

export const REQUIRED_RUNNER_PUBLICATION_PATHS = Object.freeze([
    '.agents/AGENTS.feature',
    '.agents/plugins/marketplace.json',
    '.agents/skill_registry.json',
    '.agents/skills/council-autoresearch/PROVENANCE.md',
    '.agents/skills/council-autoresearch/SKILL.md',
    '.agents/skills/council-autoresearch/council-autoresearch.feature',
    'GEMINI.md',
    'distributions/README.md',
    'docs/architecture/SKILL_PERMUTATIONS.md',
    'docs/architecture/SKILL_REGISTRY.md',
    'docs/host-native-skill-bridge.md',
    'docs/integrations/cstar_capability_discovery_api.md',
    'docs/integrations/host_native_skill_contract.md',
    'docs/operations/council-autoresearch.md',
    'docs/terminal-skill-migration.md',
    'gemini-extension.json',
    'package-lock.json',
    'package.json',
    'plugins/corvus-star/.codex-plugin/plugin.json',
    'plugins/corvus-star/README.md',
    'plugins/corvus-star/lineage.json',
    'plugins/corvus-star/skills/corvus-star/SKILL.md',
    'scripts/audit_skill_registry.py',
    'scripts/run-tsx.mjs',
    'scripts/runtime-env.mjs',
    'src/core/council_autoresearch/artifact_manifest.ts',
    'src/core/council_autoresearch/contract_schema.ts',
    'src/core/council_autoresearch/contracts.ts',
    'src/core/council_autoresearch/coordinator.ts',
    'src/core/council_autoresearch/coordinator_state.ts',
    'src/core/council_autoresearch/decision.ts',
    'src/core/council_autoresearch/execution_trust.ts',
    'src/core/council_autoresearch/frozen_bundle.ts',
    'src/core/council_autoresearch/frozen_bundle_fs.ts',
    'src/core/council_autoresearch/git_trust.ts',
    'src/core/council_autoresearch/index.ts',
    'src/core/council_autoresearch/operation_identity.ts',
    'src/core/council_autoresearch/packet.ts',
    'src/core/council_autoresearch/publication.ts',
    'src/core/council_autoresearch/rating.ts',
    'src/core/council_autoresearch/receipt_seal.ts',
    'src/core/council_autoresearch/repository_lease.ts',
    'src/core/council_autoresearch/repository_lease_acquisition.ts',
    'src/core/council_autoresearch/repository_lease_acquisition_recovery.ts',
    'src/core/council_autoresearch/repository_lease_recovery_artifact.ts',
    'src/core/council_autoresearch/repository_lease_contract.ts',
    'src/core/council_autoresearch/repository_lease_recovery.ts',
    'src/core/council_autoresearch/repository_lease_state.ts',
    'src/core/council_autoresearch/repository_operation_file.ts',
    'src/core/council_autoresearch/repository_operation_guard.ts',
    'src/core/council_autoresearch/repository_private_file.ts',
    'src/core/council_autoresearch/runner_identity.ts',
    'src/core/council_autoresearch/source_attestation.ts',
    'src/core/skill_registry.ts',
    'src/packaging/distribution_content.ts',
    'src/packaging/distributions.ts',
    'src/tools/council-autoresearch-request.ts',
    'src/tools/council-autoresearch.ts',
    'tests/unit/council-autoresearch/test_adversarial.test.ts',
    'tests/unit/council-autoresearch/test_cli_schema.test.ts',
    'tests/unit/council-autoresearch/test_frozen_bundle.test.ts',
    'tests/unit/council-autoresearch/test_helpers.ts',
    'tests/unit/council-autoresearch/test_operation_identity.test.ts',
    'tests/unit/council-autoresearch/test_publication_entries.test.ts',
    'tests/unit/council-autoresearch/test_receipt_seal.test.ts',
    'tests/unit/council-autoresearch/test_repository_lease.test.ts',
    'tests/unit/council-autoresearch/test_repository_lease_acquisition_recovery.test.ts',
    'tests/unit/council-autoresearch/test_repository_lease_crash_safety.test.ts',
    'tests/unit/council-autoresearch/test_repository_lease_lifecycle_adversarial.test.ts',
    'tests/unit/council-autoresearch/test_repository_lease_lifecycle.test.ts',
    'tests/unit/council-autoresearch/test_resource_bounds.test.ts',
    'tests/unit/council-autoresearch/test_runner_checkpoint.test.ts',
    'tests/unit/council-autoresearch/test_runner_identity.test.ts',
    'tests/unit/council-autoresearch/test_runner.test.ts',
    'tests/unit/council-autoresearch/test_source_attestation.test.ts',
    'tests/unit/test_council_autoresearch_skill.test.ts',
    'tests/unit/test_current_documentation_contract.py',
    'tests/unit/test_skill_registry_audit.py',
    'tests/unit/test_skill_registry_shape.test.ts',
    'tests/unit/test_terminal_skill_policy.test.ts',
    'tsconfig.json',
] as const);

const PUBLICATION_MODULE_PATH = 'src/core/council_autoresearch/publication.ts';

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
    repository_url: string;
    branch: string;
    commit: string;
    required_files: Record<string, string>;
    verified_remote_ref: string;
    token_path: TokenPathQuarantine;
    publication_sha256: string;
}

function runGit(repoRoot: string, args: string[], encoding: BufferEncoding | 'buffer' = 'utf8'): string | Buffer {
    return runTrustedGit(repoRoot, args, {
        encoding,
        maxBuffer: 16 * 1024 * 1024,
        timeoutMs: 30_000,
    });
}

function assertRepositoryPath(file: string): void {
    const segments = file.split('/');
    if (!file || path.isAbsolute(file) || file.includes('\\') || file.includes('\0')
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        fail(`publication path escapes the repository: ${file}`);
    }
}

export function executingRunnerRepositoryRoot(): string {
    const moduleFile = fs.realpathSync(fileURLToPath(import.meta.url));
    const suffix = PUBLICATION_MODULE_PATH.split('/').join(path.sep);
    if (!moduleFile.endsWith(`${path.sep}${suffix}`)) {
        fail('runner publication verifier is not executing from the canonical source path');
    }
    const root = moduleFile.slice(0, -(suffix.length + 1));
    if (fs.realpathSync(path.join(root, suffix)) !== moduleFile) {
        fail('runner publication verifier source identity changed');
    }
    return root;
}

function executingRunnerFiles(): Array<[string, string]> {
    const root = executingRunnerRepositoryRoot();
    return REQUIRED_RUNNER_PUBLICATION_PATHS.map((file) => {
        const absolute = path.join(root, ...file.split('/'));
        const before = fs.lstatSync(absolute);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o111) !== 0) {
            fail(`executing runner source must be a single-link non-executable regular file: ${file}`);
        }
        if (fs.realpathSync(absolute) !== absolute) {
            fail(`executing runner source path contains a symbolic link: ${file}`);
        }
        const content = readRegularFileNoFollow(absolute, `executing runner source ${file}`);
        const after = fs.lstatSync(absolute);
        if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
            || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
            || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
            fail(`executing runner source changed while it was measured: ${file}`);
        }
        return [file, sha256(content)];
    });
}

function assertExactRunnerFiles(requiredFiles: Record<string, string>): Array<[string, string]> {
    if (!requiredFiles || typeof requiredFiles !== 'object' || Array.isArray(requiredFiles)) {
        fail('runner publication required_files must be an object');
    }
    const expected = executingRunnerFiles();
    const receivedPaths = Object.keys(requiredFiles).sort((left, right) => left.localeCompare(right));
    const expectedPaths = expected.map(([file]) => file).sort((left, right) => left.localeCompare(right));
    if (canonicalJson(receivedPaths) !== canonicalJson(expectedPaths)) {
        fail('runner publication must contain the exact canonical source path set');
    }
    for (const [file, digest] of expected) {
        assertSha256(requiredFiles[file], `runner_publication.required_files.${file}`);
        if (requiredFiles[file] !== digest) {
            fail(`runner publication does not match the executing source: ${file}`);
        }
    }
    return expected.sort(([left], [right]) => left.localeCompare(right));
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

interface CanonicalRemote {
    identity: string;
    transport: string;
}

function normalizedRemotePath(value: string): string {
    const normalized = path.posix.normalize(`/${value}`).replace(/\/+$/, '');
    if (normalized === '' || normalized === '/' || normalized.split('/').includes('..')) {
        fail('publication remote path is invalid');
    }
    return normalized;
}

function normalizedScpRemotePath(value: string): { path: string; absolute: boolean } {
    const absolute = value.startsWith('/');
    const normalized = path.posix.normalize(value).replace(/\/+$/, '');
    if (!normalized || normalized === '.' || normalized === '/'
        || normalized.split('/').includes('..')) {
        fail('publication SCP remote path is invalid');
    }
    return { path: normalized, absolute };
}

function githubRepositoryPath(remotePath: string): string | undefined {
    const normalized = normalizedRemotePath(remotePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length !== 2) return undefined;
    const repository = parts[1].endsWith('.git') ? parts[1].slice(0, -4) : parts[1];
    if (!parts[0] || !repository) return undefined;
    return `/${parts[0]}/${repository}.git`;
}

function canonicalNetworkRemote(raw: string): CanonicalRemote | undefined {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        let parsed: URL;
        try {
            parsed = new URL(raw);
        } catch {
            fail('publication remote URL cannot be parsed');
        }
        if (parsed.protocol === 'file:') return undefined;
        if (!['https:', 'ssh:'].includes(parsed.protocol)
            || parsed.password || parsed.search || parsed.hash || !parsed.hostname) {
            fail('publication remote URL scheme or credentials are unsupported');
        }
        if (parsed.protocol === 'https:' && parsed.username) {
            fail('publication HTTPS remote must not contain credentials');
        }
        const host = parsed.hostname.toLowerCase();
        const remotePath = normalizedRemotePath(parsed.pathname);
        if (host === 'github.com' && (!parsed.username || parsed.username === 'git')) {
            const repositoryPath = githubRepositoryPath(remotePath);
            if (repositoryPath) {
                const defaultPort = !parsed.port
                    || (parsed.protocol === 'https:' && parsed.port === '443')
                    || (parsed.protocol === 'ssh:' && parsed.port === '22');
                if (defaultPort) {
                    return { identity: `https://${host}${repositoryPath}`, transport: raw };
                }
            }
        }
        const port = parsed.port && !((parsed.protocol === 'https:' && parsed.port === '443')
            || (parsed.protocol === 'ssh:' && parsed.port === '22')) ? `:${parsed.port}` : '';
        const user = parsed.username ? `${parsed.username}@` : '';
        return { identity: `${parsed.protocol}//${user}${host}${port}${remotePath}`, transport: raw };
    }
    const scp = /^(?:([^@/:]+)@)?(\[[^\]]+\]|[^/:]+):(.+)$/.exec(raw);
    if (!scp) return undefined;
    const user = scp[1] ? `${scp[1]}@` : '';
    const host = scp[2].toLowerCase();
    const remotePath = normalizedScpRemotePath(scp[3]);
    if (!remotePath.absolute && host === 'github.com' && (!scp[1] || scp[1] === 'git')) {
        const repositoryPath = githubRepositoryPath(remotePath.path);
        if (repositoryPath) return { identity: `https://${host}${repositoryPath}`, transport: raw };
    }
    const scope = remotePath.absolute ? 'absolute' : 'home-relative';
    return {
        identity: `scp://${user}${host}/${scope}/${remotePath.path.replace(/^\/+/, '')}`,
        transport: raw,
    };
}

function canonicalRemote(raw: string, repoRoot: string): CanonicalRemote {
    if (!raw || /[\r\n\0]/.test(raw)) fail('publication remote URL is invalid');
    const network = canonicalNetworkRemote(raw);
    if (network) return network;
    let local: string;
    try {
        local = raw.startsWith('file:') ? fileURLToPath(new URL(raw)) : path.resolve(repoRoot, raw);
    } catch {
        fail('publication local remote cannot be parsed');
    }
    const identity = fs.realpathSync(local);
    return { identity, transport: identity };
}

export function canonicalizeGitRemoteUrl(raw: string, repoRoot: string): string {
    return canonicalRemote(raw, repoRoot).identity;
}

function configuredRemote(repoRoot: string, repository: string): CanonicalRemote {
    const output = String(runGit(repoRoot, ['remote', 'get-url', repository]));
    const raw = output.endsWith('\n') ? output.replace(/\r?\n$/, '') : output;
    return canonicalRemote(raw, repoRoot);
}

function assertRegularPublishedBlob(repoRoot: string, commit: string, file: string): string {
    const listing = runGit(repoRoot, [
        '--literal-pathspecs', 'ls-tree', '-z', '--full-tree', commit, '--', file,
    ], 'buffer') as Buffer;
    if (listing.length === 0 || listing[listing.length - 1] !== 0) {
        fail(`published path does not resolve exactly once: ${file}`);
    }
    const records = listing.subarray(0, listing.length - 1).toString('utf8').split('\0');
    if (records.length !== 1) fail(`published path does not resolve exactly once: ${file}`);
    const match = /^([0-7]{6}) ([a-z]+) ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(records[0]);
    if (!match || match[4] !== file) fail(`published path does not resolve exactly: ${file}`);
    if (match[1] !== '100644' || match[2] !== 'blob') {
        fail(`published path must be a regular 100644 blob: ${file}`);
    }
    return match[3];
}

function verifyRemoteFiles(input: {
    repoRoot: string;
    repository: string;
    expectedRepositoryUrl: string;
    branch: string;
    commit: string;
    requiredFiles: Record<string, string>;
}): { ref: string; repositoryUrl: string; files: Array<[string, string]> } {
    assertCoordinates(input.repository, input.branch, input.commit);
    const remote = configuredRemote(input.repoRoot, input.repository);
    const expected = canonicalizeGitRemoteUrl(input.expectedRepositoryUrl, input.repoRoot);
    if (remote.identity !== expected) fail('publication configured remote does not match the pinned URL');
    assertRepositoryObjectTopology(input.repoRoot);
    const files = Object.entries(input.requiredFiles).sort(([left], [right]) => left.localeCompare(right));
    if (files.length < 1 || files.length > 256) fail('publication requires one to 256 files');
    const ref = `refs/heads/${input.branch}`;
    const output = String(runTrustedGitWithoutRepository(
        ['ls-remote', '--refs', remote.transport, ref],
        { maxBuffer: 16 * 1024 * 1024, timeoutMs: 30_000 },
    )).trim();
    const lines = output ? output.split(/\r?\n/) : [];
    if (lines.length !== 1) fail('remote branch did not resolve uniquely');
    const resolved = lines[0].trim().split(/\s+/);
    if (resolved.length !== 2 || resolved[0] !== input.commit || resolved[1] !== ref) {
        fail('remote branch does not resolve to the required commit');
    }
    runGit(input.repoRoot, ['cat-file', '-e', `${input.commit}^{commit}`]);
    for (const [file, digest] of files) {
        assertRepositoryPath(file);
        assertSha256(digest, `required_files.${file}`);
        const oid = assertRegularPublishedBlob(input.repoRoot, input.commit, file);
        const content = runGit(input.repoRoot, ['cat-file', 'blob', oid], 'buffer') as Buffer;
        if (sha256(content) !== digest) fail(`published file hash mismatch: ${file}`);
    }
    assertRepositoryObjectTopology(input.repoRoot);
    return { ref, repositoryUrl: remote.identity, files };
}

export function verifyRunnerPublication(input: {
    repoRoot: string;
    repository: string;
    expectedRepositoryUrl: string;
    branch: string;
    commit: string;
    requiredFiles: Record<string, string>;
}): RunnerPublicationCheckpoint {
    const requiredFiles = Object.fromEntries(assertExactRunnerFiles(input.requiredFiles));
    const verified = verifyRemoteFiles({ ...input, requiredFiles });
    const base: Omit<RunnerPublicationCheckpoint, 'checkpoint_sha256'> = {
        repository: input.repository,
        repository_url: verified.repositoryUrl,
        branch: input.branch,
        commit: input.commit,
        required_files: Object.fromEntries(verified.files),
        verified_remote_ref: verified.ref,
    };
    return { ...base, checkpoint_sha256: checkpointDigest(base) };
}

export function verifyRunnerPublicationCheckpointStructure(checkpoint: RunnerPublicationCheckpoint): void {
    assertExactObjectKeys(checkpoint, [
        'repository', 'repository_url', 'branch', 'commit', 'required_files',
        'verified_remote_ref', 'checkpoint_sha256',
    ], 'runner publication checkpoint');
    assertCoordinates(checkpoint.repository, checkpoint.branch, checkpoint.commit);
    if (typeof checkpoint.repository_url !== 'string' || checkpoint.repository_url.length < 1) {
        fail('runner publication repository URL is invalid');
    }
    if (checkpoint.verified_remote_ref !== `refs/heads/${checkpoint.branch}`) {
        fail('runner publication ref is invalid');
    }
    assertExactRunnerFiles(checkpoint.required_files);
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
    expectedRepositoryUrl: string;
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
        repository_url: verified.repositoryUrl,
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
        'repository_url', 'branch', 'commit', 'required_files', 'verified_remote_ref', 'token_path',
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
    if (typeof receipt.repository_url !== 'string'
        || receipt.repository_url.length < 1
        || receipt.repository_url.length > 4096
        || /[\r\n\0]/.test(receipt.repository_url)) {
        fail('publication receipt repository URL is invalid');
    }
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
