import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
    buildReliabilityContinuation,
    classifyReliabilityTargetPath,
    deriveReliabilityRiskTier,
    isPositiveReliabilityVerdict,
    isReliabilityEnabled,
    unverifiedReliabilityReceipt,
    verifyReliabilityReceipt,
} from '../../../src/tools/cstar-kernel-mcp/tools/reliability_loop.js';
import { loadRuntimePolicy } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_policy.js';

const HASH = 'a'.repeat(64);
const runtimePolicy = loadRuntimePolicy();
const roots: string[] = [];

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, canonical(child)]),
        );
    }
    return value;
}

function hashJson(value: unknown): string {
    return sha256(JSON.stringify(canonical(value)));
}

function makeGungnir() {
    const record = {
        path: 'src/target.ts',
        extension: '.ts',
        source_sha256: HASH,
        coverage: 'heuristic',
        breaches: [],
        matrix: { overall: 8 },
    };
    const recordWithEvidence = {
        ...record,
        evidence_sha256: hashJson({
            path: record.path,
            extension: record.extension,
            source_sha256: record.source_sha256,
            coverage: record.coverage,
            breaches: record.breaches,
            matrix: record.matrix,
        }),
    };
    const gungnir = {
        schema: 'cstar.gungnir_evidence.v1' as const,
        version: 1,
        score_scale: 10,
        overall_score: 8,
        scored_count: 1,
        candidate_count: 1,
        excluded_count: 0,
        records: [recordWithEvidence],
        exclusions: [],
        formula: 'arithmetic_mean(records[*].matrix.overall) over scored_count',
        canonical_sources: {
            engine: { path: 'src/gungnir.ts', sha256: HASH },
            matrix_schema: { path: 'src/gungnir-schema.ts', sha256: HASH },
        },
        scorer_command: {
            fixed_scorer_command_sha256: HASH,
            argv_sha256: HASH,
            node_path: '/usr/bin/node',
        },
        authority: 'heuristic_evidence_only' as const,
        process_evidence: { exit_code: 0, stdout_sha256: HASH, stderr_sha256: HASH },
    };
    return {
        ...gungnir,
        valid: true as const,
        aggregate_evidence_sha256: hashJson({
            schema: gungnir.schema,
            version: gungnir.version,
            score_scale: gungnir.score_scale,
            overall_score: gungnir.overall_score,
            scored_count: gungnir.scored_count,
            candidate_count: gungnir.candidate_count,
            excluded_count: gungnir.excluded_count,
            records: gungnir.records,
            exclusions: gungnir.exclusions,
            formula: gungnir.formula,
            canonical_sources: gungnir.canonical_sources,
            scorer_command: gungnir.scorer_command,
            authority: gungnir.authority,
            process_evidence: gungnir.process_evidence,
        }),
    };
}

function makeRunnerReceipt(
    verdict: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE' = 'ACCEPTED',
    total = 1,
    maxTrials = total,
): Record<string, unknown> {
    const passed = verdict === 'REJECTED' ? 0 : 1;
    const failed = total - passed;
    const trial = {
        trial_hash: HASH,
        success: verdict !== 'REJECTED',
        output_sha256: HASH,
        stderr_sha256: HASH,
    };
    return {
        schema: 'cstar.workflow_sprt_autoresearcher.v1',
        sprt_verdict: verdict,
        passed,
        failed,
        total,
        workflow_score: Math.round((100 * passed / total) * 1e12) / 1e12,
        sprt: {
            alpha: 0.01,
            beta: 0.01,
            p0: 0.01,
            p1: 0.2,
            llr: verdict === 'ACCEPTED' ? 5 : verdict === 'REJECTED' ? -5 : 0,
            lower_boundary: -4,
            upper_boundary: 4,
            raw_status: verdict.toLowerCase(),
            passed,
            failed,
            total,
        },
        limits: { effective: { max_trials: maxTrials } },
        trials: Array.from({ length: total }, () => trial),
        trial_hashes: Array.from({ length: total }, () => HASH),
        node_runtime: {
            selected: {
                path: '/usr/bin/node',
                node_version: `v${runtimePolicy.node.version}`,
                modules_abi: runtimePolicy.node.node_module_version,
                napi_version: runtimePolicy.node.napi_version,
                better_sqlite3_version: runtimePolicy.native.version,
                argv_sha256: HASH,
            },
            probes: [],
            selection_evidence_sha256: HASH,
            native_dependency: 'better-sqlite3',
            compatibility_smoke: 'in_memory_select_1_no_write',
            smoke_is_no_write: true,
            smoke_source_sha256: HASH,
        },
        candidate_source_paths: ['src/target.ts'],
        candidate_source_digest: HASH,
        lifecycle_source_paths: ['src/tools/cstar-kernel-mcp/tools/result.ts'],
        lifecycle_source_digest: HASH,
        command_argv: { stage_pass: ['node'], full_lifecycle: ['node'] },
        command_argv_sha256: { stage_pass: HASH, full_lifecycle: HASH },
        lifecycle: {
            request: true,
            authorization: true,
            synthetic_execute: true,
            delivered_unverified: true,
            independent_validation_record_result: true,
            closeout_terminal: true,
            cstar_record_result_called: false,
            cstar_acceptance_authority: 'independent_cstar_record_result_required',
        },
        external_effects: { receipt_write: false },
        gungnir: makeGungnir(),
    };
}

