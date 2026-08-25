/**
 * Sterling Mandate enforcement.
 *
 * "No change is final until it satisfies all three legs:
 *   - Lore     — a `.feature` Gherkin contract describes the behavior.
 *   - Isolation — a unit test confirms the logic in a sandbox.
 *   - Audit    — an independently verified validation receipt proves the result."
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
import type { HallBeadRecord, HallValidationRun, HallValidationVerdict } from '../../types/hall.js';

export type WardenVerdict = 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';

export interface MandateWardenResult {
    name: string;
    verdict: WardenVerdict;
    ran_at: number;
    /** Verified Hall validation receipt backing this independently produced result. */
    validation_id: string;
    /** Must match the validator identity stored on the verified receipt. */
    validator_identity: string;
    /** Must match the evidence digest stored on the verified receipt. */
    evidence_sha256: string;
    /** Explicit assertion required by the validation-evidence recording contract. */
    independent_of_execution: true;
    notes?: string;
}

export interface MandateAuditProof {
    /** Independently recorded wardens; every entry is checked against its verified Hall receipt. */
    warden_results?: MandateWardenResult[];
    /** hall_validation_runs.validation_id; receipt must be verified, positive, and bound to this bead. */
    validation_id?: string;
}

export interface MandateEvidence {
    /** Gherkin `.feature` paths (Lore). Resolved against hubRoot; must exist. */
    lore_paths?: string[];
    /** Unit-test paths (Isolation). Resolved against hubRoot; must exist. */
    isolation_paths?: string[];
    /** Audit proof. A verified validation receipt or verified warden receipt satisfies the leg. */
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

const GHERKIN_KEYWORD_RE = /^\s*(Feature|Scenario Outline|Scenario|Background|Rule)\s*:/m;
const SHA256_RE = /^[a-f0-9]{64}$/;

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

function verifiedReceiptForBead(
    bead: HallBeadRecord,
    validationId: string,
): { ok: true; run: HallValidationRun } | { ok: false; error: string } {
    const normalizedId = validationId.trim();
    if (!normalizedId) return { ok: false, error: 'validation_id must be non-empty' };

    const run = database.getValidationRunById(normalizedId);
    if (run === null) return { ok: false, error: `validation_id '${normalizedId}' not found in hall_validation_runs` };
    if (run.bead_id !== bead.bead_id || run.repo_id !== bead.repo_id) {
        return {
            ok: false,
            error: `validation_id '${normalizedId}' is bound to repo=${run.repo_id}, bead=${run.bead_id ?? 'none'}; expected repo=${bead.repo_id}, bead=${bead.bead_id}`,
        };
    }
    if (run.authority_class !== 'verified') {
        return {
            ok: false,
            error: `validation_id '${normalizedId}' has authority_class=${run.authority_class ?? 'legacy_unverified'} (need verified)`,
        };
    }
    if (!run.validator_identity?.trim()) {
        return { ok: false, error: `validation_id '${normalizedId}' is missing validator_identity` };
    }
    const digest = run.evidence_sha256?.trim().toLowerCase() ?? '';
    if (!SHA256_RE.test(digest)) {
        return { ok: false, error: `validation_id '${normalizedId}' is missing a valid evidence_sha256` };
    }
    return { ok: true, run };
}

function normalizeWardenVerdict(verdict: HallValidationVerdict): WardenVerdict {
    if (verdict === 'ACCEPTED' || verdict === 'SUCCESS') return 'ACCEPTED';
    if (verdict === 'REJECTED' || verdict === 'FAILURE') return 'REJECTED';
    return 'INCONCLUSIVE';
}

function checkAudit(bead: HallBeadRecord, evidence: MandateEvidence): MandateLegReport {
    const audit = evidence.audit;
    if (!audit) {
        return { leg: 'audit', status: 'unsatisfied', reason: 'no audit proof provided (need verified warden_results or validation_id)' };
    }
    const proofs: string[] = [];
    const reasons: string[] = [];
    const legacyAudit = audit as MandateAuditProof & { gungnir_score?: unknown };

    if (Object.prototype.hasOwnProperty.call(legacyAudit, 'gungnir_score')) {
        reasons.push('caller-provided gungnir_score is a historical metric and cannot satisfy the Sterling audit leg');
    }

    if (audit.warden_results && audit.warden_results.length > 0) {
        const acceptedWardens: string[] = [];
        for (const [index, warden] of audit.warden_results.entries()) {
            const label = warden.name?.trim() || `entry-${index + 1}`;
            if (!warden.name?.trim() || !Number.isFinite(warden.ran_at) || warden.ran_at <= 0) {
                reasons.push(`warden '${label}' has invalid name or ran_at`);
                continue;
            }
            if (warden.independent_of_execution !== true) {
                reasons.push(`warden '${label}' must declare independent_of_execution=true`);
                continue;
            }
            const receipt = verifiedReceiptForBead(bead, warden.validation_id ?? '');
            if (!receipt.ok) {
                reasons.push(`warden '${label}': ${receipt.error}`);
                continue;
            }
            const storedIdentity = receipt.run.validator_identity!.trim();
            const storedDigest = receipt.run.evidence_sha256!.trim().toLowerCase();
            if (warden.validator_identity?.trim() !== storedIdentity) {
                reasons.push(`warden '${label}' validator_identity does not match validation receipt`);
                continue;
            }
            if (warden.evidence_sha256?.trim().toLowerCase() !== storedDigest) {
                reasons.push(`warden '${label}' evidence_sha256 does not match validation receipt`);
                continue;
            }
            if (warden.ran_at !== receipt.run.created_at) {
                reasons.push(`warden '${label}' ran_at does not match validation receipt`);
                continue;
            }
            const storedVerdict = normalizeWardenVerdict(receipt.run.verdict);
            if (warden.verdict !== storedVerdict) {
                reasons.push(`warden '${label}' verdict=${warden.verdict} does not match receipt verdict=${storedVerdict}`);
            } else if (storedVerdict === 'REJECTED') {
                reasons.push(`verified warden REJECTED: ${label}`);
            } else if (storedVerdict === 'INCONCLUSIVE') {
                reasons.push(`verified warden INCONCLUSIVE: ${label}`);
            } else {
                acceptedWardens.push(label);
            }
        }
        if (acceptedWardens.length === 0 && reasons.length === 0) {
            reasons.push('warden_results contains zero verified ACCEPTED verdicts');
        } else if (acceptedWardens.length > 0) {
            proofs.push(`verified wardens: ${acceptedWardens.join(', ')}`);
        }
    }

    if (audit.validation_id) {
        const receipt = verifiedReceiptForBead(bead, audit.validation_id);
        if (!receipt.ok) {
            reasons.push(receipt.error);
        } else if (!ACCEPT_VALIDATION_VERDICTS.has(receipt.run.verdict)) {
            reasons.push(`validation_id '${audit.validation_id}' has verdict=${receipt.run.verdict} (need ACCEPTED or SUCCESS)`);
        } else {
            proofs.push(`validation_id=${audit.validation_id} (verdict=${receipt.run.verdict}, authority=verified)`);
        }
    }

    if (reasons.length > 0 || proofs.length === 0) {
        return {
            leg: 'audit',
            status: 'unsatisfied',
            reason: reasons.length > 0
                ? reasons.join('; ')
                : 'audit proof present but produced no verified receipt',
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
