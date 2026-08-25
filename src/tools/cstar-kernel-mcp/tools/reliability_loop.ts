import { createHash } from 'node:crypto';
import path from 'node:path';
import type { HallValidationEvidenceManifest } from '../../../types/validation_evidence.js';
import {
    readBoundedUtf8FileInside,
    resolveExistingPathInside,
    resolveExistingRelativePathInside,
} from '../contracts/runtime.js';
import { loadRuntimePolicy } from '../contracts/runtime_policy.js';
export type ReliabilityRiskTier = 'routine' | 'elevated' | 'critical';
export type ReliabilityContinuationState =
    | 'working'
    | 'repairing'
    | 'accepted'
    | 'operator_decision_required';
export interface ReliabilityReceiptInput {
    path: string;
    sha256: string;
}
interface RunnerSprt {
    alpha: number;
    beta: number;
    p0: number;
    p1: number;
    llr: number;
    lower_boundary: number;
    upper_boundary: number;
    raw_status: string;
    passed: number;
    failed: number;
    total: number;
}
interface RunnerGungnir {
    schema: 'cstar.gungnir_evidence.v1';
    authority: 'heuristic_evidence_only';
    valid: true;
    overall_score: number;
    scored_count: number;
    candidate_count: number;
    excluded_count: number;
    formula: string;
    aggregate_evidence_sha256: string;
    records: unknown[];
    exclusions: unknown[];
}
export interface VerifiedReliabilityReceipt {
    present: boolean;
    verified: boolean;
    error?: string;
    path?: string;
    sha256?: string;
    receipt?: Record<string, unknown>;
    sprt_verdict?: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';
    trials?: { passed: number; failed: number; total: number; max: number };
    gungnir?: {
        overall_score: number;
        scored_count: number;
        candidate_count: number;
        excluded_count: number;
        aggregate_evidence_sha256: string;
    };
}
export interface ReliabilityContinuation {
    schema: 'cstar.reliability_continuation.v1';
    state: ReliabilityContinuationState;
    risk_tier: ReliabilityRiskTier;
    proof_summary: {
        validation_persisted: boolean;
        validation_authority: string;
        reported_verdict: string;
        stored_verdict: string | null;
        reliability_receipt_present: boolean;
        reliability_receipt_verified: boolean;
        reason: string;
        sprt_verdict?: string;
        trials?: { passed: number; failed: number; total: number; max: number };
        gungnir?: {
            overall_score: number;
            scored_count: number;
            candidate_count: number;
            excluded_count: number;
            aggregate_evidence_sha256: string;
        };
    };
    validation_binding: {
        validation_id: string;
        validation_evidence_sha256: string | null;
        reliability_receipt_path: string | null;
        reliability_receipt_sha256: string | null;
    };
    authority_effect: 'process_only';
    next_action: string;
    repair_bead_create_draft?: Record<string, unknown>;
}
interface BeadScope {
    bead_id: string;
    repo_id: string;
    target_kind?: string;
    target_path?: string;
    target_ref?: string;
    rationale?: string;
    acceptance_criteria?: string;
    checker_shell?: string;
    contract_refs?: string[];
}
interface ContinuationInput {
    scope: BeadScope;
    metadata?: Record<string, unknown>;
    risk_tier: ReliabilityRiskTier;
    reported_verdict: string;
    stored_verdict: string | null;
    validation_persisted: boolean;
    validation_authority: string;
    authoritative: boolean;
    validation_id: string;
    validation_evidence_sha256?: string | null;
    reliability: VerifiedReliabilityReceipt;
}
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const PROTECTED_PATH = /(^|\/)(kernel|cstar-kernel-mcp|pennyone|hall(?:_|\/)|transport|runtime|validation|control-plane)(\/|\.|$)/i;
const ROUTINE_ROOT = /^(?:docs|tests|\.agents\/skills)(\/|$)/i;
const POSITIVE = new Set(['ACCEPTED', 'SUCCESS']);
const RISK_RANK: Record<ReliabilityRiskTier, number> = { routine: 0, elevated: 1, critical: 2 };
const RELIABILITY_ENABLE_KEYS = [
    'reliability_auto_repair',
    'reliability_risk_tier',
    'reliability_loop_version',
    'reliability_gate',
    'reliability_gate_required',
    'reliability_external_gate',
    'reliability_protected_gate',
    'reliability_operator_gate',
] as const;
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
function safeInteger(value: unknown, minimum = 0): value is number {
    return Number.isSafeInteger(value) && Number(value) >= minimum;
}
function hashJson(value: unknown): string {
    const canonical = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(canonical);
        if (isRecord(item)) {
            return Object.fromEntries(
                Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
                    .map(([key, child]) => [key, canonical(child)]),
            );
        }
        return item;
    };
    return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf-8').digest('hex');
}

