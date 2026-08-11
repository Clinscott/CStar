#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    PublicationReceipt,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    assertExactObjectKeys,
    canonicalJson,
    councilRunStatus,
    fail,
    freezeCouncilPacket,
    freezeCouncilRatings,
    locateRepositoryRoot,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    readJson,
    recoverRepositoryLeaseOperation,
    releaseCouncilRun,
    verifyPublication,
} from '../core/council_autoresearch/index.js';

const EXECUTING_RUNNER_ROOT = locateRepositoryRoot(path.dirname(fileURLToPath(import.meta.url)));

type Request = Record<string, unknown>;
type CouncilAutoresearchCommand =
    | 'lease-acquire'
    | 'recover-operation'
    | 'lease-release'
    | 'freeze-packet'
    | 'freeze-ratings'
    | 'reveal-mapping'
    | 'evaluate'
    | 'verify-publication'
    | 'status';

const COMMANDS = new Set<CouncilAutoresearchCommand>([
    'lease-acquire',
    'recover-operation',
    'lease-release',
    'freeze-packet',
    'freeze-ratings',
    'reveal-mapping',
    'evaluate',
    'verify-publication',
    'status',
]);

const REQUEST_ENVELOPES: Record<CouncilAutoresearchCommand, {
    required: readonly string[];
    optional?: readonly string[];
    generation: boolean;
}> = {
    'lease-acquire': {
        required: ['repo_root', 'run_id', 'resume_token', 'governed_paths'],
        optional: ['control_root'],
        generation: false,
    },
    'recover-operation': {
        required: ['repo_root', 'run_id', 'resume_token'],
        optional: ['control_root'],
        generation: false,
    },
    'lease-release': {
        required: ['repo_root', 'run_id', 'resume_token', 'disposition'],
        optional: ['control_root', 'bundle_root'],
        generation: false,
    },
    'freeze-packet': {
        required: [
            'repo_root', 'run_id', 'resume_token', 'generation', 'bundle_root',
            'runner_publication_repo_root', 'packet',
        ],
        optional: ['control_root'],
        generation: true,
    },
    'freeze-ratings': {
        required: ['repo_root', 'run_id', 'resume_token', 'generation', 'bundle_root', 'ratings'],
        optional: ['control_root'],
        generation: true,
    },
    'reveal-mapping': {
        required: ['repo_root', 'run_id', 'resume_token', 'generation', 'bundle_root', 'reveal'],
        optional: ['control_root'],
        generation: true,
    },
    evaluate: {
        required: ['repo_root', 'run_id', 'resume_token', 'generation', 'bundle_root'],
        optional: ['control_root'],
        generation: true,
    },
    'verify-publication': {
        required: [
            'repo_root', 'run_id', 'resume_token', 'generation', 'bundle_root',
            'publication_repo_root', 'publication',
        ],
        optional: ['control_root'],
        generation: true,
    },
    status: {
        required: ['run_id'],
        optional: ['control_root', 'bundle_root', 'publication_repo_root'],
        generation: false,
    },
};

export function assertCouncilAutoresearchRequestEnvelope(
    command: CouncilAutoresearchCommand,
    value: unknown,
): asserts value is Request {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail(`${command} request must be an object`);
    }
    const request = value as Request;
    const envelope = REQUEST_ENVELOPES[command];
    const required = new Set(envelope.required);
    const allowed = new Set([...envelope.required, ...(envelope.optional ?? [])]);
    const actual = Object.keys(request);
    const missing = [...required].filter((key) => !Object.hasOwn(request, key));
    const unexpected = actual.filter((key) => !allowed.has(key));
    if (missing.length > 0 || unexpected.length > 0) {
        fail(`${command} request contains unexpected or missing top-level fields`);
    }
    if (envelope.generation && request.generation !== 1) {
        fail(`${command} request generation must be the number 1`);
    }
    if (command === 'lease-release') {
        if (request.disposition !== 'completed' && request.disposition !== 'abandoned') {
            fail('lease-release request disposition must be completed or abandoned');
        }
        if (request.disposition === 'completed' && !Object.hasOwn(request, 'bundle_root')) {
            fail('completed lease-release request requires bundle_root');
        }
    }
}

function stringRecord(value: unknown, label: string): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.some(([, entry]) => typeof entry !== 'string')) fail(`${label} values must be strings`);
    return Object.fromEntries(entries) as Record<string, string>;
}

