import { createPublicKey } from 'node:crypto';
import fs from 'node:fs';

import { verifyArtifactManifest } from './artifact_manifest.js';
import {
    ArtifactManifest,
    BlindMappingReveal,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    CouncilRatingPolicy,
    FrozenCouncilPacket,
    ManifestReference,
    RunnerPublicationBinding,
    TOKEN_PATH_QUARANTINE,
    assertCanonicalCouncil,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    assertTokenPath,
    canonicalJson,
    deterministicCouncilOrder,
    fail,
    readRegularFileNoFollow,
    resolveContained,
    sha256,
} from './contracts.js';
import { verifyRunnerPublicationCheckpointStructure } from './publication.js';
import { verifyExecutingRunnerLocally, verifyExecutingRunnerPublication } from './runner_identity.js';

function assertManifestReference(reference: ManifestReference, bundleRoot: string, label: string): ArtifactManifest {
    assertExactObjectKeys(reference, ['path', 'sha256'], label);
    assertSha256(reference?.sha256, `${label}.sha256`);
    const file = resolveContained(bundleRoot, reference.path, `${label}.path`);
    if (fs.realpathSync(file) !== file) fail(`${label} manifest path contains a symbolic link`);
    const content = readRegularFileNoFollow(file, `${label} manifest`);
    if (sha256(content) !== reference.sha256) fail(`${label} file hash mismatch`);
    let manifest: ArtifactManifest;
    try {
        manifest = JSON.parse(content.toString('utf8')) as ArtifactManifest;
    } catch (error) {
        fail(`${label} manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    verifyArtifactManifest(manifest, bundleRoot);
    return manifest;
}

function assertRunnerPublication(
    binding: RunnerPublicationBinding,
    manifest: ArtifactManifest,
): void {
    assertExactObjectKeys(binding, ['manifest', 'checkpoint'], 'runner_publication');
    verifyRunnerPublicationCheckpointStructure(binding.checkpoint);
    const localFiles = Object.fromEntries(
        manifest.entries.map((entry) => [entry.path, entry.sha256]),
    );
    if (canonicalJson(localFiles) !== canonicalJson(binding.checkpoint.required_files)) {
        fail('runner publication manifest path-to-digest identities do not match the published file set');
    }
}

export function assertBlindMappingReveal(value: unknown, label = 'blind_mapping'): asserts value is BlindMappingReveal {
    assertExactObjectKeys(value, ['A', 'B', 'nonce'], label);
    const mapping = value as Record<string, unknown>;
    if (mapping.A !== 'baseline' && mapping.A !== 'candidate') fail(`${label}.A is invalid`);
    if (mapping.B !== 'baseline' && mapping.B !== 'candidate') fail(`${label}.B is invalid`);
    if (mapping.A === mapping.B) fail(`${label} must map exactly one label to the candidate`);
    if (typeof mapping.nonce !== 'string' || mapping.nonce.length < 16 || mapping.nonce.length > 256) {
        fail(`${label}.nonce must contain 16 to 256 characters`);
    }
}

function assertExecutionAuthority(authority: FrozenCouncilPacket['execution_authority']): void {
    assertExactObjectKeys(authority, ['scheme', 'public_key_pem', 'key_id_sha256'], 'execution_authority');
    if (authority.scheme !== 'ed25519') fail('execution authority must use Ed25519');
    if (typeof authority.public_key_pem !== 'string' || authority.public_key_pem.length > 4096) {
        fail('execution authority public key is invalid');
    }
    assertSha256(authority.key_id_sha256, 'execution_authority.key_id_sha256');
    if (sha256(authority.public_key_pem) !== authority.key_id_sha256) fail('execution authority key id mismatch');
    try {
        if (createPublicKey(authority.public_key_pem).asymmetricKeyType !== 'ed25519') {
            fail('execution authority public key is not Ed25519');
        }
    } catch {
        fail('execution authority public key is invalid');
    }
}

function assertPublicationSubject(subject: FrozenCouncilPacket['publication_subject']): void {
    assertExactObjectKeys(subject, ['repository', 'branch', 'receipt_paths', 'required_paths'], 'publication_subject');
    if (typeof subject.repository !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(subject.repository)) {
        fail('publication repository must be a configured Git remote name');
    }
    if (typeof subject.branch !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(subject.branch)
        || subject.branch.includes('..')) fail('publication branch is invalid');
    assertExactObjectKeys(
        subject.receipt_paths,
        ['packet', 'ratings', 'mapping_reveal', 'decision'],
        'publication_subject.receipt_paths',
    );
    if (!Array.isArray(subject.required_paths)
        || subject.required_paths.length < 4
        || subject.required_paths.length > 256
        || new Set(subject.required_paths).size !== subject.required_paths.length) {
        fail('publication subject must preregister packet, ratings, reveal, and decision paths');
    }
    const receiptPaths = Object.values(subject.receipt_paths);
    if (new Set(receiptPaths).size !== receiptPaths.length
        || receiptPaths.some((file) => !subject.required_paths.includes(file))) {
        fail('publication receipt paths must be unique members of required_paths');
    }
    for (const file of [...subject.required_paths, ...receiptPaths]) {
        if (typeof file !== 'string' || !file || file.includes('\0') || file.includes('\\')
            || file.startsWith('/') || file.split('/').includes('..')) {
            fail(`publication path is invalid: ${String(file)}`);
        }
    }
}

const MAX_RATING_AXES = 64;
const RATING_AXIS_IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/;

function assertRatingAxisIdentifiers(value: unknown, label: string, maximum: number): asserts value is string[] {
    if (!Array.isArray(value)
        || value.length < 1
        || value.length > maximum
        || value.some((axis) => typeof axis !== 'string' || !RATING_AXIS_IDENTIFIER.test(axis))
        || new Set(value).size !== value.length) {
        fail(`${label} must contain one to ${maximum} unique lowercase identifiers of 1 to 64 characters`);
    }
}

function assertRatingPolicy(policy: CouncilRatingPolicy, councilSize: number): void {
    assertExactObjectKeys(policy, [
        'axes', 'protected_axes', 'rationale_minimum_characters',
        'minimum_effective_ratings', 'p0', 'p1', 'nominal_alpha', 'nominal_beta',
    ], 'rating_policy');
    assertRatingAxisIdentifiers(policy.axes, 'rating_policy.axes', MAX_RATING_AXES);
    assertRatingAxisIdentifiers(policy.protected_axes, 'rating_policy.protected_axes', MAX_RATING_AXES + 1);
    if (!policy.protected_axes.every((axis) => policy.axes.includes(axis) || axis === 'token_path_quarantine')) {
        fail('protected axes must be scored axes or token_path_quarantine');
    }
    if (!policy.protected_axes.includes('token_path_quarantine')) {
        fail('token_path_quarantine must always be protected');
    }
    if (!Number.isInteger(policy.minimum_effective_ratings)
        || policy.minimum_effective_ratings < 1
        || policy.minimum_effective_ratings > councilSize) {
        fail('minimum effective ratings is invalid');
    }
    if (!Number.isInteger(policy.rationale_minimum_characters)
        || policy.rationale_minimum_characters < 20
        || policy.rationale_minimum_characters > 2000) {
        fail('rationale minimum is invalid');
    }
    if (!(policy.p0 > 0 && policy.p0 < policy.p1 && policy.p1 < 1)) fail('rating policy requires 0 < p0 < p1 < 1');
    if (!(policy.nominal_alpha > 0 && policy.nominal_alpha < 1
        && policy.nominal_beta > 0 && policy.nominal_beta < 1)) {
        fail('nominal boundary parameters must be between zero and one');
    }
}

function packetDigest(packet: Omit<FrozenCouncilPacket, 'packet_sha256'>): string {
    return sha256(canonicalJson(packet));
}

export function freezeCouncilPacket(input: {
    runId: string;
    sourceHead: string;
    sourceManifestSha256: string;
    governedPaths: string[];
    contractSha256: string;
    councilOrder: string[];
    protocolManifest: ManifestReference;
    protocolPathByExpert: Record<string, string>;
    protocolSha256ByExpert: Record<string, string>;
    variants: { A: ManifestReference; B: ManifestReference };
    rubricManifest: ManifestReference;
    evidenceManifest: ManifestReference;
    runnerPublication: RunnerPublicationBinding;
    runnerExecutionRepoRoot: string;
    runnerPublicationRepoRoot: string;
    seed: string;
    blindMappingCommitmentSha256: string;
    executionAuthority: FrozenCouncilPacket['execution_authority'];
    ratingPolicy: CouncilRatingPolicy;
    publicationSubject: FrozenCouncilPacket['publication_subject'];
    bundleRoot: string;
}): FrozenCouncilPacket {
    assertRunId(input.runId);
    if (!/^[a-f0-9]{40}$/.test(input.sourceHead)) fail('source HEAD must be a full Git SHA');
    assertSha256(input.sourceManifestSha256, 'source_manifest_sha256');
    assertSha256(input.contractSha256, 'contract_sha256');
    assertSha256(input.blindMappingCommitmentSha256, 'blind_mapping_commitment_sha256');
    assertCanonicalCouncil(input.councilOrder);
    const governedPaths = [...new Set(input.governedPaths)].sort();
    if (governedPaths.length < 1 || governedPaths.length !== input.governedPaths.length) {
        fail('governed paths must be non-empty and unique');
    }
    assertRatingPolicy(input.ratingPolicy, input.councilOrder.length);
    const manifests = [
        ['protocol_manifest', input.protocolManifest],
        ['variants.A', input.variants.A],
        ['variants.B', input.variants.B],
        ['rubric_manifest', input.rubricManifest],
        ['evidence_manifest', input.evidenceManifest],
        ['runner_publication', input.runnerPublication.manifest],
    ] as const;
    const loaded = new Map(manifests.map(([label, reference]) => [
        label,
        assertManifestReference(reference, input.bundleRoot, label),
    ]));
    const protocolEntries = new Map((loaded.get('protocol_manifest')?.entries ?? []).map((entry) => [entry.path, entry]));
    assertRunnerPublication(input.runnerPublication, loaded.get('runner_publication')!);
    verifyExecutingRunnerPublication({
        binding: input.runnerPublication,
        bundleManifest: loaded.get('runner_publication')!,
        executionRepoRoot: input.runnerExecutionRepoRoot,
        publicationRepoRoot: input.runnerPublicationRepoRoot,
    });
    if (Object.keys(input.protocolSha256ByExpert).sort().join('\0') !== [...input.councilOrder].sort().join('\0')) {
        fail('protocol digest map must cover the exact Council');
    }
    if (Object.keys(input.protocolPathByExpert).sort().join('\0') !== [...input.councilOrder].sort().join('\0')) {
        fail('protocol path map must cover the exact Council');
    }
    const seenPaths = new Set<string>();
    for (const [expert, digest] of Object.entries(input.protocolSha256ByExpert)) {
        assertSha256(digest, `protocol_sha256_by_expert.${expert}`);
        const protocolPath = input.protocolPathByExpert[expert];
        if (typeof protocolPath !== 'string' || protocolEntries.get(protocolPath)?.sha256 !== digest) {
            fail(`${expert} protocol path/digest is absent from the protocol manifest`);
        }
        if (seenPaths.has(protocolPath)) fail('Council protocol paths must be unique');
        seenPaths.add(protocolPath);
    }
    if (new Set(Object.values(input.protocolSha256ByExpert)).size !== 19) {
        fail('Council autoresearch requires exactly 19 unique protocol digests');
    }
    if (seenPaths.size !== protocolEntries.size) fail('protocol manifest must contain exactly one file per expert');
    assertExecutionAuthority(input.executionAuthority);
    assertPublicationSubject(input.publicationSubject);
    const requiredPaths = input.publicationSubject.required_paths;
    const experimentSha256 = sha256(canonicalJson({
        source_head: input.sourceHead,
        source_manifest_sha256: input.sourceManifestSha256,
        contract_sha256: input.contractSha256,
        variants: [input.variants.A.sha256, input.variants.B.sha256].sort(),
        rubric_manifest: input.rubricManifest.sha256,
        evidence_manifest: input.evidenceManifest.sha256,
        runner_publication_manifest: input.runnerPublication.manifest.sha256,
        runner_publication_checkpoint: input.runnerPublication.checkpoint.checkpoint_sha256,
    }));
    const base: Omit<FrozenCouncilPacket, 'packet_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: input.runId,
        generation: 1,
        source_head: input.sourceHead,
        source_manifest_sha256: input.sourceManifestSha256,
        governed_paths: governedPaths,
        contract_sha256: input.contractSha256,
        experiment_sha256: experimentSha256,
        council_order: [...input.councilOrder],
        protocol_manifest: input.protocolManifest,
        protocol_path_by_expert: { ...input.protocolPathByExpert },
        protocol_sha256_by_expert: { ...input.protocolSha256ByExpert },
        variants: input.variants,
        rubric_manifest: input.rubricManifest,
        evidence_manifest: input.evidenceManifest,
        runner_publication: input.runnerPublication,
        seed: input.seed,
        derived_order: deterministicCouncilOrder(input.councilOrder, input.seed),
        blind_mapping_commitment_sha256: input.blindMappingCommitmentSha256,
        execution_authority: { ...input.executionAuthority },
        rating_policy: input.ratingPolicy,
        publication_subject: {
            ...input.publicationSubject,
            receipt_paths: { ...input.publicationSubject.receipt_paths },
            required_paths: [...requiredPaths].sort(),
        },
        token_path: TOKEN_PATH_QUARANTINE,
    };
    return { ...base, packet_sha256: packetDigest(base) };
}

export function verifyFrozenPacket(
    packet: FrozenCouncilPacket,
    bundleRoot: string,
    runnerExecutionRepoRoot?: string,
    runnerPublicationRepoRoot?: string,
): void {
    verifyFrozenPacketStructure(packet);
    const protocolManifest = assertManifestReference(packet.protocol_manifest, bundleRoot, 'protocol_manifest');
    const protocolEntries = new Map(protocolManifest.entries.map((entry) => [entry.path, entry]));
    for (const [expert, digest] of Object.entries(packet.protocol_sha256_by_expert)) {
        const protocolPath = packet.protocol_path_by_expert[expert];
        if (protocolEntries.get(protocolPath)?.sha256 !== digest) {
            fail(`${expert} protocol path/digest is absent from the protocol manifest`);
        }
    }
    if (protocolEntries.size !== packet.council_order.length) fail('protocol manifest contains unbound files');
    for (const [label, reference] of Object.entries({
        variant_A: packet.variants.A,
        variant_B: packet.variants.B,
        rubric_manifest: packet.rubric_manifest,
        evidence_manifest: packet.evidence_manifest,
        runner_publication: packet.runner_publication.manifest,
    })) assertManifestReference(reference, bundleRoot, label);
    const runnerManifest = assertManifestReference(
        packet.runner_publication.manifest,
        bundleRoot,
        'runner_publication',
    );
    assertRunnerPublication(packet.runner_publication, runnerManifest);
    if (runnerExecutionRepoRoot && runnerPublicationRepoRoot) {
        verifyExecutingRunnerPublication({
            binding: packet.runner_publication,
            bundleManifest: runnerManifest,
            executionRepoRoot: runnerExecutionRepoRoot,
            publicationRepoRoot: runnerPublicationRepoRoot,
        });
    } else if (runnerExecutionRepoRoot) {
        verifyExecutingRunnerLocally({
            binding: packet.runner_publication,
            bundleManifest: runnerManifest,
            executionRepoRoot: runnerExecutionRepoRoot,
        });
    } else if (runnerPublicationRepoRoot) {
        fail('remote runner refresh requires the executing checkout root');
    }
    const paths = Object.values({
        protocol_manifest: packet.protocol_manifest,
        variant_A: packet.variants.A,
        variant_B: packet.variants.B,
        rubric_manifest: packet.rubric_manifest,
        evidence_manifest: packet.evidence_manifest,
        runner_publication: packet.runner_publication.manifest,
    }).map(({ path: manifestPath }) => manifestPath);
    if (new Set(paths).size !== paths.length) fail('packet manifest paths must be unique');
    if (!fs.existsSync(bundleRoot)) fail('packet bundle root does not exist');
}

export function verifyFrozenPacketStructure(packet: FrozenCouncilPacket): void {
    assertExactObjectKeys(packet, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'source_head',
        'source_manifest_sha256', 'governed_paths', 'contract_sha256', 'experiment_sha256',
        'council_order', 'protocol_manifest', 'protocol_path_by_expert',
        'protocol_sha256_by_expert', 'variants', 'rubric_manifest', 'evidence_manifest',
        'runner_publication', 'seed', 'derived_order', 'blind_mapping_commitment_sha256',
        'execution_authority', 'rating_policy', 'publication_subject', 'token_path', 'packet_sha256',
    ], 'packet');
    if (packet.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || packet.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || packet.generation !== 1) fail('packet version or generation is invalid');
    assertRunId(packet.run_id);
    if (!/^[a-f0-9]{40}$/.test(packet.source_head)) fail('packet source HEAD is invalid');
    assertSha256(packet.source_manifest_sha256, 'source_manifest_sha256');
    assertSha256(packet.contract_sha256, 'contract_sha256');
    assertSha256(packet.experiment_sha256, 'experiment_sha256');
    assertTokenPath(packet.token_path);
    assertCanonicalCouncil(packet.council_order);
    if (!Array.isArray(packet.governed_paths) || packet.governed_paths.length < 1
        || packet.governed_paths.some((entry) => typeof entry !== 'string' || !entry)
        || new Set(packet.governed_paths).size !== packet.governed_paths.length
        || canonicalJson(packet.governed_paths) !== canonicalJson([...packet.governed_paths].sort())) {
        fail('packet governed paths are invalid');
    }
    const protocolExperts = Object.keys(packet.protocol_sha256_by_expert);
    if (canonicalJson(protocolExperts.sort()) !== canonicalJson([...packet.council_order].sort())) {
        fail('protocol digest map must cover the exact Council');
    }
    for (const [expert, digest] of Object.entries(packet.protocol_sha256_by_expert)) {
        assertSha256(digest, `protocol_sha256_by_expert.${expert}`);
    }
    if (new Set(Object.values(packet.protocol_sha256_by_expert)).size !== 19) {
        fail('packet must bind exactly 19 unique protocol digests');
    }
    const protocolPathExperts = Object.keys(packet.protocol_path_by_expert);
    if (canonicalJson(protocolPathExperts.sort()) !== canonicalJson([...packet.council_order].sort())) {
        fail('protocol path map must cover the exact Council');
    }
    const protocolPaths = Object.values(packet.protocol_path_by_expert);
    if (protocolPaths.some((entry) => typeof entry !== 'string' || !entry)
        || new Set(protocolPaths).size !== packet.council_order.length) {
        fail('packet must bind exactly 19 unique protocol paths');
    }
    assertSha256(packet.blind_mapping_commitment_sha256, 'blind_mapping_commitment_sha256');
    assertExecutionAuthority(packet.execution_authority);
    assertExactObjectKeys(packet.variants, ['A', 'B'], 'variants');
    if (typeof packet.seed !== 'string') fail('packet seed is invalid');
    const experimentSha256 = sha256(canonicalJson({
        source_head: packet.source_head,
        source_manifest_sha256: packet.source_manifest_sha256,
        contract_sha256: packet.contract_sha256,
        variants: [packet.variants.A.sha256, packet.variants.B.sha256].sort(),
        rubric_manifest: packet.rubric_manifest.sha256,
        evidence_manifest: packet.evidence_manifest.sha256,
        runner_publication_manifest: packet.runner_publication.manifest.sha256,
        runner_publication_checkpoint: packet.runner_publication.checkpoint.checkpoint_sha256,
    }));
    if (packet.experiment_sha256 !== experimentSha256) fail('packet experiment identity mismatch');
    assertPublicationSubject(packet.publication_subject);
    assertRatingPolicy(packet.rating_policy, packet.council_order.length);
    if (canonicalJson(packet.derived_order) !== canonicalJson(deterministicCouncilOrder(packet.council_order, packet.seed))) {
        fail('packet derived Council order mismatch');
    }
    const { packet_sha256: claimed, ...base } = packet;
    assertSha256(claimed, 'packet_sha256');
    if (packetDigest(base) !== claimed) fail('packet hash mismatch');
    for (const [label, reference] of Object.entries({
        protocol_manifest: packet.protocol_manifest,
        variant_A: packet.variants.A,
        variant_B: packet.variants.B,
        rubric_manifest: packet.rubric_manifest,
        evidence_manifest: packet.evidence_manifest,
        runner_publication: packet.runner_publication.manifest,
    })) {
        assertExactObjectKeys(reference, ['path', 'sha256'], label);
        if (typeof reference.path !== 'string' || !reference.path) fail(`${label}.path is invalid`);
        assertSha256(reference.sha256, `${label}.sha256`);
    }
    assertExactObjectKeys(packet.runner_publication, ['manifest', 'checkpoint'], 'runner_publication');
    verifyRunnerPublicationCheckpointStructure(packet.runner_publication.checkpoint);
}
