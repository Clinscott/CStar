import fs from 'node:fs';
import path from 'node:path';

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
        requires_terminal?: boolean;
        terminal_contract?: string;
    };
}

interface SurfaceRegistryManifest {
    entries?: Record<string, SurfaceRegistryEntry>;
    skills?: Record<string, SurfaceRegistryEntry>;
}

export function loadRegistryEntries(projectRoot: string): Record<string, SurfaceRegistryEntry> {
    const candidates = [
        path.join(projectRoot, '.agents', 'skill_registry.json'),
        process.env.CSTAR_CONTROL_ROOT
            ? path.join(process.env.CSTAR_CONTROL_ROOT, '.agents', 'skill_registry.json')
            : null,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const manifestPath of candidates) {
        if (!fs.existsSync(manifestPath)) {
            continue;
        }

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as SurfaceRegistryManifest;
            if (manifest.entries && typeof manifest.entries === 'object') {
                return manifest.entries;
            }
            if (manifest.skills && typeof manifest.skills === 'object') {
                return manifest.skills;
            }
        } catch {
            continue;
        }
    }

    return {};
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

    return 'cli';
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

    for (const [skillId, entry] of Object.entries(entries)) {
        if (String(entry.runtime_trigger ?? '').trim().toLowerCase() === normalized) {
            return { skillId, entry };
        }
    }

    return null;
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