function normalPath(value: string | undefined): string {
    return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}
function hasTraversalSegment(value: string): boolean {
    return value.replace(/\\/g, '/').split('/').includes('..');
}
export function isReliabilityEnabled(
    metadata: Record<string, unknown> | undefined,
    receiptSupplied: boolean,
): boolean {
    return receiptSupplied || Boolean(metadata && RELIABILITY_ENABLE_KEYS.some((key) => (
        Object.prototype.hasOwnProperty.call(metadata, key)
    )));
}
export function classifyReliabilityTargetPath(targetPath?: string): ReliabilityRiskTier {
    const normalized = normalPath(targetPath);
    if (!normalized || ROUTINE_ROOT.test(normalized)) return 'routine';
    if (PROTECTED_PATH.test(normalized)) return 'critical';
    if (/^(?:src|scripts)(\/|$)/i.test(normalized)) return 'elevated';
    return 'routine';
}
export function deriveReliabilityRiskTier(
    metadata?: Record<string, unknown>,
    targetPath?: string,
): ReliabilityRiskTier {
    const pathTier = classifyReliabilityTargetPath(targetPath);
    const metadataTier = metadata?.reliability_risk_tier;
    const declared = metadataTier === 'routine' || metadataTier === 'elevated' || metadataTier === 'critical'
        ? metadataTier : 'routine';
    return RISK_RANK[declared] >= RISK_RANK[pathTier] ? declared : pathTier;
}
function invalidReceipt(present: boolean, error: string): VerifiedReliabilityReceipt {
    return { present, verified: false, error };
}

export function unverifiedReliabilityReceipt(
    present: boolean,
    error: string,
): VerifiedReliabilityReceipt {
    return invalidReceipt(present, error);
}

function requireHash(value: unknown): boolean {
    return typeof value === 'string' && SHA256.test(value);
}