function receiptFixture(
    receipt = makeRunnerReceipt(),
    manifestArtifacts?: Array<{ path: string; sha256: string }>,
) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-reliability-loop-'));
    roots.push(root);
    const content = `${JSON.stringify(receipt)}\n`;
    fs.writeFileSync(path.join(root, 'receipt.json'), content, { mode: 0o600 });
    return {
        root,
        content,
        input: { path: path.join(root, 'receipt.json'), sha256: sha256(content) },
        manifest: {
            artifacts: manifestArtifacts ?? [{ path: 'receipt.json', sha256: sha256(content) }],
        },
    };
}

function continuationInput(overrides: Record<string, unknown> = {}) {
    const base = {
        scope: {
            bead_id: 'bead:test:reliability',
            repo_id: 'repo:test',
            target_kind: 'FILE',
            target_path: 'src/target.ts',
            target_ref: 'src/target.ts',
            rationale: 'Synthetic reliability proof',
            acceptance_criteria: 'Independent bounded proof',
            checker_shell: 'node --test',
            contract_refs: ['tests/features/cstar_reliability_loop.feature'],
        },
        metadata: { reliability_auto_repair: true },
        risk_tier: 'routine',
        reported_verdict: 'ACCEPTED',
        stored_verdict: 'ACCEPTED',
        validation_persisted: true,
        validation_authority: 'verified_v2',
        authoritative: true,
        validation_id: 'validation:test:reliability',
        validation_evidence_sha256: HASH,
        reliability: unverifiedReliabilityReceipt(false, 'reliability_receipt_missing'),
    };
    return {
        ...base,
        ...overrides,
        scope: { ...base.scope, ...(overrides.scope as Record<string, unknown> | undefined) },
        metadata: { ...base.metadata, ...(overrides.metadata as Record<string, unknown> | undefined) },
    } as Parameters<typeof buildReliabilityContinuation>[0];
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CStar Reliability Loop v1 pure contract', () => {
    it('keeps legacy calls opt-in and classifies risk monotonically', () => {
        assert.equal(isReliabilityEnabled(undefined, false), false);
        assert.equal(isReliabilityEnabled({ reliability_loop_version: 'v1' }, false), true);
        assert.equal(isReliabilityEnabled(undefined, true), true);
        assert.equal(classifyReliabilityTargetPath('docs/guide.md'), 'routine');
        assert.equal(classifyReliabilityTargetPath('src/feature.ts'), 'elevated');
        assert.equal(classifyReliabilityTargetPath('src/tools/cstar-kernel-mcp/tools/result.ts'), 'critical');
        assert.equal(deriveReliabilityRiskTier({ reliability_risk_tier: 'routine' }, 'src/tools/cstar-kernel-mcp/tools/result.ts'), 'critical');
        assert.equal(deriveReliabilityRiskTier({ reliability_risk_tier: 'critical' }, 'docs/guide.md'), 'critical');
        assert.equal(isPositiveReliabilityVerdict('ACCEPTED'), true);
        assert.equal(isPositiveReliabilityVerdict('REJECTED'), false);
    });

    it('accepts a valid hash-bound runner receipt and a compatible path alias', () => {
        const value = receiptFixture();
        const verified = verifyReliabilityReceipt(value.root, value.manifest, value.input);
        assert.equal(verified.verified, true, JSON.stringify(verified));
        assert.equal(verified.sprt_verdict, 'ACCEPTED');
        assert.deepEqual(verified.trials, { passed: 1, failed: 0, total: 1, max: 1 });
        assert.equal(verified.gungnir?.overall_score, 8);
        const aliased = verifyReliabilityReceipt(value.root, value.manifest, {
            ...value.input,
            path: path.join(value.root, '.', 'receipt.json'),
        });
        assert.equal(aliased.verified, true, JSON.stringify(aliased));
    });

    it('rejects missing, malformed, wrong-hash, traversal, unbound, and duplicate receipts', () => {
        const missing = verifyReliabilityReceipt('/tmp', undefined, undefined);
        assert.equal(missing.error, 'reliability_receipt_missing');
        const value = receiptFixture();
        assert.equal(
            verifyReliabilityReceipt(value.root, value.manifest, { ...value.input, sha256: HASH }).error,
            'reliability_receipt_sha256_mismatch',
        );
        assert.match(
            verifyReliabilityReceipt(value.root, value.manifest, { path: path.join(value.root, '..', 'outside.json'), sha256: HASH }).error ?? '',
            /reliability_receipt_path_traversal|reliability_receipt_unreadable/,
        );
        fs.writeFileSync(path.join(value.root, 'other.json'), value.content, { mode: 0o600 });
        assert.equal(
            verifyReliabilityReceipt(value.root, {
                artifacts: [{ path: 'other.json', sha256: value.input.sha256 }],
            }, value.input).error,
            'reliability_receipt_not_bound_to_validation_manifest',
        );
        assert.equal(
            verifyReliabilityReceipt(value.root, {
                artifacts: [
                    { path: 'receipt.json', sha256: value.input.sha256 },
                    { path: './receipt.json', sha256: value.input.sha256 },
                ],
            }, value.input).error,
            'reliability_receipt_manifest_duplicate_artifact',
        );
        fs.writeFileSync(path.join(value.root, 'malformed.json'), '{not-json}\n', { mode: 0o600 });
        const malformedContent = fs.readFileSync(path.join(value.root, 'malformed.json'), 'utf8');
        assert.equal(
            verifyReliabilityReceipt(value.root, {
                artifacts: [{ path: 'malformed.json', sha256: sha256(malformedContent) }],
            }, { path: path.join(value.root, 'malformed.json'), sha256: sha256(malformedContent) }).error,
            'reliability_receipt_json_invalid',
        );
    });

    it('rejects a malformed Gungnir section instead of treating its score as authority', () => {
        const receipt = makeRunnerReceipt();
        (receipt.gungnir as Record<string, unknown>).authority = 'validation';
        const value = receiptFixture(receipt);
        const result = verifyReliabilityReceipt(value.root, value.manifest, value.input);
        assert.equal(result.verified, false);
        assert.equal(result.error, 'reliability_receipt_schema_invalid');
    });
});

