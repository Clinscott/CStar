#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    COUNCIL_EXECUTION_INPUT_CHANNELS,
    BlindMappingReveal, CouncilExecutionReceipt, CouncilRating, CouncilRatingPolicy,
    FrozenCouncilPacket, FrozenRatingRecord, ManifestReference, RunnerPublicationBinding,
    RunnerPublicationCheckpoint,
    acquireRepositoryLease,
    assertCouncilRuntimePlatform,
    assertExactObjectKeys,
    councilRunStatus,
    fail,
    freezeCouncilPacket,
    freezeCouncilRatings,
    loadExecutionTrustPolicy,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    preregisteredPublicationSubject,
    readJson,
    releaseRepositoryLease,
    verifyPublication,
    verifyRunnerPublication,
} from '../core/council_autoresearch/index.js';
type Request = Record<string, unknown>;
function isRequest(value: unknown): value is Request { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
const requestSchemas: Record<string, { required: string[]; optional?: string[] }> = {
    'lease-acquire': { required: ['repo_root', 'run_id', 'governed_paths'], optional: ['control_root'] },
    'lease-release': { required: ['repo_root', 'run_id', 'resume_token'], optional: ['control_root'] },
    'verify-runner-checkpoint': { required: ['runner_publication', 'runner_publication_repo_root'] },
    status: {
        required: ['run_id'],
        optional: ['control_root', 'bundle_root', 'runner_publication_repo_root', 'publication_repo_root'],
    },
    'freeze-packet': {
        required: ['repo_root', 'run_id', 'resume_token', 'bundle_root', 'runner_publication_repo_root', 'packet'],
        optional: ['control_root'],
    },
    'freeze-ratings': {
        required: ['repo_root', 'run_id', 'resume_token', 'bundle_root', 'runner_publication_repo_root', 'ratings'],
        optional: ['control_root'],
    },
    'reveal-mapping': {
        required: ['repo_root', 'run_id', 'resume_token', 'bundle_root', 'runner_publication_repo_root', 'reveal'],
        optional: ['control_root'],
    },
    evaluate: {
        required: ['repo_root', 'run_id', 'resume_token', 'bundle_root', 'runner_publication_repo_root'],
        optional: ['control_root'],
    },
    'verify-publication': {
        required: [
            'repo_root', 'run_id', 'resume_token', 'bundle_root', 'runner_publication_repo_root',
            'publication_repo_root', 'publication',
        ],
        optional: ['control_root'],
    },
};
function objectValue(value: unknown, label: string): Request {
    if (!isRequest(value)) fail(`${label} must be an object`); return value;
}
function exactObject(value: unknown, keys: readonly string[], label: string): Request {
    const result = objectValue(value, label);
    assertExactObjectKeys(result, keys, label);
    return result;
}
function stringField(value: Request, key: string, label = key): string {
    const result = value[key];
    if (typeof result !== 'string' || result.length === 0) fail(`${label} must be a non-empty string`);
    return result;
}
function optionalString(value: Request, key: string): string | undefined { return value[key] === undefined ? undefined : stringField(value, key); }
function numberField(value: Request, key: string, label = key): number {
    const result = value[key];
    if (typeof result !== 'number' || !Number.isFinite(result)) fail(`${label} must be a finite number`);
    return result;
}
function integerField(value: Request, key: string, label = key): number {
    const result = numberField(value, key, label);
    if (!Number.isInteger(result)) fail(`${label} must be an integer`);
    return result;
}
function booleanField(value: Request, key: string, label = key): boolean {
    const result = value[key];
    if (typeof result !== 'boolean') fail(`${label} must be a boolean`);
    return result;
}
function stringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        fail(`${label} must be a string array`);
    }
    return [...value];
}
function stringMap(value: unknown, label: string): Record<string, string> {
    const source = objectValue(value, label);
    const entries: Array<[string, string]> = [];
    for (const [key, entry] of Object.entries(source)) {
        if (typeof entry !== 'string') fail(`${label}.${key} must be a string`);
        entries.push([key, entry]);
    }
    return Object.fromEntries(entries);
}
function booleanMap(value: unknown, label: string): Record<string, boolean> {
    const source = objectValue(value, label);
    const entries: Array<[string, boolean]> = [];
    for (const [key, entry] of Object.entries(source)) {
        if (typeof entry !== 'boolean') fail(`${label}.${key} must be a boolean`);
        entries.push([key, entry]);
    }
    return Object.fromEntries(entries);
}
function manifestReference(value: unknown, label: string): ManifestReference {
    const source = exactObject(value, ['path', 'sha256'], label);
    return {
        path: stringField(source, 'path', `${label}.path`),
        sha256: stringField(source, 'sha256', `${label}.sha256`),
    };
}
function runnerCheckpoint(value: unknown): RunnerPublicationCheckpoint {
    const source = exactObject(value, [
        'repository', 'repository_url', 'branch', 'commit', 'required_files',
        'verified_remote_ref', 'checkpoint_sha256',
    ], 'runner_publication.checkpoint');
    return {
        repository: stringField(source, 'repository', 'runner_publication.checkpoint.repository'),
        repository_url: stringField(source, 'repository_url', 'runner_publication.checkpoint.repository_url'),
        branch: stringField(source, 'branch', 'runner_publication.checkpoint.branch'),
        commit: stringField(source, 'commit', 'runner_publication.checkpoint.commit'),
        required_files: stringMap(source.required_files, 'runner_publication.checkpoint.required_files'),
        verified_remote_ref: stringField(source, 'verified_remote_ref', 'runner_publication.checkpoint.verified_remote_ref'),
        checkpoint_sha256: stringField(source, 'checkpoint_sha256', 'runner_publication.checkpoint.checkpoint_sha256'),
    };
}
function runnerBinding(value: unknown): RunnerPublicationBinding {
    const source = exactObject(value, ['manifest', 'checkpoint'], 'runner_publication');
    return {
        manifest: manifestReference(source.manifest, 'runner_publication.manifest'),
        checkpoint: runnerCheckpoint(source.checkpoint),
    };
}
function ratingPolicy(value: unknown): CouncilRatingPolicy {
    const source = exactObject(value, [
        'axes', 'protected_axes', 'rationale_minimum_characters', 'minimum_effective_ratings',
        'p0', 'p1', 'nominal_alpha', 'nominal_beta',
    ], 'rating_policy');
    return {
        axes: stringArray(source.axes, 'rating_policy.axes'),
        protected_axes: stringArray(source.protected_axes, 'rating_policy.protected_axes'),
        rationale_minimum_characters: integerField(source, 'rationale_minimum_characters', 'rating_policy.rationale_minimum_characters'),
        minimum_effective_ratings: integerField(source, 'minimum_effective_ratings', 'rating_policy.minimum_effective_ratings'),
        p0: numberField(source, 'p0', 'rating_policy.p0'),
        p1: numberField(source, 'p1', 'rating_policy.p1'),
        nominal_alpha: numberField(source, 'nominal_alpha', 'rating_policy.nominal_alpha'),
        nominal_beta: numberField(source, 'nominal_beta', 'rating_policy.nominal_beta'),
    };
}
function publicationSubject(value: unknown): FrozenCouncilPacket['publication_subject'] {
    const source = exactObject(value, ['repository', 'repository_url', 'branch', 'required_paths', 'receipt_paths'], 'publication_subject');
    const receiptPaths = exactObject(source.receipt_paths, ['packet', 'ratings', 'reveal', 'decision'], 'publication_subject.receipt_paths');
    return {
        repository: stringField(source, 'repository', 'publication_subject.repository'),
        repository_url: stringField(source, 'repository_url', 'publication_subject.repository_url'),
        branch: stringField(source, 'branch', 'publication_subject.branch'),
        required_paths: stringArray(source.required_paths, 'publication_subject.required_paths'),
        receipt_paths: {
            packet: stringField(receiptPaths, 'packet', 'publication_subject.receipt_paths.packet'),
            ratings: stringField(receiptPaths, 'ratings', 'publication_subject.receipt_paths.ratings'),
            reveal: stringField(receiptPaths, 'reveal', 'publication_subject.receipt_paths.reveal'),
            decision: stringField(receiptPaths, 'decision', 'publication_subject.receipt_paths.decision'),
        },
    };
}
function councilRating(value: unknown): CouncilRating {
    const source = exactObject(value, [
        'expert', 'preference', 'rationale', 'axis_scores', 'protected_axis_regressions',
    ], 'rating');
    const preference = stringField(source, 'preference', 'rating.preference');
    if (preference !== 'A' && preference !== 'B' && preference !== 'tie') fail('rating.preference is invalid');
    const axes = objectValue(source.axis_scores, 'rating.axis_scores');
    const scores: Array<[string, { A: number; B: number }]> = [];
    for (const [axis, raw] of Object.entries(axes)) {
        const score = exactObject(raw, ['A', 'B'], `rating.axis_scores.${axis}`);
        scores.push([axis, {
            A: numberField(score, 'A', `rating.axis_scores.${axis}.A`),
            B: numberField(score, 'B', `rating.axis_scores.${axis}.B`),
        }]);
    }
    return {
        expert: stringField(source, 'expert', 'rating.expert'),
        preference,
        rationale: stringField(source, 'rationale', 'rating.rationale'),
        axis_scores: Object.fromEntries(scores),
        protected_axis_regressions: booleanMap(source.protected_axis_regressions, 'rating.protected_axis_regressions'),
    };
}