function validateRunnerGungnir(value: unknown): value is RunnerGungnir {
    if (!isRecord(value)
        || value.schema !== 'cstar.gungnir_evidence.v1'
        || value.authority !== 'heuristic_evidence_only'
        || value.valid !== true
        || !finite(value.overall_score) || value.overall_score < 0 || value.overall_score > 10
        || !safeInteger(value.scored_count, 1)
        || !safeInteger(value.candidate_count, 1)
        || !safeInteger(value.excluded_count)
        || value.scored_count + value.excluded_count !== value.candidate_count
        || value.formula !== 'arithmetic_mean(records[*].matrix.overall) over scored_count'
        || !requireHash(value.aggregate_evidence_sha256)
        || !Array.isArray(value.records) || value.records.length !== value.scored_count
        || !Array.isArray(value.exclusions) || value.exclusions.length !== value.excluded_count) return false;
    const canonicalSources = value.canonical_sources;
    if (!isRecord(canonicalSources)
        || !isRecord(canonicalSources.engine)
        || !isRecord(canonicalSources.matrix_schema)
        || !nonempty(canonicalSources.engine.path)
        || !nonempty(canonicalSources.matrix_schema.path)
        || !requireHash(canonicalSources.engine.sha256)
        || !requireHash(canonicalSources.matrix_schema.sha256)) return false;
    const records = value.records.every((entry) => {
        if (!isRecord(entry) || !nonempty(entry.path) || !nonempty(entry.extension)
            || !requireHash(entry.source_sha256) || !requireHash(entry.evidence_sha256)
            || entry.coverage !== 'heuristic' || !Array.isArray(entry.breaches) || !isRecord(entry.matrix)) return false;
        return finite(entry.matrix.overall) && entry.matrix.overall >= 0 && entry.matrix.overall <= 10
            && entry.evidence_sha256 === hashJson({
                path: entry.path, extension: entry.extension, source_sha256: entry.source_sha256,
                coverage: entry.coverage, breaches: entry.breaches, matrix: entry.matrix,
            });
    });
    const exclusions = value.exclusions.every((entry) => isRecord(entry)
        && nonempty(entry.path) && requireHash(entry.source_sha256) && nonempty(entry.reason));
    if (!records || !exclusions || !isRecord(value.scorer_command) || !isRecord(value.process_evidence)) return false;
    if (!requireHash(value.scorer_command.fixed_scorer_command_sha256)
        || !requireHash(value.scorer_command.argv_sha256)
        || !nonempty(value.scorer_command.node_path)
        || !safeInteger(value.process_evidence.exit_code, 0)
        || !requireHash(value.process_evidence.stdout_sha256)
        || !requireHash(value.process_evidence.stderr_sha256)) return false;
    const aggregate = {
        schema: value.schema,
        version: value.version,
        score_scale: value.score_scale,
        overall_score: value.overall_score,
        scored_count: value.scored_count,
        candidate_count: value.candidate_count,
        excluded_count: value.excluded_count,
        records: value.records,
        exclusions: value.exclusions,
        formula: value.formula,
        canonical_sources: value.canonical_sources,
        scorer_command: value.scorer_command,
        authority: value.authority,
        process_evidence: value.process_evidence,
    };
    return value.aggregate_evidence_sha256 === hashJson(aggregate);
}
function validateRunnerReceipt(value: unknown): value is Record<string, unknown> & {
    sprt_verdict: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';
    passed: number; failed: number; total: number; sprt: RunnerSprt; gungnir: RunnerGungnir;
} {
    if (!isRecord(value)) return false;
    const runtimePolicy = loadRuntimePolicy();
    const effectiveLimits = isRecord(value.limits) && isRecord(value.limits.effective)
        ? value.limits.effective : undefined;
    const lifecycle = isRecord(value.lifecycle) ? value.lifecycle : undefined;
    if (value.schema !== 'cstar.workflow_sprt_autoresearcher.v1'
        || !['ACCEPTED', 'REJECTED', 'INCONCLUSIVE'].includes(String(value.sprt_verdict))
        || !safeInteger(value.passed) || !safeInteger(value.failed) || !safeInteger(value.total, 1)
        || value.passed + value.failed !== value.total || !finite(value.workflow_score)
        || value.workflow_score !== Math.round((100 * value.passed / value.total) * 1e12) / 1e12
        || !isRecord(value.sprt) || !safeInteger(value.sprt.passed) || !safeInteger(value.sprt.failed)
        || value.sprt.passed !== value.passed || value.sprt.failed !== value.failed
        || value.sprt.total !== value.total || !finite(value.sprt.alpha) || !finite(value.sprt.beta)
        || !finite(value.sprt.p0) || !finite(value.sprt.p1) || value.sprt.alpha <= 0 || value.sprt.alpha >= 1
        || value.sprt.beta <= 0 || value.sprt.beta >= 1 || value.sprt.p0 <= 0 || value.sprt.p0 >= value.sprt.p1
        || value.sprt.p1 >= 1 || !finite(value.sprt.llr) || !finite(value.sprt.lower_boundary)
        || !finite(value.sprt.upper_boundary) || !nonempty(value.sprt.raw_status)
        || !effectiveLimits
        || !safeInteger(effectiveLimits.max_trials, 1)
        || effectiveLimits.max_trials > 12
        || !Array.isArray(value.trials) || value.trials.length !== value.total
        || !Array.isArray(value.trial_hashes) || value.trial_hashes.length !== value.total
        || !value.trial_hashes.every(requireHash)
        || !isRecord(value.node_runtime) || !isRecord(value.node_runtime.selected)
        || !Array.isArray(value.node_runtime.probes)
        || !requireHash(value.node_runtime.selection_evidence_sha256)
        || value.node_runtime.native_dependency !== runtimePolicy.native.dependency
        || value.node_runtime.compatibility_smoke !== 'in_memory_select_1_no_write'
        || value.node_runtime.smoke_is_no_write !== true
        || !requireHash(value.node_runtime.smoke_source_sha256)
        || !nonempty(value.node_runtime.selected.path)
        || value.node_runtime.selected.node_version !== `v${runtimePolicy.node.version}`
        || value.node_runtime.selected.modules_abi !== runtimePolicy.node.node_module_version
        || value.node_runtime.selected.napi_version !== runtimePolicy.node.napi_version
        || value.node_runtime.selected.better_sqlite3_version !== runtimePolicy.native.version
        || !requireHash(value.node_runtime.selected.argv_sha256)
        || !Array.isArray(value.candidate_source_paths) || value.candidate_source_paths.length === 0
        || !requireHash(value.candidate_source_digest)
        || !Array.isArray(value.lifecycle_source_paths) || value.lifecycle_source_paths.length === 0
        || !requireHash(value.lifecycle_source_digest)
        || !isRecord(value.command_argv) || !isRecord(value.command_argv_sha256)
        || !Array.isArray(value.command_argv.stage_pass) || !Array.isArray(value.command_argv.full_lifecycle)
        || !value.command_argv.stage_pass.every((entry) => typeof entry === 'string')
        || !value.command_argv.full_lifecycle.every((entry) => typeof entry === 'string')
        || !requireHash(value.command_argv_sha256.stage_pass)
        || !requireHash(value.command_argv_sha256.full_lifecycle)
        || !lifecycle
        || !['request', 'authorization', 'synthetic_execute', 'delivered_unverified', 'independent_validation_record_result', 'closeout_terminal']
            .every((stage) => lifecycle[stage] === true)
        || lifecycle.cstar_record_result_called !== false
        || lifecycle.cstar_acceptance_authority !== 'independent_cstar_record_result_required'
        || !isRecord(value.external_effects)
        || Object.entries(value.external_effects).some(([key, item]) => key !== 'receipt_write' && item !== false)
        || !validateRunnerGungnir(value.gungnir)) return false;
    return value.trials.every((trial) => isRecord(trial) && requireHash(trial.trial_hash)
        && typeof trial.success === 'boolean' && requireHash(trial.output_sha256)
        && requireHash(trial.stderr_sha256));
}
export function verifyReliabilityReceipt(
    repositoryRoot: string,
    manifest: Pick<HallValidationEvidenceManifest, 'artifacts'> | undefined,
    input: ReliabilityReceiptInput | undefined,
): VerifiedReliabilityReceipt {
    if (!input) return invalidReceipt(false, 'reliability_receipt_missing');
    if (!nonempty(input.path) || !requireHash(input.sha256)) return invalidReceipt(true, 'reliability_receipt_input_invalid');
    if (hasTraversalSegment(input.path)) return invalidReceipt(true, 'reliability_receipt_path_traversal');
    try {
        const file = readBoundedUtf8FileInside(repositoryRoot, input.path, MAX_RECEIPT_BYTES);
        const actual = createHash('sha256').update(file.content, 'utf-8').digest('hex');
        if (actual !== input.sha256.toLowerCase()) return invalidReceipt(true, 'reliability_receipt_sha256_mismatch');
        const canonicalArtifacts = (manifest?.artifacts ?? []).map((entry) => {
            if (hasTraversalSegment(entry.path)) throw new Error('reliability_receipt_manifest_path_traversal');
            return {
                path: path.isAbsolute(entry.path)
                    ? resolveExistingPathInside(repositoryRoot, entry.path, 'file')
                    : resolveExistingRelativePathInside(repositoryRoot, entry.path, 'file'),
                sha256: entry.sha256.toLowerCase(),
            };
        });
        if (new Set(canonicalArtifacts.map((entry) => entry.path)).size !== canonicalArtifacts.length) {
            return invalidReceipt(true, 'reliability_receipt_manifest_duplicate_artifact');
        }
        const matches = canonicalArtifacts.filter((entry) => (
            entry.path === file.path && entry.sha256 === actual
        ));
        if (matches.length !== 1) return invalidReceipt(true, 'reliability_receipt_not_bound_to_validation_manifest');
        let parsed: unknown;
        try { parsed = JSON.parse(file.content); } catch { return invalidReceipt(true, 'reliability_receipt_json_invalid'); }
        if (!validateRunnerReceipt(parsed)) return invalidReceipt(true, 'reliability_receipt_schema_invalid');
        const maxTrials = (parsed.limits as { effective: { max_trials: number } }).effective.max_trials;
        return {
            present: true,
            verified: true,
            path: file.path,
            sha256: actual,
            receipt: parsed,
            sprt_verdict: parsed.sprt_verdict,
            trials: {
                passed: parsed.passed, failed: parsed.failed, total: parsed.total,
                max: maxTrials,
            },
            gungnir: {
                overall_score: parsed.gungnir.overall_score,
                scored_count: parsed.gungnir.scored_count,
                candidate_count: parsed.gungnir.candidate_count,
                excluded_count: parsed.gungnir.excluded_count,
                aggregate_evidence_sha256: parsed.gungnir.aggregate_evidence_sha256,
            },
        };
    } catch (error) {
        return invalidReceipt(true, error instanceof Error ? `reliability_receipt_unreadable:${error.message}` : 'reliability_receipt_unreadable');
    }
}

