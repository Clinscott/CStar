import type { RuntimeContext, WeaveInvocation } from './contracts.ts';
import type { SkillBead } from '../skills/types.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type AuguryInheritanceContext = Pick<RuntimeContext, 'augury_contract' | 'augury_designation_source' | 'trace_contract' | 'trace_designation_source' | 'session_id'>;

/** Read legacy contracts without propagating an unscored numeric claim. */
export function sanitizeUnscoredAuguryContract(value: unknown): Record<string, unknown> | undefined {
    if (!isPlainRecord(value)) {
        return undefined;
    }
    if (!('confidence' in value) && !('confidence_source' in value)) {
        return value;
    }
    const sanitized = { ...value };
    delete sanitized.confidence;
    delete sanitized.confidence_source;
    return sanitized;
}

/** Sanitize contract fields on a metadata envelope without mutating the input. */
export function sanitizeAuguryMetadataContracts(metadata: Record<string, unknown>): Record<string, unknown> {
    let next = metadata;
    for (const key of ['augury_contract', 'trace_contract'] as const) {
        const sanitized = sanitizeUnscoredAuguryContract(metadata[key]);
        if (sanitized && sanitized !== metadata[key]) {
            if (next === metadata) next = { ...metadata };
            next[key] = sanitized;
        }
    }
    const learning = metadata.augury_learning_metadata;
    if (isPlainRecord(learning) && ('confidence' in learning || learning.confidence_source !== 'missing')) {
        if (next === metadata) next = { ...metadata };
        const sanitizedLearning = { ...learning };
        delete sanitizedLearning.confidence;
        sanitizedLearning.confidence_source = 'missing';
        next.augury_learning_metadata = sanitizedLearning;
    }
    return next;
}

export function inheritAuguryPayload<T>(
    payload: T,
    context: AuguryInheritanceContext,
): T {
    if (!isPlainRecord(payload)) {
        return payload;
    }

    const basePayload = sanitizeAuguryMetadataContracts(payload);
    const additions: Record<string, unknown> = {};
    const auguryContract = sanitizeUnscoredAuguryContract(context.augury_contract ?? context.trace_contract);
    const augurySource = context.augury_designation_source ?? context.trace_designation_source;
    const payloadAuguryContract = sanitizeUnscoredAuguryContract(basePayload.augury_contract);
    const payloadTraceContract = sanitizeUnscoredAuguryContract(basePayload.trace_contract);

    if (payloadAuguryContract && payloadAuguryContract !== basePayload.augury_contract) {
        additions.augury_contract = payloadAuguryContract;
    } else if (auguryContract && !payloadAuguryContract) {
        additions.augury_contract = auguryContract;
    }
    if (payloadTraceContract && payloadTraceContract !== basePayload.trace_contract) {
        additions.trace_contract = payloadTraceContract;
    } else if (auguryContract && !payloadTraceContract) {
        additions.trace_contract = auguryContract;
    }

    if (
        augurySource
        && typeof basePayload.augury_designation_source !== 'string'
    ) {
        additions.augury_designation_source = augurySource;
    }
    if (
        augurySource
        && typeof basePayload.trace_designation_source !== 'string'
    ) {
        additions.trace_designation_source = augurySource;
    }

    if (
        typeof context.session_id === 'string'
        && context.session_id.trim()
        && typeof basePayload.planning_session_id !== 'string'
    ) {
        additions.planning_session_id = context.session_id.trim();
    }

    if (Object.keys(additions).length === 0) {
        return basePayload as T;
    }

    return {
        ...basePayload,
        ...additions,
    } as T;
}

export function inheritTraceInvocation<T>(
    invocation: WeaveInvocation<T>,
    context: AuguryInheritanceContext,
): WeaveInvocation<T> {
    if (!isPlainRecord(invocation.payload)) {
        return invocation;
    }

    return {
        ...invocation,
        payload: inheritAuguryPayload(invocation.payload, context),
    };
}

export const inheritAuguryInvocation = inheritTraceInvocation;

export function inheritTraceSkillBead<T>(
    bead: SkillBead<T>,
    context: AuguryInheritanceContext,
): SkillBead<T> {
    const params = isPlainRecord(bead.params)
        ? inheritAuguryPayload(bead.params, context)
        : inheritAuguryPayload({
            value: bead.params,
        }, context);

    if (params === bead.params) {
        return bead;
    }

    return {
        ...bead,
        params: params as T,
    };
}

export const inheritAugurySkillBead = inheritTraceSkillBead;

/** @deprecated Use inheritAuguryPayload. */
export const inheritTracePayload = inheritAuguryPayload;
