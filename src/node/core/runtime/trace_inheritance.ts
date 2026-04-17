import type { RuntimeContext, WeaveInvocation } from './contracts.ts';
import type { SkillBead } from '../skills/types.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type AuguryInheritanceContext = Pick<RuntimeContext, 'augury_contract' | 'augury_designation_source' | 'trace_contract' | 'trace_designation_source' | 'session_id'>;

export function inheritAuguryPayload<T>(
    payload: T,
    context: AuguryInheritanceContext,
): T {
    if (!isPlainRecord(payload)) {
        return payload;
    }

    const additions: Record<string, unknown> = {};
    const auguryContract = context.augury_contract ?? context.trace_contract;
    const augurySource = context.augury_designation_source ?? context.trace_designation_source;

    if (auguryContract && !isPlainRecord(payload.augury_contract)) {
        additions.augury_contract = auguryContract;
    }
    if (auguryContract && !isPlainRecord(payload.trace_contract)) {
        additions.trace_contract = auguryContract;
    }

    if (
        augurySource
        && typeof payload.augury_designation_source !== 'string'
    ) {
        additions.augury_designation_source = augurySource;
    }
    if (
        augurySource
        && typeof payload.trace_designation_source !== 'string'
    ) {
        additions.trace_designation_source = augurySource;
    }

    if (
        typeof context.session_id === 'string'
        && context.session_id.trim()
        && typeof payload.planning_session_id !== 'string'
    ) {
        additions.planning_session_id = context.session_id.trim();
    }

    if (Object.keys(additions).length === 0) {
        return payload;
    }

    return {
        ...payload,
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
