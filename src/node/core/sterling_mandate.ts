/**
 * Sterling Mandate enforcement.
 *
 * "No change is final until it satisfies all three legs:
 *   - Lore     — a `.feature` Gherkin contract describes the behavior.
 *   - Isolation — a unit test confirms the logic in a sandbox.
 *   - Audit    — Gungnir score holds or improves (warden / score / validation)."
 *
 * Every bead transition to `RESOLVED` flows through `verifySterlingMandate`.
 * The verdict is one of:
 *   - ACCEPTED — all three legs proven.
 *   - EXEMPT   — bead carries `mandate_exempt: true` + non-empty `exemption_reason`.
 *   - REJECTED — at least one leg unproven; reasons enumerate every gap.
 *
 * The verifier is pure-deterministic and read-only. The caller (`handleBead`)
 * decides whether to throw, stamp metadata, or surface a warning.
 */

import fs from 'node:fs';
import path from 'node:path';

import { database } from '../../tools/pennyone/intel/database.js';
import type { HallBeadRecord, HallValidationVerdict } from '../../types/hall.js';

export type WardenVerdict = 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';

export interface MandateWardenResult {
    name: string;
    verdict: WardenVerdict;
    ran_at: number;
    notes?: string;
}

export interface MandateAuditProof {
    /** Numeric Gungnir score; must equal-or-improve over `bead.baseline_scores.gungnir`. */
    gungnir_score?: number;
    /** Wardens that have been run; need ≥1 ACCEPTED and zero REJECTED to count. */
    warden_results?: MandateWardenResult[];
    /** hall_validation_runs.validation_id; row must exist with verdict ACCEPTED or SUCCESS. */
    validation_id?: string;
}

export interface MandateEvidence {
    /** Gherkin `.feature` paths (Lore). Resolved against hubRoot; must exist. */
    lore_paths?: string[];
    /** Unit-test paths (Isolation). Resolved against hubRoot; must exist. */
    isolation_paths?: string[];
    /** Audit proof. ANY of the three sub-fields satisfies the leg. */
    audit?: MandateAuditProof;
    /** Skip the mandate entirely. Requires non-empty `exemption_reason`. */
    mandate_exempt?: boolean;
    /** Justification for the exemption (recorded to bead metadata + audit log). */
    exemption_reason?: string;
}

export type MandateLegStatus = 'satisfied' | 'unsatisfied';

export interface MandateLegReport {
    leg: 'lore' | 'isolation' | 'audit';
    status: MandateLegStatus;
    reason: string;
    artifacts?: string[];
}

export type MandateVerdictKind = 'ACCEPTED' | 'REJECTED' | 'EXEMPT';

export interface MandateVerdict {
    verdict: MandateVerdictKind;
    bead_id: string;
    hub_root: string;
    legs: MandateLegReport[];
    reasons: string[];
    exemption_reason?: string;
    evaluated_at: number;
}

const ACCEPT_VALIDATION_VERDICTS: ReadonlySet<HallValidationVerdict> = new Set<HallValidationVerdict>([
    'ACCEPTED',
    'SUCCESS',
]);

/**
 * Minimum standalone Gungnir score required for the Audit leg.
 * When the bead carries `baseline_scores.gungnir`, the score must hold-or-improve over baseline.
 * When no baseline exists, the score must still clear this floor — otherwise a fresh
 * bead with `gungnir_score: 0` would satisfy the audit leg, which defeats the purpose.
 */
export const MIN_GUNGNIR_AUDIT_SCORE = 60;

const GHERKIN_KEYWORD_RE = /^\s*(Feature|Scenario Outline|Scenario|Background|Rule)\s*:/m;

function checkArtifactsExist(paths: readonly string[], hubRoot: string): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const p of paths) {
        const abs = path.isAbsolute(p) ? p : path.resolve(hubRoot, p);
        if (!fs.existsSync(abs)) missing.push(p);
    }
    return { ok: missing.length === 0, missing };
}