function autoRepair(metadata: Record<string, unknown> | undefined): boolean {
    return metadata?.reliability_auto_repair === true;
}

function operatorGate(metadata: Record<string, unknown> | undefined): boolean {
    return metadata?.reliability_external_gate === true
        || metadata?.reliability_protected_gate === true
        || metadata?.reliability_operator_gate === true
        || metadata?.reliability_gate === true
        || metadata?.reliability_gate_required === true;
}

function repairDraft(input: ContinuationInput, reason: string): Record<string, unknown> {
    const failureFingerprint = hashJson({
        validation_id: input.validation_id,
        reported_verdict: input.reported_verdict,
        stored_verdict: input.stored_verdict,
        reason,
        validation_evidence_sha256: input.validation_evidence_sha256 ?? null,
        reliability_receipt_sha256: input.reliability.sha256 ?? null,
        reliability_error: input.reliability.error ?? null,
        sprt_verdict: input.reliability.sprt_verdict ?? null,
    });
    const key = hashJson({
        repo_id: input.scope.repo_id, bead_id: input.scope.bead_id,
        target_kind: input.scope.target_kind ?? null, target_path: input.scope.target_path ?? null,
        target_ref: input.scope.target_ref ?? null, risk_tier: input.risk_tier, reason,
        validation_id: input.validation_id, failure_fingerprint: failureFingerprint,
    });
    return {
        action: 'create',
        bead_id: `bead:reliability-repair:${key.slice(0, 32)}`,
        repository_binding: { repo_id: input.scope.repo_id },
        target_kind: input.scope.target_kind ?? 'OTHER',
        target_path: input.scope.target_path,
        target_ref: input.scope.target_ref ?? input.scope.target_path,
        rationale: `Repair reliability evidence for ${input.scope.bead_id}: ${reason}`,
        acceptance_criteria: 'Independent validation and the tier-required reliability proof are persisted before acceptance.',
        checker_shell: input.scope.checker_shell,
        contract_refs: input.scope.contract_refs ?? [],
        status: 'OPEN',
        metadata: {
            reliability_parent_bead_id: input.scope.bead_id,
            reliability_repair_key: key,
            reliability_failure_fingerprint: failureFingerprint,
            reliability_validation_id: input.validation_id,
            reliability_risk_tier: input.risk_tier,
            reliability_auto_repair: false,
        },
        idempotency_key: key,
    };
}

