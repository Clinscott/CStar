import {
    GUNGNIR_AXIS_KEYS,
    GUNGNIR_PROJECTION_KEYS,
    createGungnirMatrix,
    type GungnirMatrix,
} from './gungnir.ts';
import type { HallValidationRun } from  './hall.js';

export type ValidationVerdict = 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';
export type BenchmarkStatus = 'PASS' | 'FAIL' | 'SKIPPED';
export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export const PROMOTION_BLOCKING_AXES = ['logic', 'style', 'sovereignty'] as const;

export interface ScoreDelta {
    before: GungnirMatrix;
    after: GungnirMatrix;
    delta: Record<string, number>;
    improved_axes: string[];
    regressed_axes: string[];
}

export interface BenchmarkResult {
    status: BenchmarkStatus;
    summary: string;
    trials: number;
    avg_latency_ms: number;
    min_latency_ms?: number;
    max_latency_ms?: number;
    stddev_latency_ms?: number;
    metadata?: Record<string, unknown>;
}

export interface SprtVerdict {
    verdict: ValidationVerdict;
    summary: string;
    llr: number;
    passed: number;
    total: number;
    lower_bound: number;
    upper_bound: number;
}

export interface ValidationCheck {
    name: string;
    status: CheckStatus;
    details?: string;
}

export interface ValidationEvidence {
    validator_identity: string;
    evidence_sha256: string;
    independent_of_execution: true;
    evaluated_checks: number;
}

export interface ValidationResult {
    validation_id: string;
    verdict: ValidationVerdict;
    summary: string;
    score_delta: ScoreDelta;
    created_at: number;
    benchmark?: BenchmarkResult;
    sprt?: SprtVerdict;
    checks: ValidationCheck[];
    blocking_reasons: string[];
    evidence?: ValidationEvidence;
    evidence_gaps: string[];
    metadata?: Record<string, unknown>;
}

function asMetric(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.round(numeric * 10000) / 10000;
}

export function createScoreDelta(
    before?: Partial<GungnirMatrix> | null,
    after?: Partial<GungnirMatrix> | null,
): ScoreDelta {
    const beforeMatrix = createGungnirMatrix(before ?? {});
    const afterMatrix = createGungnirMatrix(after ?? {});
    const delta: Record<string, number> = {};
    const improvedAxes: string[] = [];
    const regressedAxes: string[] = [];

    for (const key of [...GUNGNIR_AXIS_KEYS, ...GUNGNIR_PROJECTION_KEYS]) {
        const change = asMetric(afterMatrix[key] - beforeMatrix[key]);
        delta[key] = change;
        if (change > 0) {
            improvedAxes.push(key);
        } else if (change < 0) {
            regressedAxes.push(key);
        }
    }

    return {
        before: beforeMatrix,
        after: afterMatrix,
        delta,
        improved_axes: improvedAxes,
        regressed_axes: regressedAxes,
    };
}

export function createBenchmarkResult(input: BenchmarkResult): BenchmarkResult {
    return {
        status: input.status,
        summary: input.summary,
        trials: Number(input.trials),
        avg_latency_ms: asMetric(input.avg_latency_ms),
        min_latency_ms: input.min_latency_ms === undefined ? undefined : asMetric(input.min_latency_ms),
        max_latency_ms: input.max_latency_ms === undefined ? undefined : asMetric(input.max_latency_ms),
        stddev_latency_ms:
            input.stddev_latency_ms === undefined ? undefined : asMetric(input.stddev_latency_ms),
        metadata: { ...(input.metadata ?? {}) },
    };
}

export function createSprtVerdict(input: SprtVerdict): SprtVerdict {
    return {
        verdict: input.verdict,
        summary: input.summary,
        llr: asMetric(input.llr),
        passed: Number(input.passed),
        total: Number(input.total),
        lower_bound: asMetric(input.lower_bound),
        upper_bound: asMetric(input.upper_bound),
    };
}

