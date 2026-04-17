import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type HostProvider = 'gemini' | 'codex' | 'claude' | 'droid';
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

export const AUGURY_STEERING_BLOCK_VERSION = 2;
export const AUGURY_CORVUS_STANDARD_VERSION = 1;
const AUGURY_PROMPT_CONSULT_LIMIT = 3;

export interface AugurySteeringContext {
    mode?: AugurySteeringMode;
    project_root?: string;
    target_paths?: string[];
    target_domain?: string;
    spoke_name?: string;
    requested_root?: string;
}

interface RegistryEntry {
    runtime_trigger?: string;
    host_support?: Partial<Record<HostProvider, string>>;
    execution?: {
        mode?: string;
        adapter_id?: string;
        allow_kernel_fallback?: boolean;
        ownership_model?: string;
    };
}

interface RegistryManifest {
    entries?: Record<string, RegistryEntry>;
    skills?: Record<string, RegistryEntry>;
}

function findRegistryEntry(entries: Record<string, RegistryEntry>, capability: string): RegistryEntry | null {
    const normalizedCapability = capability.trim().toLowerCase();
    if (!normalizedCapability) {
        return null;
    }

    const directEntry = entries[normalizedCapability];
    if (directEntry) {
        return directEntry;
    }

    return Object.values(entries).find((entry) => {
        const runtimeTrigger = String(entry.runtime_trigger ?? '').trim().toLowerCase();
        const adapterId = String(entry.execution?.adapter_id ?? '').trim().toLowerCase();
        return runtimeTrigger === normalizedCapability || adapterId === normalizedCapability;
    }) ?? null;
}

