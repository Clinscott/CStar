import { readBoundedJsonObject } from '../../../core/safe_local_file.js';
import { getSkillRegistryEntries } from '../../../core/skill_registry.js';

const CAPABILITY_REGISTRY_MAX_BYTES = 1024 * 1024;

export type EntrySurface = 'cli' | 'host-only' | 'compatibility';

export interface SurfaceRegistryEntry {
    tier?: string;
    runtime_trigger?: string;
    entry_surface?: string;
    terminal_required?: boolean;
    spell_classification?: string;
    owner_runtime?: string;
    entrypoint_path?: string | null;
    host_support?: Record<string, string>;
    execution?: {
        mode?: string;
        adapter_id?: string;
        ownership_model?: string;
        requires_terminal?: boolean;
        terminal_contract?: string;
    };
}

interface SurfaceRegistryManifest {
    entries?: Record<string, SurfaceRegistryEntry>;
    skills?: Record<string, SurfaceRegistryEntry>;
}

export function loadRegistryEntries(projectRoot: string): Record<string, SurfaceRegistryEntry> {
    const manifest = readBoundedJsonObject<SurfaceRegistryManifest>(
        projectRoot,
        '.agents/skill_registry.json',
        CAPABILITY_REGISTRY_MAX_BYTES,
    );
    return getSkillRegistryEntries<SurfaceRegistryEntry>(manifest);
}

export function resolveEntrySurface(entry: SurfaceRegistryEntry, capabilityId: string): EntrySurface {
    const explicit = String(entry.entry_surface ?? '').trim().toLowerCase();
    if (explicit === 'cli' || explicit === 'host-only' || explicit === 'compatibility') {
        return explicit as EntrySurface;
    }

    if (String(entry.tier ?? '').trim().toUpperCase() === 'SPELL') {
        return 'host-only';
    }

    if (capabilityId.trim().toLowerCase() === 'chant') {
        return 'host-only';
    }

    if (String(entry.spell_classification ?? '').trim().toLowerCase() === 'policy-only') {
        return 'host-only';
    }

    if (String(entry.owner_runtime ?? '').trim().toLowerCase() === 'policy-layer') {
        return 'host-only';
    }

    if (String(entry.execution?.mode ?? '').trim().toLowerCase() === 'policy-only') {
        return 'host-only';
    }

    if (entry.host_support && Object.values(entry.host_support).every((value) => value === 'policy-only')) {
        return 'host-only';
    }

    // Underspecified legacy entries never inherit terminal authority. A CLI
    // surface must be declared explicitly; compatibility remains fail-closed.
    return 'compatibility';
}

export function requiresTerminalExecution(entry: SurfaceRegistryEntry): boolean {
    if (entry.terminal_required === true) {
        return true;
    }
    if (entry.execution?.requires_terminal === true) {
        return true;
    }
    return String(entry.execution?.terminal_contract ?? '').trim().toLowerCase() === 'required';
}

export function resolveRegistryEntryForCommand(
    entries: Record<string, SurfaceRegistryEntry>,
    command: string,
): { skillId: string; entry: SurfaceRegistryEntry } | null {
    const normalized = command.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (entries[normalized]) {
        return { skillId: normalized, entry: entries[normalized] };
    }

    const withoutWeavePrefix = normalized.startsWith('weave:')
        ? normalized.slice('weave:'.length)
        : normalized;
    if (entries[withoutWeavePrefix]) {
        return { skillId: withoutWeavePrefix, entry: entries[withoutWeavePrefix] };
    }

    for (const [skillId, entry] of Object.entries(entries)) {
        const runtimeTrigger = String(entry.runtime_trigger ?? '').trim().toLowerCase();
        const adapterId = String(entry.execution?.adapter_id ?? '').trim().toLowerCase();
        if (
            runtimeTrigger === normalized
            || runtimeTrigger === withoutWeavePrefix
            || adapterId === normalized
        ) {
            return { skillId, entry };
        }
    }

    return null;
}

export function resolveCapabilityEntrySurface(
    projectRoot: string,
    capabilityId: string,
): EntrySurface | null {
    const resolved = resolveRegistryEntryForCommand(loadRegistryEntries(projectRoot), capabilityId);
    return resolved ? resolveEntrySurface(resolved.entry, resolved.skillId) : null;
}

export function summarizeCommandSurfaces(projectRoot: string): {
    cli: string[];
    hostOnly: string[];
    compatibility: string[];
} {
    const entries = loadRegistryEntries(projectRoot);
    const cli = new Set<string>();
    const hostOnly = new Set<string>();
    const compatibility = new Set<string>();

    for (const [skillId, entry] of Object.entries(entries)) {
        const command = String(entry.runtime_trigger ?? skillId).trim().toLowerCase();
        if (!command) continue;
        const surface = resolveEntrySurface(entry, skillId);
        if (surface === 'host-only') {
            hostOnly.add(command);
        } else if (surface === 'compatibility') {
            compatibility.add(command);
        } else {
            cli.add(command);
        }
    }

    return {
        cli: Array.from(cli).sort(),
        hostOnly: Array.from(hostOnly).sort(),
        compatibility: Array.from(compatibility).sort(),
    };
}
