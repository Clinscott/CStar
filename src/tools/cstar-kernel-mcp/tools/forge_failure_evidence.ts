import {
    FORGE_PRE_PROVIDER_RECOVERABLE_FAILURE_CODES,
} from '../../../types/forge.js';
import {
    FORGE_ROLE_ORDER,
    projectForgeRoleEvidence,
    type ForgeRoleReceiptEvidence,
} from './forge_role_evidence.js';

const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER_RECEIPT_KEYS = [
    'binding_sha256', 'final_state', 'journal_sha256', 'journal_valid',
    'phase', 'role', 'synthetic',
].sort();

const PROVIDER_STATE_TUPLES = {
    not_reached: { started: 0, completed: 0, ambiguous: 0, spend: 0, valid: true, synthetic: false },
    capability_consumed: { started: 0, completed: 0, ambiguous: 0, spend: 0, valid: true, synthetic: false },
    dispatch_attempted: { started: 1, completed: 0, ambiguous: 1, spend: 0, valid: true, synthetic: false },
    request_sent: { started: 1, completed: 0, ambiguous: 1, spend: 0, valid: true, synthetic: false },
    response_headers_received: { started: 1, completed: 0, ambiguous: 1, spend: 1, valid: true, synthetic: false },
    response_body_complete: { started: 1, completed: 1, ambiguous: 0, spend: 1, valid: true, synthetic: false },
    invalid_or_missing: { started: 0, completed: 0, ambiguous: 1, spend: 0, valid: false, synthetic: false },
    synthetic_response_complete: { started: 1, completed: 1, ambiguous: 0, spend: 1, valid: true, synthetic: true },
    synthetic_dispatch_ambiguous: { started: 1, completed: 0, ambiguous: 1, spend: 0, valid: true, synthetic: true },
} as const;

type ProviderFinalState = keyof typeof PROVIDER_STATE_TUPLES;

export interface ForgeProviderRequestReceiptEvidence {
    role: typeof FORGE_ROLE_ORDER[number];
    phase: string;
    final_state: ProviderFinalState;
    binding_sha256: string;
    journal_sha256: string | null;
    journal_valid: boolean;
    synthetic: boolean;
}

export interface ForgeFailureEvidenceProjection {
    provider_evidence_valid: boolean;
    success_evidence_valid: boolean;
    pre_spawn_no_spend_proven: boolean;
    role_evidence_valid: boolean;
    forge_topology: 'bounded-six-role-manifest-v1' | null;
    role_plan_sha256: string | null;
    role_receipts: ForgeRoleReceiptEvidence[] | null;
    provider_request_receipts: ForgeProviderRequestReceiptEvidence[];
    provider_requests_started: number;
    provider_requests_completed: number;
    provider_requests_ambiguous: number;
    input_tokens: number | null;
    output_tokens: number | null;
    live_spend: boolean | null;
    live_spend_unknown: boolean;
    known_spend_observed: boolean;
}

export interface ForgeZeroProviderProof {
    provider_evidence_valid: true;
    provider_requests_started: 0;
    provider_requests_completed: 0;
    provider_requests_ambiguous: 0;
    provider_request_receipts: [];
    input_tokens: 0 | null;
    output_tokens: 0 | null;
    live_spend: false;
    live_spend_unknown: false;
    known_spend_observed: false;
}

export const FORGE_PRE_PROVIDER_RECOVERABLE_FAILURES = new Set<string>([
    ...FORGE_PRE_PROVIDER_RECOVERABLE_FAILURE_CODES,
]);

/** Return only a complete, journal-derived proof that no provider boundary ran. */
export function verifiedZeroProviderProof(
    evidence: ForgeFailureEvidenceProjection,
): ForgeZeroProviderProof | null {
    if (
        !evidence.provider_evidence_valid
        || evidence.provider_requests_started !== 0
        || evidence.provider_requests_completed !== 0
        || evidence.provider_requests_ambiguous !== 0
        || evidence.provider_request_receipts.length !== 0
        || (evidence.input_tokens !== 0 && evidence.input_tokens !== null)
        || (evidence.output_tokens !== 0 && evidence.output_tokens !== null)
        || evidence.live_spend !== false
        || evidence.live_spend_unknown
        || evidence.known_spend_observed
    ) return null;
    return {
        provider_evidence_valid: true,
        provider_requests_started: 0,
        provider_requests_completed: 0,
        provider_requests_ambiguous: 0,
        provider_request_receipts: [],
        input_tokens: evidence.input_tokens,
        output_tokens: evidence.output_tokens,
        live_spend: false,
        live_spend_unknown: false,
        known_spend_observed: false,
    };
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function boundedCount(value: unknown): number | null {
    return Number.isSafeInteger(value) && Number(value) >= 0
        && Number(value) <= FORGE_ROLE_ORDER.length ? Number(value) : null;
}

function projectProviderReceipt(
    value: unknown,
    index: number,
): ForgeProviderRequestReceiptEvidence | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (Object.keys(raw).sort().join('\0') !== PROVIDER_RECEIPT_KEYS.join('\0')) return null;
    const state = typeof raw.final_state === 'string'
        && raw.final_state in PROVIDER_STATE_TUPLES
        ? raw.final_state as ProviderFinalState : null;
    if (!state) return null;
    const tuple = PROVIDER_STATE_TUPLES[state];
    const journalDigestValid = state === 'invalid_or_missing'
        ? raw.journal_sha256 === null
        : typeof raw.journal_sha256 === 'string' && DIGEST.test(raw.journal_sha256);
    if (raw.role !== FORGE_ROLE_ORDER[index]
        || raw.phase !== `${index + 1}/${FORGE_ROLE_ORDER.length}`
        || typeof raw.binding_sha256 !== 'string' || !DIGEST.test(raw.binding_sha256)
        || !journalDigestValid || raw.journal_valid !== tuple.valid
        || raw.synthetic !== tuple.synthetic) return null;
    return {
        role: raw.role as typeof FORGE_ROLE_ORDER[number],
        phase: raw.phase as string,
        final_state: state,
        binding_sha256: raw.binding_sha256,
        journal_sha256: raw.journal_sha256 as string | null,
        journal_valid: tuple.valid,
        synthetic: tuple.synthetic,
    };
}

