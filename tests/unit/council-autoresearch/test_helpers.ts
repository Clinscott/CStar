import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    CANONICAL_COUNCIL,
    CouncilExecutionReceipt,
    CouncilPreference,
    CouncilRating,
    FrozenCouncilPacket,
    FrozenRatingRecord,
    REQUIRED_RUNNER_PUBLICATION_PATHS,
    buildArtifactManifest,
    canonicalJson,
    councilExecutionInputBinding,
    freezeCouncilPacket,
    freezeCouncilRatings,
    freezeExecutionTrustPolicy,
    sha256,
    sha256File,
    verifyRunnerPublication,
} from '../../../src/core/council_autoresearch/index.js';

export const roots: string[] = [];
export const experts = [...CANONICAL_COUNCIL];
export const runnerSourceRoot = fs.realpathSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..',
));

export function cleanup(): void {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
}

export function temporary(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
    roots.push(root);
    return root;
}

export function git(root: string, args: string[]): string {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

export function repository(): string {
    const root = temporary('cstar-council-source-');
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.email', 'council@example.test']);
    git(root, ['config', 'user.name', 'Council Test']);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'site.txt'), 'stable source\n');
    git(root, ['add', 'src/site.txt']);
    git(root, ['commit', '-m', 'fixture']);
    return root;
}

export function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function manifestReference(bundle: string, name: string, includedPaths: string[]) {
    const manifest = buildArtifactManifest({ root: bundle, rootLabel: name, includedPaths });
    const relative = `manifests/${name}.json`;
    writeJson(path.join(bundle, relative), manifest);
    return { path: relative, sha256: sha256File(path.join(bundle, relative)) };
}

