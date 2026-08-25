import path from 'node:path';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    isMcpOutcome,
    isNonRecordablePreAuthorization,
    normalizeMcpResponse,
    type McpTextResponse,
    type McpOutcome,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { PROJECT_ROOT } from '../contracts/runtime.js';
import { getCstarKernelToolCatalogEntry } from '../contracts/tool_catalog.js';
import {
    clampReadDeadlineMs,
    DEFAULT_READ_DEADLINE_MS,
    withReadDeadline,
    type ReadDeadlineOptions,
} from '../contracts/deadlines.js';
import { readFailureResponse } from '../tools/read_deadline.js';
import {
    appendBoundedTelemetryLine,
    MCP_TELEMETRY_MAX_BYTES,
    MCP_USAGE_STATE_RELATIVE_PATH,
    MCP_USEFULNESS_STATE_RELATIVE_PATH,
    readBoundedTelemetryFile,
} from './storage.js';

export {
    appendBoundedTelemetryLine,
    MCP_TELEMETRY_MAX_BYTES,
    MCP_TELEMETRY_MAX_LINE_BYTES,
} from './storage.js';

const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface McpUsageEvent {
    ts: string;
    tool: string;
    ok: boolean;
    duration_ms: number;
    root: string;
    outcome?: McpOutcome;
}

export interface McpUsefulnessEvent extends McpUsageEvent {
    repo_id?: string;
    action?: string;
    bead_id?: string;
    outcome_kind: string;
    result_count?: number;
    has_results?: boolean;
    lead_bead_present?: boolean;
    active_handoff?: boolean;
    work_item_count?: number;
    routed?: boolean;
    expert?: string;
    mimir_target_count?: boolean | number;
    token_path_present?: boolean;
    doctor_status?: string;
    doctor_score?: number;
    recommended_command_count?: number;
    validation_present?: boolean;
    verdict?: string;
    validation_recorded?: boolean;
    token_path_observation_recorded?: boolean;
    token_path_episode_id?: string;
}

export interface McpUsefulnessSummary {
    total_calls_24h: number;
    failures_24h: number;
    bead_linked_call_pct: number;
    calls_by_tool_24h: Record<string, number>;
    calls_by_action_24h: Record<string, number>;
    search_hit_rate: number | null;
    handoff_active_rate: number | null;
    augury_routed_rate: number | null;
    verify_plan_useful_rate: number | null;
    mcp_created_beads_24h: number;
    mcp_claimed_beads_24h: number;
    mcp_blocked_beads_24h: number;
    mcp_resolved_beads_24h: number;
    validations_recorded_24h: number;
    token_path_advice_count_24h: number;
    token_path_observation_count_24h: number;
    token_path_observation_rate: number | null;
    usefulness_warnings: string[];
}

function resolveTelemetryRoot(): string {
    try {
        return registry.getRoot();
    } catch {
        return PROJECT_ROOT;
    }
}

function appendMcpUsageEvent(event: McpUsageEvent): void {
    try {
        appendBoundedTelemetryLine(
            resolveTelemetryRoot(),
            path.basename(MCP_USAGE_STATE_RELATIVE_PATH),
            JSON.stringify(event),
        );
    } catch {
        // Telemetry must never break the control-plane surface.
    }
}

function appendMcpUsefulnessEvent(event: McpUsefulnessEvent): void {
    try {
        appendBoundedTelemetryLine(
            resolveTelemetryRoot(),
            path.basename(MCP_USEFULNESS_STATE_RELATIVE_PATH),
            JSON.stringify(event),
        );
    } catch {
        // Usefulness telemetry must never break MCP calls.
    }
}

function readRecentJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const root = resolveTelemetryRoot();
        const content = readBoundedTelemetryFile(root, relativePath);
        if (!content) return [];
        const now = Date.now();
        return content
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .flatMap((line) => {
                try {
                    const event = JSON.parse(line) as T & { ts?: unknown };
                    if (typeof event.ts !== 'string') return [];
                    const ts = Date.parse(event.ts);
                    if (!Number.isFinite(ts) || now - ts > lookbackMs) return [];
                    return [event as T];
                } catch {
                    return [];
                }
            });
    } catch {
        return [];
    }
}

export function summarizeRecentMcpUsage(): {
    total_calls_24h: number;
    failures_24h: number;
    last_call_at: string | null;
    tool_counts_24h: Record<string, number>;
} {
    const events = readRecentJsonl<McpUsageEvent>(
        MCP_USAGE_STATE_RELATIVE_PATH,
        MCP_USAGE_LOOKBACK_MS,
    );
    const toolCounts: Record<string, number> = {};
    let failures = 0;
    let lastCallAt: string | null = null;
    for (const event of events) {
        if (!lastCallAt || Date.parse(event.ts) > Date.parse(lastCallAt)) lastCallAt = event.ts;
        toolCounts[event.tool] = (toolCounts[event.tool] ?? 0) + 1;
        if (!event.ok) failures += 1;
    }
    return {
        total_calls_24h: events.length,
        failures_24h: failures,
        last_call_at: lastCallAt,
        tool_counts_24h: toolCounts,
    };
}

