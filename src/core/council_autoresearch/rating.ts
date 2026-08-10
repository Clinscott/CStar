import { verify as verifySignature } from 'node:crypto';
import fs from 'node:fs';

import {
    BlindMappingReveal,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    COUNCIL_EXECUTION_INPUT_CHANNELS,
    FrozenCouncilPacket,
    assertExactObjectKeys,
    assertSha256,
    canonicalJson,
    fail,
    readJson,
    resolveContained,
    sha256,
    sha256File,
} from './contracts.js';
import { assertBlindMappingReveal } from './packet.js';
import {
    CouncilExecutionTrustPolicy,
    verifyPacketAgainstTrustPolicy,
} from './execution_trust.js';

export type CouncilPreference = 'A' | 'B' | 'tie';

export interface CouncilRating {
    expert: string;
    preference: CouncilPreference;
    rationale: string;
    axis_scores: Record<string, { A: number; B: number }>;
    protected_axis_regressions: Record<string, boolean>;
}

export interface CouncilExecutionReceipt {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    expert: string;
    packet_sha256: string;
    protocol_path: string;
    protocol_sha256: string;
    input_binding_sha256: string;
    rating_sha256: string;
    output_path: string;
    output_sha256: string;
    invocation_id: string;
    issuer: 'cstar-host-invocation-bridge-v1';
    completion_status: 'completed';
    authority_key_id_sha256: string;
    channel_attestation: {
        input_channels: typeof COUNCIL_EXECUTION_INPUT_CHANNELS;
        token_path_read: false;
        token_path_written: false;
        observation_writes: false;
        independent_promotion_receipt_required: true;
    };
    signature_base64: string;
}

export interface FrozenRatingRecord {
    rating: CouncilRating;
    execution_receipt: CouncilExecutionReceipt;
}

export interface FrozenRatings {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    packet_sha256: string;
    ratings: FrozenRatingRecord[];
    ratings_sha256: string;
}

export interface FrozenMappingReveal {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    packet_sha256: string;
    ratings_sha256: string;
    mapping_reveal: BlindMappingReveal;
    reveal_sha256: string;
}

function digestWithout<T extends object, K extends keyof T>(value: T, key: K): string {
    const copy = { ...value };
    delete copy[key];
    return sha256(canonicalJson(copy));
}

function ratingDigest(rating: CouncilRating): string {
    return sha256(canonicalJson(rating));
}

function ratingsDigest(ratings: Omit<FrozenRatings, 'ratings_sha256'>): string {
    return sha256(canonicalJson(ratings));
}

export function councilExecutionInputBinding(packet: FrozenCouncilPacket, expert: string): string {
    return sha256(canonicalJson({
        packet_sha256: packet.packet_sha256,
        expert,
        protocol_path: packet.protocol_path_by_expert[expert],
        protocol_sha256: packet.protocol_sha256_by_expert[expert],
        variants: packet.variants,
        rubric_manifest: packet.rubric_manifest,
        evidence_manifest: packet.evidence_manifest,
        quarantine_policy_sha256: sha256(canonicalJson(packet.token_path)),
    }));
}

export function freezeCouncilRatings(input: {
    run_id: string;
    packet_sha256: string;
    ratings: FrozenRatingRecord[];
}): FrozenRatings {
    assertExactObjectKeys(input, ['run_id', 'packet_sha256', 'ratings'], 'ratings input');
    const base: Omit<FrozenRatings, 'ratings_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: input.run_id,
        generation: 1,
        packet_sha256: input.packet_sha256,
        ratings: input.ratings,
    };
    return { ...base, ratings_sha256: ratingsDigest(base) };
}

function assertScore(value: unknown, label: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
        fail(`${label} must be an integer from 1 to 5`);
    }
}