export function createValidationResult(input: {
    before?: Partial<GungnirMatrix> | null;
    after?: Partial<GungnirMatrix> | null;
    benchmark?: BenchmarkResult;
    sprt?: SprtVerdict;
    checks?: ValidationCheck[];
    evidence?: ValidationEvidence;
    summary?: string;
    validation_id?: string;
    created_at?: number;
    metadata?: Record<string, unknown>;
    allow_regression_override?: boolean;
}): ValidationResult {
    const scoreDelta = createScoreDelta(input.before, input.after);
    const checks = [...(input.checks ?? [])];
    const benchmark = input.benchmark ? createBenchmarkResult(input.benchmark) : undefined;
    const sprt = input.sprt ? createSprtVerdict(input.sprt) : undefined;
    const blockingReasons: string[] = [];
    const evidenceGaps: string[] = [];

    if (!input.allow_regression_override) {
        for (const axis of PROMOTION_BLOCKING_AXES) {
            const delta = scoreDelta.delta[axis];
            if (delta < 0) {
                blockingReasons.push(`Gungnir axis '${axis}' regressed by ${delta.toFixed(4)}.`);
            }
        }
    }

    for (const check of checks) {
        if (check.status === 'FAIL') {
            blockingReasons.push(`Validation check '${check.name}' failed.`);
        }
    }

    if (benchmark?.status === 'FAIL') {
        blockingReasons.push(`Benchmark failed: ${benchmark.summary}`);
    }

    if (sprt?.verdict === 'REJECTED') {
        blockingReasons.push(`SPRT rejected candidate: ${sprt.summary}`);
    }

    const evaluatedChecks = checks.filter((check) => check.status !== 'SKIPPED');
    if (evaluatedChecks.length === 0) {
        evidenceGaps.push('No validation checks were evaluated.');
    }
    if (!input.evidence) {
        evidenceGaps.push('Independent validation evidence is missing.');
    } else {
        if (!input.evidence.validator_identity.trim()) {
            evidenceGaps.push('Validation evidence has no validator identity.');
        }
        if (!/^[a-f0-9]{64}$/i.test(input.evidence.evidence_sha256)) {
            evidenceGaps.push('Validation evidence has no valid SHA-256 digest.');
        }
        if (input.evidence.independent_of_execution !== true) {
            evidenceGaps.push('Validation evidence is not independent of execution.');
        }
        if (input.evidence.evaluated_checks !== evaluatedChecks.length || input.evidence.evaluated_checks <= 0) {
            evidenceGaps.push('Validation evidence evaluated-check count does not match a nonzero check denominator.');
        }
    }
    if (benchmark?.status === 'SKIPPED') {
        evidenceGaps.push('Benchmark was skipped.');
    } else if (benchmark?.status === 'PASS' && benchmark.trials <= 0) {
        evidenceGaps.push('Passing benchmark has a zero trial denominator.');
    }
    if (sprt?.verdict === 'ACCEPTED' && (sprt.total <= 0 || sprt.passed <= 0 || sprt.passed > sprt.total)) {
        evidenceGaps.push('Accepted SPRT verdict has an invalid or zero sample denominator.');
    }

    let verdict: ValidationVerdict;
    if (blockingReasons.length > 0) {
        verdict = 'REJECTED';
    } else if (sprt?.verdict === 'INCONCLUSIVE' || evidenceGaps.length > 0) {
        verdict = 'INCONCLUSIVE';
    } else {
        verdict = 'ACCEPTED';
    }

    const summary =
        input.summary ??
        (verdict === 'ACCEPTED'
            ? 'Validation accepted. Candidate may advance.'
            : verdict === 'INCONCLUSIVE'
              ? 'Validation inconclusive. More evidence is required before promotion.'
              : 'Validation rejected. Promotion gate remains closed.');

    return {
        validation_id: input.validation_id ?? `validation:${Math.random().toString(16).slice(2, 14)}`,
        verdict,
        summary,
        score_delta: scoreDelta,
        created_at: input.created_at ?? Date.now(),
        benchmark,
        sprt,
        checks,
        blocking_reasons: blockingReasons,
        evidence: input.evidence ? { ...input.evidence } : undefined,
        evidence_gaps: evidenceGaps,
        metadata: { ...(input.metadata ?? {}) },
    };
}

export function toHallValidationRun(
    result: ValidationResult,
    repoId: string,
    options: {
        scan_id?: string;
        bead_id?: string;
        target_path?: string;
        notes?: string;
        legacy_trace_id?: number;
    } = {},
): HallValidationRun {
    return {
        validation_id: result.validation_id,
        repo_id: repoId,
        scan_id: options.scan_id,
        bead_id: options.bead_id,
        target_path: options.target_path,
        verdict: result.verdict,
        sprt_verdict: result.sprt?.verdict,
        pre_scores: { ...result.score_delta.before },
        post_scores: { ...result.score_delta.after },
        benchmark: result.benchmark ? { ...result.benchmark } : {},
        notes: options.notes ?? result.summary,
        authority_class: 'reported',
        created_at: result.created_at,
        legacy_trace_id: options.legacy_trace_id,
    };
}