function incrementCount(counts: Record<string, number>, key: string | undefined): void {
    if (key) counts[key] = (counts[key] ?? 0) + 1;
}

export function rate(numerator: number, denominator: number): number | null {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 1000) / 1000;
}

export function summarizeUsefulnessEvents(events: McpUsefulnessEvent[]): McpUsefulnessSummary {
    const callsByTool: Record<string, number> = {};
    const callsByAction: Record<string, number> = {};
    let failures = 0;
    let beadLinked = 0;
    let searchCalls = 0;
    let searchHits = 0;
    let handoffCalls = 0;
    let activeHandoffs = 0;
    let auguryCalls = 0;
    let routedAugury = 0;
    let verifyCalls = 0;
    let usefulVerify = 0;
    let beadCreates = 0;
    let beadClaims = 0;
    let beadBlocks = 0;
    let beadResolves = 0;
    let validations = 0;
    let tokenPathAdvice = 0;
    let tokenPathObservations = 0;

    for (const event of events) {
        incrementCount(callsByTool, event.tool);
        incrementCount(callsByAction, event.action ? `${event.tool}:${event.action}` : event.tool);
        if (!event.ok) failures += 1;
        if (event.bead_id || event.lead_bead_present) beadLinked += 1;
        if (event.tool === 'cstar_hall_search') {
            searchCalls += 1;
            if (event.has_results) searchHits += 1;
        } else if (event.tool === 'cstar_handoff') {
            handoffCalls += 1;
            if (event.active_handoff) activeHandoffs += 1;
        } else if (event.tool === 'cstar_augury') {
            auguryCalls += 1;
            if (event.routed) routedAugury += 1;
            if (event.token_path_present) tokenPathAdvice += 1;
        } else if (event.tool === 'cstar_verify_plan') {
            verifyCalls += 1;
            if ((event.recommended_command_count ?? 0) > 0 || event.validation_present) usefulVerify += 1;
        } else if (event.tool === 'cstar_bead') {
            if (event.action === 'create' && event.ok) beadCreates += 1;
            if (event.action === 'claim' && event.ok) beadClaims += 1;
            if (event.action === 'block' && event.ok) beadBlocks += 1;
            if (event.action === 'resolve' && event.ok) beadResolves += 1;
        } else if (event.tool === 'cstar_record_result' && event.validation_recorded && event.ok) {
            validations += 1;
            if (event.token_path_observation_recorded) tokenPathObservations += 1;
        }
    }

    const warnings: string[] = [];
    if (searchCalls >= 5 && beadCreates + beadClaims + beadBlocks + beadResolves === 0) {
        warnings.push('High MCP search activity but no bead transitions.');
    }
    if (beadCreates > 0 && beadResolves === 0) warnings.push('MCP-created beads exist but none were resolved in the lookback window.');
    if (validations > 0 && beadCreates + beadClaims + beadBlocks + beadResolves === 0) {
        warnings.push('MCP validations recorded without corresponding bead state transitions.');
    }
    if (tokenPathAdvice >= 3 && tokenPathObservations === 0) {
        warnings.push('Token-path advice is being generated but no observations were recorded.');
    }

    return {
        total_calls_24h: events.length,
        failures_24h: failures,
        bead_linked_call_pct: events.length === 0 ? 0 : Math.round((beadLinked / events.length) * 1000) / 10,
        calls_by_tool_24h: callsByTool,
        calls_by_action_24h: callsByAction,
        search_hit_rate: rate(searchHits, searchCalls),
        handoff_active_rate: rate(activeHandoffs, handoffCalls),
        augury_routed_rate: rate(routedAugury, auguryCalls),
        verify_plan_useful_rate: rate(usefulVerify, verifyCalls),
        mcp_created_beads_24h: beadCreates,
        mcp_claimed_beads_24h: beadClaims,
        mcp_blocked_beads_24h: beadBlocks,
        mcp_resolved_beads_24h: beadResolves,
        validations_recorded_24h: validations,
        token_path_advice_count_24h: tokenPathAdvice,
        token_path_observation_count_24h: tokenPathObservations,
        token_path_observation_rate: rate(tokenPathObservations, tokenPathAdvice),
        usefulness_warnings: warnings.slice(0, 5),
    };
}