function verifyRatingShape(packet: FrozenCouncilPacket, rating: CouncilRating): void {
    assertExactObjectKeys(rating, [
        'expert', 'preference', 'rationale', 'axis_scores', 'protected_axis_regressions',
    ], `rating.${rating?.expert ?? 'unknown'}`);
    if (!packet.council_order.includes(rating.expert)) fail('rating expert is unknown');
    if (!['A', 'B', 'tie'].includes(rating.preference)) fail(`${rating.expert} preference is invalid`);
    if (typeof rating.rationale !== 'string'
        || rating.rationale.trim().length < packet.rating_policy.rationale_minimum_characters) {
        fail(`${rating.expert} rationale is too short`);
    }
    assertExactObjectKeys(rating.axis_scores, packet.rating_policy.axes, `${rating.expert}.axis_scores`);
    let totalA = 0;
    let totalB = 0;
    for (const axis of packet.rating_policy.axes) {
        assertExactObjectKeys(rating.axis_scores[axis], ['A', 'B'], `${rating.expert}.${axis}`);
        assertScore(rating.axis_scores[axis].A, `${rating.expert}.${axis}.A`);
        assertScore(rating.axis_scores[axis].B, `${rating.expert}.${axis}.B`);
        totalA += rating.axis_scores[axis].A;
        totalB += rating.axis_scores[axis].B;
    }
    if ((rating.preference === 'A' && totalA <= totalB)
        || (rating.preference === 'B' && totalB <= totalA)
        || (rating.preference === 'tie' && totalA !== totalB)) {
        fail(`${rating.expert} preference contradicts its axis scores`);
    }
    assertExactObjectKeys(
        rating.protected_axis_regressions,
        packet.rating_policy.protected_axes,
        `${rating.expert}.protected_axis_regressions`,
    );
    for (const axis of packet.rating_policy.protected_axes) {
        if (typeof rating.protected_axis_regressions[axis] !== 'boolean') {
            fail(`${rating.expert}.${axis} must be an explicit boolean`);
        }
    }
}

function verifyExecutionReceipt(
    packet: FrozenCouncilPacket,
    rating: CouncilRating,
    receipt: CouncilExecutionReceipt,
    bundleRoot: string,
    trustPolicy: CouncilExecutionTrustPolicy,
): void {
    assertExactObjectKeys(receipt, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'expert', 'packet_sha256',
        'protocol_path', 'protocol_sha256', 'input_binding_sha256', 'rating_sha256',
        'output_path', 'output_sha256', 'invocation_id', 'authority_key_id_sha256',
        'issuer', 'completion_status', 'channel_attestation', 'signature_base64',
    ], `${rating.expert}.execution_receipt`);
    if (receipt.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || receipt.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || receipt.run_id !== packet.run_id
        || receipt.generation !== 1
        || receipt.expert !== rating.expert
        || receipt.packet_sha256 !== packet.packet_sha256
        || receipt.protocol_path !== packet.protocol_path_by_expert[rating.expert]
        || receipt.protocol_sha256 !== packet.protocol_sha256_by_expert[rating.expert]
        || receipt.input_binding_sha256 !== councilExecutionInputBinding(packet, rating.expert)
        || receipt.rating_sha256 !== ratingDigest(rating)
        || receipt.issuer !== trustPolicy.receipt_issuer
        || receipt.completion_status !== 'completed'
        || receipt.authority_key_id_sha256 !== trustPolicy.execution_authority.key_id_sha256) {
        fail(`${rating.expert} execution receipt binding mismatch`);
    }
    assertSha256(receipt.output_sha256, `${rating.expert}.output_sha256`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,255}$/.test(receipt.invocation_id)) {
        fail(`${rating.expert} invocation id is invalid`);
    }
    const output = resolveContained(bundleRoot, receipt.output_path, `${rating.expert}.output_path`);
    if (fs.realpathSync(output) !== output) fail(`${rating.expert} output path contains a symbolic link`);
    if (sha256File(output) !== receipt.output_sha256) fail(`${rating.expert} output artifact hash mismatch`);
    if (canonicalJson(readJson<CouncilRating>(output)) !== canonicalJson(rating)) {
        fail(`${rating.expert} output artifact does not contain the signed rating`);
    }
    assertExactObjectKeys(receipt.channel_attestation, [
        'input_channels', 'token_path_read', 'token_path_written', 'observation_writes',
        'independent_promotion_receipt_required',
    ], `${rating.expert}.channel_attestation`);
    if (canonicalJson(receipt.channel_attestation.input_channels) !== canonicalJson(trustPolicy.enforced_input_channels)
        || receipt.channel_attestation.token_path_read !== false
        || receipt.channel_attestation.token_path_written !== false
        || receipt.channel_attestation.observation_writes !== false
        || receipt.channel_attestation.independent_promotion_receipt_required !== true) {
        fail(`${rating.expert} execution channel attestation violates quarantine`);
    }
    const { signature_base64: signature, ...signed } = receipt;
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) {
        fail(`${rating.expert} execution signature is invalid`);
    }
    if (!verifySignature(
        null,
        Buffer.from(canonicalJson(signed)),
        trustPolicy.execution_authority.public_key_pem,
        Buffer.from(signature, 'base64'),
    )) fail(`${rating.expert} execution signature verification failed`);
}

