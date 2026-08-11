import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    COUNCIL_EXECUTION_INPUT_CHANNELS,
    assertExactObjectKeys,
    fail,
    type BlindMappingReveal,
    type CouncilRatingPolicy,
    type FrozenCouncilPacket,
    type ManifestReference,
    type RunnerPublicationBinding,
    type RunnerPublicationCheckpoint,
} from '../core/council_autoresearch/contract_schema.js';
import type {
    CouncilExecutionReceipt,
    CouncilRating,
    FrozenRatingRecord,
} from '../core/council_autoresearch/rating.js';

export type CouncilAutoresearchRequest = Record<string, unknown>;

function isRequest(value: unknown): value is CouncilAutoresearchRequest {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

export function objectValue(value: unknown, label: string): CouncilAutoresearchRequest {
    if (!isRequest(value)) fail(`${label} must be an object`);
    return value;
}

export function exactObject(
    value: unknown,
    keys: readonly string[],
    label: string,
): CouncilAutoresearchRequest {
    const result = objectValue(value, label);
    assertExactObjectKeys(result, keys, label);
    return result;
}

export function stringField(
    value: CouncilAutoresearchRequest,
    key: string,
    label = key,
): string {
    const result = value[key];
    if (typeof result !== 'string' || result.length === 0) fail(`${label} must be a non-empty string`);
    return result;
}

export function optionalString(
    value: CouncilAutoresearchRequest,
    key: string,
): string | undefined {
    return value[key] === undefined ? undefined : stringField(value, key);
}

function numberField(value: CouncilAutoresearchRequest, key: string, label = key): number {
    const result = value[key];
    if (typeof result !== 'number' || !Number.isFinite(result)) fail(`${label} must be a finite number`);
    return result;
}

function integerField(value: CouncilAutoresearchRequest, key: string, label = key): number {
    const result = numberField(value, key, label);
    if (!Number.isInteger(result)) fail(`${label} must be an integer`);
    return result;
}

function booleanField(value: CouncilAutoresearchRequest, key: string, label = key): boolean {
    const result = value[key];
    if (typeof result !== 'boolean') fail(`${label} must be a boolean`);
    return result;
}

export function stringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        fail(`${label} must be a string array`);
    }
    return [...value];
}

export function stringMap(value: unknown, label: string): Record<string, string> {
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

export function manifestReference(value: unknown, label: string): ManifestReference {
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

export function runnerBinding(value: unknown): RunnerPublicationBinding {
    const source = exactObject(value, ['manifest', 'checkpoint'], 'runner_publication');
    return {
        manifest: manifestReference(source.manifest, 'runner_publication.manifest'),
        checkpoint: runnerCheckpoint(source.checkpoint),
    };
}

export function ratingPolicy(value: unknown): CouncilRatingPolicy {
    const source = exactObject(value, [
        'axes', 'protected_axes', 'rationale_minimum_characters', 'minimum_effective_ratings',
        'p0', 'p1', 'nominal_alpha', 'nominal_beta',
    ], 'rating_policy');
    return {
        axes: stringArray(source.axes, 'rating_policy.axes'),
        protected_axes: stringArray(source.protected_axes, 'rating_policy.protected_axes'),
        rationale_minimum_characters: integerField(
            source,
            'rationale_minimum_characters',
            'rating_policy.rationale_minimum_characters',
        ),
        minimum_effective_ratings: integerField(
            source,
            'minimum_effective_ratings',
            'rating_policy.minimum_effective_ratings',
        ),
        p0: numberField(source, 'p0', 'rating_policy.p0'),
        p1: numberField(source, 'p1', 'rating_policy.p1'),
        nominal_alpha: numberField(source, 'nominal_alpha', 'rating_policy.nominal_alpha'),
        nominal_beta: numberField(source, 'nominal_beta', 'rating_policy.nominal_beta'),
    };
}

export function publicationSubject(value: unknown): FrozenCouncilPacket['publication_subject'] {
    const source = exactObject(
        value,
        ['repository', 'repository_url', 'branch', 'required_paths', 'receipt_paths'],
        'publication_subject',
    );
    const receiptPaths = exactObject(
        source.receipt_paths,
        ['packet', 'ratings', 'reveal', 'decision'],
        'publication_subject.receipt_paths',
    );
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
        protected_axis_regressions: booleanMap(
            source.protected_axis_regressions,
            'rating.protected_axis_regressions',
        ),
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

export function ratingRecords(value: unknown): FrozenRatingRecord[] {
    if (!Array.isArray(value)) fail('ratings.records must be an array');
    return value.map((entry) => {
        const source = exactObject(entry, ['rating', 'execution_receipt'], 'rating record');
        return {
            rating: councilRating(source.rating),
            execution_receipt: executionReceipt(source.execution_receipt),
        };
    });
}

export function mappingReveal(value: unknown): BlindMappingReveal {
    const source = exactObject(value, ['A', 'B', 'nonce'], 'mapping_reveal');
    const A = stringField(source, 'A', 'mapping_reveal.A');
    const B = stringField(source, 'B', 'mapping_reveal.B');
    if ((A !== 'baseline' && A !== 'candidate') || (B !== 'baseline' && B !== 'candidate') || A === B) {
        fail('mapping_reveal must be bijective');
    }
    return { A, B, nonce: stringField(source, 'nonce', 'mapping_reveal.nonce') };
}

export function assertCommandRequest(command: string, request: CouncilAutoresearchRequest): void {
    const schema = requestSchemas[command];
    if (!schema) fail('command request schema is unavailable');
    const allowed = new Set([...schema.required, ...(schema.optional ?? [])]);
    for (const key of Object.keys(request)) {
        if (!allowed.has(key)) fail(`request contains unknown field: ${key}`);
    }
    for (const key of schema.required) {
        if (!(key in request)) fail(`request is missing required field: ${key}`);
    }
}

export function readArgs(argv: string[]): { command: string; requestFile: string } {
    if (argv.length !== 3 || argv[1] !== '--request') {
        fail('usage: council-autoresearch <command> --request <request.json>');
    }
    if (!requestSchemas[argv[0]]) fail(`unknown council-autoresearch command: ${argv[0]}`);
    return { command: argv[0], requestFile: path.resolve(argv[2]) };
}

export function requestControlRoot(request: CouncilAutoresearchRequest): string {
    const configured = process.env.CSTAR_CONTROL_ROOT;
    if (!configured) fail('CSTAR_CONTROL_ROOT must name the external private receipt root');
    const expected = path.resolve(configured);
    if (request.control_root !== undefined && path.resolve(stringField(request, 'control_root')) !== expected) {
        fail('request.control_root does not match CSTAR_CONTROL_ROOT');
    }
    return expected;
}

export function common(request: CouncilAutoresearchRequest): {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
} {
    return {
        repoRoot: stringField(request, 'repo_root'),
        controlRoot: requestControlRoot(request),
        runId: stringField(request, 'run_id'),
        resumeToken: stringField(request, 'resume_token'),
    };
}
