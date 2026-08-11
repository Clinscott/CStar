import {
    CANONICAL_COUNCIL,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    FrozenCouncilPacket,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    fail,
    sha256,
} from './contracts.js';
import {
    CouncilExecutionTrustPolicy,
    verifyPacketAgainstTrustPolicy,
} from './execution_trust.js';
import { verifyFrozenPacket } from './packet.js';
import {
    CouncilPreference,
    FrozenMappingReveal,
    FrozenRatings,
    verifyFrozenRatings,
    verifyMappingReveal,
} from './rating.js';

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
    promotion_eligible: boolean;
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

function digestWithout<T extends object, K extends keyof T>(value: T, key: K): string {
    const copy = { ...value };
    delete copy[key];
    return sha256(canonicalJson(copy));
}

function decisionDigest(decision: Omit<CouncilDecision, 'decision_sha256'>): string {
    return sha256(canonicalJson(decision));
}

export function verifyDecisionReceiptStructure(decision: CouncilDecision): void {
    assertExactObjectKeys(decision, [
        'schema_version', 'runner_version', 'run_id', 'generation', 'packet_sha256',
        'ratings_sha256', 'reveal_sha256', 'verdict', 'advisory_outcome_only',
        'promotion_eligible', 'promotion_authorized', 'candidate_label', 'effective_non_tie_ratings',
        'candidate_preferences', 'baseline_preferences', 'ties', 'final_log_likelihood',
        'nominal_boundaries', 'protected_axis_regressions', 'trajectory', 'method',
        'method_limitations', 'decision_sha256',
    ], 'decision receipt');
    if (decision.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || decision.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || decision.generation !== 1
        || decision.advisory_outcome_only !== true
        || decision.promotion_eligible !== (decision.verdict === 'ACCEPTED')
        || decision.promotion_authorized !== false) fail('decision receipt boundary is invalid');
    assertRunId(decision.run_id);
    if (!['ACCEPTED', 'REJECTED', 'REJECTED_PROTECTED_AXIS', 'INCONCLUSIVE'].includes(decision.verdict)) {
        fail('decision verdict is invalid');
    }
    if (decision.candidate_label !== 'A' && decision.candidate_label !== 'B') {
        fail('decision candidate label is invalid');
    }
    const counts = [
        decision.effective_non_tie_ratings,
        decision.candidate_preferences,
        decision.baseline_preferences,
        decision.ties,
    ];
    if (counts.some((value) => !Number.isInteger(value) || value < 0)
        || decision.effective_non_tie_ratings
            !== decision.candidate_preferences + decision.baseline_preferences
        || decision.effective_non_tie_ratings + decision.ties !== CANONICAL_COUNCIL.length) {
        fail('decision rating counts are inconsistent');
    }
    if (!Number.isFinite(decision.final_log_likelihood)) fail('decision likelihood must be finite');
    assertExactObjectKeys(decision.nominal_boundaries, ['upper', 'lower'], 'decision nominal boundaries');
    if (!Number.isFinite(decision.nominal_boundaries.upper)
        || !Number.isFinite(decision.nominal_boundaries.lower)
        || decision.nominal_boundaries.lower >= decision.nominal_boundaries.upper) {
        fail('decision nominal boundaries are invalid');
    }
    if (!Array.isArray(decision.protected_axis_regressions)
        || decision.protected_axis_regressions.some((entry) => {
            try {
                assertExactObjectKeys(entry, ['expert', 'axis'], 'protected regression');
                return typeof entry.expert !== 'string' || !entry.expert
                    || typeof entry.axis !== 'string' || !entry.axis;
            } catch {
                return true;
            }
        })) fail('decision protected regressions are invalid');
    if (!Array.isArray(decision.trajectory) || decision.trajectory.length !== CANONICAL_COUNCIL.length) {
        fail('decision trajectory must cover the canonical Council');
    }
    for (const entry of decision.trajectory) {
        assertExactObjectKeys(entry, [
            'expert', 'preference', 'contribution', 'cumulative', 'effective_non_tie_ratings',
        ], 'decision trajectory entry');
        if (typeof entry.expert !== 'string' || !entry.expert
            || !['A', 'B', 'tie'].includes(entry.preference)
            || !Number.isFinite(entry.contribution)
            || !Number.isFinite(entry.cumulative)
            || !Number.isInteger(entry.effective_non_tie_ratings)
            || entry.effective_non_tie_ratings < 0) {
            fail('decision trajectory entry is invalid');
        }
    }
    if (decision.method !== 'bounded-related-council-sequential-preference-heuristic'
        || !Array.isArray(decision.method_limitations)
        || decision.method_limitations.length < 1
        || decision.method_limitations.some((entry) => typeof entry !== 'string' || entry.length < 1)) {
        fail('decision method disclosure is invalid');
    }
    for (const [label, digest] of Object.entries({
        packet_sha256: decision.packet_sha256,
        ratings_sha256: decision.ratings_sha256,
        reveal_sha256: decision.reveal_sha256,
        decision_sha256: decision.decision_sha256,
    })) assertSha256(digest, label);
    if (digestWithout(decision, 'decision_sha256') !== decision.decision_sha256) fail('decision hash mismatch');
}

export function verifyDecisionReceipt(input: {
    decision: CouncilDecision;
    packet: FrozenCouncilPacket;
    ratings: FrozenRatings;
    reveal: FrozenMappingReveal;
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    trustPolicy: CouncilExecutionTrustPolicy;
}): void {
    verifyDecisionReceiptStructure(input.decision);
    const expected = evaluateCouncilRatings(
        input.packet,
        input.ratings,
        input.reveal,
        input.bundleRoot,
        input.runnerPublicationRepoRoot,
        input.trustPolicy,
    );
    if (canonicalJson(expected) !== canonicalJson(input.decision)) {
        fail('decision does not match the frozen evidence');
    }
}

export function evaluateCouncilRatings(
    packet: FrozenCouncilPacket,
    frozen: FrozenRatings,
    reveal: FrozenMappingReveal,
    bundleRoot: string,
    runnerPublicationRepoRoot: string,
    trustPolicy: CouncilExecutionTrustPolicy,
): CouncilDecision {
    verifyPacketAgainstTrustPolicy(packet, trustPolicy);
    verifyFrozenPacket(packet, bundleRoot, runnerPublicationRepoRoot);
    verifyFrozenRatings(packet, frozen, bundleRoot, trustPolicy);
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
    if (!(boundaries.lower < 0 && boundaries.upper > 0 && boundaries.lower < boundaries.upper)) {
        fail('nominal decision boundaries are not ordered around zero');
    }
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
        promotion_eligible: verdict === 'ACCEPTED',
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