const SUPPORTED_HOST_STATUSES = new Set<HostSupportStatus>([
    'supported',
    'native-session',
    'exec-bridge',
]);

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
    fallback: HostProvider = 'gemini',
): HostProvider | null {
    const override = normalizeFlag(env.CORVUS_HOST_SESSION_ACTIVE);
    if (override === false) {
        return null;
    }

    const provider = detectHostProvider(env);
    if (provider) {
        return provider;
    }

    return isHostSessionActive(env) ? fallback : null;
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
    return ' ◤ GEMINI CLI INTEGRATION ACTIVE ◢ ';
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

function parseBridgeArgsJson(raw: string | undefined, envName: string): string[] {
    if (!raw?.trim()) {
        return ['{prompt}'];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${envName} must be valid JSON: ${message}`);
    }

    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
        throw new Error(`${envName} must be a JSON array of strings.`);
    }

    return parsed;
}

function getProviderBridgeEnvNames(provider: HostProvider): { command: string; args: string } {
    const prefix = `CORVUS_${provider.toUpperCase()}_HOST_BRIDGE`;
    return {
        command: `${prefix}_CMD`,
        args: `${prefix}_ARGS_JSON`,
    };
}

function getProviderDelegateBridgeEnvNames(provider: HostProvider): { command: string; args: string } {
    const prefix = `CORVUS_${provider.toUpperCase()}_DELEGATE_BRIDGE`;
    return {
        command: `${prefix}_CMD`,
        args: `${prefix}_ARGS_JSON`,
    };
}

function getProviderDelegatePollBridgeEnvNames(provider: HostProvider): { command: string; args: string } {
    const prefix = `CORVUS_${provider.toUpperCase()}_DELEGATE_POLL_BRIDGE`;
    return {
        command: `${prefix}_CMD`,
        args: `${prefix}_ARGS_JSON`,
    };
}

function loadRegistryManifest(projectRoot: string): RegistryManifest | null {
    const manifestPath = path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RegistryManifest;
    } catch {
        return null;
    }
}

function getRegistryEntries(manifest: RegistryManifest | null): Record<string, RegistryEntry> {
    if (manifest?.entries && typeof manifest.entries === 'object') {
        return manifest.entries;
    }
    if (manifest?.skills && typeof manifest.skills === 'object') {
        return manifest.skills;
    }
    return {};
}

function normalizeHostSupportStatus(value: string | undefined): HostSupportStatus {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'supported') {
        return 'supported';
    }
    if (normalized === 'native-session' || normalized === 'native') {
        return 'native-session';
    }
    if (normalized === 'exec-bridge' || normalized === 'bridge') {
        return 'exec-bridge';
    }
    if (normalized === 'policy-only') {
        return 'policy-only';
    }
    if (normalized === 'unsupported') {
        return 'unsupported';
    }
    return 'unknown';
}

function normalizeCapabilityExecutionMode(value: string | undefined): CapabilityExecutionMode {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'agent-native') {
        return 'agent-native';
    }
    if (normalized === 'kernel-backed') {
        return 'kernel-backed';
    }
    if (normalized === 'policy-only') {
        return 'policy-only';
    }
    return 'unknown';
}

export function isHostSupportStatusAllowed(status: HostSupportStatus | null | undefined): boolean {
    return status === null || status === undefined || SUPPORTED_HOST_STATUSES.has(status);
}

export function getCapabilityHostSupport(
    projectRoot: string,
    capability: string,
    provider: HostProvider,
): HostSupportStatus | null {
    const entries = getRegistryEntries(loadRegistryManifest(projectRoot));
    const matchedEntry = findRegistryEntry(entries, capability);
    if (!matchedEntry?.host_support) {
        return null;
    }

    return normalizeHostSupportStatus(matchedEntry.host_support[provider]);
}

export function getCapabilityExecutionMode(
    projectRoot: string,
    capability: string,
): CapabilityExecutionMode {
    const entries = getRegistryEntries(loadRegistryManifest(projectRoot));
    const matchedEntry = findRegistryEntry(entries, capability);
    return normalizeCapabilityExecutionMode(matchedEntry?.execution?.mode);
}

export function getCapabilityOwnershipModel(
    projectRoot: string,
    capability: string,
): CapabilityOwnershipModel {
    const entries = getRegistryEntries(loadRegistryManifest(projectRoot));
    const matchedEntry = findRegistryEntry(entries, capability);
    const explicit = matchedEntry?.execution?.ownership_model?.trim().toLowerCase();
    if (explicit === 'kernel-primitive') {
        return 'kernel-primitive';
    }
    if (explicit === 'host-workflow') {
        return 'host-workflow';
    }

    return normalizeCapabilityExecutionMode(matchedEntry?.execution?.mode) === 'kernel-backed'
        ? 'kernel-primitive'
        : 'host-workflow';
}

export function getCapabilityKernelFallbackPolicy(
    projectRoot: string,
    capability: string,
): CapabilityKernelFallbackPolicy {
    const entries = getRegistryEntries(loadRegistryManifest(projectRoot));
    const matchedEntry = findRegistryEntry(entries, capability);

    return matchedEntry?.execution?.allow_kernel_fallback === false ? 'forbidden' : 'allowed';
}

export function explainCapabilityHostSupport(
    projectRoot: string,
    capability: string,
    provider: HostProvider,
): string | null {
    const status = getCapabilityHostSupport(projectRoot, capability, provider);
    if (isHostSupportStatusAllowed(status)) {
        return null;
    }

    if (status === 'policy-only') {
        return `Capability '${capability}' is policy-only and cannot execute directly on ${provider}.`;
    }

    if (status === 'unsupported') {
        return `Capability '${capability}' is marked unsupported on ${provider} in the authoritative skill registry.`;
    }

    return `Capability '${capability}' does not declare executable support for ${provider} in the authoritative skill registry.`;
}

export function resolveConfiguredHostBridge(
    env: NodeJS.ProcessEnv = process.env,
    provider: HostProvider,
): HostBridgeConfig | null {
    const providerEnv = getProviderBridgeEnvNames(provider);
    const providerCommand = env[providerEnv.command]?.trim();
    if (providerCommand) {
        return {
            command: providerCommand,
            args: parseBridgeArgsJson(env[providerEnv.args], providerEnv.args),
        };
    }

    const sharedCommand = env.CORVUS_HOST_BRIDGE_CMD?.trim();
    if (sharedCommand) {
        return {
            command: sharedCommand,
            args: parseBridgeArgsJson(env.CORVUS_HOST_BRIDGE_ARGS_JSON, 'CORVUS_HOST_BRIDGE_ARGS_JSON'),
        };
    }

    return null;
}

export function resolveConfiguredDelegateBridge(
    env: NodeJS.ProcessEnv = process.env,
    provider: HostProvider,
): HostDelegateBridgeConfig | null {
    const providerEnv = getProviderDelegateBridgeEnvNames(provider);
    const providerCommand = env[providerEnv.command]?.trim();
    if (providerCommand) {
        return {
            command: providerCommand,
            args: parseBridgeArgsJson(env[providerEnv.args], providerEnv.args),
        };
    }

    const sharedCommand = env.CORVUS_DELEGATE_BRIDGE_CMD?.trim();
    if (sharedCommand) {
        return {
            command: sharedCommand,
            args: parseBridgeArgsJson(env.CORVUS_DELEGATE_BRIDGE_ARGS_JSON, 'CORVUS_DELEGATE_BRIDGE_ARGS_JSON'),
        };
    }

    return null;
}

export function resolveConfiguredDelegatePollBridge(
    env: NodeJS.ProcessEnv = process.env,
    provider: HostProvider,
): HostDelegatePollBridgeConfig | null {
    const providerEnv = getProviderDelegatePollBridgeEnvNames(provider);
    const providerCommand = env[providerEnv.command]?.trim();
    if (providerCommand) {
        return {
            command: providerCommand,
            args: parseBridgeArgsJson(env[providerEnv.args], providerEnv.args),
        };
    }

    const sharedCommand = env.CORVUS_DELEGATE_POLL_BRIDGE_CMD?.trim();
    if (sharedCommand) {
        return {
            command: sharedCommand,
            args: parseBridgeArgsJson(env.CORVUS_DELEGATE_POLL_BRIDGE_ARGS_JSON, 'CORVUS_DELEGATE_POLL_BRIDGE_ARGS_JSON'),
        };
    }

    return null;
}

export function expandHostBridgeArgs(
    template: string[],
    values: {
        prompt: string;
        project_root: string;
        provider: HostProvider;
    },
): string[] {
    return template.map((entry) =>
        entry
            .replaceAll('{prompt}', values.prompt)
            .replaceAll('{project_root}', values.project_root)
            .replaceAll('{provider}', values.provider),
    );
}

export function expandDelegateBridgeArgs(
    template: string[],
    values: {
        request_path: string;
        result_path: string;
        project_root: string;
        provider: HostProvider;
        subagent_profile: string;
        request_id?: string;
        handle_id?: string;
    },
): string[] {
    return template.map((entry) =>
        entry
            .replaceAll('{request_path}', values.request_path)
            .replaceAll('{result_path}', values.result_path)
            .replaceAll('{project_root}', values.project_root)
            .replaceAll('{provider}', values.provider)
            .replaceAll('{subagent_profile}', values.subagent_profile)
            .replaceAll('{request_id}', values.request_id ?? '')
            .replaceAll('{handle_id}', values.handle_id ?? ''),
    );
}

export function getHostBridgeConfigurationHint(provider: HostProvider): string {
    const providerEnv = getProviderBridgeEnvNames(provider);
    return `Set ${providerEnv.command} and ${providerEnv.args}, set CORVUS_HOST_BRIDGE_CMD and CORVUS_HOST_BRIDGE_ARGS_JSON, or supply an explicit hostSessionInvoker.`;
}

export function getDelegateBridgeConfigurationHint(provider: HostProvider): string {
    const providerEnv = getProviderDelegateBridgeEnvNames(provider);
    return `Set ${providerEnv.command} and ${providerEnv.args}, set CORVUS_DELEGATE_BRIDGE_CMD and CORVUS_DELEGATE_BRIDGE_ARGS_JSON, or bind a provider-native delegation adapter.`;
}

export function getDelegatePollBridgeConfigurationHint(provider: HostProvider): string {
    const providerEnv = getProviderDelegatePollBridgeEnvNames(provider);
    return `Set ${providerEnv.command} and ${providerEnv.args}, or set CORVUS_DELEGATE_POLL_BRIDGE_CMD and CORVUS_DELEGATE_POLL_BRIDGE_ARGS_JSON to resolve in-flight delegated handles.`;
}

export function buildHostSkillActivationEnvelope(request: HostSkillActivationRequest): string {
    return [
        '[CORVUS_SKILL_ACTIVATION]',
        `SKILL_ID: ${request.skill_id}`,
        request.role ? `ROLE: ${request.role}` : '',
        `INTENT: ${request.intent}`,
        `PROJECT_ROOT: ${request.project_root}`,
        request.target_paths && request.target_paths.length > 0
            ? `TARGET_PATHS: ${request.target_paths.join(', ')}`
            : '',
        'PAYLOAD:',
        JSON.stringify(request.payload ?? {}, null, 2),
        '[/CORVUS_SKILL_ACTIVATION]',
    ].filter(Boolean).join('\n');
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
}

function compactSingleLine(value: unknown, maxLength = 220): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function stableNormalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => stableNormalize(entry));
    }
    if (value && typeof value === 'object') {
        const normalized: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const entry = (value as Record<string, unknown>)[key];
            if (entry !== undefined) {
                normalized[key] = stableNormalize(entry);
            }
        }
        return normalized;
    }
    return value;
}

function buildContractHash(contract: Record<string, unknown>): string {
    return createHash('sha256')
        .update(JSON.stringify(stableNormalize(contract)))
        .digest('hex');
}

function resolveConfidenceSource(
    contract: Record<string, unknown>,
    options: { confidence_source?: 'explicit' | 'missing' | 'synthetic'; designation_source?: string | null },
): 'explicit' | 'missing' | 'synthetic' {
    if (options.confidence_source) {
        return options.confidence_source;
    }
    if (contract.confidence_source === 'explicit' || contract.confidence_source === 'missing' || contract.confidence_source === 'synthetic') {
        return contract.confidence_source;
    }
    if (typeof contract.confidence !== 'number' || !Number.isFinite(contract.confidence)) {
        return 'missing';
    }
    return options.designation_source === 'dispatcher_synthesized' ? 'synthetic' : 'explicit';
}

function findCStarRoot(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    const explicitRoot = env.CSTAR_AUGURY_LEARNING_ROOT?.trim()
        || env.CSTAR_ROOT?.trim()
        || env.CSTAR_PROJECT_ROOT?.trim();
    if (explicitRoot) {
        return path.resolve(explicitRoot);
    }

    let current = path.resolve(projectRoot || process.cwd());
    for (let depth = 0; depth < 8; depth += 1) {
        if (path.basename(current) === 'CStar' && fs.existsSync(path.join(current, '.agents'))) {
            return current;
        }
        const siblingCStar = path.join(current, 'CStar');
        if (fs.existsSync(path.join(siblingCStar, '.agents'))) {
            return siblingCStar;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return path.resolve(projectRoot || process.cwd());
}

export function resolveAuguryLearningLedgerPath(
    projectRoot: string,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const explicitPath = env.CSTAR_AUGURY_LEARNING_LEDGER?.trim();
    if (explicitPath) {
        return path.resolve(explicitPath);
    }
    return path.join(findCStarRoot(projectRoot, env), '.agents', 'state', 'augury-learning.jsonl');
}

export function recordAuguryLearningEvent(
    projectRoot: string,
    event: AuguryLearningEvent,
    env: NodeJS.ProcessEnv = process.env,
): string | null {
    if (env.CSTAR_AUGURY_LEARNING_DISABLED === '1') {
        return null;
    }

    const ledgerPath = resolveAuguryLearningLedgerPath(projectRoot, env);
    try {
        fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
        fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`, 'utf-8');
        return ledgerPath;
    } catch {
        return null;
    }
}

