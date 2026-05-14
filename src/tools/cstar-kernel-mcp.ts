import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type {
    HallBeadRecord,
    HallBeadStatus,
    HallBeadTargetKind,
    HallMountedSpokeRecord,
    HallValidationRun,
} from '../types/hall.js';
import type { SovereignBead } from '../types/bead.js';
import { buildHallRepositoryId, normalizeHallPath } from '../types/hall.js';

// [Ω] THE AWAKENING: Forcefully load local environment
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

import { registry } from './pennyone/pathRegistry.js';
import { selectCouncilExpert } from '../core/council_experts.js';
import { 
    buildTraceAgentHandoffPayload, 
    resolveActivePlanningSession,
    buildAuguryDoctorPayload,
    buildAuguryExplainPayload,
    getTraceContract,
    hydratePlanningSession
} from '../node/core/commands/trace.js';
import { database } from './pennyone/intel/database.js';
import {
    walkSpokeSkills,
    walkSpokeJournal,
    type SpokeSkillManifest,
} from '../node/core/spokes/spoke_capability_walker.js';
import {
    buildCapabilityManifestPayload,
    buildCapabilityInfoPayload,
} from '../node/core/commands/capability_discovery.js';
import {
    scoreEngramIfArbitrated,
    registerContest as warGameRegisterContest,
    tallyContest,
    tallyAllContests,
    recentScores,
    byScenario,
    getScoreByShot,
    type RecordedEngram as WarGameRecordedEngram,
} from './war_game/score_trigger.js';
import { StateRegistry } from '../node/core/state.js';
import {
    tokenize,
    loadRegistryManifest,
    getRegistryIntentCategories,
    resolveIntentCategoryFromGrammar,
} from '../node/core/runtime/host_workflows/chant_parser.js';
import { execa } from 'execa';

/**
 * CStar Kernel MCP (v3.1)
 * Purpose: Minimal kernel access for host agents.
 * Mandate: Compact kernel tools. Compact JSON. No ceremony.
 */

const server = new McpServer({
    name: 'cstar-kernel',
    version: '3.1.0',
});

const MCP_LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'mcp');
const MCP_LOG_PATH = path.join(MCP_LOG_DIR, 'mcp_bootstrap_error.log');
const MCP_USAGE_STATE_RELATIVE_PATH = path.join('.agents', 'state', 'cstar-kernel-mcp-usage.jsonl');
const MCP_USEFULNESS_STATE_RELATIVE_PATH = path.join('.agents', 'state', 'cstar-kernel-mcp-usefulness.jsonl');
const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function logBootstrapError(error: unknown): void {
    try {
        fs.mkdirSync(MCP_LOG_DIR, { recursive: true });
        const stack = error instanceof Error ? error.stack ?? error.message : String(error);
        fs.appendFileSync(MCP_LOG_PATH, `[${new Date().toISOString()}] ${stack}\n`, 'utf-8');
    } catch {
        // Diagnostics must never break the MCP surface.
    }
}

interface McpUsageEvent {
    ts: string;
    tool: string;
    ok: boolean;
    duration_ms: number;
    root: string;
}