export function summarizeRecentMcpUsefulness(): McpUsefulnessSummary {
    return summarizeUsefulnessEvents(
        readRecentJsonl<McpUsefulnessEvent>(MCP_USEFULNESS_STATE_RELATIVE_PATH, MCP_USAGE_LOOKBACK_MS),
    );
}

function parseTextResponsePayload(result: McpTextResponse): any {
    try {
        return JSON.parse(result.content[0]?.text ?? '{}');
    } catch {
        return {};
    }
}

function responseOutcome(result: McpTextResponse): McpOutcome {
    const payload = parseTextResponsePayload(result);
    return isMcpOutcome(payload?.outcome)
        ? payload.outcome
        : result.isError === true ? 'internal_error' : 'ok';
}

function isPublicReadTool(toolName: string): boolean {
    try {
        return getCstarKernelToolCatalogEntry(toolName).toolClass === 'READ';
    } catch {
        return false;
    }
}

function requestSignal(context?: McpRequestContext): AbortSignal | undefined {
    const signal = (context as (McpRequestContext & { signal?: unknown }) | undefined)?.signal;
    if (!signal || typeof signal !== 'object') return undefined;
    const candidate = signal as Partial<AbortSignal>;
    return typeof candidate.aborted === 'boolean'
        && typeof candidate.addEventListener === 'function'
        ? signal as AbortSignal
        : undefined;
}

function requestedReadDeadline(args: unknown): number | null | undefined {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
    const record = args as Record<string, unknown>;
    for (const key of ['deadlineMs', 'timeoutMs', 'deadline_ms', 'timeout_ms']) {
        const value = record[key];
        if (value === null || typeof value === 'number') return value;
    }
    return undefined;
}

function publicReadDeadlineOptions(
    args: unknown,
    context?: McpRequestContext,
): ReadDeadlineOptions {
    return {
        deadlineMs: clampReadDeadlineMs(
            requestedReadDeadline(args) ?? DEFAULT_READ_DEADLINE_MS,
        ),
        signal: requestSignal(context),
    };
}

function isValidationRollbackOrPartial(payload: any): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (payload.validation_persisted === false
        || payload.validation_transaction_rolled_back === true
        || payload.rolled_back === true
        || payload.partial === true) return true;

    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
    if (['partial', 'rolled_back', 'rollback', 'not_persisted',
        'validation_transaction_rolled_back', 'validation_not_persisted'].includes(status)) {
        return true;
    }

    return ['error_code', 'error', 'validation_warning', 'forge_validation_warning']
        .some((key) => {
            const value = payload[key];
            return typeof value === 'string'
                && /(?:validation_)?(?:transaction_)?rolled_back|(?:validation_)?not_persisted/i.test(value);
        });
}

function validationWasRecorded(payload: any): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (payload.error || isValidationRollbackOrPartial(payload)) return false;
    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
    return payload.validation_persisted === true
        || status === 'recorded'
        || status === 'recorded_verified'
        || status === 'recorded_unverified';
}

/**
 * Rejected callers have not crossed the mutation boundary, so they must not
 * be able to create telemetry state as a side effect of probing that gate.
 */
export function isPreAuthorizationRejection(value: unknown): boolean {
    return isNonRecordablePreAuthorization(value);
}

function resolveUsefulnessRepoId(root: string): string | undefined {
    try {
        return database.getHallRepository(root)?.repo_id || buildHallRepositoryId(normalizeHallPath(root));
    } catch {
        return undefined;
    }
}