describe('CStar Reliability Loop v1 continuation states', () => {
    it('accepts routine authoritative validation without requiring SPRT', () => {
        const result = buildReliabilityContinuation(continuationInput());
        assert.equal(result.state, 'accepted');
        assert.equal(result.risk_tier, 'routine');
        assert.equal(result.repair_bead_create_draft, undefined);
    });

    it('requires critical proof and creates a deterministic repair draft only when enabled', () => {
        const input = continuationInput({
            risk_tier: 'critical',
            reported_verdict: 'ACCEPTED',
            stored_verdict: 'INCONCLUSIVE',
            authoritative: false,
            metadata: { reliability_auto_repair: true },
        });
        const first = buildReliabilityContinuation(input);
        const second = buildReliabilityContinuation(input);
        assert.equal(first.state, 'repairing');
        assert.deepEqual(first.repair_bead_create_draft, second.repair_bead_create_draft);
        const draft = first.repair_bead_create_draft as Record<string, unknown>;
        assert.deepEqual(draft.repository_binding, { repo_id: 'repo:test' });
        assert.equal(draft.action, 'create');
        assert.equal(draft.status, 'OPEN');
        assert.equal(typeof draft.idempotency_key, 'string');
        const gated = buildReliabilityContinuation(continuationInput({
            ...input,
            metadata: { reliability_auto_repair: true, reliability_operator_gate: true },
        }));
        assert.equal(gated.state, 'operator_decision_required');
        assert.equal(gated.repair_bead_create_draft, undefined);
    });

    it('accepts critical validation only with an independently verified ACCEPTED receipt', () => {
        const value = receiptFixture();
        const receipt = verifyReliabilityReceipt(value.root, value.manifest, value.input);
        const result = buildReliabilityContinuation(continuationInput({
            risk_tier: 'critical',
            reliability: receipt,
        }));
        assert.equal(result.state, 'accepted');
        assert.equal(result.proof_summary.reliability_receipt_verified, true);
        assert.equal(result.proof_summary.sprt_verdict, 'ACCEPTED');
    });

    it('keeps inconclusive verified SPRT work active only while trials remain', () => {
        const value = receiptFixture(makeRunnerReceipt('INCONCLUSIVE', 1, 2));
        const receipt = verifyReliabilityReceipt(value.root, value.manifest, value.input);
        const result = buildReliabilityContinuation(continuationInput({
            risk_tier: 'critical',
            reported_verdict: 'INCONCLUSIVE',
            stored_verdict: 'INCONCLUSIVE',
            reliability: receipt,
        }));
        assert.equal(result.state, 'working');
        assert.match(result.next_action, /remaining bounded SPRT trials/);
    });

    it('never lets Gungnir override a rejected SPRT or bypass an operator gate', () => {
        const value = receiptFixture(makeRunnerReceipt('REJECTED'));
        const receipt = verifyReliabilityReceipt(value.root, value.manifest, value.input);
        const rejected = buildReliabilityContinuation(continuationInput({
            risk_tier: 'critical',
            reported_verdict: 'REJECTED',
            stored_verdict: 'REJECTED',
            reliability: receipt,
        }));
        assert.notEqual(rejected.state, 'accepted');
        assert.equal(rejected.proof_summary.gungnir?.overall_score, 8);
        const noRepair = buildReliabilityContinuation(continuationInput({
            reported_verdict: 'REJECTED',
            stored_verdict: 'REJECTED',
            metadata: { reliability_auto_repair: false },
        }));
        assert.equal(noRepair.state, 'operator_decision_required');
    });
});
