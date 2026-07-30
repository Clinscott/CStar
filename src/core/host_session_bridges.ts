import { readBoundedJsonObject } from './safe_local_file.js';

import type {
    CapabilityExecutionMode,
    CapabilityKernelFallbackPolicy,
    CapabilityOwnershipModel,
    HostBridgeConfig,
    HostDelegateBridgeConfig,
    HostDelegatePollBridgeConfig,
    HostProvider,
    HostSupportStatus,
} from './host_session.js';

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

const SUPPORTED_HOST_STATUSES = new Set<HostSupportStatus>([
    'supported',
    'native-session',
    'exec-bridge',
]);

const CAPABILITY_REGISTRY_MAX_BYTES = 1024 * 1024;

function findRegistryEntry(entries: Record<string, RegistryEntry>, capability: string): RegistryEntry | null {
    const normalizedCapability = capability.trim().toLowerCase();
    if (!normalizedCapability) return null;
    const directEntry = entries[normalizedCapability];
    if (directEntry) return directEntry;
    return Object.values(entries).find((entry) => {
        const runtimeTrigger = String(entry.runtime_trigger ?? '').trim().toLowerCase();
        const adapterId = String(entry.execution?.adapter_id ?? '').trim().toLowerCase();
        return runtimeTrigger === normalizedCapability || adapterId === normalizedCapability;
    }) ?? null;
}

function parseBridgeArgsJson(raw: string | undefined, envName: string): string[] {
    if (!raw?.trim()) return ['{prompt}'];
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

function providerEnvNames(provider: HostProvider, suffix: string): { command: string; args: string } {
    const prefix = `CORVUS_${provider.toUpperCase()}_${suffix}`;
    return { command: `${prefix}_CMD`, args: `${prefix}_ARGS_JSON` };
}

function loadRegistryManifest(projectRoot: string): RegistryManifest | null {
    return readBoundedJsonObject<RegistryManifest>(
        projectRoot,
        '.agents/skill_registry.json',
        CAPABILITY_REGISTRY_MAX_BYTES,
    );
}

function getRegistryEntries(manifest: RegistryManifest | null): Record<string, RegistryEntry> {
    if (manifest?.entries && typeof manifest.entries === 'object') return manifest.entries;
    if (manifest?.skills && typeof manifest.skills === 'object') return manifest.skills;
    return {};
}

function normalizeHostSupportStatus(value: string | undefined): HostSupportStatus {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'supported') return 'supported';
    if (normalized === 'native-session' || normalized === 'native') return 'native-session';
    if (normalized === 'exec-bridge' || normalized === 'bridge') return 'exec-bridge';
    if (normalized === 'policy-only') return 'policy-only';
    if (normalized === 'unsupported') return 'unsupported';
    return 'unknown';
}

function normalizeCapabilityExecutionMode(value: string | undefined): CapabilityExecutionMode {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'agent-native') return 'agent-native';
    if (normalized === 'kernel-backed') return 'kernel-backed';
    if (normalized === 'policy-only') return 'policy-only';
    return 'unknown';
}

export function isHostSupportStatusAllowed(status: HostSupportStatus | null | undefined): boolean {
    return status === null || status === undefined || SUPPORTED_HOST_STATUSES.has(status);
}

export function getCapabilityHostSupport(projectRoot: string, capability: string, provider: HostProvider): HostSupportStatus | null {
    const matchedEntry = findRegistryEntry(getRegistryEntries(loadRegistryManifest(projectRoot)), capability);
    return matchedEntry?.host_support ? normalizeHostSupportStatus(matchedEntry.host_support[provider]) : null;
}

export function getCapabilityExecutionMode(projectRoot: string, capability: string): CapabilityExecutionMode {
    const matchedEntry = findRegistryEntry(getRegistryEntries(loadRegistryManifest(projectRoot)), capability);
    return normalizeCapabilityExecutionMode(matchedEntry?.execution?.mode);
}

export function getCapabilityOwnershipModel(projectRoot: string, capability: string): CapabilityOwnershipModel {
    const matchedEntry = findRegistryEntry(getRegistryEntries(loadRegistryManifest(projectRoot)), capability);
    const explicit = matchedEntry?.execution?.ownership_model?.trim().toLowerCase();
    if (explicit === 'kernel-primitive') return 'kernel-primitive';
    if (explicit === 'host-workflow') return 'host-workflow';
    return normalizeCapabilityExecutionMode(matchedEntry?.execution?.mode) === 'kernel-backed'
        ? 'kernel-primitive'
        : 'host-workflow';
}