function executionReceipt(value: unknown): CouncilExecutionReceipt {
    const source = exactObject(value, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'expert', 'packet_sha256',
        'protocol_path', 'protocol_sha256', 'input_binding_sha256', 'rating_sha256',
        'output_path', 'output_sha256', 'invocation_id', 'issuer', 'completion_status',
        'authority_key_id_sha256', 'channel_attestation', 'signature_base64',
    ], 'execution_receipt');
    if (stringField(source, 'schema_version') !== COUNCIL_AUTORESEARCH_SCHEMA
        || stringField(source, 'runner_version') !== COUNCIL_AUTORESEARCH_RUNNER
        || integerField(source, 'generation') !== 1) fail('execution_receipt version or generation is invalid');
    const issuer = stringField(source, 'issuer');
    const completion = stringField(source, 'completion_status');
    if (issuer !== 'cstar-host-invocation-bridge-v1' || completion !== 'completed') {
        fail('execution_receipt issuer or completion status is invalid');
    }
    const channel = exactObject(source.channel_attestation, [
        'input_channels', 'token_path_read', 'token_path_written', 'observation_writes',
        'independent_promotion_receipt_required',
    ], 'execution_receipt.channel_attestation');
    const channels = stringArray(channel.input_channels, 'execution_receipt.channel_attestation.input_channels');
    if (JSON.stringify(channels) !== JSON.stringify(COUNCIL_EXECUTION_INPUT_CHANNELS)) {
        fail('execution_receipt input channels are invalid');
    }
    const tokenRead = booleanField(channel, 'token_path_read');
    const tokenWritten = booleanField(channel, 'token_path_written');
    const observationWrites = booleanField(channel, 'observation_writes');
    const promotionRequired = booleanField(channel, 'independent_promotion_receipt_required');
    if (tokenRead || tokenWritten || observationWrites || !promotionRequired) {
        fail('execution_receipt channel attestation is invalid');
    }
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: stringField(source, 'run_id'),
        generation: 1,
        expert: stringField(source, 'expert'),
        packet_sha256: stringField(source, 'packet_sha256'),
        protocol_path: stringField(source, 'protocol_path'),
        protocol_sha256: stringField(source, 'protocol_sha256'),
        input_binding_sha256: stringField(source, 'input_binding_sha256'),
        rating_sha256: stringField(source, 'rating_sha256'),
        output_path: stringField(source, 'output_path'),
        output_sha256: stringField(source, 'output_sha256'),
        invocation_id: stringField(source, 'invocation_id'),
        issuer,
        completion_status: completion,
        authority_key_id_sha256: stringField(source, 'authority_key_id_sha256'),
        channel_attestation: {
            input_channels: COUNCIL_EXECUTION_INPUT_CHANNELS,
            token_path_read: false,
            token_path_written: false,
            observation_writes: false,
            independent_promotion_receipt_required: true,
        },
        signature_base64: stringField(source, 'signature_base64'),
    };
}