export function bundleFixture(): {
    bundle: string;
    publicationRemote: string;
    mapping: { A: 'baseline'; B: 'candidate'; nonce: string };
    privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
    packetInput: Parameters<typeof freezeCouncilPacket>[0];
    runnerCommit: string;
    runnerRequiredFiles: Record<string, string>;
    trustPolicy: ReturnType<typeof freezeExecutionTrustPolicy>;
} {
    const bundle = temporary('cstar-council-bundle-');
    for (const [directory, content] of [
        ['contract', 'frozen experiment contract\n'],
        ['variant-a', 'baseline\n'],
        ['variant-b', 'candidate\n'],
        ['rubric', 'bounded rubric\n'],
        ['evidence', 'frozen evidence\n'],
    ]) {
        fs.mkdirSync(path.join(bundle, directory));
        fs.writeFileSync(path.join(bundle, directory, 'content.txt'), content);
    }
    fs.mkdirSync(path.join(bundle, 'protocols'));
    const protocolPathByExpert: Record<string, string> = {};
    const protocolSha256ByExpert: Record<string, string> = {};
    for (const expert of experts) {
        const relative = `protocols/${expert}.txt`;
        const file = path.join(bundle, relative);
        fs.writeFileSync(file, `${expert} protocol\n`);
        protocolPathByExpert[expert] = relative;
        protocolSha256ByExpert[expert] = sha256File(file);
    }
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const mapping = { A: 'baseline', B: 'candidate', nonce: '0123456789abcdef0123456789abcdef' } as const;
    for (const runnerPath of REQUIRED_RUNNER_PUBLICATION_PATHS) {
        const target = path.join(bundle, runnerPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(runnerSourceRoot, runnerPath), target);
        fs.chmodSync(target, 0o644);
    }
    const runnerRepo = temporary('cstar-council-runner-publication-');
    const runnerBare = temporary('cstar-council-runner-remote-');
    git(runnerBare, ['init', '--bare']);
    git(runnerRepo, ['init', '-b', 'main']);
    git(runnerRepo, ['config', 'user.email', 'council@example.test']);
    git(runnerRepo, ['config', 'user.name', 'Council Test']);
    for (const runnerPath of REQUIRED_RUNNER_PUBLICATION_PATHS) {
        const target = path.join(runnerRepo, runnerPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(runnerSourceRoot, runnerPath), target);
        fs.chmodSync(target, 0o644);
    }
    git(runnerRepo, ['add', ...REQUIRED_RUNNER_PUBLICATION_PATHS]);
    git(runnerRepo, ['commit', '-m', 'publish runner fixture']);
    git(runnerRepo, ['remote', 'add', 'origin', runnerBare]);
    git(runnerRepo, ['push', '-u', 'origin', 'main']);
    const runnerCommit = git(runnerRepo, ['rev-parse', 'HEAD']);
    const runnerRequiredFiles = Object.fromEntries(REQUIRED_RUNNER_PUBLICATION_PATHS.map((runnerPath) => [
        runnerPath,
        sha256File(path.join(runnerRepo, runnerPath)),
    ]));
    const runnerCheckpoint = verifyRunnerPublication({
        repoRoot: runnerRepo,
        repository: 'origin',
        expectedRepositoryUrl: path.resolve(runnerBare),
        branch: 'main',
        commit: runnerCommit,
        requiredFiles: runnerRequiredFiles,
    });
    const publicationRemote = temporary('cstar-council-result-remote-');
    git(publicationRemote, ['init', '--bare']);
    const packetInput: Parameters<typeof freezeCouncilPacket>[0] = {
        runId: 'council-test-run-1',
        sourceHead: 'a'.repeat(40),
        sourceManifestSha256: 'c'.repeat(64),
        governedPaths: ['src'],
        contractManifest: manifestReference(bundle, 'contract', ['contract']),
        councilOrder: experts,
        protocolManifest: manifestReference(bundle, 'protocols', ['protocols']),
        protocolPathByExpert,
        protocolSha256ByExpert,
        variants: {
            A: manifestReference(bundle, 'variant-a', ['variant-a']),
            B: manifestReference(bundle, 'variant-b', ['variant-b']),
        },
        rubricManifest: manifestReference(bundle, 'rubric', ['rubric']),
        evidenceManifest: manifestReference(bundle, 'evidence', ['evidence']),
        runnerPublication: {
            manifest: manifestReference(
                bundle,
                'runner-publication',
                [...REQUIRED_RUNNER_PUBLICATION_PATHS],
            ),
            checkpoint: runnerCheckpoint,
        },
        runnerPublicationRepoRoot: runnerRepo,
        seed: 'council-test-seed-2026',
        blindMappingCommitmentSha256: sha256(canonicalJson(mapping)),
        executionAuthority: {
            scheme: 'ed25519',
            public_key_pem: publicKeyPem,
            key_id_sha256: sha256(publicKeyPem),
        },
        ratingPolicy: {
            axes: ['truth_provenance', 'accessibility', 'privacy', 'maintainability'],
            protected_axes: ['truth_provenance', 'accessibility', 'privacy', 'token_path_quarantine'],
            rationale_minimum_characters: 20,
            minimum_effective_ratings: 13,
            p0: 0.5,
            p1: 0.7,
            nominal_alpha: 0.05,
            nominal_beta: 0.05,
        },
        publicationSubject: {
            repository: 'origin',
            repository_url: path.resolve(publicationRemote),
            branch: 'main',
            required_paths: [
                'results/packet.json', 'results/ratings.json',
                'results/mapping-reveal.json', 'results/decision.json',
            ],
            receipt_paths: {
                packet: 'results/packet.json',
                ratings: 'results/ratings.json',
                reveal: 'results/mapping-reveal.json',
                decision: 'results/decision.json',
            },
        },
        bundleRoot: bundle,
    };
    const trustPolicy = freezeExecutionTrustPolicy({
        execution_authority: packetInput.executionAuthority,
        receipt_issuer: 'cstar-host-invocation-bridge-v1',
        enforced_input_channels: [
            'packet', 'protocol', 'variant_a', 'variant_b', 'rubric', 'evidence', 'quarantine_policy',
        ],
        token_path_runtime_access: 'forbidden',
        runner_repository_url: runnerCheckpoint.repository_url,
        runner_branch: runnerCheckpoint.branch,
        runner_commit: runnerCheckpoint.commit,
        runner_checkpoint_sha256: runnerCheckpoint.checkpoint_sha256,
    });
    return {
        bundle,
        publicationRemote,
        mapping,
        privateKey,
        packetInput,
        runnerCommit,
        runnerRequiredFiles,
        trustPolicy,
    };
}

