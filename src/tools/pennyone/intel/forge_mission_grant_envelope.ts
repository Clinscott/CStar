import { createHash } from 'node:crypto';

import {
    FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
    type ForgeMissionGrantEnvelope,
    type HallForgeWriteCapability,
} from '../../../types/forge.js';

const SHA256 = /^[a-f0-9]{64}$/;
const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const ENVELOPE_KEYS = [
    'schema', 'allowed_targets', 'allowed_outputs', 'allowed_actions',
    'prohibited_actions', 'adapter_ref', 'write_capability',
    'total_provider_attempt_ceiling', 'retry_derived_iteration_ceiling',
    'paid_attempt_ceiling',
] as const;

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function stableForgeMissionGrantEnvelopeJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

function normalizedStrings(value: unknown, code: string): string[] {
    if (!Array.isArray(value) || value.length === 0
        || value.some((entry) => typeof entry !== 'string'
            || entry !== entry.trim() || !REFERENCE.test(entry))) {
        throw new Error(code);
    }
    return [...new Set(value as string[])].sort();
}

function boundedCeiling(value: unknown, minimum: number): number {
    if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > 64) {
        throw new Error('forge_mission_grant_envelope_ceiling_invalid');
    }
    return Number(value);
}

export function canonicalForgeMissionGrantEnvelope(
    value: unknown,
): ForgeMissionGrantEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('forge_mission_grant_envelope_invalid');
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...ENVELOPE_KEYS].sort())
        || input.schema !== 'cstar.forge_mission_grant_envelope.v1') {
        throw new Error('forge_mission_grant_envelope_invalid');
    }
    const allowedTargets = normalizedStrings(
        input.allowed_targets, 'forge_mission_grant_envelope_targets_invalid',
    );
    const allowedOutputs = normalizedStrings(
        input.allowed_outputs, 'forge_mission_grant_envelope_outputs_invalid',
    );
    const allowedActions = normalizedStrings(
        input.allowed_actions, 'forge_mission_grant_envelope_actions_invalid',
    );
    const prohibitedActions = normalizedStrings(
        input.prohibited_actions, 'forge_mission_grant_envelope_prohibitions_invalid',
    );
    const prohibited = new Set(prohibitedActions);
    if (FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.some(
        (action) => !prohibited.has(action),
    )) {
        throw new Error('forge_mission_grant_envelope_prohibitions_incomplete');
    }
    if (allowedActions.some((action) => prohibited.has(action))) {
        throw new Error('forge_mission_grant_envelope_action_conflict');
    }
    const adapterRef = input.adapter_ref;
    const capability = input.write_capability;
    if (typeof adapterRef !== 'string' || adapterRef !== adapterRef.trim()
        || !REFERENCE.test(adapterRef)
        || (capability !== 'response_only' && capability !== 'project_files')) {
        throw new Error('forge_mission_grant_envelope_adapter_invalid');
    }
    const total = boundedCeiling(input.total_provider_attempt_ceiling, 1);
    const retry = boundedCeiling(input.retry_derived_iteration_ceiling, 0);
    const paid = boundedCeiling(input.paid_attempt_ceiling, 0);
    if (paid > total || retry > total) {
        throw new Error('forge_mission_grant_envelope_ceiling_invalid');
    }
    return {
        schema: 'cstar.forge_mission_grant_envelope.v1',
        allowed_targets: allowedTargets,
        allowed_outputs: allowedOutputs,
        allowed_actions: allowedActions,
        prohibited_actions: prohibitedActions,
        adapter_ref: adapterRef,
        write_capability: capability as HallForgeWriteCapability,
        total_provider_attempt_ceiling: total,
        retry_derived_iteration_ceiling: retry,
        paid_attempt_ceiling: paid,
    };
}

export function hashForgeMissionGrantEnvelope(envelope: ForgeMissionGrantEnvelope): string {
    return createHash('sha256')
        .update(stableForgeMissionGrantEnvelopeJson(envelope), 'utf-8')
        .digest('hex');
}

export function readForgeMissionGrantEnvelope(
    metadata: Record<string, unknown>,
): { envelope: ForgeMissionGrantEnvelope; sha256: string } {
    const envelope = canonicalForgeMissionGrantEnvelope(metadata.mission_grant_envelope);
    const suppliedHash = metadata.mission_grant_envelope_sha256;
    const canonicalJson = stableForgeMissionGrantEnvelopeJson(envelope);
    if (canonicalJson !== stableForgeMissionGrantEnvelopeJson(metadata.mission_grant_envelope)
        || typeof suppliedHash !== 'string' || !SHA256.test(suppliedHash)
        || suppliedHash !== hashForgeMissionGrantEnvelope(envelope)) {
        throw new Error('forge_mission_grant_envelope_hash_invalid');
    }
    return { envelope, sha256: suppliedHash };
}

export function bindForgeMissionGrantEnvelopeMetadata(
    metadata: Record<string, unknown>,
): Record<string, unknown> {
    if (metadata.schema !== 'cstar.set_manifest.v1') return metadata;
    const envelope = canonicalForgeMissionGrantEnvelope(metadata.mission_grant_envelope);
    return {
        ...metadata,
        mission_grant_envelope: envelope,
        mission_grant_envelope_sha256: hashForgeMissionGrantEnvelope(envelope),
    };
}