function checkLore(evidence: MandateEvidence, hubRoot: string): MandateLegReport {
    const paths = evidence.lore_paths ?? [];
    if (paths.length === 0) {
        return { leg: 'lore', status: 'unsatisfied', reason: 'no lore_paths declared (need ≥1 .feature path)' };
    }
    const { ok, missing } = checkArtifactsExist(paths, hubRoot);
    if (!ok) {
        return {
            leg: 'lore',
            status: 'unsatisfied',
            reason: `lore artifacts missing on disk: ${missing.join(', ')}`,
            artifacts: paths,
        };
    }
    // Gherkin sniff — existence alone is insufficient. A `.feature` file containing
    // plain prose or JSON does not describe behavior.
    const nonGherkin: string[] = [];
    for (const p of paths) {
        const abs = path.isAbsolute(p) ? p : path.resolve(hubRoot, p);
        let content: string;
        try {
            content = fs.readFileSync(abs, 'utf-8');
        } catch (err) {
            nonGherkin.push(`${p} (read failed: ${(err as Error).message})`);
            continue;
        }
        if (!GHERKIN_KEYWORD_RE.test(content)) {
            nonGherkin.push(p);
        }
    }
    if (nonGherkin.length > 0) {
        return {
            leg: 'lore',
            status: 'unsatisfied',
            reason: `lore artifacts lack Gherkin keywords (Feature/Scenario/Background/Rule): ${nonGherkin.join(', ')}`,
            artifacts: paths,
        };
    }
    return { leg: 'lore', status: 'satisfied', reason: `${paths.length} lore artifact(s) verified`, artifacts: paths };
}

function checkIsolation(evidence: MandateEvidence, hubRoot: string): MandateLegReport {
    const paths = evidence.isolation_paths ?? [];
    if (paths.length === 0) {
        return { leg: 'isolation', status: 'unsatisfied', reason: 'no isolation_paths declared (need ≥1 unit-test path)' };
    }
    const { ok, missing } = checkArtifactsExist(paths, hubRoot);
    if (!ok) {
        return {
            leg: 'isolation',
            status: 'unsatisfied',
            reason: `isolation artifacts missing on disk: ${missing.join(', ')}`,
            artifacts: paths,
        };
    }
    return { leg: 'isolation', status: 'satisfied', reason: `${paths.length} isolation artifact(s) verified`, artifacts: paths };
}

function checkAudit(bead: HallBeadRecord, evidence: MandateEvidence): MandateLegReport {
    const audit = evidence.audit;
    if (!audit) {
        return { leg: 'audit', status: 'unsatisfied', reason: 'no audit proof provided (need warden_results, gungnir_score, or validation_id)' };
    }
    const proofs: string[] = [];
    const reasons: string[] = [];

    if (audit.warden_results && audit.warden_results.length > 0) {
        const rejected = audit.warden_results.filter((w) => w.verdict === 'REJECTED');
        const accepted = audit.warden_results.filter((w) => w.verdict === 'ACCEPTED');
        if (rejected.length > 0) {
            reasons.push(`warden(s) REJECTED: ${rejected.map((w) => w.name).join(', ')}`);
        } else if (accepted.length === 0) {
            reasons.push('warden_results contains zero ACCEPTED verdicts');
        } else {
            proofs.push(`wardens: ${accepted.map((w) => w.name).join(', ')}`);
        }
    }

    if (typeof audit.gungnir_score === 'number') {
        const baselineRaw = (bead.baseline_scores as Record<string, unknown> | undefined)?.gungnir;
        const baseline = typeof baselineRaw === 'number' ? baselineRaw : null;
        if (baseline !== null && audit.gungnir_score < baseline) {
            reasons.push(`gungnir_score=${audit.gungnir_score} < baseline=${baseline}`);
        } else if (audit.gungnir_score < MIN_GUNGNIR_AUDIT_SCORE) {
            reasons.push(`gungnir_score=${audit.gungnir_score} < floor=${MIN_GUNGNIR_AUDIT_SCORE}`);
        } else {
            proofs.push(`gungnir_score=${audit.gungnir_score}${baseline !== null ? ` (≥ baseline ${baseline})` : ` (≥ floor ${MIN_GUNGNIR_AUDIT_SCORE}; no baseline)`}`);
        }
    }

    if (audit.validation_id) {
        const run = database.getValidationRunById(audit.validation_id);
        if (run === null) {
            reasons.push(`validation_id '${audit.validation_id}' not found in hall_validation_runs`);
        } else if (!ACCEPT_VALIDATION_VERDICTS.has(run.verdict)) {
            reasons.push(`validation_id '${audit.validation_id}' has verdict=${run.verdict} (need ACCEPTED or SUCCESS)`);
        } else {
            proofs.push(`validation_id=${audit.validation_id} (verdict=${run.verdict})`);
        }
    }

    if (proofs.length === 0) {
        return {
            leg: 'audit',
            status: 'unsatisfied',
            reason: reasons.length > 0 ? reasons.join('; ') : 'audit proof present but produced no satisfied sub-leg',
        };
    }
    return { leg: 'audit', status: 'satisfied', reason: proofs.join('; ') };
}

