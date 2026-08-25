import type Database from 'better-sqlite3';

import {
    buildForgeOperatorIntentProjection,
    LEGACY_EXACT_FORGE_CHALLENGE_PROFILE,
    ROOT_USER_FORGE_INTENT_PROFILE,
    type ForgeOperatorIntentProjection,
    type ForgeOperatorIntentSubjectKind,
} from '../../pennyone/intel/forge_authorization_policy.js';
import type { HallForgeRequestRecord } from '../../../types/forge.js';
import type { VerifiedForgeOperatorIntent } from './forge_operator_intent_attestation.js';

interface ForgeAuthorizationCandidate {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    requester_thread_id?: string;
    requester_turn_id?: string;
    requester_record_set_sha256?: string;
    authorization_profile?: string;
    target_ref?: string;
}

interface CandidateMatch {
    candidate: ForgeAuthorizationCandidate;
    kind: ForgeOperatorIntentSubjectKind;
    value: string;
}

const REFERENCE_STOPWORDS = new Set([
    'a', 'an', 'and', 'accepted', 'bounded', 'build', 'change', 'feature', 'fix', 'forge',
    'for', 'implement', 'improvement', 'in', 'of', 'please', 'proposal', 'repair',
    'proposed', 'route', 'send', 'synthetic', 'the', 'this', 'through', 'to', 'update',
    'via', 'work',
]);
const NUMBER_WORDS: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function tokens(value: string): string[] {
    const raw = (value.normalize('NFKC').toLowerCase().match(/[\p{L}]+|[\p{N}]+/gu) ?? [])
        .map((token) => NUMBER_WORDS[token] ?? token)
        .filter((token) => !REFERENCE_STOPWORDS.has(token));
    const folded: string[] = [];
    for (let index = 0; index < raw.length; index += 1) {
        const token = raw[index]!;
        const next = raw[index + 1];
        if (['phase', 'pr', 'q', 'recovery'].includes(token) && /^\d+$/.test(next ?? '')) {
            folded.push(`${token}${next}`);
            index += 1;
        } else {
            folded.push(token);
        }
    }
    return folded;
}