function ratingRecords(value: unknown): FrozenRatingRecord[] {
    if (!Array.isArray(value)) fail('ratings.records must be an array');
    return value.map((entry) => {
        const source = exactObject(entry, ['rating', 'execution_receipt'], 'rating record');
        return { rating: councilRating(source.rating), execution_receipt: executionReceipt(source.execution_receipt) };
    });
}

function mappingReveal(value: unknown): BlindMappingReveal {
    const source = exactObject(value, ['A', 'B', 'nonce'], 'mapping_reveal');
    const A = stringField(source, 'A', 'mapping_reveal.A');
    const B = stringField(source, 'B', 'mapping_reveal.B');
    if ((A !== 'baseline' && A !== 'candidate') || (B !== 'baseline' && B !== 'candidate') || A === B) {
        fail('mapping_reveal must be bijective');
    }
    return { A, B, nonce: stringField(source, 'nonce', 'mapping_reveal.nonce') };
}
function assertCommandRequest(command: string, request: Request): void {
    const schema = requestSchemas[command];
    if (!schema) fail('command request schema is unavailable');
    const allowed = new Set([...schema.required, ...(schema.optional ?? [])]);
    for (const key of Object.keys(request)) if (!allowed.has(key)) fail(`request contains unknown field: ${key}`);
    for (const key of schema.required) if (!(key in request)) fail(`request is missing required field: ${key}`);
}
function readArgs(argv: string[]): { command: string; requestFile: string } {
    if (argv.length !== 3 || argv[1] !== '--request') {
        fail('usage: council-autoresearch <command> --request <request.json>');
    }
    if (!requestSchemas[argv[0]]) fail(`unknown council-autoresearch command: ${argv[0]}`);
    return { command: argv[0], requestFile: path.resolve(argv[2]) };
}
function requestControlRoot(request: Request): string {
    const configured = process.env.CSTAR_CONTROL_ROOT;
    if (!configured) fail('CSTAR_CONTROL_ROOT must name the external private receipt root');
    const expected = path.resolve(configured);
    if (request.control_root !== undefined && path.resolve(stringField(request, 'control_root')) !== expected) {
        fail('request.control_root does not match CSTAR_CONTROL_ROOT');
    }
    return expected;
}
function common(request: Request) {
    return {
        repoRoot: stringField(request, 'repo_root'),
        controlRoot: requestControlRoot(request),
        runId: stringField(request, 'run_id'),
        resumeToken: stringField(request, 'resume_token'),
    };
}