export function verifyFrozenRatings(
    packet: FrozenCouncilPacket,
    frozen: FrozenRatings,
    bundleRoot: string,
    trustPolicy: CouncilExecutionTrustPolicy,
): void {
    verifyPacketAgainstTrustPolicy(packet, trustPolicy);
    assertExactObjectKeys(frozen, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'packet_sha256',
        'ratings', 'ratings_sha256',
    ], 'ratings receipt');
    if (frozen.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || frozen.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || frozen.run_id !== packet.run_id
        || frozen.generation !== 1
        || frozen.packet_sha256 !== packet.packet_sha256) fail('ratings identity does not match the packet');
    assertSha256(frozen.ratings_sha256, 'ratings_sha256');
    if (digestWithout(frozen, 'ratings_sha256') !== frozen.ratings_sha256) fail('ratings hash mismatch');
    if (!Array.isArray(frozen.ratings) || frozen.ratings.length !== packet.council_order.length) {
        fail('ratings must cover the exact Council');
    }
    const experts = new Set<string>();
    const invocations = new Set<string>();
    const outputPaths = new Set<string>();
    for (const record of frozen.ratings) {
        assertExactObjectKeys(record, ['rating', 'execution_receipt'], 'rating record');
        verifyRatingShape(packet, record.rating);
        verifyExecutionReceipt(packet, record.rating, record.execution_receipt, bundleRoot, trustPolicy);
        if (experts.has(record.rating.expert)) fail('rating expert is duplicated');
        if (invocations.has(record.execution_receipt.invocation_id)) fail('execution invocation is reused');
        if (outputPaths.has(record.execution_receipt.output_path)) fail('execution output path is reused');
        experts.add(record.rating.expert);
        invocations.add(record.execution_receipt.invocation_id);
        outputPaths.add(record.execution_receipt.output_path);
    }
}

export function freezeMappingReveal(
    packet: FrozenCouncilPacket,
    ratings: FrozenRatings,
    mappingReveal: BlindMappingReveal,
): FrozenMappingReveal {
    assertBlindMappingReveal(mappingReveal, 'mapping_reveal');
    if (sha256(canonicalJson(mappingReveal)) !== packet.blind_mapping_commitment_sha256) {
        fail('mapping reveal does not match the preregistered commitment');
    }
    const base: Omit<FrozenMappingReveal, 'reveal_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: packet.run_id,
        generation: 1,
        packet_sha256: packet.packet_sha256,
        ratings_sha256: ratings.ratings_sha256,
        mapping_reveal: mappingReveal,
    };
    return { ...base, reveal_sha256: sha256(canonicalJson(base)) };
}

export function verifyMappingReveal(
    packet: FrozenCouncilPacket,
    ratings: FrozenRatings,
    reveal: FrozenMappingReveal,
): void {
    assertExactObjectKeys(reveal, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'packet_sha256',
        'ratings_sha256', 'mapping_reveal', 'reveal_sha256',
    ], 'mapping reveal receipt');
    if (reveal.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || reveal.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || reveal.run_id !== packet.run_id
        || reveal.generation !== 1
        || reveal.packet_sha256 !== packet.packet_sha256
        || reveal.ratings_sha256 !== ratings.ratings_sha256) fail('mapping reveal identity mismatch');
    assertBlindMappingReveal(reveal.mapping_reveal, 'mapping_reveal');
    if (sha256(canonicalJson(reveal.mapping_reveal)) !== packet.blind_mapping_commitment_sha256) {
        fail('mapping reveal commitment mismatch');
    }
    assertSha256(reveal.reveal_sha256, 'reveal_sha256');
    if (digestWithout(reveal, 'reveal_sha256') !== reveal.reveal_sha256) fail('mapping reveal hash mismatch');
}