interface McpUsefulnessEvent extends McpUsageEvent {
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
    mimir_target_count?: number;
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

interface McpUsefulnessSummary {
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

interface McpTextResponse {
    [key: string]: unknown;
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

type KernelCouncilExpert = {
    signature_question?: string;
    anti_behavior?: string[];
    selection_candidates?: unknown[];
};

const HALL_BEAD_STATUSES: HallBeadStatus[] = [
    'OPEN',
    'SET-PENDING',
    'SET',
    'IN_PROGRESS',
    'READY_FOR_REVIEW',
    'NEEDS_TRIAGE',
    'BLOCKED',
    'RESOLVED',
    'ARCHIVED',
    'SUPERSEDED',
];

const HALL_BEAD_TARGET_KINDS: HallBeadTargetKind[] = [
    'FILE',
    'SECTOR',
    'REPOSITORY',
    'CONTRACT',
    'SPOKE',
    'WORKFLOW',
    'VALIDATION',
    'OTHER',
];

type BeadAction = 'get' | 'list' | 'create' | 'update_status' | 'claim' | 'resolve' | 'block';

interface BeadToolArgs {
    action: BeadAction;
    bead_id?: string;
    limit?: number;
    statuses?: HallBeadStatus[];
    target_kind?: HallBeadTargetKind;
    target_path?: string;
    target_ref?: string;
    rationale?: string;
    acceptance_criteria?: string;
    checker_shell?: string;
    contract_refs?: string[];
    status?: HallBeadStatus;
    assigned_agent?: string;
    resolution_note?: string;
    resolved_validation_id?: string;
    triage_reason?: string;
    metadata?: Record<string, unknown>;
    spoke?: string;
}

interface SpokeBeadImportArgs {
    spoke: string;
    bead_id?: string;
    intent: string;
    acceptance_criteria: string;
    lore_path: string;
    design_doc_path?: string;
    wireframe_ref?: string;
    threat_model_summary?: string;
    contract_refs?: string[];
    checker_shell?: string;
    target_paths?: string[];
    target_kind?: HallBeadTargetKind;
    target_ref?: string;
    augury_block?: string;
    assigned_agent?: string;
    status?: HallBeadStatus;
    metadata?: Record<string, unknown>;
}

interface SpokeAnchor {
    repoId: string;
    spoke: HallMountedSpokeRecord | null;
    metadata: Record<string, unknown> | null;
}

function textResponse(payload: unknown, isError = false): McpTextResponse {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        ...(isError ? { isError: true } : {}),
    };
}

function compactBead(bead: SovereignBead | null): Record<string, unknown> | null {
    if (!bead) {
        return null;
    }
    return {
        bead_id: bead.id,
        status: bead.status,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale.substring(0, 240),
        acceptance_criteria: bead.acceptance_criteria?.substring(0, 300),
        checker_shell: bead.checker_shell,
        assigned_agent: bead.assigned_agent,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: bead.resolved_validation_id,
        contract_refs: bead.contract_refs.slice(0, 5),
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    };
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} is required.`);
    }
    return value.trim();
}

function generateBeadId(rationale: string): string {
    const slug = rationale
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'mcp-bead';
    return `bead:mcp:${slug}-${Date.now().toString(36)}`;
}

function resolveActiveRepo(): { root: string; repoId: string } {
    const root = registry.getRoot();
    const repo = database.getHallRepository(root);
    return {
        root,
        repoId: repo?.repo_id || buildHallRepositoryId(normalizeHallPath(root)),
    };
}

/**
 * Resolve the Hall repo a bead should be anchored to.
 * - When `spokeSlug` is absent: anchor to the kernel's active repo (existing behavior).
 * - When present: look up the spoke in `hall_mounted_spokes`. Reject hard if the spoke
 *   is unregistered, inactive, quarantined, or read-only — no silent fallback to the
 *   kernel repo, because that would land the bead in the wrong tray.
 */
export function resolveSpokeAnchor(spokeSlug: string | undefined | null): SpokeAnchor {
    if (!spokeSlug || spokeSlug.trim().length === 0) {
        const { repoId } = resolveActiveRepo();
        return { repoId, spoke: null, metadata: null };
    }
    const slug = spokeSlug.trim();
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) {
        throw new Error(
            `Spoke '${slug}' is not registered in the Hall estate. ` +
            `Mount it with './cstar spoke link <slug> <root>' before submitting beads.`,
        );
    }
    if (spoke.mount_status !== 'active') {
        throw new Error(
            `Spoke '${slug}' is not active (mount_status='${spoke.mount_status}'). ` +
            `Re-link or repair the spoke before submitting beads.`,
        );
    }
    if (spoke.trust_level === 'quarantined') {
        throw new Error(
            `Spoke '${slug}' is quarantined (trust_level='quarantined'). ` +
            `Bead writes are refused until trust is restored.`,
        );
    }
    if (spoke.write_policy !== 'read_write') {
        throw new Error(
            `Spoke '${slug}' has write_policy='${spoke.write_policy}'. ` +
            `Bead writes require 'read_write'.`,
        );
    }
    return {
        repoId: spoke.repo_id,
        spoke,
        metadata: {
            spoke_slug: spoke.slug,
            spoke_id: spoke.spoke_id,
            spoke_trust_level: spoke.trust_level,
            spoke_write_policy: spoke.write_policy,
            spoke_root: spoke.root_path,
            spoke_kind: spoke.kind,
        },
    };
}

/**
 * Verify a path declared by a spoke payload exists, resolved against the spoke's root.
 * Absolute paths are honored as-is. Returns the resolved absolute path on success.
 */
export function resolveSpokeRelativePath(
    spoke: HallMountedSpokeRecord,
    relativeOrAbsolute: string,
    fieldName: string,
): string {
    const candidate = path.isAbsolute(relativeOrAbsolute)
        ? relativeOrAbsolute
        : path.join(spoke.root_path, relativeOrAbsolute);
    if (!fs.existsSync(candidate)) {
        throw new Error(
            `${fieldName} '${relativeOrAbsolute}' does not exist under spoke '${spoke.slug}' (resolved: ${candidate}).`,
        );
    }
    return candidate;
}

function beadToRecord(bead: SovereignBead): HallBeadRecord {
    return {
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id || undefined,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: bead.status,
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: bead.resolved_validation_id,
        superseded_by: bead.superseded_by,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        metadata: bead.metadata,
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    };
}

function upsertBeadFromExisting(bead: SovereignBead, updates: Partial<HallBeadRecord>): SovereignBead | null {
    const now = Date.now();
    database.upsertHallBead({
        ...beadToRecord(bead),
        ...updates,
        bead_id: bead.id,
        repo_id: bead.repo_id,
        created_at: bead.created_at,
        updated_at: now,
    });
    return database.getHallBead(bead.id);
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
                    if (typeof event.ts !== 'string') {
                        return [];
                    }
                    const ts = Date.parse(event.ts);
                    if (!Number.isFinite(ts) || now - ts > lookbackMs) {
                        return [];
                    }
                    return [event as T];
                } catch {
                    return [];
                }
            });
    } catch {
        return [];
    }
}

function readRecentProjectJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const filePath = path.join(PROJECT_ROOT, relativePath);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const now = Date.now();
        return fs.readFileSync(filePath, 'utf-8')
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .flatMap((line) => {
                try {
                    const event = JSON.parse(line) as T & { ts?: unknown; occurred_at?: unknown };
                    const timestamp = typeof event.ts === 'string'
                        ? event.ts
                        : typeof event.occurred_at === 'string'
                            ? event.occurred_at
                            : undefined;
                    if (!timestamp) {
                        return [];
                    }
                    const ts = Date.parse(timestamp);
                    if (!Number.isFinite(ts) || now - ts > lookbackMs) {
                        return [];
                    }
                    return [event as T];
                } catch {
                    return [];
                }
            });
    } catch {
        return [];
    }
}

function summarizeRecentMcpUsage(): {
    total_calls_24h: number;
    failures_24h: number;
    last_call_at: string | null;
    tool_counts_24h: Record<string, number>;
} {
    try {
        const root = resolveTelemetryRoot();
        const usagePath = path.join(root, MCP_USAGE_STATE_RELATIVE_PATH);
        if (!fs.existsSync(usagePath)) {
            return {
                total_calls_24h: 0,
                failures_24h: 0,
                last_call_at: null,
                tool_counts_24h: {},
            };
        }

        const now = Date.now();
        const lines = fs.readFileSync(usagePath, 'utf-8')
            .split('\n')
            .filter((line) => line.trim().length > 0);

        const toolCounts: Record<string, number> = {};
        let total = 0;
        let failures = 0;
        let lastCallAt: string | null = null;

        for (const line of lines) {
            try {
                const event = JSON.parse(line) as Partial<McpUsageEvent>;
                if (typeof event.ts !== 'string' || typeof event.tool !== 'string') {
                    continue;
                }
                const ts = Date.parse(event.ts);
                if (!Number.isFinite(ts)) {
                    continue;
                }
                if (!lastCallAt || ts > Date.parse(lastCallAt)) {
                    lastCallAt = event.ts;
                }
                if (now - ts > MCP_USAGE_LOOKBACK_MS) {
                    continue;
                }
                total += 1;
                toolCounts[event.tool] = (toolCounts[event.tool] ?? 0) + 1;
                if (event.ok === false) {
                    failures += 1;
                }
            } catch {
                // Ignore malformed rows.
            }
        }

        return {
            total_calls_24h: total,
            failures_24h: failures,
            last_call_at: lastCallAt,
            tool_counts_24h: toolCounts,
        };
    } catch {
        return {
            total_calls_24h: 0,
            failures_24h: 0,
            last_call_at: null,
            tool_counts_24h: {},
        };
    }
}

function incrementCount(counts: Record<string, number>, key: string | undefined): void {
    if (!key) {
        return;
    }
    counts[key] = (counts[key] ?? 0) + 1;
}

function rate(numerator: number, denominator: number): number | null {
    if (denominator === 0) {
        return null;
    }
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
        if (!event.ok) {
            failures += 1;
        }
        if (event.bead_id || event.lead_bead_present) {
            beadLinked += 1;
        }
        if (event.tool === 'cstar_hall_search') {
            searchCalls += 1;
            if (event.has_results) {
                searchHits += 1;
            }
        }
        if (event.tool === 'cstar_handoff') {
            handoffCalls += 1;
            if (event.active_handoff) {
                activeHandoffs += 1;
            }
        }
        if (event.tool === 'cstar_augury') {
            auguryCalls += 1;
            if (event.routed) {
                routedAugury += 1;
            }
            if (event.token_path_present) {
                tokenPathAdvice += 1;
            }
        }
        if (event.tool === 'cstar_verify_plan') {
            verifyCalls += 1;
            if ((event.recommended_command_count ?? 0) > 0 || event.validation_present) {
                usefulVerify += 1;
            }
        }
        if (event.tool === 'cstar_bead') {
            if (event.action === 'create' && event.ok) beadCreates += 1;
            if (event.action === 'claim' && event.ok) beadClaims += 1;
            if (event.action === 'block' && event.ok) beadBlocks += 1;
            if (event.action === 'resolve' && event.ok) beadResolves += 1;
        }
        if (event.tool === 'cstar_record_result' && event.validation_recorded && event.ok) {
            validations += 1;
            if (event.token_path_observation_recorded) {
                tokenPathObservations += 1;
            }
        }
    }

    const warnings: string[] = [];
    if (searchCalls >= 5 && beadCreates + beadClaims + beadBlocks + beadResolves === 0) {
        warnings.push('High MCP search activity but no bead transitions.');
    }
    if (beadCreates > 0 && beadResolves === 0) {
        warnings.push('MCP-created beads exist but none were resolved in the lookback window.');
    }
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

function summarizeRecentMcpUsefulness(): McpUsefulnessSummary {
    return summarizeUsefulnessEvents(
        readRecentJsonl<McpUsefulnessEvent>(MCP_USEFULNESS_STATE_RELATIVE_PATH, MCP_USAGE_LOOKBACK_MS),
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Augury token-path sidecar bridge.
// Sidecar advisor lives outside this repo (Corvus/AuguryTokenPath). We call it
// dynamically so the kernel keeps building when the sidecar isn't checked out.
// Telemetry collected here feeds the sidecar's calibration loop — one-way pull.
// ────────────────────────────────────────────────────────────────────────────

interface TokenPathRoutingInput {
    prompt?: string;
    inferred_intent?: string;
    intent_category?: string;
    target_paths?: string[];
    mimirs_well?: string[];
    scope?: string;
    selection_tier?: string;
    selection_name?: string;
    estimated_context_tokens?: number;
    ambiguity_score?: number;
    requires_external_research?: boolean;
    verification_available?: boolean;
}

interface TokenPathRecommendation {
    advisor: 'augury-token-path';
    schema_version: number;
    mode: string;
    selected_policy: string;
    scenario_class: string;
    context_strategy: unknown;
    budget: unknown;
    decision_reason: string;
    confidence: number;
    rationale: string[];
    expected_billable_tokens: number;
    expected_raw_tokens: number;
    requires_followup: boolean;
    execution_deferred: boolean;
    episode_id?: string;
}

interface TokenPathObservationPayload {
    token_path_episode_id?: string;
    scenario_class: string;
    selected_policy: string;
    advised_mode: string;
    observed_raw_tokens_episode?: number;
    observed_billable_tokens_episode?: number;
    rounds?: number;
    verification_result?: string;
    terminal_outcome?: string;
    actual_success?: boolean;
    actual_completion?: boolean;
    actual_verification_passed?: boolean;
    actual_requires_followup?: boolean;
    actual_deferred?: boolean;
    notes?: string;
}

interface TokenPathAdviceRecord {
    schema_version: '1.0.0';
    ts: string;
    episode_id: string;
    occurred_at: string;
    tool: 'cstar_augury';
    prompt_hash: string;
    bead_id?: string;
    target_paths?: string[];
    intent_category?: string;
    selected_policy: string;
    advised_mode: string;
    scenario_class: string;
    expected_raw_tokens?: number;
    expected_billable_tokens?: number;
    requires_followup?: boolean;
    execution_deferred?: boolean;
    confidence?: number;
}

const TOKEN_PATH_OBSERVATIONS_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-observations.jsonl',
);
const TOKEN_PATH_ADVICE_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-advice.jsonl',
);

function stableHash(input: string): string {
    let hash = 2166136261;
    for (let idx = 0; idx < input.length; idx += 1) {
        hash ^= input.charCodeAt(idx);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateTokenPathEpisodeId(): string {
    return `mcp-tp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

function resolveAuguryTokenPathRoot(): string {
    const envRoot = process.env.AUGURY_TOKEN_PATH_ROOT;
    if (envRoot && envRoot.trim().length > 0) {
        return path.resolve(envRoot);
    }
    return path.resolve(PROJECT_ROOT, '..', 'AuguryTokenPath');
}

async function runTokenPathAdvisor(input: TokenPathRoutingInput): Promise<TokenPathRecommendation | null> {
    try {
        const sidecarRoot = resolveAuguryTokenPathRoot();
        const entryPath = [
            path.join(sidecarRoot, 'src', 'core', 'advisor_entry.ts'),
            path.join(sidecarRoot, 'src', 'core', 'advisor_entry.js'),
        ].find((candidate) => fs.existsSync(candidate));
        if (!entryPath) {
            return null;
        }
        const entryUrl = pathToFileURL(entryPath).href;
        const mod = await import(entryUrl) as {
            getTokenPathAdviceForRouting?: (i: TokenPathRoutingInput) => TokenPathRecommendation;
        };
        if (typeof mod.getTokenPathAdviceForRouting !== 'function') {
            return null;
        }
        return mod.getTokenPathAdviceForRouting(input);
    } catch (error) {
        logBootstrapError(error);
        return null;
    }
}

function deriveObservationOutcome(payload: TokenPathObservationPayload, verdict?: string): {
    actual_success: boolean;
    actual_completion: boolean;
    actual_verification_passed: boolean;
    actual_requires_followup: boolean;
    actual_deferred: boolean;
} {
    const terminal = payload.terminal_outcome;
    const normalizedVerdict = verdict?.toUpperCase();
    const successByVerdict = normalizedVerdict === 'SUCCESS' || normalizedVerdict === 'ACCEPTED';
    const actualSuccess = payload.actual_success ?? (terminal === 'verified-success' || successByVerdict);
    const actualCompletion = payload.actual_completion
        ?? (terminal === 'verified-success' || terminal === 'completed-unverified' || actualSuccess);
    const actualVerificationPassed = payload.actual_verification_passed
        ?? (terminal === 'verified-success' || successByVerdict);
    const actualRequiresFollowup = payload.actual_requires_followup
        ?? (terminal === 'needs-followup' || normalizedVerdict === 'INCONCLUSIVE');
    const actualDeferred = payload.actual_deferred ?? (terminal === 'deferred');

    return {
        actual_success: actualSuccess,
        actual_completion: actualCompletion,
        actual_verification_passed: actualVerificationPassed,
        actual_requires_followup: actualRequiresFollowup,
        actual_deferred: actualDeferred,
    };
}

function appendTokenPathAdvice(
    input: TokenPathRoutingInput,
    recommendation: TokenPathRecommendation,
    beadId?: string,
): string | null {
    const episodeId = recommendation.episode_id || generateTokenPathEpisodeId();
    recommendation.episode_id = episodeId;
    const record: TokenPathAdviceRecord = {
        schema_version: '1.0.0',
        ts: new Date().toISOString(),
        episode_id: episodeId,
        occurred_at: new Date().toISOString(),
        tool: 'cstar_augury',
        prompt_hash: stableHash(`${input.prompt || ''}\n${input.inferred_intent || ''}`),
        bead_id: beadId,
        target_paths: input.target_paths?.slice(0, 10),
        intent_category: input.intent_category,
        selected_policy: recommendation.selected_policy,
        advised_mode: recommendation.mode,
        scenario_class: recommendation.scenario_class,
        expected_raw_tokens: recommendation.expected_raw_tokens,
        expected_billable_tokens: recommendation.expected_billable_tokens,
        requires_followup: recommendation.requires_followup,
        execution_deferred: recommendation.execution_deferred,
        confidence: recommendation.confidence,
    };
    const appendRecord = (root: string): void => {
        const advicePath = path.join(root, TOKEN_PATH_ADVICE_RELATIVE_PATH);
        fs.mkdirSync(path.dirname(advicePath), { recursive: true });
        fs.appendFileSync(advicePath, `${JSON.stringify(record)}\n`, 'utf-8');
    };
    try {
        appendRecord(PROJECT_ROOT);
        return episodeId;
    } catch (error) {
        logBootstrapError(error);
        try {
            appendRecord(path.join('/tmp', 'cstar-kernel-mcp'));
            return episodeId;
        } catch (fallbackError) {
            logBootstrapError(fallbackError);
            return null;
        }
    }
}

function findRecentTokenPathAdvice(episodeId?: string, beadId?: string): TokenPathAdviceRecord | null {
    const advice = readRecentProjectJsonl<TokenPathAdviceRecord>(TOKEN_PATH_ADVICE_RELATIVE_PATH, MCP_USAGE_LOOKBACK_MS);
    const sorted = [...advice].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    if (episodeId) {
        const byEpisode = sorted.find((record) => record.episode_id === episodeId);
        if (byEpisode) {
            return byEpisode;
        }
    }
    if (beadId) {
        const byBead = sorted.find((record) => record.bead_id === beadId);
        if (byBead) {
            return byBead;
        }
    }
    return null;
}

function buildObservationFromAdvice(
    advice: TokenPathAdviceRecord,
    notes?: string,
): TokenPathObservationPayload {
    return {
        token_path_episode_id: advice.episode_id,
        scenario_class: advice.scenario_class,
        selected_policy: advice.selected_policy,
        advised_mode: advice.advised_mode,
        observed_raw_tokens_episode: advice.expected_raw_tokens,
        observed_billable_tokens_episode: advice.expected_billable_tokens,
        terminal_outcome: 'completed-unverified',
        notes,
    };
}

function summarizeRecentTokenPathIntegration(): Record<string, unknown> {
    const advice = readRecentProjectJsonl<TokenPathAdviceRecord>(TOKEN_PATH_ADVICE_RELATIVE_PATH, MCP_USAGE_LOOKBACK_MS);
    const observations = readRecentProjectJsonl<Record<string, unknown>>(
        TOKEN_PATH_OBSERVATIONS_RELATIVE_PATH,
        MCP_USAGE_LOOKBACK_MS,
    );
    const adviceTimes = advice.map((record) => record.occurred_at).sort();
    const observationTimes = observations
        .map((record) => typeof record.occurred_at === 'string' ? record.occurred_at : undefined)
        .filter((ts): ts is string => !!ts)
        .sort();
    const observedEpisodes = new Set(
        observations
            .map((record) => typeof record.token_path_episode_id === 'string' ? record.token_path_episode_id : undefined)
            .filter((episodeId): episodeId is string => !!episodeId),
    );
    const successes = observations.filter((record) => record.actual_success === true).length;
    return {
        advisor_available: fs.existsSync(path.join(resolveAuguryTokenPathRoot(), 'src', 'core', 'advisor_entry.ts'))
            || fs.existsSync(path.join(resolveAuguryTokenPathRoot(), 'src', 'core', 'advisor_entry.js')),
        advice_count_24h: advice.length,
        observation_count_24h: observations.length,
        advice_observation_rate: rate(observedEpisodes.size, advice.length),
        observed_success_rate: rate(successes, observations.length),
        last_advice_at: adviceTimes.length > 0 ? adviceTimes[adviceTimes.length - 1] : null,
        last_observation_at: observationTimes.length > 0 ? observationTimes[observationTimes.length - 1] : null,
    };
}

function appendTokenPathObservation(
    beadId: string,
    payload: TokenPathObservationPayload,
    verdict?: string,
): string | null {
    const observationId = `mcp-obs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const outcome = deriveObservationOutcome(payload, verdict);
    const record = {
        schema_version: '1.0.0',
        ts: new Date().toISOString(),
        observation_id: observationId,
        token_path_episode_id: payload.token_path_episode_id,
        bead_id: beadId,
        occurred_at: new Date().toISOString(),
        scenario_class: payload.scenario_class,
        selected_policy: payload.selected_policy,
        advised_mode: payload.advised_mode,
        observed_raw_tokens_episode: payload.observed_raw_tokens_episode,
        observed_billable_tokens_episode: payload.observed_billable_tokens_episode,
        rounds: payload.rounds,
        verification_result: payload.verification_result,
        terminal_outcome: payload.terminal_outcome,
        ...outcome,
        notes: payload.notes,
    };
    const appendRecord = (root: string): void => {
        const obsPath = path.join(root, TOKEN_PATH_OBSERVATIONS_RELATIVE_PATH);
        fs.mkdirSync(path.dirname(obsPath), { recursive: true });
        fs.appendFileSync(obsPath, `${JSON.stringify(record)}\n`, 'utf-8');
    };
    try {
        appendRecord(PROJECT_ROOT);
        return observationId;
    } catch (error) {
        logBootstrapError(error);
        try {
            appendRecord(path.join('/tmp', 'cstar-kernel-mcp'));
            return observationId;
        } catch (fallbackError) {
            logBootstrapError(fallbackError);
            return null;
        }
    }
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

    if (typeof payload?.bead_id === 'string') {
        event.bead_id = payload.bead_id;
    }
    if (payload?.bead && typeof payload.bead.bead_id === 'string') {
        event.bead_id = payload.bead.bead_id;
    }

    if (base.tool === 'cstar_hall_search') {
        const count = Array.isArray(payload) ? payload.length : 0;
        event.outcome_kind = count > 0 ? 'search_hit' : 'search_miss';
        event.result_count = count;
        event.has_results = count > 0;
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
        event.token_path_episode_id = typeof payload?.token_path?.episode_id === 'string'
            ? payload.token_path.episode_id
            : undefined;
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
        event.validation_recorded = payload?.status === 'recorded';
        event.token_path_observation_recorded = typeof payload?.token_path_observation_id === 'string';
        event.token_path_episode_id = typeof payload?.token_path_episode_id === 'string'
            ? payload.token_path_episode_id
            : undefined;
    }

    return event;
}

function instrumentTool<TArgs>(
    toolName: string,
    handler: (args: TArgs) => Promise<McpTextResponse>,
) {
    return async (args: TArgs) => {
        const startedAt = Date.now();
        const root = resolveTelemetryRoot();
        try {
            const result = await handler(args);
            const usageEvent = {
                ts: new Date(startedAt).toISOString(),
                tool: toolName,
                ok: result.isError !== true,
                duration_ms: Date.now() - startedAt,
                root,
            };
            appendMcpUsageEvent(usageEvent);
            appendMcpUsefulnessEvent({
                ...deriveMcpUsefulnessEvent(usageEvent, args, result),
                repo_id: resolveUsefulnessRepoId(root),
            });
            return result;
        } catch (error) {
            const usageEvent = {
                ts: new Date(startedAt).toISOString(),
                tool: toolName,
                ok: false,
                duration_ms: Date.now() - startedAt,
                root,
            };
            appendMcpUsageEvent(usageEvent);
            appendMcpUsefulnessEvent({
                ...deriveMcpUsefulnessEvent(usageEvent, args),
                repo_id: resolveUsefulnessRepoId(root),
            });
            throw error;
        }
    };
}

// 1. cstar_handoff
export async function handleHallMaintenance({ action, limit, memory_id }: { action: "study" | "harvest", limit?: number, memory_id?: string }) { 
    try { 
        const root = registry.getRoot(); 
        if (action === "study") { 
            if (!memory_id) return textResponse({ error: "study action requires memory_id" }, true); 
            const result = await database.getDb().prepare("SELECT * FROM hall_episodic_memory WHERE memory_id = ?").get(memory_id); 
            if (!result) return textResponse({ error: `Engram ${memory_id} not found` }, true); 
            // Study logic is handled by the agent using the harvester skill 
            return textResponse({ status: "ready_to_study", memory_id }); 
        } 
        if (action === "harvest") { 
            const unstudied = database.listUnstudiedEngrams(true); 
            const targetIds = unstudied.slice(0, limit || 5).map(e => e.memory_id); 
            return textResponse({ 
                status: "harvest_queue_ready", 
                total_unstudied: unstudied.length, 
                queue: targetIds 
            }); 
        } 
        return textResponse({ error: "Invalid action" }, true); 
    } catch (error: any) { 
        return textResponse({ error: error.message }, true); 
    } 
} 

export async function handleHandoff() {
    try {
        const root = registry.getRoot();
        const session = resolveActivePlanningSession(root);
        const handoff = buildTraceAgentHandoffPayload(session, root);
        
        if (!handoff) {
            return textResponse({ status: 'idle' });
        }

        // Compact the handoff according to the mandate
        const compactHandoff = {
            execution_gate: handoff.execution_gate,
            phase: handoff.phase,
            next_action: handoff.next_action,
            lead_bead_id: handoff.lead_bead_id,
            target_paths: handoff.target_paths.slice(0, 5),
            checker_shells: handoff.checker_shells.slice(0, 3),
            work_items: handoff.work_items.slice(0, 3).map(w => ({
                bead_id: w.bead_id,
                status: w.status,
                target_path: w.target_path
            }))
        };

        return textResponse(compactHandoff);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool( 
    "cstar_hall_maintenance", 
    "Maintenance operations for the Hall of Records (e.g. studying/harvesting lessons).", 
    { 
        action: z.enum(["study", "harvest"]).describe("The maintenance action to perform"), 
        limit: z.number().min(1).max(20).optional().default(5).describe("Batch size for harvest"), 
        memory_id: z.string().optional().describe("Target engram for study") 
    }, 
    instrumentTool("cstar_hall_maintenance", handleHallMaintenance) 
); 

server.tool(
    'cstar_handoff',
    'Return compact active state from Augury/handoff logic.',
    {},
    instrumentTool('cstar_handoff', handleHandoff)
);

// 2. cstar_hall_search
export async function handleHallSearch({ query, limit, types }: { query: string, limit?: number, types?: string[] }) {
    try {
        const actualLimit = Math.min(limit || 5, 10);
        const results = database.searchIntents(query);
        
        // Apply type filtering
        let filtered = results;
        if (types && types.length > 0) {
            const typeSet = new Set(types.map(t => t.toUpperCase()));
            filtered = results.filter(r => typeSet.has(r.type));
        }

        const output = filtered.slice(0, actualLimit).map(r => ({
            type: r.type,
            path_or_id: r.path,
            title: r.type === 'CODE' || r.type === 'DOC' ? path.basename(r.path) : (r.intent || 'Untitled'),
            summary: (r.intent || '').substring(0, 240),
            rank: r.rank
        }));

        return textResponse(output);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_hall_search',
    'Bounded Hall search across code/docs/engrams/beads/sessions/lessons.',
    {
        query: z.string().describe('The search query'),
        limit: z.number().min(1).max(10).optional().default(5).describe('Result limit (max 10)'),
        types: z.array(z.enum(['CODE', 'DOC', 'ENGRAM', 'BEAD', 'SESSION', 'LESSON'])).optional().describe('Filter by types')
    },
    instrumentTool('cstar_hall_search', handleHallSearch)
);

// 3. cstar_augury
export async function handleAugury({ prompt, inferred_intent, target_paths, scope }: { prompt: string, inferred_intent?: string, target_paths?: string[], scope?: string }) {
    try {
        let explain: ReturnType<typeof buildAuguryExplainPayload> = {
            status: 'missing',
            agent_next_action: 'Perform handoff to verify active state.',
            warnings: [],
        };
        try {
            const root = registry.getRoot();
            const session = resolveActivePlanningSession(root);
            explain = buildAuguryExplainPayload(session, root);
        } catch (error) {
            logBootstrapError(error);
        }

        let result: Record<string, unknown>;
        let routingInput: TokenPathRoutingInput;

        if (explain.status === 'available' && explain.route) {
            const expert = explain.expert as (typeof explain.expert & KernelCouncilExpert);
            const designation = explain.route.designation || '';
            const colonIdx = designation.indexOf(':');
            const selectionTier = colonIdx >= 0 ? designation.slice(0, colonIdx).trim() : designation.trim();
            const selectionName = colonIdx >= 0 ? designation.slice(colonIdx + 1).trim() : undefined;
            result = {
                intent_category: explain.route.intent_category,
                intent: explain.route.intent,
                scope: explain.scope?.value || scope || 'brain:CStar',
                selection: explain.route.designation,
                expert: expert?.id,
                expert_label: expert?.label,
                expert_lens: expert?.lens,
                expert_signature_question: expert?.signature_question,
                expert_guardrails: expert?.anti_behavior?.slice(0, 3),
                mimir_targets: explain.mimir?.targets.slice(0, 3) || (target_paths || []).slice(0, 3),
                next_action: explain.agent_next_action || 'Perform handoff to verify active state.',
                council_candidates: expert?.selection_candidates?.slice(0, 3) ?? [],
                confidence: 1.0
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: explain.route.intent_category,
                target_paths,
                mimirs_well: explain.mimir?.targets,
                scope: explain.scope?.value || scope,
                selection_tier: selectionTier || undefined,
                selection_name: selectionName,
            };
        } else {
            // Fallback for idle/missing state
            const selectedExpert = selectCouncilExpert({
                intent_category: 'ORCHESTRATE',
                intent: inferred_intent || prompt.substring(0, 100),
                selection_tier: 'SKILL',
                selection_name: 'cstar-kernel',
                mimirs_well: (target_paths || []).slice(0, 3),
            }) as ReturnType<typeof selectCouncilExpert> & KernelCouncilExpert;
            result = {
                intent_category: 'ORCHESTRATE',
                intent: inferred_intent || prompt.substring(0, 100),
                scope: scope || 'brain:CStar',
                selection: 'SKILL: cstar-kernel',
                expert: selectedExpert.id,
                expert_label: selectedExpert.label,
                expert_lens: selectedExpert.lens,
                expert_signature_question: selectedExpert.signature_question ?? '',
                expert_guardrails: selectedExpert.anti_behavior.slice(0, 3),
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: 'Perform handoff to verify active state.',
                council_candidates: selectedExpert.selection_candidates?.slice(0, 3) ?? [],
                confidence: 0.9
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: 'ORCHESTRATE',
                target_paths,
                scope,
                selection_tier: 'SKILL',
                selection_name: 'cstar-kernel',
            };
        }

        const tokenPath = await runTokenPathAdvisor(routingInput);
        if (tokenPath) {
            appendTokenPathAdvice(routingInput, tokenPath);
            result.token_path = tokenPath;
        }

        return textResponse(result);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_augury',
    'Route one mission without claiming host pre-inference control.',
    {
        prompt: z.string().describe('The user prompt or mission statement'),
        inferred_intent: z.string().optional().describe('Optional inferred intent'),
        target_paths: z.array(z.string()).optional().describe('Optional target paths'),
        scope: z.string().optional().describe('Optional scope')
    },
    instrumentTool('cstar_augury', handleAugury)
);

// 4. cstar_doctor
export async function handleDoctor() {
    try {
        const root = registry.getRoot();
        const session = resolveActivePlanningSession(root);
        const doctor = buildAuguryDoctorPayload(session, root);
        const db = database.getDb(root);
        const dbOk = db !== null;
        const result = {
            status: doctor.status === 'pass' ? 'healthy' : 'degraded',
            score: doctor.score,
            warnings: doctor.warnings,
            active: true,
            checks: {
                database: dbOk,
                registry: !!root,
                augury: doctor.status === 'pass'
            },
            telemetry: summarizeRecentMcpUsage(),
            usefulness: summarizeRecentMcpUsefulness(),
            token_path: summarizeRecentTokenPathIntegration(),
        };



        return textResponse(result);
    } catch (error: any) {
        return textResponse({ status: 'fail', error: error.message }, true);
    }
}

server.tool(
    'cstar_doctor',
    'Diagnose base kernel health and active Augury health.',
    {},
    instrumentTool('cstar_doctor', handleDoctor)
);

// 5. cstar_verify_plan
export async function handleVerifyPlan() {
    try {
        const root = registry.getRoot();
        const session = resolveActivePlanningSession(root);
        const handoff = buildTraceAgentHandoffPayload(session, root);

        let last_validation: { verdict: string; recorded_at: number; validation_id: string } | null = null;
        if (handoff?.lead_bead_id) {
            try {
                const runs = database.getValidationRuns(handoff.lead_bead_id);
                if (runs && runs.length > 0) {
                    const sorted = [...runs].sort((a: any, b: any) => (b.created_at ?? 0) - (a.created_at ?? 0));
                    const latest: any = sorted[0];
                    last_validation = {
                        verdict: String(latest.verdict ?? 'INCONCLUSIVE'),
                        recorded_at: Number(latest.created_at ?? 0),
                        validation_id: String(latest.validation_id ?? ''),
                    };
                }
            } catch {
                // last_validation stays null on lookup failure.
            }
        }

        const result = {
            recommended_commands: (handoff?.checker_shells || []).slice(0, 3),
            reason: 'Verified from active bead checker shells.',
            bead_id: handoff?.lead_bead_id,
            target_paths: handoff?.target_paths || [],
            last_validation,
        };

        return textResponse(result);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_verify_plan',
    'Recommend focused checks; do not run them.',
    {},
    instrumentTool('cstar_verify_plan', handleVerifyPlan)
);

// 6. cstar_bead
export async function handleBead(args: BeadToolArgs) {
    try {
        const { root, repoId: kernelRepoId } = resolveActiveRepo();
        const now = Date.now();

        if (args.action === 'list') {
            const limit = Math.min(args.limit || 5, 10);
            const beads = database.getHallBeads(root, args.statuses);
            return textResponse({
                status: 'ok',
                action: 'list',
                count: Math.min(beads.length, limit),
                beads: beads.slice(0, limit).map(compactBead),
            });
        }

        if (args.action === 'create') {
            const rationale = requireString(args.rationale, 'rationale');
            const anchor = resolveSpokeAnchor(args.spoke);
            const repoId = anchor.repoId || kernelRepoId;
            const beadId = args.bead_id?.trim() || generateBeadId(rationale);
            const targetKind = args.target_kind || (args.target_path ? 'FILE' : 'OTHER');
            database.upsertHallBead({
                bead_id: beadId,
                repo_id: repoId,
                target_kind: targetKind,
                target_ref: args.target_ref || args.target_path,
                target_path: args.target_path,
                rationale,
                contract_refs: args.contract_refs || [],
                baseline_scores: {},
                acceptance_criteria: args.acceptance_criteria,
                checker_shell: args.checker_shell,
                status: args.status || 'OPEN',
                assigned_agent: args.assigned_agent,
                source_kind: 'MCP',
                metadata: {
                    source: 'cstar-kernel-mcp',
                    ...(anchor.metadata || {}),
                    ...(args.metadata || {}),
                },
                created_at: now,
                updated_at: now,
            });
            return textResponse({
                status: 'created',
                action: 'create',
                spoke: anchor.spoke?.slug,
                repo_id: repoId,
                bead: compactBead(database.getHallBead(beadId)),
            });
        }

        const beadId = requireString(args.bead_id, 'bead_id');
        const bead = database.getHallBead(beadId);
        if (!bead) {
            return textResponse({ error: `Bead not found: ${beadId}` }, true);
        }

        if (args.action === 'get') {
            return textResponse({
                status: 'ok',
                action: 'get',
                bead: compactBead(bead),
            });
        }

        if (args.action === 'update_status') {
            const status = args.status || (() => { throw new Error('status is required.'); })();
            const updated = upsertBeadFromExisting(bead, {
                status,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                resolved_validation_id: args.resolved_validation_id ?? bead.resolved_validation_id,
                triage_reason: args.triage_reason ?? bead.triage_reason,
                metadata: {
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    updated_by: 'cstar-kernel-mcp',
                },
            });
            return textResponse({
                status: 'updated',
                action: 'update_status',
                bead: compactBead(updated),
            });
        }

        if (args.action === 'claim') {
            const assignedAgent = requireString(args.assigned_agent, 'assigned_agent');
            const updated = upsertBeadFromExisting(bead, {
                assigned_agent: assignedAgent,
                status: args.status || 'IN_PROGRESS',
                metadata: {
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    claimed_by: assignedAgent,
                    claim_source: 'cstar-kernel-mcp',
                },
            });
            return textResponse({
                status: 'claimed',
                action: 'claim',
                bead: compactBead(updated),
            });
        }

        if (args.action === 'resolve') {
            const updated = upsertBeadFromExisting(bead, {
                status: 'RESOLVED',
                resolution_note: args.resolution_note || bead.resolution_note || 'Resolved through cstar-kernel MCP.',
                resolved_validation_id: args.resolved_validation_id ?? bead.resolved_validation_id,
                metadata: {
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    resolved_by: 'cstar-kernel-mcp',
                },
            });
            return textResponse({
                status: 'resolved',
                action: 'resolve',
                bead: compactBead(updated),
            });
        }

        if (args.action === 'block') {
            const triageReason = requireString(args.triage_reason || args.resolution_note, 'triage_reason');
            const updated = upsertBeadFromExisting(bead, {
                status: 'BLOCKED',
                triage_reason: triageReason,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                metadata: {
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    blocked_by: 'cstar-kernel-mcp',
                },
            });
            return textResponse({
                status: 'blocked',
                action: 'block',
                bead: compactBead(updated),
            });
        }

        return textResponse({ error: `Unsupported bead action: ${args.action}` }, true);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_bead',
    'Create, inspect, claim, block, resolve, and list bounded Hall beads.',
    {
        action: z.enum(['get', 'list', 'create', 'update_status', 'claim', 'resolve', 'block']).describe('Bounded bead action'),
        bead_id: z.string().optional().describe('Hall bead id'),
        limit: z.number().min(1).max(10).optional().default(5).describe('Result limit for list'),
        statuses: z.array(z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]])).optional().describe('Optional list status filter'),
        target_kind: z.enum(HALL_BEAD_TARGET_KINDS as [HallBeadTargetKind, ...HallBeadTargetKind[]]).optional().describe('Target kind for create'),
        target_path: z.string().optional().describe('Target file/path'),
        target_ref: z.string().optional().describe('Target reference'),
        rationale: z.string().optional().describe('Bead rationale, required for create'),
        acceptance_criteria: z.string().optional().describe('Acceptance criteria'),
        checker_shell: z.string().optional().describe('Focused checker command'),
        contract_refs: z.array(z.string()).optional().describe('Contract references'),
        status: z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]]).optional().describe('Status for create/update/claim'),
        assigned_agent: z.string().optional().describe('Assigned agent for claim/create'),
        resolution_note: z.string().optional().describe('Resolution or blocker note'),
        resolved_validation_id: z.string().optional().describe('Validation id used for resolution'),
        triage_reason: z.string().optional().describe('Reason for blocked/triage status'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Small metadata object'),
        spoke: z.string().optional().describe('Slug of a registered Hall spoke. When set on create, the bead is anchored to that spoke\'s repo_id instead of the kernel\'s. Unregistered, quarantined, or read-only spokes are rejected.'),
    },
    instrumentTool('cstar_bead', handleBead)
);

// 6b. cstar_spoke_bead_import
//
// Rich Bead-import surface for spokes (SecureSphere, etc.). Differs from
// `cstar_bead create` in that it accepts a curated handoff payload:
//   - lore_path  : required Gherkin .feature file (Sterling Mandate leg 1)
//   - design_doc_path / wireframe_ref / threat_model_summary / augury_block
// All path fields are resolved against the spoke's root. Spoke must be
// registered, active, trusted, and read_write — otherwise rejected hard.
export async function handleSpokeBeadImport(args: SpokeBeadImportArgs) {
    try {
        const slug = requireString(args.spoke, 'spoke');
        const intent = requireString(args.intent, 'intent');
        const acceptance = requireString(args.acceptance_criteria, 'acceptance_criteria');
        const lorePath = requireString(args.lore_path, 'lore_path');

        const anchor = resolveSpokeAnchor(slug);
        if (!anchor.spoke) {
            throw new Error(`Spoke '${slug}' did not resolve to a Hall record.`);
        }

        const resolvedLore = resolveSpokeRelativePath(anchor.spoke, lorePath, 'lore_path');
        const resolvedDesignDoc = args.design_doc_path
            ? resolveSpokeRelativePath(anchor.spoke, args.design_doc_path, 'design_doc_path')
            : undefined;

        const targetPaths = (args.target_paths || []).filter((p) => p.trim().length > 0);
        const primaryTargetPath = targetPaths[0];
        const extraTargetPaths = targetPaths.slice(1);
        const targetKind = args.target_kind || (primaryTargetPath ? 'FILE' : 'SPOKE');
        const beadId = args.bead_id?.trim() || generateBeadId(intent);
        const now = Date.now();

        const contractRefs = [
            ...(args.contract_refs || []),
            `lore:${path.relative(anchor.spoke.root_path, resolvedLore)}`,
        ];

        const spokeMetadata: Record<string, unknown> = {
            ...(anchor.metadata || {}),
            lore_path: path.relative(anchor.spoke.root_path, resolvedLore),
            lore_absolute_path: resolvedLore,
        };
        if (resolvedDesignDoc) {
            spokeMetadata.design_doc_path = path.relative(anchor.spoke.root_path, resolvedDesignDoc);
            spokeMetadata.design_doc_absolute_path = resolvedDesignDoc;
        }
        if (args.wireframe_ref) {
            spokeMetadata.wireframe_ref = args.wireframe_ref;
        }
        if (args.threat_model_summary) {
            spokeMetadata.threat_model_summary = args.threat_model_summary.slice(0, 4000);
        }
        if (args.augury_block) {
            spokeMetadata.augury_block = args.augury_block.slice(0, 4000);
        }
        if (extraTargetPaths.length > 0) {
            spokeMetadata.extra_target_paths = extraTargetPaths;
        }

        database.upsertHallBead({
            bead_id: beadId,
            repo_id: anchor.repoId,
            target_kind: targetKind,
            target_ref: args.target_ref || primaryTargetPath || `spoke://${anchor.spoke.slug}`,
            target_path: primaryTargetPath,
            rationale: intent,
            contract_refs: contractRefs,
            baseline_scores: {},
            acceptance_criteria: acceptance,
            checker_shell: args.checker_shell,
            status: args.status || 'OPEN',
            assigned_agent: args.assigned_agent,
            source_kind: 'MCP',
            metadata: {
                source: 'cstar-kernel-mcp:spoke_bead_import',
                ...spokeMetadata,
                ...(args.metadata || {}),
            },
            created_at: now,
            updated_at: now,
        });