/**
 * Evaluate the Sterling Mandate against a bead + evidence payload.
 *
 * Pure-deterministic. Reads disk for lore/isolation existence checks and
 * the Hall for validation_id resolution; never mutates either.
 *
 * @param bead the bead record being transitioned
 * @param evidence mandate evidence (typically merged from bead.metadata.mandate_evidence + per-call args)
 * @param hubRoot hub root used to resolve relative lore/isolation paths
 * @returns verdict + per-leg status + cumulative reasons array
 */
export function verifySterlingMandate(
    bead: HallBeadRecord,
    evidence: MandateEvidence,
    hubRoot: string,
): MandateVerdict {
    const evaluatedAt = Date.now();

    if (evidence.mandate_exempt === true) {
        const reason = (evidence.exemption_reason ?? '').trim();
        if (reason.length === 0) {
            return {
                verdict: 'REJECTED',
                bead_id: bead.bead_id,
                hub_root: hubRoot,
                legs: [],
                reasons: ['mandate_exempt=true requires a non-empty exemption_reason'],
                evaluated_at: evaluatedAt,
            };
        }
        return {
            verdict: 'EXEMPT',
            bead_id: bead.bead_id,
            hub_root: hubRoot,
            legs: [],
            reasons: [],
            exemption_reason: reason,
            evaluated_at: evaluatedAt,
        };
    }

    const legs = [
        checkLore(evidence, hubRoot),
        checkIsolation(evidence, hubRoot),
        checkAudit(bead, evidence),
    ];
    const failed = legs.filter((l) => l.status === 'unsatisfied');
    if (failed.length > 0) {
        return {
            verdict: 'REJECTED',
            bead_id: bead.bead_id,
            hub_root: hubRoot,
            legs,
            reasons: failed.map((l) => `[${l.leg}] ${l.reason}`),
            evaluated_at: evaluatedAt,
        };
    }
    return {
        verdict: 'ACCEPTED',
        bead_id: bead.bead_id,
        hub_root: hubRoot,
        legs,
        reasons: [],
        evaluated_at: evaluatedAt,
    };
}

/**
 * Merge call-site mandate_evidence with anything already cached on
 * `bead.metadata.mandate_evidence`. Call-site fields win on conflict.
 *
 * @param bead the bead carrying potential cached evidence
 * @param fromArgs fresh evidence supplied with the resolve/update call
 * @returns merged evidence ready for verification
 */
export function mergeMandateEvidence(
    bead: HallBeadRecord,
    fromArgs: MandateEvidence | undefined,
): MandateEvidence {
    const cached = (bead.metadata?.mandate_evidence ?? {}) as MandateEvidence;
    const fresh = fromArgs ?? {};
    return {
        lore_paths: fresh.lore_paths ?? cached.lore_paths,
        isolation_paths: fresh.isolation_paths ?? cached.isolation_paths,
        audit: fresh.audit ?? cached.audit,
        mandate_exempt: fresh.mandate_exempt ?? cached.mandate_exempt,
        exemption_reason: fresh.exemption_reason ?? cached.exemption_reason,
    };
}
