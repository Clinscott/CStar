import fs from 'node:fs';
import path from 'node:path';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import type { McpTextResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { PROJECT_ROOT } from '../contracts/runtime.js';

const MCP_USAGE_STATE_RELATIVE_PATH = path.join('.agents', 'state', 'cstar-kernel-mcp-usage.jsonl');
const MCP_USEFULNESS_STATE_RELATIVE_PATH = path.join('.agents', 'state', 'cstar-kernel-mcp-usefulness.jsonl');
const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface McpUsageEvent {
    ts: string;
    tool: string;
    ok: boolean;
    duration_ms: number;
    root: string;
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
        const root = event.root || resolveTelemetryRoot();
        const usagePath = path.join(root, MCP_USAGE_STATE_RELATIVE_PATH);
        fs.mkdirSync(path.dirname(usagePath), { recursive: true });
        fs.appendFileSync(usagePath, `${JSON.stringify(event)}\n`, 'utf-8');
    } catch {
        // Telemetry must never break the control-plane surface.
    }
}

function appendMcpUsefulnessEvent(event: McpUsefulnessEvent): void {
    try {
        const root = event.root || resolveTelemetryRoot();
        const usefulnessPath = path.join(root, MCP_USEFULNESS_STATE_RELATIVE_PATH);
        fs.mkdirSync(path.dirname(usefulnessPath), { recursive: true });
        fs.appendFileSync(usefulnessPath, `${JSON.stringify(event)}\n`, 'utf-8');
    } catch {
        // Usefulness telemetry must never break MCP calls.
    }
}

function readRecentJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const root = resolveTelemetryRoot();
        const filePath = path.join(root, relativePath);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const now = Date.now();
        return fs.readFileSync(filePath, 'utf-8')
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
    try {
        const root = resolveTelemetryRoot();
        const usagePath = path.join(root, MCP_USAGE_STATE_RELATIVE_PATH);
        if (!fs.existsSync(usagePath)) {
            return { total_calls_24h: 0, failures_24h: 0, last_call_at: null, tool_counts_24h: {} };
        }
        const now = Date.now();
        const toolCounts: Record<string, number> = {};
        let total = 0;
        let failures = 0;
        let lastCallAt: string | null = null;
        const lines = fs.readFileSync(usagePath, 'utf-8')
            .split('\n')
            .filter((line) => line.trim().length > 0);
        for (const line of lines) {
            try {
                const event = JSON.parse(line) as Partial<McpUsageEvent>;
                if (typeof event.ts !== 'string' || typeof event.tool !== 'string') continue;
                const ts = Date.parse(event.ts);
                if (!Number.isFinite(ts)) continue;
                if (!lastCallAt || ts > Date.parse(lastCallAt)) lastCallAt = event.ts;
                if (now - ts > MCP_USAGE_LOOKBACK_MS) continue;
                total += 1;
                toolCounts[event.tool] = (toolCounts[event.tool] ?? 0) + 1;
                if (event.ok === false) failures += 1;
            } catch {
                // Ignore malformed rows.
            }
        }
        return { total_calls_24h: total, failures_24h: failures, last_call_at: lastCallAt, tool_counts_24h: toolCounts };
    } catch {
        return { total_calls_24h: 0, failures_24h: 0, last_call_at: null, tool_counts_24h: {} };
    }
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
        event.outcome_kind = payload?.error ? 'validation_error' : 'validation_recorded';
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
        event.verdict = typeof payload?.verdict === 'string' ? payload.verdict : undefined;
        event.validation_recorded = payload?.validation_persisted === true
            || ['recorded', 'recorded_verified', 'recorded_unverified'].includes(String(payload?.status ?? ''));
        event.token_path_observation_recorded = typeof payload?.token_path_observation_id === 'string';
        event.token_path_episode_id = typeof payload?.token_path_episode_id === 'string' ? payload.token_path_episode_id : undefined;
    } else if (base.tool === 'cstar_researcher_request' || base.tool === 'cstar_forge_request') {
        event.outcome_kind = payload?.error ? 'dispatch_request_error' : `dispatch_${payload?.status ?? 'unknown'}`;
        event.bead_id = typeof payload?.bead_id === 'string' ? payload.bead_id : event.bead_id;
    }

    return event;
}

export function instrumentTool<TArgs>(
    toolName: string,
    handler: (args: TArgs, context?: McpRequestContext) => Promise<McpTextResponse>,
) {
    return async (args: TArgs, context?: McpRequestContext) => {
        const startedAt = Date.now();
        const root = resolveTelemetryRoot();
        try {
            const result = await handler(args, context);
            const usageEvent = { ts: new Date(startedAt).toISOString(), tool: toolName, ok: result.isError !== true, duration_ms: Date.now() - startedAt, root };
            appendMcpUsageEvent(usageEvent);
            appendMcpUsefulnessEvent({
                ...deriveMcpUsefulnessEvent(usageEvent, args, result),
                repo_id: resolveUsefulnessRepoId(root),
            });
            return result;
        } catch (error) {
            const usageEvent = { ts: new Date(startedAt).toISOString(), tool: toolName, ok: false, duration_ms: Date.now() - startedAt, root };
            appendMcpUsageEvent(usageEvent);
            appendMcpUsefulnessEvent({
                ...deriveMcpUsefulnessEvent(usageEvent, args),
                repo_id: resolveUsefulnessRepoId(root),
            });
            throw error;
        }
    };
}