        return textResponse({
            status: 'created',
            action: 'spoke_bead_import',
            spoke: anchor.spoke.slug,
            repo_id: anchor.repoId,
            bead: compactBead(database.getHallBead(beadId)),
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_spoke_bead_import',
    'Import a rich Bead payload from a registered spoke. Anchors the bead to the spoke\'s repo, validates Lore (.feature) on disk, and embeds design/wireframe/threat-model/augury references in metadata. Hard-rejects unregistered, inactive, quarantined, or read-only spokes.',
    {
        spoke: z.string().describe('Registered spoke slug (must exist in hall_mounted_spokes).'),
        bead_id: z.string().optional().describe('Pre-assigned bead id; generated if omitted.'),
        intent: z.string().describe('Bead rationale / mission statement.'),
        acceptance_criteria: z.string().describe('Concrete completion criteria.'),
        lore_path: z.string().describe('Path to a Gherkin .feature file (Sterling Mandate leg 1), relative to spoke root or absolute. Must exist.'),
        design_doc_path: z.string().optional().describe('Path to the design record (e.g. docs/design/*.md), relative to spoke root or absolute. Must exist if provided.'),
        wireframe_ref: z.string().optional().describe('Wireframe path or anchor for UI-binding beads.'),
        threat_model_summary: z.string().optional().describe('Short threat-model summary (truncated to 4 KiB).'),
        contract_refs: z.array(z.string()).optional().describe('Additional contract references.'),
        checker_shell: z.string().optional().describe('Focused checker command.'),
        target_paths: z.array(z.string()).optional().describe('Target paths; first is primary, rest stored in metadata.'),
        target_kind: z.enum(HALL_BEAD_TARGET_KINDS as [HallBeadTargetKind, ...HallBeadTargetKind[]]).optional().describe('Override target kind; defaults to FILE if target_paths given, else SPOKE.'),
        target_ref: z.string().optional().describe('Target reference override; defaults to primary target_path or spoke URI.'),
        augury_block: z.string().optional().describe('Captured Corvus Star Augury block for the work (truncated to 4 KiB).'),
        assigned_agent: z.string().optional().describe('Assigned agent.'),
        status: z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]]).optional().describe('Initial status; defaults to OPEN.'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Extra metadata merged after spoke + lore stamping.'),
    },
    instrumentTool('cstar_spoke_bead_import', handleSpokeBeadImport)
);