function execute(command: string, request: Request): unknown {
    assertCommandRequest(command, request);
    if (command === 'lease-acquire') {
        const controlRoot = requestControlRoot(request);
        const repoRoot = stringField(request, 'repo_root');
        const runId = stringField(request, 'run_id');
        const governedPaths = stringArray(request.governed_paths, 'governed_paths');
        loadExecutionTrustPolicy(controlRoot);
        return acquireRepositoryLease({
            repoRoot,
            controlRoot,
            runId,
            governedPaths,
        });
    }
    if (command === 'lease-release') return releaseRepositoryLease(common(request));
    if (command === 'verify-runner-checkpoint') {
        const checkpoint = exactObject(request.runner_publication, ['repository', 'branch', 'commit', 'required_files'], 'runner publication request');
        const policy = loadExecutionTrustPolicy(requestControlRoot(request));
        const branch = stringField(checkpoint, 'branch');
        const commit = stringField(checkpoint, 'commit');
        if (branch !== policy.runner_branch || commit !== policy.runner_commit) {
            fail('runner publication coordinates do not match the pinned policy');
        }
        const verified = verifyRunnerPublication({
            repoRoot: stringField(request, 'runner_publication_repo_root'),
            repository: stringField(checkpoint, 'repository'),
            expectedRepositoryUrl: policy.runner_repository_url,
            branch,
            commit,
            requiredFiles: stringMap(checkpoint.required_files, 'runner publication request.required_files'),
        });
        if (verified.checkpoint_sha256 !== policy.runner_checkpoint_sha256) {
            fail('runner publication checkpoint does not match the pinned policy');
        }
        return verified;
    }
    if (command === 'status') return { phase: councilRunStatus({
        controlRoot: requestControlRoot(request),
        runId: stringField(request, 'run_id'),
        bundleRoot: optionalString(request, 'bundle_root'),
        runnerPublicationRepoRoot: optionalString(request, 'runner_publication_repo_root'),
        publicationRepoRoot: optionalString(request, 'publication_repo_root'),
    }) };
    if (command === 'freeze-packet') {
        const lease = common(request);
        const packet = exactObject(request.packet, [
            'source_head', 'source_manifest_sha256', 'governed_paths', 'contract_manifest',
            'council_order', 'protocol_manifest', 'protocol_path_by_expert',
            'protocol_sha256_by_expert', 'variants', 'rubric_manifest', 'evidence_manifest',
            'runner_publication', 'seed', 'blind_mapping_commitment_sha256',
            'rating_policy', 'publication_subject',
        ], 'packet request');
        const variants = exactObject(packet.variants, ['A', 'B'], 'variants');
        const bundleRoot = stringField(request, 'bundle_root');
        const runnerPublicationRepoRoot = stringField(request, 'runner_publication_repo_root');
        const parsedPacket = {
            sourceHead: stringField(packet, 'source_head'),
            sourceManifestSha256: stringField(packet, 'source_manifest_sha256'),
            governedPaths: stringArray(packet.governed_paths, 'packet.governed_paths'),
            contractManifest: manifestReference(packet.contract_manifest, 'contract_manifest'),
            councilOrder: stringArray(packet.council_order, 'council_order'),
            protocolManifest: manifestReference(packet.protocol_manifest, 'protocol_manifest'),
            protocolPathByExpert: stringMap(packet.protocol_path_by_expert, 'protocol_path_by_expert'),
            protocolSha256ByExpert: stringMap(packet.protocol_sha256_by_expert, 'protocol_sha256_by_expert'),
            variants: {
                A: manifestReference(variants.A, 'variants.A'),
                B: manifestReference(variants.B, 'variants.B'),
            },
            rubricManifest: manifestReference(packet.rubric_manifest, 'rubric_manifest'),
            evidenceManifest: manifestReference(packet.evidence_manifest, 'evidence_manifest'),
            runnerPublication: runnerBinding(packet.runner_publication),
            seed: stringField(packet, 'seed'),
            blindMappingCommitmentSha256: stringField(packet, 'blind_mapping_commitment_sha256'),
            ratingPolicy: ratingPolicy(packet.rating_policy),
            publicationSubject: publicationSubject(packet.publication_subject),
        };
        const policy = loadExecutionTrustPolicy(lease.controlRoot);
        const runnerPublication = parsedPacket.runnerPublication;
        if (runnerPublication.checkpoint.repository_url !== policy.runner_repository_url
            || runnerPublication.checkpoint.branch !== policy.runner_branch) fail('runner publication does not match the pinned policy');
        const frozen = freezeCouncilPacket({
            runId: lease.runId,
            ...parsedPacket,
            runnerPublicationRepoRoot,
            executionAuthority: policy.execution_authority,
            bundleRoot,
        });
        return { packet: frozen, persistence: persistFrozenPacket({
            ...lease, bundleRoot, runnerPublicationRepoRoot, packet: frozen,
        }) };
    }
    if (command === 'freeze-ratings') {
        const lease = common(request);
        const input = exactObject(request.ratings, ['packet_sha256', 'records'], 'ratings request');
        const ratings = freezeCouncilRatings({
            run_id: lease.runId,
            packet_sha256: stringField(input, 'packet_sha256'),
            ratings: ratingRecords(input.records),
        });
        return { ratings, persistence: persistFrozenRatings({
            ...lease,
            bundleRoot: stringField(request, 'bundle_root'),
            runnerPublicationRepoRoot: stringField(request, 'runner_publication_repo_root'),
            ratings,
        }) };
    }
    if (command === 'reveal-mapping') {
        const input = exactObject(request.reveal, ['mapping_reveal'], 'mapping reveal request');
        return persistMappingReveal({
            ...common(request),
            bundleRoot: stringField(request, 'bundle_root'),
            runnerPublicationRepoRoot: stringField(request, 'runner_publication_repo_root'),
            mappingReveal: mappingReveal(input.mapping_reveal),
        });
    }
    if (command === 'evaluate') return persistFirstDecision({
        ...common(request),
        bundleRoot: stringField(request, 'bundle_root'),
        runnerPublicationRepoRoot: stringField(request, 'runner_publication_repo_root'),
    });
    if (command === 'verify-publication') {
        const lease = common(request);
        const input = exactObject(request.publication, [
            'packet_sha256', 'ratings_sha256', 'mapping_reveal_sha256', 'decision_sha256',
            'repository', 'branch', 'commit', 'required_files',
        ], 'publication request');
        const publicationRepoRoot = stringField(request, 'publication_repo_root');
        const subject = preregisteredPublicationSubject(lease.controlRoot, lease.runId);
        if (stringField(input, 'repository') !== subject.repository
            || stringField(input, 'branch') !== subject.branch) fail('publication request does not match the preregistered subject');
        const receipt = verifyPublication({
            repoRoot: publicationRepoRoot,
            runId: lease.runId,
            packetSha256: stringField(input, 'packet_sha256'),
            ratingsSha256: stringField(input, 'ratings_sha256'),
            mappingRevealSha256: stringField(input, 'mapping_reveal_sha256'),
            decisionSha256: stringField(input, 'decision_sha256'),
            repository: stringField(input, 'repository'),
            expectedRepositoryUrl: subject.repository_url,
            branch: stringField(input, 'branch'),
            commit: stringField(input, 'commit'),
            requiredFiles: stringMap(input.required_files, 'publication request.required_files'),
        });
        return { receipt, persistence: persistPublicationReceipt({
            ...lease,
            bundleRoot: stringField(request, 'bundle_root'),
            runnerPublicationRepoRoot: stringField(request, 'runner_publication_repo_root'),
            publicationRepoRoot,
            receipt,
        }) };
    }
    return fail(`unsupported command: ${command}`);
}

export function runCouncilAutoresearchCli(argv: string[]): number {
    let command = 'unknown';
    try {
        assertCouncilRuntimePlatform();
        const args = readArgs(argv);
        command = args.command;
        const stat = fs.lstatSync(args.requestFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024) {
            fail('request must be a single-link regular JSON file no larger than 4 MiB');
        }
        const request = objectValue(readJson<unknown>(args.requestFile), 'request');
        const data = execute(command, request);
        process.stdout.write(`${JSON.stringify({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            command,
            status: 'pass',
            data,
        }, null, 2)}\n`);
        return 0;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`${JSON.stringify({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            command,
            status: 'fail',
            error: { code: 'COUNCIL_AUTORESEARCH_FAIL_CLOSED', message: message.slice(0, 4096) },
        }, null, 2)}\n`);
        return 1;
    }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    process.exitCode = runCouncilAutoresearchCli(process.argv.slice(2));
}