export function buildAuguryLearningMetadata(
    contract: Record<string, unknown> | undefined,
    options: {
        session_id?: string | null;
        planning_session_id?: string | null;
        designation_source?: string | null;
        prompt_surface?: string | null;
        bead_id?: string | null;
        weave_id?: string | null;
        result_status?: string | null;
        provider?: string | null;
        prompt_token_estimate?: number | null;
        steering_mode?: AugurySteeringMode;
        confidence_source?: 'explicit' | 'missing' | 'synthetic';
        target_domain?: string | null;
        spoke_name?: string | null;
        requested_root?: string | null;
    } = {},
): AuguryLearningMetadata | undefined {
    if (!contract) {
        return undefined;
    }

    const expert = contract.council_expert && typeof contract.council_expert === 'object' && !Array.isArray(contract.council_expert)
        ? contract.council_expert as Record<string, unknown>
        : undefined;
    const intentCategory = typeof contract.intent_category === 'string' ? contract.intent_category : undefined;
    const selectionTier = typeof contract.selection_tier === 'string' ? contract.selection_tier : undefined;
    const selectionName = typeof contract.selection_name === 'string' ? contract.selection_name : undefined;
    const route = [intentCategory, selectionTier && selectionName ? `${selectionTier}: ${selectionName}` : undefined]
        .filter(Boolean)
        .join(' -> ') || undefined;
    const mimirsWellCount = asStringArray(contract.mimirs_well).length;
    const confidenceSource = resolveConfidenceSource(contract, options);
    const councilCandidates = (Array.isArray(contract.council_candidates) ? contract.council_candidates : Array.isArray(expert?.selection_candidates) ? expert.selection_candidates : [])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
            id: String(entry.id ?? ''),
            label: String(entry.label ?? ''),
            score: Number(entry.score ?? 0),
            reason: String(entry.reason ?? ''),
        }))
        .filter((entry) => entry.id && entry.label && Number.isFinite(entry.score) && entry.reason)
        .slice(0, 3);

    return {
        schema_version: 1,
        steering_block_version: AUGURY_STEERING_BLOCK_VERSION,
        steering_mode: options.steering_mode ?? 'full',
        corvus_standard_version: AUGURY_CORVUS_STANDARD_VERSION,
        optimizer_ready: true,
        optimizer_family: 'GEPA_DSPY',
        contract_hash: buildContractHash(contract),
        ...(typeof contract.confidence === 'number' && Number.isFinite(contract.confidence) ? { confidence: contract.confidence } : {}),
        confidence_source: confidenceSource,
        ...(route ? { route } : {}),
        ...(intentCategory ? { intent_category: intentCategory } : {}),
        ...(selectionTier ? { selection_tier: selectionTier } : {}),
        ...(selectionName ? { selection_name: selectionName } : {}),
        ...(typeof expert?.id === 'string' ? { expert_id: expert.id } : {}),
        ...(typeof expert?.label === 'string' ? { expert_label: expert.label } : {}),
        ...(councilCandidates.length > 0 ? { council_candidates: councilCandidates } : {}),
        mimirs_well_count: mimirsWellCount,
        mimirs_well_omitted_count: Math.max(0, mimirsWellCount - AUGURY_PROMPT_CONSULT_LIMIT),
        session_id: options.session_id ?? null,
        planning_session_id: options.planning_session_id ?? null,
        designation_source: options.designation_source ?? null,
        prompt_surface: options.prompt_surface ?? null,
        bead_id: options.bead_id ?? null,
        weave_id: options.weave_id ?? null,
        result_status: options.result_status ?? null,
        provider: options.provider ?? null,
        prompt_token_estimate: typeof options.prompt_token_estimate === 'number' && Number.isFinite(options.prompt_token_estimate)
            ? options.prompt_token_estimate
            : null,
        target_domain: options.target_domain ?? null,
        spoke_name: options.spoke_name ?? null,
        requested_root: options.requested_root ?? null,
    };
}