function projectProviderReceipts(value: unknown): {
    receipts: ForgeProviderRequestReceiptEvidence[];
    structurallyValid: boolean;
} {
    if (!Array.isArray(value)) return { receipts: [], structurallyValid: false };
    const receipts: ForgeProviderRequestReceiptEvidence[] = [];
    const boundedLength = Math.min(value.length, FORGE_ROLE_ORDER.length);
    for (let index = 0; index < boundedLength; index += 1) {
        const projected = projectProviderReceipt(value[index], index);
        if (!projected) return { receipts, structurallyValid: false };
        receipts.push(projected);
    }
    return { receipts, structurallyValid: value.length <= FORGE_ROLE_ORDER.length };
}

function sumProviderTuples(receipts: ForgeProviderRequestReceiptEvidence[]) {
    return receipts.reduce((totals, receipt) => {
        const tuple = PROVIDER_STATE_TUPLES[receipt.final_state];
        totals.started += tuple.started;
        totals.completed += tuple.completed;
        totals.ambiguous += tuple.ambiguous;
        totals.spend += tuple.spend;
        return totals;
    }, { started: 0, completed: 0, ambiguous: 0, spend: 0 });
}

function declarationIsInvalid(envelope: Record<string, unknown> | null): boolean {
    if (!envelope) return false;
    return [
        ['live_spend', true],
        ['live_spend_unknown', false],
        ['known_spend_observed', false],
    ].some(([key, nullable]) => hasOwn(envelope, key as string)
        && typeof envelope[key as string] !== 'boolean'
        && !(nullable && envelope[key as string] === null));
}

export function projectForgeFailureEvidence(
    envelope: Record<string, unknown> | null,
    spawnErrorCode: unknown = null,
): ForgeFailureEvidenceProjection {
    const role = projectForgeRoleEvidence(envelope);
    const preSpawn = spawnErrorCode === 'ENOENT' || spawnErrorCode === 'E2BIG';
    if (preSpawn) {
        return {
            provider_evidence_valid: true, success_evidence_valid: false,
            pre_spawn_no_spend_proven: true,
            role_evidence_valid: role.valid,
            forge_topology: role.forge_topology, role_plan_sha256: role.role_plan_sha256,
            role_receipts: role.role_receipts, provider_request_receipts: [],
            provider_requests_started: 0, provider_requests_completed: 0,
            provider_requests_ambiguous: 0,
            input_tokens: role.input_tokens, output_tokens: role.output_tokens,
            live_spend: false, live_spend_unknown: false, known_spend_observed: false,
        };
    }

    const provider = projectProviderReceipts(envelope?.provider_request_receipts);
    const derived = sumProviderTuples(provider.receipts);
    const reportedStarted = boundedCount(envelope?.provider_requests_started);
    const reportedCompleted = boundedCount(envelope?.provider_requests_completed);
    const reportedAmbiguous = boundedCount(envelope?.provider_requests_ambiguous);
    const providerEvidenceValid = provider.structurallyValid
        && reportedStarted === derived.started
        && reportedCompleted === derived.completed
        && reportedAmbiguous === derived.ambiguous;
    const projectedAmbiguous = providerEvidenceValid
        ? derived.ambiguous : Math.max(1, derived.ambiguous);
    const declaredLive = envelope?.live_spend;
    const declaredKnown = envelope?.known_spend_observed;
    const knownSpendObserved = derived.spend > 0
        || declaredLive === true || declaredKnown === true;
    const unsupportedKnownSpend = knownSpendObserved && derived.completed === 0;
    const declarationConflict = (declaredLive === false && knownSpendObserved)
        || (declaredKnown === false && derived.completed > 0);
    const explicitAmbiguity = envelope?.live_spend_unknown === true
        || declaredLive === null;
    const liveSpendUnknown = !providerEvidenceValid || projectedAmbiguous > 0
        || explicitAmbiguity || unsupportedKnownSpend || declarationConflict
        || declarationIsInvalid(envelope);
    const liveSpend = liveSpendUnknown ? null : knownSpendObserved;
    const successEvidenceValid = envelope?.status === 'ok'
        && providerEvidenceValid && provider.receipts.length === FORGE_ROLE_ORDER.length
        && derived.started === FORGE_ROLE_ORDER.length
        && derived.completed === FORGE_ROLE_ORDER.length && derived.ambiguous === 0
        && role.valid && role.role_receipts?.length === FORGE_ROLE_ORDER.length
        && liveSpend === true && !liveSpendUnknown;

    return {
        provider_evidence_valid: providerEvidenceValid,
        success_evidence_valid: successEvidenceValid,
        pre_spawn_no_spend_proven: false,
        role_evidence_valid: role.valid,
        forge_topology: role.forge_topology,
        role_plan_sha256: role.role_plan_sha256,
        role_receipts: role.role_receipts,
        provider_request_receipts: provider.receipts,
        provider_requests_started: derived.started,
        provider_requests_completed: derived.completed,
        provider_requests_ambiguous: projectedAmbiguous,
        input_tokens: role.input_tokens,
        output_tokens: role.output_tokens,
        live_spend: liveSpend,
        live_spend_unknown: liveSpendUnknown,
        known_spend_observed: knownSpendObserved,
    };
}