export function buildReliabilityContinuation(input: ContinuationInput): ReliabilityContinuation {
    const effectiveVerdict = input.stored_verdict ?? '';
    const reportedPositive = POSITIVE.has(input.reported_verdict);
    const positive = POSITIVE.has(effectiveVerdict);
    const criticalPositiveProofInvalid = input.risk_tier === 'critical'
        && reportedPositive
        && (!input.reliability.verified || input.reliability.sprt_verdict !== 'ACCEPTED');
    const remainingTrials = input.validation_persisted && input.authoritative
        && input.reliability.verified
        && input.reliability.sprt_verdict === 'INCONCLUSIVE'
        && !['REJECTED', 'FAILURE'].includes(effectiveVerdict)
        && Boolean(input.reliability.trials && input.reliability.trials.total < input.reliability.trials.max);
    let reason = 'validation_acceptance_requirements_met';
    if (!input.validation_persisted) reason = 'validation_not_persisted';
    else if (remainingTrials) reason = 'bounded_sprt_trials_remaining';
    else if (criticalPositiveProofInvalid) reason = input.reliability.error || 'critical_sprt_not_accepted';
    else if (reportedPositive && (!input.authoritative || !positive)) reason = 'positive_validation_unverified';
    else if (effectiveVerdict === 'REJECTED' || effectiveVerdict === 'FAILURE') reason = 'independent_validation_rejected';
    else if (effectiveVerdict === 'INCONCLUSIVE') reason = 'validation_inconclusive';
    const gate = operatorGate(input.metadata);
    const repairable = !gate && autoRepair(input.metadata) && !remainingTrials && reason !== 'validation_acceptance_requirements_met';
    const state: ReliabilityContinuationState = input.validation_persisted && input.authoritative
        && !criticalPositiveProofInvalid && positive
        ? 'accepted'
        : remainingTrials && !gate
            ? 'working'
            : repairable ? 'repairing' : 'operator_decision_required';
    const continuation: ReliabilityContinuation = {
        schema: 'cstar.reliability_continuation.v1',
        state,
        risk_tier: input.risk_tier,
        proof_summary: {
            validation_persisted: input.validation_persisted,
            validation_authority: input.validation_authority,
            reported_verdict: input.reported_verdict,
            stored_verdict: input.stored_verdict,
            reliability_receipt_present: input.reliability.present,
            reliability_receipt_verified: input.reliability.verified,
            reason,
            ...(input.reliability.sprt_verdict ? { sprt_verdict: input.reliability.sprt_verdict } : {}),
            ...(input.reliability.trials ? { trials: input.reliability.trials } : {}),
            ...(input.reliability.gungnir ? { gungnir: input.reliability.gungnir } : {}),
        },
        validation_binding: {
            validation_id: input.validation_id,
            validation_evidence_sha256: input.validation_evidence_sha256 ?? null,
            reliability_receipt_path: input.reliability.path ?? null,
            reliability_receipt_sha256: input.reliability.sha256 ?? null,
        },
        authority_effect: 'process_only',
        next_action: state === 'accepted'
            ? 'continue to bounded closeout'
            : state === 'working'
                ? 'run the remaining bounded SPRT trials, then validate independently'
                : state === 'repairing'
                    ? 'materialize the repair bead draft, assign Luna Max, repair, and validate independently'
                    : 'real operator decision required before repair or protected continuation',
    };
    if (state === 'repairing') continuation.repair_bead_create_draft = repairDraft(input, reason);
    return continuation;
}
export function isPositiveReliabilityVerdict(verdict: string): boolean {
    return POSITIVE.has(verdict);
}
