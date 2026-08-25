import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, logBootstrapError, readBoundedUtf8FileInside } from '../contracts/runtime.js';

const MCP_USAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const TOKEN_PATH_OBSERVATION_ACCEPTANCE_ENABLED = false;

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
    status: 'quarantined';
    mode: 'shadow-disabled';
    reason: string;
    shadow_only?: boolean;
    actionable?: boolean;
}

export interface TokenPathObservationPayload {
    token_path_episode_id?: string;
    scenario_class: string;
    selected_policy: string;
    advised_mode: string;
    observed_raw_tokens_episode: number;
    observed_billable_tokens_episode: number;
    rounds: number;
    verification_result: string;
    terminal_outcome: string;
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

export function isMeasuredTokenPathObservation(value: unknown): value is TokenPathObservationPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    const nonempty = (field: string): boolean => (
        typeof candidate[field] === 'string' && (candidate[field] as string).trim().length > 0
    );
    const nonnegativeInteger = (field: string): boolean => (
        typeof candidate[field] === 'number'
        && Number.isSafeInteger(candidate[field])
        && (candidate[field] as number) >= 0
    );
    const terminalOutcome = candidate.terminal_outcome;
    const verificationResult = candidate.verification_result;
    const allowedOutcomes = new Set([
        'verified-success',
        'completed-unverified',
        'needs-followup',
        'deferred',
        'failed',
        'unknown',
    ]);
    const allowedVerification = new Set(['pass', 'fail', 'not-run', 'unknown']);
    if (!allowedOutcomes.has(terminalOutcome as string)
        || !allowedVerification.has(verificationResult as string)) return false;
    const verificationPassed = verificationResult === 'pass';
    if ((terminalOutcome === 'verified-success') !== verificationPassed) return false;
    if (Object.keys(candidate).some((key) => key.startsWith('actual_'))) return false;
    return nonempty('token_path_episode_id')
        && nonempty('scenario_class')
        && nonempty('selected_policy')
        && nonempty('advised_mode')
        && nonempty('terminal_outcome')
        && nonempty('verification_result')
        && nonnegativeInteger('observed_raw_tokens_episode')
        && nonnegativeInteger('observed_billable_tokens_episode')
        && nonnegativeInteger('rounds')
        && (candidate.rounds as number) > 0;
}

const TOKEN_PATH_OBSERVATIONS_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-observations.jsonl',
);
const TOKEN_PATH_ADVICE_RELATIVE_PATH = path.join(
    '.agents', 'state', 'augury-token-path-mcp-advice.jsonl',
);

function resolveAuguryTokenPathRoot(): string {
    const envRoot = process.env.AUGURY_TOKEN_PATH_ROOT;
    if (envRoot && envRoot.trim().length > 0) {
        return path.resolve(envRoot);
    }
    return path.resolve(PROJECT_ROOT, '..', 'AuguryTokenPath');
}

function resolveTokenPathStateRoot(): string {
    const configured = process.env.CSTAR_TOKEN_PATH_STATE_ROOT?.trim();
    return configured ? path.resolve(configured) : PROJECT_ROOT;
}

function readRecentProjectJsonl<T>(relativePath: string, lookbackMs: number): T[] {
    try {
        const filePath = path.join(resolveTokenPathStateRoot(), relativePath);
        if (!fs.existsSync(filePath)) return [];
        const now = Date.now();
        return readBoundedUtf8FileInside(resolveTokenPathStateRoot(), filePath, 4 * 1024 * 1024).content
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
    void input;
    return {
        advisor: 'augury-token-path',
        schema_version: 3,
        status: 'quarantined',
        mode: 'shadow-disabled',
        reason: 'No promoted causal episode pipeline exists; historical ledgers are non-authoritative.',
        shadow_only: true,
        actionable: false,
    };
}

function deriveObservationOutcome(payload: TokenPathObservationPayload): {
    actual_success: boolean;
    actual_completion: boolean;
    actual_verification_passed: boolean;
    actual_requires_followup: boolean;
    actual_deferred: boolean;
} {
    const terminal = payload.terminal_outcome;
    const explicitVerificationPassed = payload.verification_result?.trim().toLowerCase() === 'pass';
    const actualSuccess = terminal === 'verified-success';
    const actualCompletion = terminal === 'verified-success' || terminal === 'completed-unverified';
    const actualVerificationPassed = terminal === 'verified-success' || explicitVerificationPassed;
    const actualRequiresFollowup = terminal === 'needs-followup';
    const actualDeferred = terminal === 'deferred';

    return {
        actual_success: actualSuccess,
        actual_completion: actualCompletion,
        actual_verification_passed: actualVerificationPassed,
        actual_requires_followup: actualRequiresFollowup,
        actual_deferred: actualDeferred,
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
    const measuredObservations = observations.filter((record) => record.schema_version === '2.0.0');
    return {
        advisor_available: false,
        legacy_sidecar_present: fs.existsSync(path.join(resolveAuguryTokenPathRoot(), 'src', 'core', 'advisor_entry.ts'))
            || fs.existsSync(path.join(resolveAuguryTokenPathRoot(), 'src', 'core', 'advisor_entry.js')),
        advisor_mode: 'shadow-disabled',
        advisor_actionable: false,
        causal_calibration_ready: false,
        historical_ledger_trusted: false,
        historical_advice_count_24h: advice.length,
        historical_observation_count_24h: observations.length,
        historical_measured_observation_count_24h: measuredObservations.length,
        advice_count_24h: 0,
        observation_count_24h: 0,
        advice_observation_rate: null,
        observed_success_rate: null,
        last_advice_at: null,
        last_observation_at: null,
        historical_last_advice_at: adviceTimes.length > 0 ? adviceTimes[adviceTimes.length - 1] : null,
        historical_last_observation_at: observationTimes.length > 0 ? observationTimes[observationTimes.length - 1] : null,
    };
}

export function appendTokenPathObservation(
    beadId: string,
    payload: TokenPathObservationPayload,
): string | null {
    // TokenPath emits no promoted episode ids while shadow-disabled. Accepting
    // caller-invented ids would turn uncorrelated assertions into calibration
    // evidence, so writes remain quarantined with the advisor.
    if (!TOKEN_PATH_OBSERVATION_ACCEPTANCE_ENABLED) return null;
    if (!isMeasuredTokenPathObservation(payload)) return null;
    const observationId = `mcp-obs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const outcome = deriveObservationOutcome(payload);
    const record = {
        schema_version: '2.0.0',
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
        appendRecord(resolveTokenPathStateRoot());
        return observationId;
    } catch (error) {
        logBootstrapError(error);
        return null;
    }
}