function buildAuguryScopeLine(context: AugurySteeringContext): string {
    const domain = compactSingleLine(context.target_domain, 60);
    const spoke = compactSingleLine(context.spoke_name, 80);
    const project = compactSingleLine(context.project_root ? path.basename(context.project_root) : '', 80);
    const requestedRoot = compactSingleLine(context.requested_root, 120);

    if (spoke) {
        return `Scope: spoke:${spoke}${requestedRoot ? ` (${requestedRoot})` : ''}`;
    }
    if (!domain && project === 'CStar') {
        return 'Scope: brain:CStar';
    }
    if (domain) {
        return `Scope: ${domain}${project ? `:${project}` : ''}`;
    }
    return project ? `Scope: ${project}` : '';
}

function buildAuguryQualityLine(intentCategory: string): string {
    if (['VERIFY', 'SCORE', 'OBSERVE', 'DOCUMENT'].includes(intentCategory)) {
        return 'Review Standard: findings first; cite files; call out regressions, risks, and missing tests.';
    }
    if (['ORCHESTRATE', 'EXPAND', 'GUARD'].includes(intentCategory)) {
        return 'Coordination Standard: follow registry/runtime contracts; respect spoke boundaries; fail closed on unsafe ambiguity.';
    }
    return 'Code Standard: scoped changes; preserve unrelated work; verify focused behavior; leave no known broken surface.';
}

