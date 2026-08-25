import type {
    ForgeFailureEvidenceProjection,
    ForgeProviderRequestReceiptEvidence,
} from './forge_failure_evidence.js';
import type { ForgeRoleReceiptEvidence } from './forge_role_evidence.js';

export function parseAdapterEnvelope(stdout: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(stdout);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
    } catch {
        return null;
    }
}

function boundedIdentity(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,80}$/.test(value) ? value : null;
}

function boundedReason(value: unknown): string | null {
    return typeof value === 'string' && value.length <= 120
        && /^forge_[a-z0-9_]+(?:_[0-9]+)?(?::[a-z0-9_]+)?$/.test(value) ? value : null;
}

export function boundedAdapterStatus(value: unknown): 'ok' | 'degraded' | null {
    return value === 'ok' || value === 'degraded' ? value : null;
}

function boundedBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

export type ProjectedForgeAdapterEnvelope = {
    schema: 'cstar.forge_delegate_failure.v1' | null;
    status: 'ok' | 'degraded' | null;
    provider: 'minimax-oauth' | null;
    auth_provider: 'minimax-oauth' | null;
    auth_mode: 'oauth' | null;
    requested_model: 'MiniMax-M3' | null;
    actual_model: string | null;
    model_source: 'provider_reported' | 'unreported';
    model: 'MiniMax-M3' | null;
    hermes_profile: 'cstar-hub' | null;
    degraded_reason: string | null;
    live_spend: boolean | null;
    live_spend_unknown: boolean;
    known_spend_observed: boolean;
    live_source_collection: boolean | null;
    provider_evidence_valid: boolean;
    success_evidence_valid: boolean;
    pre_spawn_no_spend_proven: boolean;
    role_evidence_valid: boolean;
    forge_topology: 'bounded-six-role-manifest-v1' | null;
    role_plan_sha256: string | null;
    role_receipts: ForgeRoleReceiptEvidence[] | null;
    provider_requests_started: number | null;
    provider_requests_completed: number | null;
    provider_requests_ambiguous: number;
    provider_request_receipts: ForgeProviderRequestReceiptEvidence[];
    input_tokens: number | null;
    output_tokens: number | null;
};

export function projectAdapterEnvelope(
    envelope: Record<string, any> | null,
    evidence: ForgeFailureEvidenceProjection,
): ProjectedForgeAdapterEnvelope | null {
    if (!envelope) return null;
    const modelSource = envelope.model_source === 'provider_reported'
        ? 'provider_reported' : 'unreported';
    return {
        schema: envelope.schema === 'cstar.forge_delegate_failure.v1' ? envelope.schema : null,
        status: boundedAdapterStatus(envelope.status),
        provider: envelope.provider === 'minimax-oauth' ? 'minimax-oauth' : null,
        auth_provider: envelope.auth_provider === 'minimax-oauth' ? 'minimax-oauth' : null,
        auth_mode: envelope.auth_mode === 'oauth' ? 'oauth' : null,
        requested_model: (envelope.requested_model ?? envelope.model) === 'MiniMax-M3' ? 'MiniMax-M3' : null,
        actual_model: modelSource === 'provider_reported' ? boundedIdentity(envelope.actual_model) : null,
        model_source: modelSource,
        model: envelope.model === 'MiniMax-M3' ? 'MiniMax-M3' : null,
        hermes_profile: envelope.hermes_profile === 'cstar-hub' ? 'cstar-hub' : null,
        degraded_reason: boundedReason(envelope.degraded_reason),
        live_spend: evidence.live_spend,
        live_spend_unknown: evidence.live_spend_unknown,
        known_spend_observed: evidence.known_spend_observed,
        live_source_collection: boundedBoolean(envelope.live_source_collection),
        provider_evidence_valid: evidence.provider_evidence_valid,
        success_evidence_valid: evidence.success_evidence_valid,
        pre_spawn_no_spend_proven: evidence.pre_spawn_no_spend_proven,
        role_evidence_valid: evidence.role_evidence_valid,
        forge_topology: evidence.forge_topology,
        role_plan_sha256: evidence.role_plan_sha256,
        role_receipts: evidence.role_receipts,
        provider_requests_started: evidence.provider_requests_started,
        provider_requests_completed: evidence.provider_requests_completed,
        provider_requests_ambiguous: evidence.provider_requests_ambiguous,
        provider_request_receipts: evidence.provider_request_receipts,
        input_tokens: evidence.input_tokens,
        output_tokens: evidence.output_tokens,
    };
}

export type ForgeAdapterArtifact = { path: string; bytes: number; sha256: string };

export type ReturnedForgeAdapterEnvelope = ProjectedForgeAdapterEnvelope & {
    intent_id?: undefined;
    wrote_to: string | null;
    response_artifact: ForgeAdapterArtifact | null;
    response_contract: Record<string, unknown> | null;
    execution_trace_artifact: ForgeAdapterArtifact | null;
    hermes_preflight: Record<string, unknown> | null;
};

export function isSuccessAdapterStatus(status: string): boolean {
    return ['accepted', 'ok', 'pass', 'passed', 'success', 'succeeded'].includes(status.trim().toLowerCase());
}