function readArgs(argv: string[]): { command: CouncilAutoresearchCommand; requestFile: string } {
    if (argv.length !== 3 || argv[1] !== '--request') {
        fail('usage: council-autoresearch <command> --request <request.json>');
    }
    if (!COMMANDS.has(argv[0] as CouncilAutoresearchCommand)) {
        fail(`unknown council-autoresearch command: ${argv[0]}`);
    }
    return { command: argv[0] as CouncilAutoresearchCommand, requestFile: path.resolve(argv[2]) };
}

function requestControlRoot(request: Request): string {
    const configured = process.env.CSTAR_CONTROL_ROOT;
    if (!configured) fail('CSTAR_CONTROL_ROOT must name the external private receipt root');
    const expected = path.resolve(configured);
    if (request.control_root !== undefined && path.resolve(String(request.control_root)) !== expected) {
        fail('request.control_root does not match CSTAR_CONTROL_ROOT');
    }
    return expected;
}

function common(request: Request): {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
    runnerExecutionRepoRoot: string;
} {
    return {
        repoRoot: String(request.repo_root),
        controlRoot: requestControlRoot(request),
        runId: String(request.run_id),
        resumeToken: String(request.resume_token),
        runnerExecutionRepoRoot: EXECUTING_RUNNER_ROOT,
    };
}

