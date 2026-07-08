import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import { rate } from './usage.js';

const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

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

function readRecentProjectJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const filePath = path.join(PROJECT_ROOT, relativePath);
        if (!fs.existsSync(filePath)) return [];
        const now = Date.now();
        return fs.readFileSync(filePath, 'utf-8')
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

export async function runTokenPathAdvisor(input: TokenPathRoutingInput): Promise<TokenPathRecommendation | null> {
    try {
        const sidecarRoot = resolveAuguryTokenPathRoot();
        const entryPath = [
            path.join(sidecarRoot, 'src', 'core', 'advisor_entry.ts'),
            path.join(sidecarRoot, 'src', 'core', 'advisor_entry.js'),
        ].find((candidate) => fs.existsSync(candidate));
        if (!entryPath) return null;
        const entryUrl = pathToFileURL(entryPath).href;
        const mod = await import(entryUrl) as {
            getTokenPathAdviceForRouting?: (i: TokenPathRoutingInput) => TokenPathRecommendation;
        };
        if (typeof mod.getTokenPathAdviceForRouting !== 'function') return null;
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

export function appendTokenPathAdvice(
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

export function findRecentTokenPathAdvice(episodeId?: string, beadId?: string): TokenPathAdviceRecord | null {
    const advice = readRecentProjectJsonl<TokenPathAdviceRecord>(TOKEN_PATH_ADVICE_RELATIVE_PATH, MCP_USAGE_LOOKBACK_MS);
    const sorted = [...advice].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    if (episodeId) {
        const byEpisode = sorted.find((record) => record.episode_id === episodeId);
        if (byEpisode) return byEpisode;
    }
    if (beadId) {
        const byBead = sorted.find((record) => record.bead_id === beadId);
        if (byBead) return byBead;
    }
    return null;
}

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

export function appendTokenPathObservation(
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