// 7. cstar_record_result
export async function handleRecordResult({ bead_id, verdict, notes, token_path_episode_id, token_path_observation }: {
    bead_id: string,
    verdict: string,
    notes?: string,
    token_path_episode_id?: string,
    token_path_observation?: TokenPathObservationPayload,
}) {
    try {
        let root = PROJECT_ROOT;
        let repoId = 'cstar';
        const validationId = `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        let validationError: string | undefined;

        try {
            root = registry.getRoot();
            const repo = database.getHallRepository(root);
            repoId = repo?.repo_id || repoId;
            database.saveValidationRun({
                validation_id: validationId,
                repo_id: repoId,
                bead_id,
                verdict: verdict as any,
                notes: notes || '',
                created_at: Date.now()
            } satisfies HallValidationRun);
        } catch (error) {
            validationError = error instanceof Error ? error.message : String(error);
            logBootstrapError(error);
        }

        let observationId: string | null = null;
        let observationPayload = token_path_observation;
        let linkedTokenPathEpisodeId = token_path_episode_id;
        if (!observationPayload && token_path_episode_id) {
            const advice = findRecentTokenPathAdvice(token_path_episode_id, bead_id);
            if (advice) {
                observationPayload = buildObservationFromAdvice(advice, notes);
                linkedTokenPathEpisodeId = advice.episode_id;
            }
        }
        if (observationPayload
            && typeof observationPayload.scenario_class === 'string'
            && typeof observationPayload.selected_policy === 'string'
            && typeof observationPayload.advised_mode === 'string') {
            if (linkedTokenPathEpisodeId && !observationPayload.token_path_episode_id) {
                observationPayload = {
                    ...observationPayload,
                    token_path_episode_id: linkedTokenPathEpisodeId,
                };
            }
            observationId = appendTokenPathObservation(bead_id, observationPayload, verdict);
            linkedTokenPathEpisodeId = observationPayload.token_path_episode_id || linkedTokenPathEpisodeId;
        }

        const response: Record<string, unknown> = { status: 'recorded', bead_id, verdict, validation_id: validationId };
        if (validationError) {
            response.validation_warning = validationError;
        }
        if (observationId) {
            response.token_path_observation_id = observationId;
        }
        if (linkedTokenPathEpisodeId) {
            response.token_path_episode_id = linkedTokenPathEpisodeId;
        }

        return textResponse(response);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_record_result',
    'Append validation outcome and optionally connect it to a bead. Pass token_path_observation to feed the Augury token-path sidecar calibration loop.',
    {
        bead_id: z.string().describe('The ID of the bead being validated'),
        verdict: z.enum(['ACCEPTED', 'REJECTED', 'INCONCLUSIVE', 'SUCCESS', 'FAILURE']).describe('The validation result'),
        notes: z.string().optional().describe('Optional notes about the result'),
        token_path_episode_id: z.string().optional().describe('Episode id from cstar_augury token_path. Enables automatic observation linking.'),
        token_path_observation: z.object({
            token_path_episode_id: z.string().optional().describe('Episode id from cstar_augury token_path'),
            scenario_class: z.string().describe('Scenario class string from cstar_augury token_path block'),
            selected_policy: z.string().describe('Policy id (e.g. advisor, lite-only, defer-escalate)'),
            advised_mode: z.string().describe('Token-path mode the advisor selected'),
            observed_raw_tokens_episode: z.number().nonnegative().optional(),
            observed_billable_tokens_episode: z.number().nonnegative().optional(),
            rounds: z.number().int().nonnegative().optional(),
            verification_result: z.string().optional(),
            terminal_outcome: z.string().optional(),
            actual_success: z.boolean().optional(),
            actual_completion: z.boolean().optional(),
            actual_verification_passed: z.boolean().optional(),
            actual_requires_followup: z.boolean().optional(),
            actual_deferred: z.boolean().optional(),
            notes: z.string().optional(),
        }).optional().describe('Optional Augury token-path live observation; appended to .agents/state/augury-token-path-mcp-observations.jsonl for sidecar calibration.'),
    },
    instrumentTool('cstar_record_result', handleRecordResult)
);


// ─────────────────────────────────────────────────────────────────────────────
// BEAD-CSTAR-WAR-GAME-SCORING-001 — Dead-drop write surface + arbitration.
//
// cstar_engram_record:  Spokes publish arbitrary-intent Engrams to the Hall.
// cstar_war_game_score: Operator queries the scoring infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

interface EngramRecordArgs {
    intent: string;
    bead_id: string;
    spoke?: string;
    metadata?: Record<string, unknown>;
    memory_id?: string;
}

export async function handleEngramRecord(args: EngramRecordArgs) {
    try {
        const intent = requireString(args.intent, 'intent');
        const beadId = requireString(args.bead_id, 'bead_id');
        const metadata = args.metadata ?? {};

        // Resolve spoke (if specified). Reuses the trust+write-policy gate
        // already used by cstar_spoke_bead_import. Spokes that are quarantined
        // or read_only are rejected hard.
        let anchor;
        if (args.spoke) {
            anchor = resolveSpokeAnchor(args.spoke);
        } else {
            const { repoId } = resolveActiveRepo();
            anchor = { repoId, spoke: null, metadata: null };
        }

        const now = Date.now();
        const memoryId = args.memory_id?.trim() || `engram_${intent.replace(/[^a-zA-Z0-9_-]/g, '_')}_${now}_${Math.random().toString(36).substring(2, 8)}`;

        // Persist via direct insert so the FTS triggers fire and the row is
        // queryable BEFORE the scoring trigger runs.
        database.getDb().prepare(
            `INSERT INTO hall_episodic_memory (
                memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                successes_json, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            memoryId,
            beadId,
            anchor.repoId,
            intent,
            '[]',
            '[]',
            JSON.stringify(metadata),
            now,
            now,
        );

        // Fire the score trigger AFTER the row is persisted. Fail-soft —
        // any error inside the trigger is logged and swallowed, never
        // propagated to the caller.
        const recorded: WarGameRecordedEngram = {
            memory_id: memoryId,
            bead_id: beadId,
            repo_id: anchor.repoId,
            intent,
            metadata,
            created_at: now,
        };

        // Skip scoring for kernel-emitted scored Engrams to prevent recursion.
        let scoreResults: ReturnType<typeof scoreEngramIfArbitrated> = [];
        if (!intent.startsWith('cstar/war-game/scored/')) {
            scoreResults = scoreEngramIfArbitrated(database.getDb(), recorded);
        }

        return textResponse({
            status: 'recorded',
            memory_id: memoryId,
            intent,
            bead_id: beadId,
            repo_id: anchor.repoId,
            score_results: scoreResults.length > 0 ? scoreResults : undefined,
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_engram_record',
    'Publish an Engram to the Hall. Spokes use this as the dead-drop write surface for cross-system events (e.g. usb-forge/shot-fired/*, usb-sentry/verdict/*). Fires the war-game scoring trigger for any Engram whose intent matches a registered contest defender prefix.',
    {
        intent: z.string().describe('Free-form intent string, e.g. "usb-forge/shot-fired/FORGE-MS-002". Used as the tactical_summary for FTS search.'),
        bead_id: z.string().describe('Parent bead anchor (required by hall_episodic_memory FK).'),
        spoke: z.string().optional().describe('Optional spoke slug. When set, the spoke must be active, trusted, and read_write — otherwise rejected hard.'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Free-form Engram payload (JSON-serializable). Carries shot_id, terminal_event, expected, etc. for war-game arbitration.'),
        memory_id: z.string().optional().describe('Optional pre-assigned memory_id; auto-generated if omitted.'),
    },
    instrumentTool('cstar_engram_record', handleEngramRecord)
);


interface WarGameScoreArgs {
    action: 'register_contest' | 'tally' | 'recent' | 'by_scenario' | 'get_score' | 'list_contests';
    contest_id?: string;
    shot_id?: string;
    limit?: number;

    // register_contest fields
    contest_name?: string;
    attacker_label?: string;
    defender_label?: string;
    attacker_bead_id?: string;
    defender_bead_id?: string;
    attacker_intent_prefix?: string;
    defender_intent_prefix?: string;
    shot_id_path?: string;
    expected_path?: string;
    terminal_event_path?: string;
    terminal_event_class_map?: { block: string[]; complete: string[]; inconclusive: string[] };
    scenario_compatibility_map?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}

export async function handleWarGameScore(args: WarGameScoreArgs) {
    try {
        const db = database.getDb();
        switch (args.action) {
            case 'register_contest': {
                const contestId = requireString(args.contest_id, 'contest_id');
                const contestName = requireString(args.contest_name, 'contest_name');
                const attackerLabel = requireString(args.attacker_label, 'attacker_label');
                const defenderLabel = requireString(args.defender_label, 'defender_label');
                const attackerPrefix = requireString(args.attacker_intent_prefix, 'attacker_intent_prefix');
                const defenderPrefix = requireString(args.defender_intent_prefix, 'defender_intent_prefix');
                if (!args.terminal_event_class_map) {
                    return textResponse({ error: 'terminal_event_class_map is required' }, true);
                }
                if (!args.scenario_compatibility_map) {
                    return textResponse({ error: 'scenario_compatibility_map is required' }, true);
                }
                const { repoId } = resolveActiveRepo();
                warGameRegisterContest(db, {
                    contest_id: contestId,
                    repo_id: repoId,
                    contest_name: contestName,
                    attacker_label: attackerLabel,
                    defender_label: defenderLabel,
                    attacker_bead_id: args.attacker_bead_id ?? null,
                    defender_bead_id: args.defender_bead_id ?? null,
                    attacker_intent_prefix: attackerPrefix,
                    defender_intent_prefix: defenderPrefix,
                    shot_id_path: args.shot_id_path,
                    expected_path: args.expected_path,
                    terminal_event_path: args.terminal_event_path,
                    terminal_event_class_map: args.terminal_event_class_map,
                    scenario_compatibility_map: args.scenario_compatibility_map,
                    metadata: args.metadata,
                });
                return textResponse({ status: 'registered', contest_id: contestId });
            }
            case 'tally': {
                if (args.contest_id) {
                    const tally = tallyContest(db, args.contest_id);
                    if (!tally) return textResponse({ error: `contest '${args.contest_id}' not found` }, true);
                    return textResponse({ status: 'ok', action: 'tally', tally });
                }
                const tallies = tallyAllContests(db);
                return textResponse({ status: 'ok', action: 'tally', tallies });
            }
            case 'recent': {
                const limit = args.limit ?? 10;
                const rows = recentScores(db, args.contest_id ?? null, limit);
                return textResponse({ status: 'ok', action: 'recent', scores: rows });
            }
            case 'by_scenario': {
                const contestId = requireString(args.contest_id, 'contest_id');
                const buckets = byScenario(db, contestId);
                return textResponse({ status: 'ok', action: 'by_scenario', contest_id: contestId, buckets });
            }
            case 'get_score': {
                const shotId = requireString(args.shot_id, 'shot_id');
                const row = getScoreByShot(db, shotId, args.contest_id);
                return textResponse({ status: 'ok', action: 'get_score', score: row });
            }
            case 'list_contests': {
                const rows = db.prepare(
                    `SELECT contest_id, contest_name, attacker_label, defender_label,
                            attacker_bead_id, defender_bead_id, created_at
                     FROM war_game_contests ORDER BY created_at DESC`,
                ).all();
                return textResponse({ status: 'ok', action: 'list_contests', contests: rows });
            }
            default:
                return textResponse({ error: `Unsupported war_game_score action: ${args.action}` }, true);
        }
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_war_game_score',
    'Query and manage war-game scoring. Actions: register_contest, tally, recent, by_scenario, get_score, list_contests. Scoring itself fires automatically when cstar_engram_record receives an Engram whose intent matches a registered contest defender prefix.',
    {
        action: z.enum(['register_contest', 'tally', 'recent', 'by_scenario', 'get_score', 'list_contests']).describe('Bounded scoring action'),
        contest_id: z.string().optional().describe('Contest identifier (required for register_contest, by_scenario; optional filter for tally/recent/get_score)'),
        shot_id: z.string().optional().describe('Shot identifier (required for get_score)'),
        limit: z.number().int().min(1).max(100).optional().describe('Result limit for recent (default 10)'),
        contest_name: z.string().optional().describe('Human label for the contest (register_contest)'),
        attacker_label: z.string().optional().describe('Short attacker identifier, e.g. "claude:forge" (register_contest)'),
        defender_label: z.string().optional().describe('Short defender identifier, e.g. "codex:sentry" (register_contest)'),
        attacker_bead_id: z.string().optional().describe('Anchoring bead for the attacker side (register_contest)'),
        defender_bead_id: z.string().optional().describe('Anchoring bead for the defender side (register_contest)'),
        attacker_intent_prefix: z.string().optional().describe('Engram intent prefix that identifies attacker shot-fired writes, e.g. "usb-forge/shot-fired/" (register_contest)'),
        defender_intent_prefix: z.string().optional().describe('Engram intent prefix that identifies defender verdict writes, e.g. "usb-sentry/verdict/" (register_contest)'),
        shot_id_path: z.string().optional().describe('Dotted JSONPath for shot_id, default "metadata.shot_id" (register_contest)'),
        expected_path: z.string().optional().describe('Dotted JSONPath for attacker expected outcome, default "metadata.expected" (register_contest)'),
        terminal_event_path: z.string().optional().describe('Dotted JSONPath for defender terminal_event, default "metadata.terminal_event" (register_contest)'),
        terminal_event_class_map: z.object({
            block: z.array(z.string()),
            complete: z.array(z.string()),
            inconclusive: z.array(z.string()),
        }).optional().describe('Maps terminal_event strings to their class (block/complete/inconclusive) (register_contest)'),
        scenario_compatibility_map: z.record(z.string(), z.array(z.string())).optional().describe('Per-scenario_id allowed terminal_events; structural-violation detection uses this (register_contest)'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Optional contest metadata'),
    },
    instrumentTool('cstar_war_game_score', handleWarGameScore)
);


// ─────────────────────────────────────────────────────────────────────────
// BEAD-CSTAR-SPOKE-DISCOVERY-001 — F3 tools.
// Read-only, announce-only spoke awareness. Kernel walks; host executes.
// ─────────────────────────────────────────────────────────────────────────

interface SpokeCapabilityRecord {
    id: string;
    bare_id: string;
    source: 'spoke';
    source_spoke: string;
    tier: string;
    risk: string;
    entry_surface: 'host-only';
    execution_mode: 'agent-native';
    owner_runtime: 'host-agent';
    authority_path: string;
    active_in_runtime: false;
    validation: string;
    validation_reason?: string;
    shadows_hub_id: boolean;
    name: string;
    description: string;
}

function adaptSpokeManifestToCapability(s: SpokeSkillManifest): SpokeCapabilityRecord {
    return {
        id: s.id,
        bare_id: s.bare_id,
        source: 'spoke',
        source_spoke: s.spoke_slug,
        tier: s.tier,
        risk: s.risk,
        entry_surface: 'host-only',
        execution_mode: 'agent-native',
        owner_runtime: 'host-agent',
        authority_path: s.authority_path,
        active_in_runtime: false,
        validation: s.validation,
        validation_reason: s.validation_reason,
        shadows_hub_id: s.shadows_hub_id,
        name: s.name,
        description: s.description,
    };
}

const LOGIC_PROTOCOL_RE = /^#{1,6}.*LOGIC PROTOCOL.*$/im;

function extractLogicProtocolAnchor(content: string): string | null {
    const m = LOGIC_PROTOCOL_RE.exec(content);
    return m === null ? null : m[0].trim();
}

async function handleManifest({ scope = 'hub', spoke }: { scope?: 'hub' | 'spoke' | 'all'; spoke?: string }) {
    try {
        const projectRoot = registry.getRoot();
        const hubPayload = scope === 'hub' || scope === 'all'
            ? buildCapabilityManifestPayload(projectRoot)
            : null;
        const spokeManifests = scope === 'spoke' || scope === 'all'
            ? walkSpokeSkills(spoke)
            : [];

        const hubEntries = (hubPayload?.capabilities ?? []).map((c) => ({
            ...c,
            source: 'hub' as const,
        }));
        const spokeEntries = spokeManifests.map(adaptSpokeManifestToCapability);
        const capabilities = [...hubEntries, ...spokeEntries].sort((a, b) =>
            String(a.id).localeCompare(String(b.id))
        );

        return textResponse({ scope, spoke: spoke ?? null, capabilities });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

async function handleSkillInfo({ id, spoke }: { id: string; spoke?: string }) {
    try {
        const projectRoot = registry.getRoot();

        if (id.includes(':')) {
            // Spoke skill: namespaced as <slug>:<bare_id>.
            const sep = id.indexOf(':');
            const parsedSlug = id.slice(0, sep);
            const bareId = id.slice(sep + 1);
            const slug = spoke ?? parsedSlug;

            const candidates = walkSpokeSkills(slug, { includeQuarantined: true });
            const found = candidates.find((s) => s.bare_id === bareId);
            if (found === undefined) {
                return textResponse({ error: `spoke skill not found: ${id}` }, true);
            }
            return textResponse({
                capability: adaptSpokeManifestToCapability(found),
                documentation: {
                    kind: 'markdown',
                    path: found.authority_path,
                    readable: true,
                    content: found.documentation,
                },
                invocation: {
                    agent_hint: 'any-host-agent',
                    working_dir: found.spoke_root,
                    command: null,
                    logic_protocol_anchor: extractLogicProtocolAnchor(found.documentation),
                },
            });
        }

        // Hub skill: delegate to the existing capability discovery path.
        const payload = buildCapabilityInfoPayload(projectRoot, id);
        return textResponse(payload);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

async function handleSpokeJournal({ spoke }: { spoke: string }) {
    try {
        const report = walkSpokeJournal(spoke);
        return textResponse(report);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

server.tool(
    'cstar_manifest',
    'Capability discovery. Returns the kernel registry merged with spoke-local skill manifests, namespaced as <slug>:<id>. Read-only; announce-only per Host-Native First (BEAD-CSTAR-SPOKE-DISCOVERY-001).',
    {
        scope: z.enum(['hub', 'spoke', 'all']).optional().default('hub').describe('Capability source: hub (kernel registry), spoke (spoke-local), or all (merged)'),
        spoke: z.string().optional().describe('When set with scope=spoke or scope=all, narrows spoke walk to this slug'),
    },
    instrumentTool('cstar_manifest', handleManifest)
);

server.tool(
    'cstar_skill_info',
    'Per-capability contract view. Resolves <slug>:<id> to the spoke walker (returning SKILL.md content + invocation metadata for host-agent execution), and bare ids to the kernel registry.',
    {
        id: z.string().describe('Capability id; bare for hub, <slug>:<bare> for spoke'),
        spoke: z.string().optional().describe('Optional override of the spoke slug parsed from id'),
    },
    instrumentTool('cstar_skill_info', handleSkillInfo)
);

server.tool(
    'cstar_spoke_journal',
    'Four-file journal state for a registered spoke: memory.md, tasks.md, wireframe.md, DEV_JOURNAL.md. Returns presence, mtime, sha256, size_bytes, summary. Memory-file drift between .agent/ and .agents/ is flagged.',
    {
        spoke: z.string().describe('Slug of a registered spoke'),
    },
    instrumentTool('cstar_spoke_journal', handleSpokeJournal)
);

// ─────────────────────────────────────────────────────────────────
// Phase-1/2 promotion: deterministic kernel surfaces absorbed from
// the legacy `cstar.ts` Commander CLI plus net-new MCP-only tools.
// Each handler routes to deterministic kernel modules — no LLM
// inference per Host-Agent Run First mandate.
// ─────────────────────────────────────────────────────────────────

// Shared hardening helpers for the Phase-1/2 surface.
const MCP_ERROR_MESSAGE_MAX = 512;
const MCP_PROPOSAL_MAX_BYTES = 512 * 1024;
const MCP_SAFE_PROPOSAL_ID = /^[a-zA-Z0-9._-]+$/;

function normalizeErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.replace(/\s+/g, ' ').slice(0, MCP_ERROR_MESSAGE_MAX);
}

function errorResponse(error: unknown): McpTextResponse {
    return textResponse({ error: normalizeErrorMessage(error) }, true);
}

function isPathInside(child: string, parent: string): boolean {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) {
        return true;
    }
    const rel = path.relative(resolvedParent, resolvedChild);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// cstar_status — deterministic vitals snapshot from StateRegistry.
export async function handleStatus(): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const snapshot = StateRegistry.get();
        const fw = snapshot.framework;

        let hallReachable = false;
        try {
            const db = database.getDb(root);
            hallReachable = db !== null;
        } catch {
            hallReachable = false;
        }

        const uptimeSeconds = fw.last_awakening > 0
            ? Math.max(0, Math.floor((Date.now() - fw.last_awakening) / 1000))
            : null;

        return textResponse({
            framework: {
                status: fw.status,
                active_persona: fw.active_persona,
                last_awakening: fw.last_awakening,
                uptime_seconds: uptimeSeconds,
                active_task: fw.active_task,
                mission_id: fw.mission_id,
                bead_id: fw.bead_id,
                gungnir_score: fw.gungnir_score,
                intent_integrity: fw.intent_integrity,
            },
            workspace: root,
            hall_reachable: hallReachable,
            managed_spokes: snapshot.managed_spokes.map((s) => ({
                slug: s.slug,
                mount_status: s.mount_status,
                trust_level: s.trust_level,
                write_policy: s.write_policy,
                root_path: s.root_path,
            })),
            agents: Object.values(snapshot.agents).map((a) => ({
                id: a.id,
                name: a.name,
                status: a.status,
                last_seen: a.last_seen || null,
            })),
        });
    } catch (error) {
        return errorResponse(error);
    }
}

server.tool(
    'cstar_status',
    'Deterministic kernel state snapshot: framework status, active persona, gungnir score, managed spokes, agent presence. Read-only.',
    {},
    instrumentTool('cstar_status', handleStatus),
);

// cstar_evolve — read-only deterministic ops over proposals and SPRT ledger.
// Proposal generation and adversarial critique are LLM-driven and stay
// host-native; this surface only exposes file/ledger inspection.
type EvolveAction = 'list_proposals' | 'get_proposal' | 'list_sprt_history';

export async function handleEvolve({
    action,
    proposal_id,
    limit,
}: {
    action: EvolveAction;
    proposal_id?: string;
    limit?: number;
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const proposalDir = path.join(root, '.agents', 'proposals', 'evolve');

        if (action === 'list_proposals') {
            if (!fs.existsSync(proposalDir)) {
                return textResponse({ status: 'ok', count: 0, proposals: [] });
            }
            const all = fs
                .readdirSync(proposalDir)
                .filter((f) => f.endsWith('.json'))
                .map((file) => {
                    const full = path.join(proposalDir, file);
                    let mtime = 0;
                    try {
                        mtime = fs.statSync(full).mtimeMs;
                    } catch {
                        // Unstatable — fall through with mtime 0.
                    }
                    return { file, full, mtime };
                })
                .sort((a, b) => b.mtime - a.mtime); // newest first

            const cap = Math.min(limit ?? 20, 50);
            const proposals = all.slice(0, cap).map(({ file, full }) => {
                let summary = '';
                let bead_id: string | undefined;
                let created_at: number | undefined;
                try {
                    const stat = fs.statSync(full);
                    if (stat.size <= MCP_PROPOSAL_MAX_BYTES) {
                        const raw = JSON.parse(fs.readFileSync(full, 'utf-8')) as Record<string, unknown>;
                        summary = String(raw.summary ?? raw.rationale ?? '').slice(0, 240);
                        bead_id = typeof raw.bead_id === 'string' ? raw.bead_id : undefined;
                        created_at = typeof raw.created_at === 'number' ? raw.created_at : undefined;
                    } else {
                        summary = `[oversized proposal — ${stat.size} bytes]`;
                    }
                } catch {
                    // Malformed / unreadable — file-only entry.
                }
                return {
                    proposal_id: file.replace(/\.json$/, ''),
                    file,
                    summary,
                    bead_id,
                    created_at,
                };
            });
            return textResponse({ status: 'ok', count: all.length, proposals });
        }

        if (action === 'get_proposal') {
            if (!proposal_id) {
                return textResponse({ error: 'get_proposal requires proposal_id' }, true);
            }
            const bare = proposal_id.replace(/\.json$/, '');
            if (!MCP_SAFE_PROPOSAL_ID.test(bare)) {
                return textResponse(
                    { error: 'proposal_id must match [a-zA-Z0-9._-]+ (no path components)' },
                    true,
                );
            }
            const full = path.join(proposalDir, `${bare}.json`);
            if (!isPathInside(full, proposalDir)) {
                return textResponse({ error: 'proposal_id resolves outside the proposals directory' }, true);
            }
            if (!fs.existsSync(full)) {
                return textResponse({ error: `proposal not found: ${bare}` }, true);
            }
            const stat = fs.statSync(full);
            if (stat.size > MCP_PROPOSAL_MAX_BYTES) {
                return textResponse(
                    { error: `proposal ${bare} exceeds size cap (${stat.size} > ${MCP_PROPOSAL_MAX_BYTES} bytes)` },
                    true,
                );
            }
            const raw = JSON.parse(fs.readFileSync(full, 'utf-8')) as Record<string, unknown>;
            return textResponse({
                status: 'ok',
                proposal_id: bare,
                size_bytes: stat.size,
                proposal: raw,
            });
        }

        if (action === 'list_sprt_history') {
            const ledgerPath = path.join(root, '.agents', 'sprt_ledger.json');
            if (!fs.existsSync(ledgerPath)) {
                return textResponse({ status: 'ok', count: 0, history: [] });
            }
            const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as { history?: unknown[] };
            const history = Array.isArray(raw.history) ? raw.history : [];
            const cap = Math.min(limit ?? 20, 100);
            return textResponse({
                status: 'ok',
                count: history.length,
                history: history.slice(-cap),
            });
        }

        return textResponse({ error: `invalid evolve action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}

server.tool(
    'cstar_evolve',
    'Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history. Proposal generation and adversarial critique are LLM-driven and stay host-native (not exposed here).',
    {
        action: z
            .enum(['list_proposals', 'get_proposal', 'list_sprt_history'])
            .describe('Read-only operation against .agents/proposals/evolve/ or .agents/sprt_ledger.json'),
        proposal_id: z.string().optional().describe('Required for get_proposal; file stem in .agents/proposals/evolve/'),
        limit: z.number().min(1).max(100).optional().describe('Cap on returned proposals (default 20) or SPRT history entries (default 20)'),
    },
    instrumentTool('cstar_evolve', handleEvolve),
);

// cstar_spoke — link / unlink / list / inspect for mounted estate spokes.
// Completes the spoke surface already partly MCP'd via cstar_spoke_journal
// and cstar_spoke_bead_import.
function normalizeSpokeMcpSlug(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export async function handleSpoke({
    action,
    slug,
    root_path,
    kind,
    remote_url,
    branch,
    trust_level,
    write_policy,
    accept_beads,
}: {
    action: 'list' | 'link' | 'unlink' | 'inspect';
    slug?: string;
    root_path?: string;
    kind?: 'local' | 'git' | 'mirror' | 'archive';
    remote_url?: string;
    branch?: string;
    trust_level?: 'trusted' | 'observe' | 'quarantined';
    write_policy?: 'read_write' | 'read_only';
    accept_beads?: boolean;
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        if (action === 'list') {
            const mounted = database.listHallMountedSpokes(root);
            return textResponse({
                status: 'ok',
                count: mounted.length,
                spokes: mounted.map((s) => ({
                    slug: s.slug,
                    spoke_id: s.spoke_id,
                    kind: s.kind,
                    root_path: s.root_path,
                    mount_status: s.mount_status,
                    trust_level: s.trust_level,
                    write_policy: s.write_policy,
                    projection_status: s.projection_status,
                })),
            });
        }
        if (action === 'inspect') {
            if (!slug) {
                return textResponse({ error: 'inspect requires slug' }, true);
            }
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) {
                return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            }
            const found = database.getHallMountedSpoke(normalized, root);
            if (!found) {
                return textResponse({ error: `spoke not registered: ${normalized}` }, true);
            }
            return textResponse({ status: 'ok', spoke: found });
        }
        if (action === 'unlink') {
            if (!slug) {
                return textResponse({ error: 'unlink requires slug' }, true);
            }
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) {
                return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            }
            const removed = database.removeHallMountedSpoke(normalized, root);
            if (!removed) {
                return textResponse({ error: `spoke not registered: ${normalized}` }, true);
            }
            return textResponse({ status: 'unlinked', slug: normalized });
        }
        if (action === 'link') {
            if (!slug) {
                return textResponse({ error: 'link requires slug' }, true);
            }
            if (!root_path) {
                return textResponse({ error: 'link requires root_path' }, true);
            }
            const absolutePath = path.resolve(root_path);
            if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
                return textResponse(
                    { error: `root_path does not exist or is not a directory: ${absolutePath}` },
                    true,
                );
            }
            const repo = database.getHallRepository(root);
            if (!repo) {
                return textResponse(
                    { error: 'failed to resolve Hall repository before linking' },
                    true,
                );
            }
            const normalizedSlug = normalizeSpokeMcpSlug(slug);
            if (normalizedSlug.length === 0 || normalizedSlug.length > 64) {
                return textResponse(
                    { error: `slug must normalize to 1..64 chars (got "${normalizedSlug}")` },
                    true,
                );
            }
            const acceptBeads = accept_beads === true;
            const resolvedTrust = (acceptBeads ? 'trusted' : trust_level ?? 'trusted') as
                | 'trusted'
                | 'observe'
                | 'quarantined';
            const resolvedWritePolicy = (acceptBeads ? 'read_write' : write_policy ?? 'read_only') as
                | 'read_write'
                | 'read_only';
            const now = Date.now();
            const existing = database.getHallMountedSpoke(normalizedSlug, root);
            database.saveHallMountedSpoke({
                spoke_id: `spoke:${normalizedSlug}`,
                repo_id: repo.repo_id,
                slug: normalizedSlug,
                kind: kind ?? existing?.kind ?? 'local',
                root_path: absolutePath.replace(/\\/g, '/'),
                remote_url: remote_url ?? existing?.remote_url,
                default_branch: branch ?? existing?.default_branch,
                mount_status: 'active',
                trust_level: resolvedTrust,
                write_policy: resolvedWritePolicy,
                projection_status: existing?.projection_status ?? 'missing',
                created_at: existing?.created_at ?? now,
                updated_at: now,
                metadata: {
                    ...(existing?.metadata ?? {}),
                    source: 'cstar_spoke_mcp',
                    accept_beads: acceptBeads,
                },
            });
            return textResponse({
                status: existing ? 'relinked' : 'linked',
                slug: normalizedSlug,
                root_path: absolutePath.replace(/\\/g, '/'),
                trust_level: resolvedTrust,
                write_policy: resolvedWritePolicy,
                created_at: existing?.created_at ?? now,
            });
        }
        return textResponse({ error: `invalid spoke action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}

server.tool(
    'cstar_spoke',
    'Mounted-spoke lifecycle: list / link / unlink / inspect. Completes the spoke surface alongside cstar_spoke_journal and cstar_spoke_bead_import. Deterministic Hall mutation; no LLM.',
    {
        action: z.enum(['list', 'link', 'unlink', 'inspect']).describe('Lifecycle operation'),
        slug: z.string().optional().describe('Required for link, unlink, inspect'),
        root_path: z.string().optional().describe('Required for link; absolute or relative path to spoke directory'),
        kind: z.enum(['local', 'git', 'mirror', 'archive']).optional().describe('Spoke kind (default local)'),
        remote_url: z.string().optional().describe('Optional remote URL for git/mirror kinds'),
        branch: z.string().optional().describe('Default branch (link only)'),
        trust_level: z.enum(['trusted', 'observe', 'quarantined']).optional().describe('Trust policy (link only; default trusted)'),
        write_policy: z.enum(['read_write', 'read_only']).optional().describe('Whether spoke may submit beads (link only; default read_only)'),
        accept_beads: z.boolean().optional().describe('Shortcut: forces trust=trusted and write_policy=read_write (link only)'),
    },
    instrumentTool('cstar_spoke', handleSpoke),
);

// cstar_intent_route — expose the intent grammar dispatcher.
// Deterministic tokenization + table lookup against
// `.agents/skill_registry.json` intent_grammar (falls back to in-code
// INTENT_CATEGORIES when the registry is unreadable).
const MCP_INTENT_PROMPT_MAX = 4096;

export async function handleIntentRoute({ prompt }: { prompt: string }): Promise<McpTextResponse> {
    try {
        if (typeof prompt !== 'string' || prompt.trim().length === 0) {
            return textResponse({ error: 'prompt must be a non-empty string' }, true);
        }
        if (prompt.length > MCP_INTENT_PROMPT_MAX) {
            return textResponse(
                { error: `prompt exceeds ${MCP_INTENT_PROMPT_MAX} chars (got ${prompt.length})` },
                true,
            );
        }
        const root = registry.getRoot();
        const manifest = loadRegistryManifest(root);
        const grammar = getRegistryIntentCategories(manifest);
        const tokens = tokenize(prompt);
        const match = resolveIntentCategoryFromGrammar(tokens, grammar);
        if (!match) {
            return textResponse({
                status: 'unmatched',
                tokens: tokens.slice(0, 32),
                available_categories: Object.keys(grammar),
            });
        }
        return textResponse({
            status: 'matched',
            intent_category: match.category,
            default_path: match.default_path,
            tier: match.tier,
            matched_trigger: match.matched_trigger,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

server.tool(
    'cstar_intent_route',
    'Resolve a prompt against the kernel intent grammar (.agents/skill_registry.json#intent_grammar). Returns the matched category, default_path, tier, and triggering token. Deterministic; no LLM inference.',
    {
        prompt: z.string().describe('Prompt or mission text to tokenize and match against the intent grammar'),
    },
    instrumentTool('cstar_intent_route', handleIntentRoute),
);

// cstar_warden — on-demand Sentinel Warden invocations.
// Python wardens are deterministic (AST/text scans). The handler shells
// out to a small Python driver (scripts/run_warden.py) that imports the
// named warden, runs `.scan()`, and emits JSON. No LLM in the loop.
const KNOWN_WARDENS = [
    'norn',
    'valkyrie',
    'freya',
    'mimir',
    'ghost',
    'security',
    'huginn',
    'taste',
    'edda',
    'scour',
    'runecaster',
    'shadow_forge',
] as const;

function resolveWardenPython(projectRoot: string): string {
    const windows = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
    const unix = path.join(projectRoot, '.venv', 'bin', 'python');
    if (process.platform === 'win32' && fs.existsSync(windows)) return windows;
    if (process.platform !== 'win32' && fs.existsSync(unix)) return unix;
    return process.platform === 'win32' ? 'python' : 'python3';
}

const MCP_WARDEN_STDOUT_MAX = 256 * 1024;
const MCP_WARDEN_TIMEOUT_MS = 60_000;

export async function handleWarden({
    action,
    warden,
    target,
}: {
    action: 'list' | 'bounties' | 'scan';
    warden?: string;
    target?: string;
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        if (action === 'list') {
            return textResponse({ status: 'ok', wardens: [...KNOWN_WARDENS] });
        }
        if (action === 'bounties') {
            const ledgerPath = path.join(root, '.agents', 'tech_debt_ledger.json');
            if (!fs.existsSync(ledgerPath)) {
                return textResponse({ status: 'ok', count: 0, top_targets: [] });
            }
            const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as {
                top_targets?: unknown[];
                timestamp?: string;
            };
            const top = Array.isArray(raw.top_targets) ? raw.top_targets : [];
            return textResponse({
                status: 'ok',
                timestamp: raw.timestamp,
                count: top.length,
                top_targets: top,
            });
        }
        if (action === 'scan') {
            if (!warden) {
                return textResponse({ error: 'scan requires warden name (use list to see available)' }, true);
            }
            const normalized = warden.trim().toLowerCase();
            if (!(KNOWN_WARDENS as readonly string[]).includes(normalized)) {
                return textResponse(
                    { error: `unknown warden: ${warden} (use list to see available)` },
                    true,
                );
            }
            const driver = path.join(root, 'scripts', 'run_warden.py');
            if (!fs.existsSync(driver)) {
                return textResponse({ error: 'warden driver missing: scripts/run_warden.py' }, true);
            }

            // Resolve and validate optional target against the project root.
            // A `target` directory becomes the warden's effective root; a file
            // is surfaced as advisory metadata. Either way it must stay inside
            // the project root to prevent the warden from walking the host.
            let resolvedTarget: string | undefined;
            let targetIsDir = false;
            if (target) {
                const abs = path.resolve(root, target);
                if (!isPathInside(abs, root) && abs !== path.resolve(root)) {
                    return textResponse(
                        { error: 'target must resolve to a path inside the project root' },
                        true,
                    );
                }
                if (!fs.existsSync(abs)) {
                    return textResponse({ error: `target does not exist: ${target}` }, true);
                }
                resolvedTarget = abs;
                targetIsDir = fs.statSync(abs).isDirectory();
            }

            const py = resolveWardenPython(root);
            const args = [driver, '--warden', normalized];
            if (resolvedTarget) {
                args.push('--target', resolvedTarget);
                if (targetIsDir) {
                    args.push('--root', resolvedTarget);
                }
            }

            let stdout: string;
            try {
                const result = await execa(py, args, {
                    cwd: root,
                    env: { ...process.env, PYTHONPATH: root },
                    timeout: MCP_WARDEN_TIMEOUT_MS,
                    maxBuffer: MCP_WARDEN_STDOUT_MAX,
                });
                stdout = result.stdout;
            } catch (execErr: any) {
                if (execErr?.timedOut) {
                    return textResponse(
                        { error: `warden '${normalized}' timed out after ${MCP_WARDEN_TIMEOUT_MS}ms` },
                        true,
                    );
                }
                if (execErr?.shortMessage?.includes('maxBuffer')) {
                    return textResponse(
                        { error: `warden '${normalized}' exceeded stdout cap (${MCP_WARDEN_STDOUT_MAX} bytes)` },
                        true,
                    );
                }
                return errorResponse(execErr);
            }

            try {
                const parsed = JSON.parse(stdout);
                return textResponse({
                    status: 'ok',
                    warden: normalized,
                    root_used: targetIsDir ? resolvedTarget : root,
                    ...parsed,
                });
            } catch {
                return textResponse({
                    status: 'ok',
                    warden: normalized,
                    root_used: targetIsDir ? resolvedTarget : root,
                    raw_output: stdout.slice(0, 1024),
                });
            }
        }
        return textResponse({ error: `invalid warden action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}

server.tool(
    'cstar_warden',
    'On-demand Sentinel Warden invocation. action=list returns the available warden names; action=bounties returns the cached PennyOne tech-debt ledger; action=scan invokes a named Python warden against an optional target path. Wardens are deterministic AST/text scanners — no LLM inference.',
    {
        action: z.enum(['list', 'bounties', 'scan']).describe('list / bounties (cached ledger) / scan (live Python warden)'),
        warden: z.string().optional().describe('Required for scan; one of: norn, valkyrie, freya, mimir, ghost, security, huginn, taste, edda, scour, runecaster, shadow_forge'),
        target: z.string().optional().describe('Optional path inside the project root. Directory targets become the warden\'s effective root (constraining the scan); file targets are surfaced as advisory metadata. Paths outside the project root are rejected.'),
    },
    instrumentTool('cstar_warden', handleWarden),
);


async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stdin.resume();
    const keepAlive = setInterval(() => {
        // Keep stdio MCP server alive while the host owns the pipe.
    }, 60_000);
    process.stdin.once('end', () => {
        clearInterval(keepAlive);
        process.exit(0);
    });
    process.stdin.once('close', () => {
        clearInterval(keepAlive);
        process.exit(0);
    });
    process.once('SIGTERM', () => {
        clearInterval(keepAlive);
        process.exit(0);
    });
}

function isDirectKernelMcpLaunch(): boolean {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return entry === fileURLToPath(import.meta.url);
}

if (process.env.CSTAR_KERNEL_MCP === '1' || isDirectKernelMcpLaunch()) {
    main().catch((error) => {
        console.error('Fatal error in CStar Kernel MCP:', error);
        process.exit(1);
    });
}