export function getCapabilityKernelFallbackPolicy(projectRoot: string, capability: string): CapabilityKernelFallbackPolicy {
    const matchedEntry = findRegistryEntry(getRegistryEntries(loadRegistryManifest(projectRoot)), capability);
    return matchedEntry?.execution?.allow_kernel_fallback === false ? 'forbidden' : 'allowed';
}

export function explainCapabilityHostSupport(projectRoot: string, capability: string, provider: HostProvider): string | null {
    const status = getCapabilityHostSupport(projectRoot, capability, provider);
    if (isHostSupportStatusAllowed(status)) return null;
    if (status === 'policy-only') return `Capability '${capability}' is policy-only and cannot execute directly on ${provider}.`;
    if (status === 'unsupported') return `Capability '${capability}' is marked unsupported on ${provider} in the authoritative skill registry.`;
    return `Capability '${capability}' does not declare executable support for ${provider} in the authoritative skill registry.`;
}

function resolveBridge(
    env: NodeJS.ProcessEnv,
    provider: HostProvider,
    suffix: string,
    sharedCommandName: string,
    sharedArgsName: string,
): { command: string; args: string[] } | null {
    const names = providerEnvNames(provider, suffix);
    const providerCommand = env[names.command]?.trim();
    if (providerCommand) {
        return { command: providerCommand, args: parseBridgeArgsJson(env[names.args], names.args) };
    }
    const sharedCommand = env[sharedCommandName]?.trim();
    return sharedCommand
        ? { command: sharedCommand, args: parseBridgeArgsJson(env[sharedArgsName], sharedArgsName) }
        : null;
}

export function resolveConfiguredHostBridge(env: NodeJS.ProcessEnv = process.env, provider: HostProvider): HostBridgeConfig | null {
    return resolveBridge(env, provider, 'HOST_BRIDGE', 'CORVUS_HOST_BRIDGE_CMD', 'CORVUS_HOST_BRIDGE_ARGS_JSON');
}

export function resolveConfiguredDelegateBridge(env: NodeJS.ProcessEnv = process.env, provider: HostProvider): HostDelegateBridgeConfig | null {
    return resolveBridge(env, provider, 'DELEGATE_BRIDGE', 'CORVUS_DELEGATE_BRIDGE_CMD', 'CORVUS_DELEGATE_BRIDGE_ARGS_JSON');
}

export function resolveConfiguredDelegatePollBridge(env: NodeJS.ProcessEnv = process.env, provider: HostProvider): HostDelegatePollBridgeConfig | null {
    return resolveBridge(env, provider, 'DELEGATE_POLL_BRIDGE', 'CORVUS_DELEGATE_POLL_BRIDGE_CMD', 'CORVUS_DELEGATE_POLL_BRIDGE_ARGS_JSON');
}

export function expandHostBridgeArgs(template: string[], values: { prompt: string; project_root: string; provider: HostProvider }): string[] {
    return template.map((entry) => entry
        .replaceAll('{prompt}', values.prompt)
        .replaceAll('{project_root}', values.project_root)
        .replaceAll('{provider}', values.provider));
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
    return template.map((entry) => entry
        .replaceAll('{request_path}', values.request_path)
        .replaceAll('{result_path}', values.result_path)
        .replaceAll('{project_root}', values.project_root)
        .replaceAll('{provider}', values.provider)
        .replaceAll('{subagent_profile}', values.subagent_profile)
        .replaceAll('{request_id}', values.request_id ?? '')
        .replaceAll('{handle_id}', values.handle_id ?? ''));
}

export function getHostBridgeConfigurationHint(provider: HostProvider): string {
    const names = providerEnvNames(provider, 'HOST_BRIDGE');
    return `Set ${names.command} and ${names.args}, set CORVUS_HOST_BRIDGE_CMD and CORVUS_HOST_BRIDGE_ARGS_JSON, or supply an explicit hostSessionInvoker.`;
}

export function getDelegateBridgeConfigurationHint(provider: HostProvider): string {
    const names = providerEnvNames(provider, 'DELEGATE_BRIDGE');
    return `Set ${names.command} and ${names.args}, set CORVUS_DELEGATE_BRIDGE_CMD and CORVUS_DELEGATE_BRIDGE_ARGS_JSON, or bind a provider-native delegation adapter.`;
}

export function getDelegatePollBridgeConfigurationHint(provider: HostProvider): string {
    const names = providerEnvNames(provider, 'DELEGATE_POLL_BRIDGE');
    return `Set ${names.command} and ${names.args}, or set CORVUS_DELEGATE_POLL_BRIDGE_CMD and CORVUS_DELEGATE_POLL_BRIDGE_ARGS_JSON to resolve in-flight delegated handles.`;
}
