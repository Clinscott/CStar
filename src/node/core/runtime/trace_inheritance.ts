import type { RuntimeContext, WeaveInvocation } from './contracts.ts';
import type { SkillBead } from '../skills/types.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function inheritTracePayload<T>(
    payload: T,
    context: Pick<RuntimeContext, 'trace_contract' | 'trace_designation_source' | 'session_id'>,
): T {
    if (!isPlainRecord(payload)) {
        return payload;
    }

    const additions: Record<string, unknown> = {};

    if (context.trace_contract && !isPlainRecord(payload.trace_contract)) {
        additions.trace_contract = context.trace_contract;
    }

    if (
        context.trace_designation_source
        && typeof payload.trace_designation_source !== 'string'
    ) {
        additions.trace_designation_source = context.trace_designation_source;
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
    context: Pick<RuntimeContext, 'trace_contract' | 'trace_designation_source' | 'session_id'>,
): WeaveInvocation<T> {
    if (!isPlainRecord(invocation.payload)) {
        return invocation;
    }

    return {
        ...invocation,
        payload: inheritTracePayload(invocation.payload, context),
    };
}

export function inheritTraceSkillBead<T>(
    bead: SkillBead<T>,
    context: Pick<RuntimeContext, 'trace_contract' | 'trace_designation_source' | 'session_id'>,
): SkillBead<T> {
    const params = isPlainRecord(bead.params)
        ? inheritTracePayload(bead.params, context)
        : inheritTracePayload({
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
