import * as fs from 'node:fs';
import * as path from 'node:path';

export type HostProvider = 'gemini' | 'codex' | 'claude' | 'droid';
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

export function buildHostNativeSkillPrompt(request: HostSkillActivationRequest): string {
    const targetPaths = request.target_paths?.filter((entry) => entry.trim().length > 0) ?? [];
    return [
        buildHostSkillActivationEnvelope(request),
        '',
        'Execute this Corvus skill natively inside the current host session.',
        'Do not invoke `cstar`, `node`, or a runtime dispatcher to fulfill it.',
        'Use the authoritative skill instructions directly so Hall and trace continuity remain in-session.',
        targetPaths.length > 0 ? `Focus targets: ${targetPaths.join(', ')}` : '',
    ].filter(Boolean).join('\n');
}
