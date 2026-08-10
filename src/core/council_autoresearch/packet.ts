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
import {
    REQUIRED_RUNNER_PUBLICATION_PATHS,
    verifyRunnerPublication,
    verifyRunnerPublicationCheckpointStructure,
} from './publication.js';

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
    publicationRepoRoot: string,
): void {
    assertExactObjectKeys(binding, ['manifest', 'checkpoint'], 'runner_publication');
    verifyRunnerPublicationCheckpointStructure(binding.checkpoint);
    const verified = verifyRunnerPublication({
        repoRoot: publicationRepoRoot,
        repository: binding.checkpoint.repository,
        expectedRepositoryUrl: binding.checkpoint.repository_url,
        branch: binding.checkpoint.branch,
        commit: binding.checkpoint.commit,
        requiredFiles: binding.checkpoint.required_files,
    });
    if (canonicalJson(verified) !== canonicalJson(binding.checkpoint)) {
        fail('runner publication remote verification changed');
    }
    const expectedPaths = [...REQUIRED_RUNNER_PUBLICATION_PATHS]
        .sort((left, right) => left.localeCompare(right));
    const includedPaths = [...manifest.included_paths]
        .sort((left, right) => left.localeCompare(right));
    if (canonicalJson(includedPaths) !== canonicalJson(expectedPaths)) {
        fail('runner publication manifest must include the exact canonical source paths');
    }
    const localFiles = Object.fromEntries(manifest.entries.map((entry) => [
        entry.path,
        { sha256: entry.sha256, mode: entry.mode },
    ]));
    const publishedFiles = Object.fromEntries(Object.entries(binding.checkpoint.required_files).map(
        ([file, digest]) => [file, { sha256: digest, mode: 0o644 }],
    ));
    if (canonicalJson(localFiles) !== canonicalJson(publishedFiles)) {
        fail('runner publication manifest does not mirror the exact published path/digest/mode map');
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
    assertExactObjectKeys(
        subject,
        ['repository', 'repository_url', 'branch', 'required_paths', 'receipt_paths'],
        'publication_subject',
    );
    if (typeof subject.repository !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(subject.repository)) {
        fail('publication repository must be a configured Git remote name');
    }
    if (typeof subject.repository_url !== 'string'
        || subject.repository_url.length < 1
        || subject.repository_url.length > 4096
        || /[\r\n\0]/.test(subject.repository_url)) {
        fail('publication repository URL is invalid');
    }
    if (typeof subject.branch !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(subject.branch)
        || subject.branch.includes('..')) fail('publication branch is invalid');
    if (!Array.isArray(subject.required_paths)
        || subject.required_paths.length < 4
        || subject.required_paths.length > 256
        || new Set(subject.required_paths).size !== subject.required_paths.length) {
        fail('publication subject must preregister packet, ratings, reveal, and decision paths');
    }
    for (const file of subject.required_paths) {
        if (typeof file !== 'string' || !file || file.includes('\0') || file.includes('\\')
            || file.startsWith('/') || file.split('/').includes('..')) {
            fail(`publication path is invalid: ${String(file)}`);
        }
    }
    assertExactObjectKeys(subject.receipt_paths, ['packet', 'ratings', 'reveal', 'decision'], 'receipt_paths');
    const receiptPaths = Object.values(subject.receipt_paths);
    if (new Set(receiptPaths).size !== 4
        || receiptPaths.some((file) => !subject.required_paths.includes(file))) {
        fail('publication receipt paths must be four unique required paths');
    }
}

function assertRatingPolicy(policy: CouncilRatingPolicy, councilSize: number): void {
    assertExactObjectKeys(policy, [
        'axes', 'protected_axes', 'rationale_minimum_characters',
        'minimum_effective_ratings', 'p0', 'p1', 'nominal_alpha', 'nominal_beta',
    ], 'rating_policy');
    const validAxis = (axis: unknown): axis is string => typeof axis === 'string'
        && /^[a-z][a-z0-9._-]{0,63}$/.test(axis);
    if (!Array.isArray(policy.axes) || policy.axes.length < 1
        || policy.axes.some((axis) => !validAxis(axis))
        || new Set(policy.axes).size !== policy.axes.length) {
        fail('rating axes must be a non-empty unique array');
    }
    if (!Array.isArray(policy.protected_axes) || policy.protected_axes.length < 1
        || policy.protected_axes.some((axis) => !validAxis(axis))
        || new Set(policy.protected_axes).size !== policy.protected_axes.length) {
        fail('protected axes must be a non-empty array');
    }
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
    const probabilities = [policy.p0, policy.p1, policy.nominal_alpha, policy.nominal_beta];
    if (probabilities.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        fail('rating policy probabilities must be finite numbers');
    }
    if (!(policy.p0 > 0 && policy.p0 < policy.p1 && policy.p1 < 1)) fail('rating policy requires 0 < p0 < p1 < 1');
    if (!(policy.nominal_alpha > 0 && policy.nominal_alpha < 1
        && policy.nominal_beta > 0 && policy.nominal_beta < 1)) {
        fail('nominal boundary parameters must be between zero and one');
    }
    if (policy.nominal_alpha + policy.nominal_beta >= 1) {
        fail('nominal alpha plus beta must be less than one');
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
    contractManifest: ManifestReference;
    councilOrder: string[];
    protocolManifest: ManifestReference;
    protocolPathByExpert: Record<string, string>;
    protocolSha256ByExpert: Record<string, string>;
    variants: { A: ManifestReference; B: ManifestReference };
    rubricManifest: ManifestReference;
    evidenceManifest: ManifestReference;
    runnerPublication: RunnerPublicationBinding;
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
    assertSha256(input.blindMappingCommitmentSha256, 'blind_mapping_commitment_sha256');
    assertCanonicalCouncil(input.councilOrder);
    const governedPaths = [...new Set(input.governedPaths)].sort();
    if (governedPaths.length < 1 || governedPaths.length !== input.governedPaths.length) {
        fail('governed paths must be non-empty and unique');
    }
    assertRatingPolicy(input.ratingPolicy, input.councilOrder.length);
    const manifests = [
        ['protocol_manifest', input.protocolManifest],
        ['contract_manifest', input.contractManifest],
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
    assertRunnerPublication(
        input.runnerPublication,
        loaded.get('runner_publication')!,
        input.runnerPublicationRepoRoot,
    );
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
        contract_manifest: input.contractManifest.sha256,
        variants: [input.variants.A.sha256, input.variants.B.sha256].sort(),
        rubric_manifest: input.rubricManifest.sha256,
        evidence_manifest: input.evidenceManifest.sha256,
    }));
    const base: Omit<FrozenCouncilPacket, 'packet_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: input.runId,
        generation: 1,
        source_head: input.sourceHead,
        source_manifest_sha256: input.sourceManifestSha256,
        governed_paths: governedPaths,
        contract_manifest: input.contractManifest,
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
            required_paths: [...requiredPaths].sort(),
            receipt_paths: { ...input.publicationSubject.receipt_paths },
        },
        token_path: TOKEN_PATH_QUARANTINE,
    };
    return { ...base, packet_sha256: packetDigest(base) };
}

export function verifyFrozenPacket(
    packet: FrozenCouncilPacket,
    bundleRoot: string,
    runnerPublicationRepoRoot: string,
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
        contract_manifest: packet.contract_manifest,
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
    assertRunnerPublication(packet.runner_publication, runnerManifest, runnerPublicationRepoRoot);
    const paths = Object.values({
        protocol_manifest: packet.protocol_manifest,
        contract_manifest: packet.contract_manifest,
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
        'source_manifest_sha256', 'governed_paths', 'contract_manifest', 'experiment_sha256',
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
        contract_manifest: packet.contract_manifest.sha256,
        variants: [packet.variants.A.sha256, packet.variants.B.sha256].sort(),
        rubric_manifest: packet.rubric_manifest.sha256,
        evidence_manifest: packet.evidence_manifest.sha256,
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
        contract_manifest: packet.contract_manifest,
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
