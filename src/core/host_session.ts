export type HostProvider = 'gemini' | 'codex' | 'claude' | 'droid';
export type HostAttemptEvidence = Readonly<{
    requested_provider: HostProvider | null;
    actual_provider: HostProvider | null;
    requested_surface: string;
    actual_surface: string | null;
    execution_dispatched: boolean;
}>;
export type AugurySteeringMode = 'full' | 'lite';
export type HostSupportStatus =
    | 'supported'
    | 'native-session'
    | 'exec-bridge'
    | 'policy-only'
    | 'unsupported'
    | 'unknown';

export interface HostBridgeConfig {
    command: string;
    args: string[];
}

export interface HostDelegateBridgeConfig {
    command: string;
    args: string[];
}

export interface HostDelegatePollBridgeConfig {
    command: string;
    args: string[];
}

export type CapabilityExecutionMode =
    | 'agent-native'
    | 'kernel-backed'
    | 'policy-only'
    | 'unknown';

export type CapabilityOwnershipModel =
    | 'host-workflow'
    | 'kernel-primitive';

export type CapabilityKernelFallbackPolicy =
    | 'allowed'
    | 'forbidden';

export interface HostSkillActivationRequest {
    skill_id: string;
    role?: string;
    intent: string;
    project_root: string;
    target_paths?: string[];
    payload?: Record<string, unknown>;
    augury_contract?: Record<string, unknown>;
    augury_mode?: AugurySteeringMode;
    target_domain?: string;
    spoke_name?: string;
    requested_root?: string;
}

export interface AuguryLearningMetadata {
    [key: string]: unknown;
    schema_version: 1;
    steering_block_version: 2;
    steering_mode: AugurySteeringMode;
    corvus_standard_version: 1;
    optimizer_ready: true;
    optimizer_family: 'GEPA_DSPY';
    contract_hash: string;
    confidence?: number;
    confidence_source: 'explicit' | 'missing' | 'synthetic';
    route?: string;
    intent_category?: string;
    selection_tier?: string;
    selection_name?: string;
    expert_id?: string;
    expert_label?: string;
    council_candidates?: Array<{
        id: string;
        label: string;
        score: number;
        reason: string;
    }>;
    mimirs_well_count: number;
    mimirs_well_omitted_count: number;
    session_id?: string | null;
    planning_session_id?: string | null;
    designation_source?: string | null;
    prompt_surface?: string | null;
    bead_id?: string | null;
    weave_id?: string | null;
    result_status?: string | null;
    provider?: string | null;
    prompt_token_estimate?: number | null;
    target_domain?: string | null;
    spoke_name?: string | null;
    requested_root?: string | null;
}

export interface AuguryLearningEvent {
    schema_version: 1;
    event_version: 1;
    event_type: 'host_prompt';
    recorded_at: string;
    project_root: string;
    prompt_key?: string | null;
    prompt_surface?: string | null;
    steering_mode: AugurySteeringMode;
    contract_hash: string;
    confidence?: number;
    confidence_source: 'explicit' | 'missing' | 'synthetic';
    route?: string;
    intent_category?: string;
    selection_tier?: string;
    selection_name?: string;
    expert_id?: string;
    expert_label?: string;
    council_candidates?: AuguryLearningMetadata['council_candidates'];
    mimirs_well_count: number;
    mimirs_well_omitted_count: number;
    session_id?: string | null;
    planning_session_id?: string | null;
    designation_source?: string | null;
    provider?: string | null;
    target_domain?: string | null;
    spoke_name?: string | null;
    requested_root?: string | null;
    result_status?: string | null;
    transport_mode?: string | null;
    error?: string | null;
}

export interface AugurySteeringContext {
    mode?: AugurySteeringMode;
    project_root?: string;
    target_paths?: string[];
    target_domain?: string;
    spoke_name?: string;
    requested_root?: string;
}

function normalizeFlag(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return undefined;
}

export function detectHostProvider(env: NodeJS.ProcessEnv = process.env): HostProvider | null {
    const override = env.CORVUS_HOST_PROVIDER?.trim().toLowerCase();
    if (override === 'gemini' || override === 'codex' || override === 'claude' || override === 'droid') {
        return override as HostProvider;
    }

    if (env.CODEX_SHELL === '1' || Boolean(env.CODEX_THREAD_ID)) {
        return 'codex';
    }

    if (env.GEMINI_CLI_ACTIVE === 'true' || env.GEMINI_CLI === '1') {
        return 'gemini';
    }

    if (env.DROID_CLI_ACTIVE === 'true') {
        return 'droid';
    }

    return null;
}

export function isHostSessionActive(env: NodeJS.ProcessEnv = process.env): boolean {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override !== undefined) {
        return override;
    }

    return detectHostProvider(env) !== null;
}

export function isInteractiveHostSession(env: NodeJS.ProcessEnv = process.env): boolean {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override === false) {
        return false;
    }

    const provider = detectHostProvider(env);
    if (provider === 'gemini') {
        return env.GEMINI_CLI_ACTIVE === 'true' || env.GEMINI_CLI === '1';
    }
    if (provider === 'codex') {
        return env.CODEX_SHELL === '1';
    }
    if (provider === 'droid') {
        return env.DROID_CLI_ACTIVE === 'true';
    }
    return false;
}

export function resolveHostProvider(
    env: NodeJS.ProcessEnv = process.env,
): HostProvider | null {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override === false) {
        return null;
    }

    return detectHostProvider(env);
}

export function getHostProviderBanner(provider: HostProvider | null): string {
    if (provider === 'codex') {
        return ' ◤ CODEX CLI INTEGRATION ACTIVE ◢ ';
    }
    if (provider === 'claude') {
        return ' ◤ CLAUDE CLI INTEGRATION ACTIVE ◢ ';
    }
    if (provider === 'droid') {
        return ' ◤ DROID CLI INTEGRATION ACTIVE ◢ ';
    }
    if (provider === 'gemini') {
        return ' ◤ GEMINI CLI INTEGRATION ACTIVE ◢ ';
    }
    return ' ◤ HOST PROVIDER UNRESOLVED ◢ ';
}

export function getHostMindLabel(provider: HostProvider | null): string {
    if (provider === 'codex') {
        return 'OPENAI CODEX';
    }
    if (provider === 'claude') {
        return 'CLAUDE HOST';
    }
    if (provider === 'droid') {
        return 'DROID-CONTROL';
    }
    if (provider === 'gemini') {
        return 'GEMINI-3.1-PRO';
    }
    return 'HOST SESSION';
}

export function createHostAttemptEvidence(input: HostAttemptEvidence): HostAttemptEvidence {
    return Object.freeze({ ...input });
}

export function formatHostAttemptEvidence(evidence: HostAttemptEvidence): string {
    return [
        `requested_provider=${evidence.requested_provider ?? 'unresolved'}`,
        `actual_provider=${evidence.actual_provider ?? 'unresolved'}`,
        `requested_surface=${evidence.requested_surface}`,
        `actual_surface=${evidence.actual_surface ?? 'none'}`,
        `execution_dispatched=${String(evidence.execution_dispatched)}`,
    ].join(' ');
}

export * from './host_session_bridges.js';
export * from './host_session_augury.js';
