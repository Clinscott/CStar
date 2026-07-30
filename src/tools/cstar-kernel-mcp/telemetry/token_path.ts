import path from 'node:path';
import { PROJECT_ROOT, readBoundedUtf8FileInside } from '../contracts/runtime.js';
import { rate } from './usage.js';

const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATH_TELEMETRY_MAX_BYTES = 8 * 1024 * 1024;
const TOKEN_PATH_QUARANTINE_REASON = 'token_path_independent_promotion_required';

export interface TokenPathRoutingInput {
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

export interface TokenPathRecommendation {
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

export interface TokenPathObservationPayload {
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

export interface TokenPathAdviceRecord {
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

export interface TokenPathAdviceLookup {
    episodeId?: string;
    beadId?: string;
    targetPaths?: string[];
}

export interface TokenPathQuarantineStatus {
    schema_version: '1.0.0';
    status: 'quarantined';
    actionable: false;
    advisor_available: false;
    advice_attached: false;
    advice_writes_enabled: false;
    observation_writes_enabled: false;
    external_root_consulted: false;
    reason: 'token_path_independent_promotion_required';
}

const TOKEN_PATH_OBSERVATIONS_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-observations.jsonl',
);
const TOKEN_PATH_ADVICE_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-advice.jsonl',
);

/**
 * Return the only TokenPath state that Augury may attach while quarantine is
 * active. This object is static by design: it does not inspect an environment
 * override, probe an external repository, load a module, or choose a policy.
 */
export function buildTokenPathQuarantineStatus(): TokenPathQuarantineStatus {
    return {
        schema_version: '1.0.0',
        status: 'quarantined',
        actionable: false,
        advisor_available: false,
        advice_attached: false,
        advice_writes_enabled: false,
        observation_writes_enabled: false,
        external_root_consulted: false,
        reason: TOKEN_PATH_QUARANTINE_REASON,
    };
}

function readRecentProjectJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const filePath = path.join(PROJECT_ROOT, relativePath);
        const bounded = readBoundedUtf8FileInside(
            PROJECT_ROOT,
            filePath,
            TOKEN_PATH_TELEMETRY_MAX_BYTES,
        );
        const now = Date.now();
        return bounded.content
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .flatMap((line) => {
                try {
                    const event = JSON.parse(line) as T & { ts?: unknown; occurred_at?: unknown };
                    const timestamp = typeof event.ts === 'string'
                        ? event.ts
                        : typeof event.occurred_at === 'string' ? event.occurred_at : undefined;
                    if (!timestamp) return [];
                    const ts = Date.parse(timestamp);
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

/** Compatibility tombstone. TokenPath cannot advise until promoted. */
export async function runTokenPathAdvisor(
    _input: TokenPathRoutingInput,
): Promise<TokenPathRecommendation | null> {
    return null;
}

/** Compatibility tombstone. Quarantine never returns an episode receipt. */
export function appendTokenPathAdvice(
    _input: TokenPathRoutingInput,
    _recommendation: TokenPathRecommendation,
    _beadId?: string,
): string | null {
    return null;
}

function normalizeTokenPathTarget(candidate: string): string | null {
    const value = candidate.trim();
    if (!value) return null;
    const slashNormalized = value.replace(/\\/g, '/');
    const resolved = path.isAbsolute(slashNormalized)
        ? slashNormalized
        : path.resolve(PROJECT_ROOT, slashNormalized);
    return resolved.replace(/\/+$/, '');
}

function tokenTargetsOverlap(left: string, right: string): boolean {
    const normalizedLeft = normalizeTokenPathTarget(left);
    const normalizedRight = normalizeTokenPathTarget(right);
    if (!normalizedLeft || !normalizedRight) return false;
    if (normalizedLeft === normalizedRight) return true;
    const projectRoot = normalizeTokenPathTarget(PROJECT_ROOT);
    if (normalizedLeft === projectRoot || normalizedRight === projectRoot) return false;
    return normalizedLeft.startsWith(`${normalizedRight}/`)
        || normalizedRight.startsWith(`${normalizedLeft}/`);
}

function recordTargetsMatch(record: TokenPathAdviceRecord, targetPaths?: string[]): boolean {
    if (!targetPaths?.length || !record.target_paths?.length) return false;
    return targetPaths.some((targetPath) => record.target_paths?.some(
        (recordPath) => tokenTargetsOverlap(targetPath, recordPath),
    ));
}

/** Read-only access to historical, project-local compatibility telemetry. */
export function findRecentTokenPathAdvice(
    episodeOrLookup?: string | TokenPathAdviceLookup,
    beadId?: string,
): TokenPathAdviceRecord | null {
    const lookup: TokenPathAdviceLookup = typeof episodeOrLookup === 'object'
        ? episodeOrLookup
        : { episodeId: episodeOrLookup, beadId };
    const advice = readRecentProjectJsonl<TokenPathAdviceRecord>(
        TOKEN_PATH_ADVICE_RELATIVE_PATH,
        MCP_USAGE_LOOKBACK_MS,
    );
    const sorted = [...advice].sort(
        (a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at),
    );
    if (lookup.episodeId) {
        const byEpisode = sorted.find((record) => record.episode_id === lookup.episodeId);
        if (byEpisode) return byEpisode;
    }
    if (lookup.beadId) {
        const byBead = sorted.find((record) => record.bead_id === lookup.beadId);
        if (byBead) return byBead;
    }
    return sorted.find((record) => recordTargetsMatch(record, lookup.targetPaths)) ?? null;
}

/** Pure compatibility projection. It does not persist an observation. */
export function buildObservationFromAdvice(
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

export function summarizeRecentTokenPathIntegration(): Record<string, unknown> {
    const advice = readRecentProjectJsonl<TokenPathAdviceRecord>(
        TOKEN_PATH_ADVICE_RELATIVE_PATH,
        MCP_USAGE_LOOKBACK_MS,
    );
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
            .map((record) => typeof record.token_path_episode_id === 'string'
                ? record.token_path_episode_id
                : undefined)
            .filter((episodeId): episodeId is string => !!episodeId),
    );
    const successes = observations.filter((record) => record.actual_success === true).length;
    return {
        ...buildTokenPathQuarantineStatus(),
        advice_count_24h: advice.length,
        observation_count_24h: observations.length,
        advice_observation_rate: rate(observedEpisodes.size, advice.length),
        observed_success_rate: rate(successes, observations.length),
        last_advice_at: adviceTimes.at(-1) ?? null,
        last_observation_at: observationTimes.at(-1) ?? null,
    };
}

/** Compatibility tombstone. Quarantine never returns an observation receipt. */
export function appendTokenPathObservation(
    _beadId: string,
    _payload: TokenPathObservationPayload,
    _verdict?: string,
): string | null {
    return null;
}