function score(preference: CouncilPreference): { A: number; B: number } {
    if (preference === 'A') return { A: 4, B: 3 };
    if (preference === 'B') return { A: 3, B: 4 };
    return { A: 3, B: 3 };
}

export function signedRatings(
    packet: FrozenCouncilPacket,
    bundle: string,
    privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
    preference: CouncilPreference | ((expert: string) => CouncilPreference),
    mutate?: (rating: CouncilRating) => void,
) {
    const records: FrozenRatingRecord[] = experts.map((expert, index) => {
        const selected = typeof preference === 'function' ? preference(expert) : preference;
        const rating: CouncilRating = {
            expert,
            preference: selected,
            rationale: `${expert} compared the frozen anonymous variants against the complete rubric.`,
            axis_scores: Object.fromEntries(packet.rating_policy.axes.map((axis) => [axis, score(selected)])),
            protected_axis_regressions: Object.fromEntries(
                packet.rating_policy.protected_axes.map((axis) => [axis, false]),
            ),
        };
        mutate?.(rating);
        const outputPath = `ratings/${expert}.json`;
        writeJson(path.join(bundle, outputPath), rating);
        const unsigned: Omit<CouncilExecutionReceipt, 'signature_base64'> = {
            schema_version: '2.1.0',
            runner_version: '2.1.0',
            run_id: packet.run_id,
            generation: 1,
            expert,
            packet_sha256: packet.packet_sha256,
            protocol_path: packet.protocol_path_by_expert[expert],
            protocol_sha256: packet.protocol_sha256_by_expert[expert],
            input_binding_sha256: councilExecutionInputBinding(packet, expert),
            rating_sha256: sha256(canonicalJson(rating)),
            output_path: outputPath,
            output_sha256: sha256File(path.join(bundle, outputPath)),
            invocation_id: `host-invocation-${index.toString().padStart(2, '0')}-${expert}`,
            issuer: 'cstar-host-invocation-bridge-v1',
            completion_status: 'completed',
            authority_key_id_sha256: packet.execution_authority.key_id_sha256,
            channel_attestation: {
                input_channels: [
                    'packet', 'protocol', 'variant_a', 'variant_b', 'rubric', 'evidence',
                    'quarantine_policy',
                ],
                token_path_read: false,
                token_path_written: false,
                observation_writes: false,
                independent_promotion_receipt_required: true,
            },
        };
        return {
            rating,
            execution_receipt: {
                ...unsigned,
                signature_base64: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString('base64'),
            },
        };
    });
    return freezeCouncilRatings({ run_id: packet.run_id, packet_sha256: packet.packet_sha256, ratings: records });
}

export function resignRecord(
    record: FrozenRatingRecord,
    privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
): void {
    const { signature_base64: _signature, ...unsigned } = record.execution_receipt;
    record.execution_receipt.signature_base64 = sign(
        null,
        Buffer.from(canonicalJson(unsigned)),
        privateKey,
    ).toString('base64');
}

export function provisionTrustPolicy(
    controlRoot: string,
    fixture: ReturnType<typeof bundleFixture>,
): void {
    const directory = path.join(controlRoot, 'council-autoresearch');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const file = path.join(directory, 'trust-policy.json');
    writeJson(file, fixture.trustPolicy);
    fs.chmodSync(file, 0o600);
}
