#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    assertCouncilRuntimePlatform,
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
import {
    assertCommandRequest,
    common,
    exactObject,
    manifestReference,
    mappingReveal,
    objectValue,
    optionalString,
    publicationSubject,
    ratingPolicy,
    ratingRecords,
    readArgs,
    requestControlRoot,
    runnerBinding,
    stringArray,
    stringField,
    stringMap,
    type CouncilAutoresearchRequest as Request,
} from './council-autoresearch-request.js';
function execute(command: string, request: Request): unknown {
    assertCommandRequest(command, request);
    if (command === 'lease-acquire') {
        const controlRoot = requestControlRoot(request);
        const repoRoot = stringField(request, 'repo_root');
        const runId = stringField(request, 'run_id');
        const resumeToken = stringField(request, 'resume_token');
        const governedPaths = stringArray(request.governed_paths, 'governed_paths');
        loadExecutionTrustPolicy(controlRoot);
        return acquireRepositoryLease({
            repoRoot,
            controlRoot,
            runId,
            governedPaths,
            resumeToken,
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