function loadCandidates(
    db: Database.Database,
): ForgeAuthorizationCandidate[] {
    const rows = db.prepare(`
        SELECT r.request_id, r.repo_id, r.bead_id, r.decision_id,
               r.requester_thread_id, r.requester_turn_id,
               r.requester_record_set_sha256, r.authorization_profile,
               b.target_ref
        FROM hall_forge_requests r
        JOIN hall_beads b ON b.bead_id = r.bead_id AND b.repo_id = r.repo_id
        WHERE r.status = 'PENDING_AUTH'
          AND b.status NOT IN ('RESOLVED', 'ARCHIVED', 'SUPERSEDED')
          AND NOT EXISTS (
              SELECT 1 FROM hall_forge_attempts a WHERE a.request_id = r.request_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM hall_forge_authorizations z WHERE z.request_id = r.request_id
          )
        ORDER BY r.request_id
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
        request_id: String(row.request_id),
        repo_id: String(row.repo_id),
        bead_id: String(row.bead_id),
        decision_id: String(row.decision_id),
        requester_thread_id: optionalString(row.requester_thread_id),
        requester_turn_id: optionalString(row.requester_turn_id),
        requester_record_set_sha256: optionalString(row.requester_record_set_sha256),
        authorization_profile: optionalString(row.authorization_profile),
        target_ref: optionalString(row.target_ref),
    }));
}

function isIdentifierCharacter(value: string | undefined): boolean {
    return value !== undefined && /[\p{L}\p{N}_:./-]/u.test(value);
}

function stripExactIdentifier(
    text: string,
    identifier: string,
): { text: string; matched: boolean } {
    let remainder = text;
    const needle = identifier.toLowerCase();
    let lower = remainder.toLowerCase();
    let offset = lower.indexOf(needle);
    let matched = false;
    while (offset >= 0) {
        const before = offset === 0 ? undefined : lower[offset - 1];
        const afterOffset = offset + needle.length;
        const after = afterOffset === lower.length ? undefined : lower[afterOffset];
        if (!isIdentifierCharacter(before) && !isIdentifierCharacter(after)) {
            remainder = `${remainder.slice(0, offset)} ${remainder.slice(afterOffset)}`;
            lower = remainder.toLowerCase();
            matched = true;
            offset = lower.indexOf(needle);
        } else {
            offset = lower.indexOf(needle, offset + 1);
        }
    }
    return { text: remainder, matched };
}

function sameTokens(left: string[], right: string[]): boolean {
    return left.length === right.length
        && left.every((token, index) => token === right[index]);
}

function exactIdentifierMatch(text: string, candidate: ForgeAuthorizationCandidate): CandidateMatch | null {
    const bead = stripExactIdentifier(text, candidate.bead_id);
    const decision = stripExactIdentifier(bead.text, candidate.decision_id);
    if (!bead.matched && !decision.matched) return null;
    const remainderTokens = tokens(decision.text);
    const targetTokens = tokens(candidate.target_ref ?? '');
    if (remainderTokens.length !== 0 && !sameTokens(remainderTokens, targetTokens)) {
        return null;
    }
    return bead.matched
        ? { candidate, kind: 'bead', value: candidate.bead_id }
        : { candidate, kind: 'decision', value: candidate.decision_id };
}

function targetReferenceMatch(
    messageTokens: string[],
    candidate: ForgeAuthorizationCandidate,
): CandidateMatch | null {
    if (!candidate.target_ref) return null;
    const referenceTokens = tokens(candidate.target_ref);
    if (referenceTokens.length === 0 || !sameTokens(messageTokens, referenceTokens)) {
        return null;
    }
    return { candidate, kind: 'target_ref', value: candidate.target_ref };
}

function isStructuredStageToken(token: string): boolean {
    return /^(?:phase|pr|q)\d+$/.test(token);
}

function derivedDecisionOperatorLabel(
    candidate: ForgeAuthorizationCandidate,
): string[] {
    const targetTokens = new Set(tokens(candidate.target_ref ?? ''));
    const alias: string[] = [];
    const identityTokens = new Set<string>();
    const stageTokens = new Set<string>();
    for (const token of tokens(candidate.decision_id)) {
        const stage = isStructuredStageToken(token);
        const identity = !stage && targetTokens.has(token) && !/^\d+$/.test(token);
        if (!stage && !identity) continue;
        if (!alias.includes(token)) alias.push(token);
        if (identity) identityTokens.add(token);
        if (stage) stageTokens.add(token);
    }
    return alias.length >= 3 && identityTokens.size >= 1 && stageTokens.size >= 1
        ? alias
        : [];
}

function boundedOperatorLabelMatch(
    messageTokens: string[],
    candidate: ForgeAuthorizationCandidate,
): CandidateMatch | null {
    const alias = derivedDecisionOperatorLabel(candidate);
    return alias.length > 0 && sameTokens(messageTokens, alias)
        ? { candidate, kind: 'decision', value: candidate.decision_id }
        : null;
}

function requesterLineageMatches(
    candidate: ForgeAuthorizationCandidate,
    attestation: VerifiedForgeOperatorIntent,
): boolean {
    return candidate.requester_thread_id === attestation.thread_id
        && candidate.requester_turn_id === attestation.turn_id
        && candidate.requester_record_set_sha256 === attestation.session_record_set_sha256;
}

function canonicalMissionDecisionId(decisionId: string): string {
    return decisionId.replace(
        /-i[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
        '',
    );
}

function replayCandidate(
    db: Database.Database,
    selected: HallForgeRequestRecord,
    attestation: VerifiedForgeOperatorIntent,
): ForgeAuthorizationCandidate | null {
    if (
        selected.operator_thread_id !== attestation.thread_id
        || selected.operator_turn_id !== attestation.turn_id
        || selected.operator_record_set_sha256 !== attestation.session_record_set_sha256
    ) return null;
    const targetRef = db.prepare(
        'SELECT target_ref FROM hall_beads WHERE bead_id = ? AND repo_id = ?',
    ).pluck().get(selected.bead_id, selected.repo_id) as string | null | undefined;
    return {
        ...selected,
        target_ref: optionalString(targetRef),
    };
}

export function resolveForgeOperatorWorkItem(
    db: Database.Database,
    selected: HallForgeRequestRecord,
    attestation: VerifiedForgeOperatorIntent,
    options: { allowStoredSetManifest?: boolean } = {},
): ForgeOperatorIntentProjection {
    if (attestation.binding_mode === 'exact_request_receipt'
        || attestation.binding_mode === 'exact_mission_record') {
        if (attestation.bound_request_id !== selected.request_id
            || attestation.bound_request_sha256 !== selected.request_sha256
            || attestation.bound_decision_id !== selected.decision_id
            || attestation.work_reference_text !== selected.bead_id
            || selected.requester_thread_id !== attestation.thread_id) {
            throw new Error('forge_operator_intent_exact_request_binding_mismatch');
        }
        if (attestation.binding_mode === 'exact_mission_record') {
            const missionDecisionId = canonicalMissionDecisionId(selected.decision_id);
            const eligible = loadCandidates(db).filter((candidate) =>
                candidate.repo_id === selected.repo_id
                && candidate.bead_id === selected.bead_id
                && candidate.requester_thread_id === attestation.thread_id
                && canonicalMissionDecisionId(candidate.decision_id) === missionDecisionId);
            const replay = replayCandidate(db, selected, attestation);
            if (replay && !eligible.some((candidate) => candidate.request_id === replay.request_id)) {
                eligible.push(replay);
            }
            if (eligible.length !== 1 || eligible[0]!.request_id !== selected.request_id) {
                throw new Error('forge_operator_intent_mission_candidate_ambiguous');
            }
        }
        return buildForgeOperatorIntentProjection({
            action: attestation.action,
            requester_lineage_mode: attestation.binding_mode === 'exact_request_receipt'
                ? 'explicit_request_receipt_binding'
                : 'explicit_mission_record_binding',
            kind: 'bead',
            value: selected.bead_id,
            repo_id: selected.repo_id,
        });
    }
    const candidates = loadCandidates(db);
    const replay = replayCandidate(db, selected, attestation);
    if (replay && !candidates.some((candidate) => candidate.request_id === replay.request_id)) {
        candidates.push(replay);
    }
    const messageTokens = tokens(attestation.work_reference_text);
    const matches = candidates.flatMap((candidate) => {
        const exact = exactIdentifierMatch(attestation.work_reference_text, candidate);
        const target = exact ? null : targetReferenceMatch(messageTokens, candidate);
        const bounded = exact || target ? null : boundedOperatorLabelMatch(messageTokens, candidate);
        return [exact ?? target ?? bounded].filter(
            (value): value is CandidateMatch => value !== null,
        );
    });
    if (matches.length === 0) throw new Error('forge_operator_intent_work_item_not_found');
    if (matches.length !== 1) throw new Error('forge_operator_intent_work_item_ambiguous');
    const resolved = matches[0]!;
    if (resolved.candidate.request_id !== selected.request_id) {
        throw new Error('forge_operator_intent_selected_request_mismatch');
    }
    if (selected.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE) {
        if (!requesterLineageMatches(resolved.candidate, attestation)) {
            if (!replay && !(options.allowStoredSetManifest === true
                && selected.requester_thread_id === attestation.thread_id)) {
                throw new Error('forge_operator_intent_requester_lineage_mismatch');
            }
        }
    } else if (selected.authorization_profile !== LEGACY_EXACT_FORGE_CHALLENGE_PROFILE) {
        throw new Error('forge_operator_intent_request_profile_invalid');
    }
    return buildForgeOperatorIntentProjection({
        action: attestation.action,
        requester_lineage_mode: options.allowStoredSetManifest === true
            && !requesterLineageMatches(resolved.candidate, attestation)
            ? 'stored_set_manifest'
            : selected.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
                && requesterLineageMatches(resolved.candidate, attestation)
                ? 'same_turn_request'
                : 'explicit_legacy_request_upgrade',
        kind: resolved.kind,
        value: resolved.value,
        repo_id: selected.repo_id,
    });
}
