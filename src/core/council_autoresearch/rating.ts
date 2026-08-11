import { verify as verifySignature } from 'node:crypto';

import {
    BlindMappingReveal,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    FrozenCouncilPacket,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    fail,
    readJson,
    resolveContained,
    sha256,
    sha256File,
} from './contracts.js';
import { assertBlindMappingReveal, verifyFrozenPacket } from './packet.js';

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
    authority_key_id_sha256: string;
    channel_attestation: {
        input_channels: ['packet', 'protocol', 'variant_a', 'variant_b', 'rubric', 'evidence'];
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

export interface CouncilDecision {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    generation: 1;
    packet_sha256: string;
    ratings_sha256: string;
    reveal_sha256: string;
    verdict: 'ACCEPTED' | 'REJECTED' | 'REJECTED_PROTECTED_AXIS' | 'INCONCLUSIVE';
    advisory_outcome_only: true;
    promotion_authorized: false;
    candidate_label: 'A' | 'B';
    effective_non_tie_ratings: number;
    candidate_preferences: number;
    baseline_preferences: number;
    ties: number;
    final_log_likelihood: number;
    nominal_boundaries: { upper: number; lower: number };
    protected_axis_regressions: Array<{ expert: string; axis: string }>;
    trajectory: Array<{
        expert: string;
        preference: CouncilPreference;
        contribution: number;
        cumulative: number;
        effective_non_tie_ratings: number;
    }>;
    method: 'bounded-related-council-sequential-preference-heuristic';
    method_limitations: string[];
    decision_sha256: string;
}

const CHANNELS = ['packet', 'protocol', 'variant_a', 'variant_b', 'rubric', 'evidence'] as const;

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
        token_path: packet.token_path,
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
): void {
    assertExactObjectKeys(receipt, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'expert', 'packet_sha256',
        'protocol_path', 'protocol_sha256', 'input_binding_sha256', 'rating_sha256',
        'output_path', 'output_sha256', 'invocation_id', 'authority_key_id_sha256',
        'channel_attestation', 'signature_base64',
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
        || receipt.authority_key_id_sha256 !== packet.execution_authority.key_id_sha256) {
        fail(`${rating.expert} execution receipt binding mismatch`);
    }
    assertSha256(receipt.output_sha256, `${rating.expert}.output_sha256`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,255}$/.test(receipt.invocation_id)) {
        fail(`${rating.expert} invocation id is invalid`);
    }
    const output = resolveContained(bundleRoot, receipt.output_path, `${rating.expert}.output_path`);
    if (sha256File(output) !== receipt.output_sha256) fail(`${rating.expert} output artifact hash mismatch`);
    if (canonicalJson(readJson<CouncilRating>(output)) !== canonicalJson(rating)) {
        fail(`${rating.expert} output artifact does not contain the signed rating`);
    }
    assertExactObjectKeys(receipt.channel_attestation, [
        'input_channels', 'token_path_read', 'token_path_written', 'observation_writes',
        'independent_promotion_receipt_required',
    ], `${rating.expert}.channel_attestation`);
    if (canonicalJson(receipt.channel_attestation.input_channels) !== canonicalJson(CHANNELS)
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
        packet.execution_authority.public_key_pem,
        Buffer.from(signature, 'base64'),
    )) fail(`${rating.expert} execution signature verification failed`);
}

export function verifyFrozenRatings(
    packet: FrozenCouncilPacket,
    frozen: FrozenRatings,
    bundleRoot: string,
): void {
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
        verifyExecutionReceipt(packet, record.rating, record.execution_receipt, bundleRoot);
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

function decisionDigest(decision: Omit<CouncilDecision, 'decision_sha256'>): string {
    return sha256(canonicalJson(decision));
}

export function verifyDecisionReceipt(decision: CouncilDecision): void {
    assertExactObjectKeys(decision, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'packet_sha256',
        'ratings_sha256', 'reveal_sha256', 'verdict', 'advisory_outcome_only',
        'promotion_authorized', 'candidate_label', 'effective_non_tie_ratings',
        'candidate_preferences', 'baseline_preferences', 'ties', 'final_log_likelihood',
        'nominal_boundaries', 'protected_axis_regressions', 'trajectory', 'method',
        'method_limitations', 'decision_sha256',
    ], 'decision receipt');
    if (decision.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || decision.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || decision.generation !== 1
        || decision.advisory_outcome_only !== true
        || decision.promotion_authorized !== false) fail('decision receipt boundary is invalid');
    assertRunId(decision.run_id);
    for (const [label, digest] of Object.entries({
        packet_sha256: decision.packet_sha256,
        ratings_sha256: decision.ratings_sha256,
        reveal_sha256: decision.reveal_sha256,
        decision_sha256: decision.decision_sha256,
    })) assertSha256(digest, label);
    if (digestWithout(decision, 'decision_sha256') !== decision.decision_sha256) fail('decision hash mismatch');
}