function execute(command: CouncilAutoresearchCommand, request: Request): unknown {
    assertCouncilAutoresearchRequestEnvelope(command, request);
    if (command === 'lease-acquire') {
        const acquired = acquireRepositoryLease({
            repoRoot: String(request.repo_root),
            controlRoot: requestControlRoot(request),
            runId: String(request.run_id),
            resumeToken: String(request.resume_token),
            governedPaths: request.governed_paths as string[],
        });
        return {
            record: acquired.record,
            lock_file: acquired.lock_file,
            created: acquired.created,
        };
    }
    if (command === 'recover-operation') {
        return recoverRepositoryLeaseOperation(common(request));
    }
    if (command === 'lease-release') {
        return releaseCouncilRun({
            ...common(request),
            disposition: request.disposition as 'completed' | 'abandoned',
            bundleRoot: request.bundle_root === undefined ? undefined : String(request.bundle_root),
        });
    }
    if (command === 'status') {
        return { phase: councilRunStatus({
            controlRoot: requestControlRoot(request),
            runId: String(request.run_id),
            bundleRoot: request.bundle_root === undefined ? undefined : String(request.bundle_root),
            publicationRepoRoot: request.publication_repo_root === undefined
                ? undefined
                : String(request.publication_repo_root),
            runnerExecutionRepoRoot: EXECUTING_RUNNER_ROOT,
        }) };
    }
    if (command === 'freeze-packet') {
        const lease = common(request);
        const bundleRoot = String(request.bundle_root);
        const packetInput = request.packet as Request;
        assertExactObjectKeys(packetInput, [
            'source_head', 'source_manifest_sha256', 'governed_paths', 'contract_sha256',
            'council_order', 'protocol_manifest', 'protocol_path_by_expert',
            'protocol_sha256_by_expert', 'variants', 'rubric_manifest', 'evidence_manifest',
            'runner_publication', 'seed', 'blind_mapping_commitment_sha256',
            'execution_authority', 'rating_policy', 'publication_subject',
        ], 'packet request');
        const packet = freezeCouncilPacket({
            runId: lease.runId,
            sourceHead: String(packetInput.source_head),
            sourceManifestSha256: String(packetInput.source_manifest_sha256),
            governedPaths: packetInput.governed_paths as string[],
            contractSha256: String(packetInput.contract_sha256),
            councilOrder: packetInput.council_order as string[],
            protocolManifest: packetInput.protocol_manifest as any,
            protocolPathByExpert: packetInput.protocol_path_by_expert as Record<string, string>,
            protocolSha256ByExpert: packetInput.protocol_sha256_by_expert as Record<string, string>,
            variants: packetInput.variants as any,
            rubricManifest: packetInput.rubric_manifest as any,
            evidenceManifest: packetInput.evidence_manifest as any,
            runnerPublication: packetInput.runner_publication as any,
            runnerExecutionRepoRoot: EXECUTING_RUNNER_ROOT,
            runnerPublicationRepoRoot: String(request.runner_publication_repo_root),
            seed: String(packetInput.seed),
            blindMappingCommitmentSha256: String(packetInput.blind_mapping_commitment_sha256),
            executionAuthority: packetInput.execution_authority as any,
            ratingPolicy: packetInput.rating_policy as any,
            publicationSubject: packetInput.publication_subject as any,
            bundleRoot,
        });
        return {
            packet,
            persistence: persistFrozenPacket({ ...lease, bundleRoot, packet }),
        };
    }
    if (command === 'freeze-ratings') {
        const lease = common(request);
        const ratingsInput = request.ratings as Request;
        assertExactObjectKeys(ratingsInput, ['packet_sha256', 'records'], 'ratings request');
        const ratings = freezeCouncilRatings({
            run_id: lease.runId,
            packet_sha256: String(ratingsInput.packet_sha256),
            ratings: ratingsInput.records as any,
        });
        return {
            ratings,
            persistence: persistFrozenRatings({
                ...lease,
                bundleRoot: String(request.bundle_root),
                ratings,
            }),
        };
    }
    if (command === 'reveal-mapping') {
        const lease = common(request);
        const revealInput = request.reveal as Request;
        assertExactObjectKeys(revealInput, ['mapping_reveal'], 'mapping reveal request');
        return persistMappingReveal({
            ...lease,
            bundleRoot: String(request.bundle_root),
            mappingReveal: revealInput.mapping_reveal as any,
        });
    }
    if (command === 'evaluate') {
        return persistFirstDecision({
            ...common(request),
            bundleRoot: String(request.bundle_root),
        });
    }
    if (command === 'verify-publication') {
        const lease = common(request);
        const publication = request.publication as Request;
        assertExactObjectKeys(publication, [
            'packet_sha256', 'ratings_sha256', 'mapping_reveal_sha256', 'decision_sha256',
            'repository', 'branch', 'commit', 'required_files',
        ], 'publication request');
        const publicationRepoRoot = String(request.publication_repo_root);
        const phase = councilRunStatus({
            controlRoot: lease.controlRoot,
            runId: lease.runId,
            bundleRoot: String(request.bundle_root),
            runnerExecutionRepoRoot: EXECUTING_RUNNER_ROOT,
        });
        if (phase === 'PAUSED') {
            const durable = readJson<PublicationReceipt>(path.join(
                lease.controlRoot,
                'council-autoresearch',
                lease.runId,
                '40-publication.json',
            ));
            const requested = {
                packet_sha256: String(publication.packet_sha256),
                ratings_sha256: String(publication.ratings_sha256),
                mapping_reveal_sha256: String(publication.mapping_reveal_sha256),
                decision_sha256: String(publication.decision_sha256),
                repository: String(publication.repository),
                branch: String(publication.branch),
                commit: String(publication.commit),
                required_files: stringRecord(publication.required_files, 'publication.required_files'),
            };
            const recorded = Object.fromEntries(
                Object.keys(requested).map((key) => [key, durable[key as keyof PublicationReceipt]]),
            );
            if (canonicalJson(requested) !== canonicalJson(recorded)) fail('publication replay conflicts');
            return {
                receipt: durable,
                persistence: persistPublicationReceipt({
                    ...lease,
                    bundleRoot: String(request.bundle_root),
                    publicationRepoRoot,
                    receipt: durable,
                }),
            };
        }
        const receipt = verifyPublication({
            repoRoot: publicationRepoRoot,
            runId: lease.runId,
            packetSha256: String(publication.packet_sha256),
            ratingsSha256: String(publication.ratings_sha256),
            mappingRevealSha256: String(publication.mapping_reveal_sha256),
            decisionSha256: String(publication.decision_sha256),
            repository: String(publication.repository),
            branch: String(publication.branch),
            commit: String(publication.commit),
            requiredFiles: stringRecord(publication.required_files, 'publication.required_files'),
        });
        return {
            receipt,
            persistence: persistPublicationReceipt({
                ...lease,
                bundleRoot: String(request.bundle_root),
                publicationRepoRoot,
                receipt,
            }),
        };
    }
    return fail(`unsupported command: ${command}`);
}

export function runCouncilAutoresearchCli(argv: string[]): number {
    let command = 'unknown';
    try {
        const args = readArgs(argv);
        command = args.command;
        const stat = fs.lstatSync(args.requestFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024) {
            fail('request must be a single-link regular JSON file no larger than 4 MiB');
        }
        const request = readJson<Request>(args.requestFile);
        const data = execute(args.command, request);
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