export function formatAugurySteeringBlock(
    contract: Record<string, unknown> | undefined,
    context: AugurySteeringContext = {},
): string {
    if (!contract) {
        return '';
    }

    const expert = contract.council_expert && typeof contract.council_expert === 'object' && !Array.isArray(contract.council_expert)
        ? contract.council_expert as Record<string, unknown>
        : undefined;
    const antiBehavior = asStringArray(expert?.anti_behavior).slice(0, 2).map((entry) => compactSingleLine(entry, 140));
    const mimirsWell = asStringArray(contract.mimirs_well);
    const promptMimirsWell = mimirsWell.slice(0, AUGURY_PROMPT_CONSULT_LIMIT);
    const intentCategory = compactSingleLine(contract.intent_category ?? 'UNKNOWN', 80);
    const selectionTier = compactSingleLine(contract.selection_tier ?? 'UNKNOWN', 80);
    const selectionName = compactSingleLine(contract.selection_name ?? 'unknown', 120);
    const trajectoryStatus = compactSingleLine(contract.trajectory_status, 80).toUpperCase();
    const trajectoryReason = compactSingleLine(contract.trajectory_reason, 180);
    const applyLens = compactSingleLine(expert?.lens ?? expert?.protocol, 220);
    const mode = context.mode ?? 'full';

    if (mode === 'lite') {
        return [
            '[CORVUS_STAR_AUGURY]',
            'Mode: lite',
            `Route: ${intentCategory} -> ${selectionTier}: ${selectionName}`,
            buildAuguryScopeLine(context),
            `Intent: ${compactSingleLine(contract.intent ?? contract.canonical_intent, 180)}`,
            promptMimirsWell.length > 0 ? `Mimir's Well: ${promptMimirsWell.map((entry) => compactSingleLine(entry, 140)).join(' | ')}` : '',
            expert ? `Council Expert: ${compactSingleLine(expert.label ?? expert.id ?? 'UNKNOWN', 80)}` : '',
            'Directive: Route only. Consult targets before choosing a path. Do not echo.',
            '[/CORVUS_STAR_AUGURY]',
        ].filter(Boolean).join('\n');
    }

    return [
        '[CORVUS_STAR_AUGURY]',
        'Mode: full',
        `Route: ${intentCategory} -> ${selectionTier}: ${selectionName}`,
        buildAuguryScopeLine(context),
        `Intent: ${compactSingleLine(contract.intent ?? contract.canonical_intent, 260)}`,
        promptMimirsWell.length > 0 ? `Mimir's Well: ${promptMimirsWell.map((entry) => compactSingleLine(entry, 160)).join(' | ')}` : '',
        expert ? `Council Expert: ${compactSingleLine(expert.label ?? expert.id ?? 'UNKNOWN', 80)}` : '',
        applyLens ? `Council Lens: ${applyLens}` : '',
        antiBehavior.length > 0 ? `Guardrails: ${antiBehavior.join(' | ')}` : '',
        'Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.',
        buildAuguryQualityLine(intentCategory.toUpperCase()),
        trajectoryStatus && trajectoryStatus !== 'STABLE'
            ? `Trajectory: ${trajectoryStatus}${trajectoryReason ? `: ${trajectoryReason}` : ''}`
            : '',
        contract.gungnir_verdict ? `Verdict: ${compactSingleLine(contract.gungnir_verdict, 220)}` : '',
        'Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.',
        '[/CORVUS_STAR_AUGURY]',
    ].filter(Boolean).join('\n');
}

export function buildHostNativeSkillPrompt(request: HostSkillActivationRequest): string {
    const targetPaths = request.target_paths?.filter((entry) => entry.trim().length > 0) ?? [];
    const auguryBlock = formatAugurySteeringBlock(request.augury_contract, {
        mode: request.augury_mode,
        project_root: request.project_root,
        target_paths: targetPaths,
        target_domain: request.target_domain,
        spoke_name: request.spoke_name,
        requested_root: request.requested_root,
    });
    return [
        buildHostSkillActivationEnvelope(request),
        auguryBlock,
        '',
        'Execute this Corvus skill natively inside the current host session.',
        'Do not invoke `cstar`, `node`, or a runtime dispatcher to fulfill it.',
        'Use the authoritative skill instructions directly so Hall and Augury continuity remain in-session.',
        targetPaths.length > 0 ? `Focus targets: ${targetPaths.join(', ')}` : '',
    ].filter(Boolean).join('\n');
}