export function evaluateCouncilRatings(
    packet: FrozenCouncilPacket,
    frozen: FrozenRatings,
    reveal: FrozenMappingReveal,
    bundleRoot: string,
): CouncilDecision {
    verifyFrozenPacket(packet, bundleRoot);
    verifyFrozenRatings(packet, frozen, bundleRoot);
    verifyMappingReveal(packet, frozen, reveal);
    const candidateLabel = reveal.mapping_reveal.A === 'candidate' ? 'A' : 'B';
    const baselineLabel = candidateLabel === 'A' ? 'B' : 'A';
    const byExpert = new Map(frozen.ratings.map((record) => [record.rating.expert, record.rating]));
    const protectedRegressions: Array<{ expert: string; axis: string }> = [];
    for (const rating of byExpert.values()) {
        for (const axis of packet.rating_policy.protected_axes) {
            const flag = rating.protected_axis_regressions[axis];
            if (axis !== 'token_path_quarantine') {
                const scores = rating.axis_scores[axis];
                if (scores?.[candidateLabel] < scores?.[baselineLabel] && !flag) {
                    fail(`${rating.expert}.${axis} hides a candidate score regression`);
                }
            }
            if (flag) protectedRegressions.push({ expert: rating.expert, axis });
        }
    }
    const policy = packet.rating_policy;
    const boundaries = {
        upper: Math.log((1 - policy.nominal_beta) / policy.nominal_alpha),
        lower: Math.log(policy.nominal_beta / (1 - policy.nominal_alpha)),
    };
    let llr = 0;
    let effective = 0;
    let candidatePreferences = 0;
    let baselinePreferences = 0;
    let ties = 0;
    const trajectory: CouncilDecision['trajectory'] = [];
    for (const expert of packet.derived_order) {
        const rating = byExpert.get(expert)!;
        let contribution = 0;
        if (rating.preference === candidateLabel) {
            contribution = Math.log(policy.p1 / policy.p0);
            candidatePreferences += 1;
            effective += 1;
        } else if (rating.preference === baselineLabel) {
            contribution = Math.log((1 - policy.p1) / (1 - policy.p0));
            baselinePreferences += 1;
            effective += 1;
        } else ties += 1;
        llr += contribution;
        trajectory.push({ expert, preference: rating.preference, contribution, cumulative: llr, effective_non_tie_ratings: effective });
    }
    const verdict = protectedRegressions.length > 0
        ? 'REJECTED_PROTECTED_AXIS'
        : effective < policy.minimum_effective_ratings
            ? 'INCONCLUSIVE'
            : llr >= boundaries.upper ? 'ACCEPTED' : llr <= boundaries.lower ? 'REJECTED' : 'INCONCLUSIVE';
    const base: Omit<CouncilDecision, 'decision_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: packet.run_id,
        generation: 1,
        packet_sha256: packet.packet_sha256,
        ratings_sha256: frozen.ratings_sha256,
        reveal_sha256: reveal.reveal_sha256,
        verdict,
        advisory_outcome_only: true,
        promotion_authorized: false,
        candidate_label: candidateLabel,
        effective_non_tie_ratings: effective,
        candidate_preferences: candidatePreferences,
        baseline_preferences: baselinePreferences,
        ties,
        final_log_likelihood: llr,
        nominal_boundaries: boundaries,
        protected_axis_regressions: protectedRegressions,
        trajectory,
        method: 'bounded-related-council-sequential-preference-heuristic',
        method_limitations: [
            'Council lenses are related expert protocols, not established independent Bernoulli trials.',
            'Nominal alpha and beta configure heuristic boundaries; they are not empirical error guarantees.',
            'The verdict is advisory and cannot authorize source promotion or any other effect.',
        ],
    };
    return { ...base, decision_sha256: decisionDigest(base) };
}
