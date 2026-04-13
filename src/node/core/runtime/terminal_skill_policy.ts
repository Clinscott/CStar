import { requiresTerminalExecution, resolveEntrySurface, type SurfaceRegistryEntry } from './entry_surface.js';

export interface TerminalSkillPolicyViolation {
    skill_id: string;
    reason: string;
    entrypoint_path?: string;
    entry_surface: string;
}

export type TerminalSkillClassification =
    | 'host-native'
    | 'compatibility-only'
    | 'terminal-required';

export function hasTerminalEntrypoint(entry: SurfaceRegistryEntry): boolean {
    const entrypoint = String(entry.entrypoint_path ?? '').trim();
    if (!entrypoint) {
        return false;
    }

    return /(^|[\\/])scripts[\\/]/.test(entrypoint)
        || /\.(sh|bash|zsh|fish|py|mjs|cjs|js|ts)$/i.test(entrypoint);
}

export function classifyTerminalSkill(entry: SurfaceRegistryEntry): TerminalSkillClassification {
    if (requiresTerminalExecution(entry)) {
        return 'terminal-required';
    }
    if (hasTerminalEntrypoint(entry)) {
        return 'compatibility-only';
    }
    return 'host-native';
}

export function collectTerminalSkillPolicyViolations(
    entries: Record<string, SurfaceRegistryEntry>,
): TerminalSkillPolicyViolation[] {
    const violations: TerminalSkillPolicyViolation[] = [];

    for (const [skillId, entry] of Object.entries(entries)) {
        const surface = resolveEntrySurface(entry, skillId);
        const classification = classifyTerminalSkill(entry);
        if (classification === 'host-native') {
            continue;
        }
        if (classification === 'terminal-required') {
            continue;
        }

        violations.push({
            skill_id: skillId,
            reason: 'Skill declares a terminal/script entrypoint without an explicit terminal-required contract.',
            entrypoint_path: String(entry.entrypoint_path ?? '').trim(),
            entry_surface: surface,
        });
    }

    return violations;
}