export function deriveMcpUsefulnessEvent(
    base: McpUsageEvent,
    args: unknown,
    result?: McpTextResponse,
): McpUsefulnessEvent {
    const payload = result ? parseTextResponsePayload(result) : {};
    const argRecord = args && typeof args === 'object' ? args as Record<string, unknown> : {};
    const event: McpUsefulnessEvent = {
        ...base,
        action: typeof argRecord.action === 'string' ? argRecord.action : undefined,
        bead_id: typeof argRecord.bead_id === 'string' ? argRecord.bead_id : undefined,
        outcome_kind: base.ok ? 'ok' : 'error',
        outcome: base.outcome ?? (result ? responseOutcome(result) : undefined),
    };

    if (typeof payload?.bead_id === 'string') event.bead_id = payload.bead_id;
    if (payload?.bead && typeof payload.bead.bead_id === 'string') event.bead_id = payload.bead.bead_id;

    if (base.tool === 'cstar_hall_search') {
        const searchResults = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);
        event.outcome_kind = searchResults.length > 0 ? 'search_hit' : 'search_miss';
        event.result_count = searchResults.length;
        event.has_results = searchResults.length > 0;
    } else if (base.tool === 'cstar_handoff') {
        const active = payload?.status !== 'idle' && !payload?.error;
        event.outcome_kind = active ? 'handoff_active' : 'handoff_idle';
        event.active_handoff = active;
        event.lead_bead_present = typeof payload?.lead_bead_id === 'string';
        event.bead_id = typeof payload?.lead_bead_id === 'string' ? payload.lead_bead_id : event.bead_id;
        event.work_item_count = Array.isArray(payload?.work_items) ? payload.work_items.length : 0;
    } else if (base.tool === 'cstar_augury') {
        event.outcome_kind = payload?.error ? 'augury_error' : 'augury_routed';
        event.routed = !payload?.error && typeof payload?.intent_category === 'string';
        event.expert = typeof payload?.expert === 'string' ? payload.expert : undefined;
        event.mimir_target_count = Array.isArray(payload?.mimir_targets) ? payload.mimir_targets.length : 0;
        event.token_path_present = !!payload?.token_path;
        event.token_path_episode_id = typeof payload?.token_path?.episode_id === 'string' ? payload.token_path.episode_id : undefined;
    } else if (base.tool === 'cstar_doctor') {
        event.outcome_kind = payload?.status === 'healthy' ? 'doctor_healthy' : 'doctor_degraded';
        event.doctor_status = typeof payload?.status === 'string' ? payload.status : undefined;
        event.doctor_score = typeof payload?.score === 'number' ? payload.score : undefined;
    } else if (base.tool === 'cstar_verify_plan') {
        const commandCount = Array.isArray(payload?.recommended_commands) ? payload.recommended_commands.length : 0;
        event.outcome_kind = commandCount > 0 || payload?.last_validation ? 'verify_plan_useful' : 'verify_plan_empty';
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
        event.recommended_command_count = commandCount;
        event.validation_present = !!payload?.last_validation;
    } else if (base.tool === 'cstar_bead') {
        event.action = typeof payload?.action === 'string' ? payload.action : event.action;
        event.outcome_kind = payload?.error ? 'bead_error' : `bead_${event.action || 'unknown'}`;
        event.result_count = Array.isArray(payload?.beads) ? payload.beads.length : undefined;
        event.has_results = Array.isArray(payload?.beads) ? payload.beads.length > 0 : undefined;
    } else if (base.tool === 'cstar_record_result') {
        const recorded = validationWasRecorded(payload);
        event.outcome_kind = recorded
            ? 'validation_recorded'
            : payload?.error ? 'validation_error' : 'validation_not_recorded';
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
        event.verdict = typeof payload?.verdict === 'string' ? payload.verdict : undefined;
        event.validation_recorded = recorded;
    } else if (base.tool === 'cstar_researcher_request' || base.tool === 'cstar_forge_request') {
        event.outcome_kind = payload?.error ? 'dispatch_request_error' : `dispatch_${payload?.status ?? 'unknown'}`;
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
    } else if (base.tool === 'cstar_researcher_host_complete') {
        event.outcome_kind = payload?.error ? 'researcher_delivery_error' : `researcher_${payload?.status ?? 'unknown'}`;
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
        event.validation_present = payload?.status === 'DELIVERED_UNVERIFIED';
    }

    return event;
}

function recordMcpTelemetry(
    toolName: string,
    args: unknown,
    startedAt: number,
    root: string,
    result?: McpTextResponse,
): void {
    const usageEvent: McpUsageEvent = {
        ts: new Date(startedAt).toISOString(), tool: toolName,
        ok: result ? result.isError !== true : false,
        duration_ms: Date.now() - startedAt, root,
        outcome: result ? responseOutcome(result) : 'internal_error',
    };
    appendMcpUsageEvent(usageEvent);
    appendMcpUsefulnessEvent({
        ...deriveMcpUsefulnessEvent(usageEvent, args, result),
        repo_id: resolveUsefulnessRepoId(root),
    });
}

export function instrumentTool<TArgs>(
    toolName: string,
    handler: (args: TArgs, context?: McpRequestContext) => Promise<McpTextResponse>,
) {
    const publicRead = isPublicReadTool(toolName);
    return async (args: TArgs, context?: McpRequestContext) => {
        const startedAt = Date.now();
        const root = resolveTelemetryRoot();
        try {
            const rawResult = publicRead
                ? await withReadDeadline(
                    () => handler(args, context),
                    publicReadDeadlineOptions(args, context),
                )
                : await handler(args, context);
            if (isPreAuthorizationRejection(rawResult)) return rawResult;
            const result = normalizeMcpResponse(rawResult);
            recordMcpTelemetry(toolName, args, startedAt, root, result);
            return result;
        } catch (error) {
            if (isPreAuthorizationRejection(error)) throw error;
            if (!publicRead) {
                recordMcpTelemetry(toolName, args, startedAt, root);
                throw error;
            }
            const result = normalizeMcpResponse(readFailureResponse(error));
            recordMcpTelemetry(toolName, args, startedAt, root, result);
            return result;
        }
    };
}
