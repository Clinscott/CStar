import { readBoundedJsonObject } from '../../../../core/safe_local_file.js';

export interface IntentCategoryMatch {
    category: string;
    default_path: string;
    tier: string;
    matched_trigger: string;
}

export interface RegistryEntry {
    tier?: string;
    viability?: string;
    spell_classification?: string;
    host_support?: Record<string, string>;
    execution?: {
        mode?: string;
        adapter_id?: string;
        cli?: string;
    };
    runtime_trigger?: string;
}

export interface RegistryManifest {
    entries?: Record<string, RegistryEntry>;
    skills?: Record<string, RegistryEntry>;
    intent_grammar?: Record<string, {
        triggers?: string[];
        default_path?: string;
        tier?: string;
    }>;
}

export type IntentGrammar = Record<string, {
    triggers: string[];
    default_path: string;
    tier: string;
}>;

// In-code fallback for INTENT_CATEGORIES.
// Source of truth: `.agents/skill_registry.json#intent_grammar`. The registry is
// loaded via `loadRegistryManifest` and `getRegistryIntentCategories`; this map
// is only used when the registry is unreadable. Keep triggers synchronized with
// the registry so registry-failed contexts do not silently see stale grammar.
export const INTENT_CATEGORIES: IntentGrammar = {
    REPAIR:      { triggers: ['fix', 'repair', 'heal', 'restore', 'broken', 'failing', 'bug'], default_path: 'restoration', tier: 'WEAVE' },
    BUILD:       { triggers: ['build', 'create', 'scaffold', 'implement', 'new', 'add', 'feature'], default_path: 'creation_loop', tier: 'WEAVE' },
    VERIFY:      { triggers: ['test', 'verify', 'validate', 'check', 'assert', 'spec'], default_path: 'empire', tier: 'SKILL' },
    SCORE:       { triggers: ['score', 'grade', 'rate', 'audit', 'quality', 'gungnir'], default_path: 'calculus', tier: 'PRIME' },
    OBSERVE:     { triggers: ['scan', 'search', 'find', 'query', 'status', 'health', 'look', 'show', 'browse', 'website', 'url', 'navigate'], default_path: 'scan', tier: 'PRIME' },
    HARDEN:      { triggers: ['contract', 'comply', 'sterling', 'harden', 'gherkin'], default_path: 'contract_hardening', tier: 'WEAVE' },
    EXPAND:      { triggers: ['deploy', 'link', 'mount', 'spoke', 'onboard'], default_path: 'expansion', tier: 'WEAVE' },
    EVOLVE:      { triggers: ['optimize', 'refactor', 'evolve', 'improve'], default_path: 'evolve', tier: 'WEAVE' },
    ORCHESTRATE: { triggers: ['plan', 'dispatch', 'autobot', 'orchestrate'], default_path: 'orchestrate', tier: 'WEAVE' },
    GUARD:       { triggers: ['protect', 'shield', 'lock', 'guard', 'drift'], default_path: 'silver_shield', tier: 'SPELL' },
    DOCUMENT:    { triggers: ['document', 'explain', 'chronicle', 'architecture', 'study', 'harvest', 'learn'], default_path: 'mimir-harvester', tier: 'SKILL' },
};

const CAPABILITY_REGISTRY_MAX_BYTES = 1024 * 1024;

export function loadRegistryManifest(projectRoot: string): RegistryManifest | null {
    try {
        return readBoundedJsonObject<RegistryManifest>(
            projectRoot,
            '.agents/skill_registry.json',
            CAPABILITY_REGISTRY_MAX_BYTES,
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'bounded_file_root_missing') {
            return null;
        }
        throw error;
    }
}

export function getRegistryEntries(manifest: RegistryManifest | null): Record<string, RegistryEntry> {
    if (!manifest) {
        return {};
    }
    if (manifest.entries && typeof manifest.entries === 'object') {
        return manifest.entries;
    }
    if (manifest.skills && typeof manifest.skills === 'object') {
        return manifest.skills;
    }
    return {};
}

export function getRegistryIntentCategories(manifest: RegistryManifest | null): IntentGrammar {
    if (!manifest?.intent_grammar || typeof manifest.intent_grammar !== 'object') {
        return INTENT_CATEGORIES;
    }

    const normalized: IntentGrammar = {};
    for (const [category, config] of Object.entries(manifest.intent_grammar)) {
        normalized[category] = {
            triggers: Array.isArray(config?.triggers)
                ? config.triggers.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
                : [],
            default_path: typeof config?.default_path === 'string' ? config.default_path : '',
            tier: typeof config?.tier === 'string' ? config.tier : '',
        };
    }

    return Object.keys(normalized).length > 0 ? normalized : INTENT_CATEGORIES;
}

export function loadSkillTriggers(projectRoot: string): Set<string> {
    const manifest = loadRegistryManifest(projectRoot);
    return new Set(Object.keys(getRegistryEntries(manifest)).map((entry) => entry.toLowerCase()));
}

export function resolveIntentCategory(lowerTokens: string[]): IntentCategoryMatch | null {
    return resolveIntentCategoryFromGrammar(lowerTokens, INTENT_CATEGORIES);
}

export function resolveIntentCategoryFromGrammar(
    lowerTokens: string[],
    grammar: IntentGrammar,
): IntentCategoryMatch | null {
    for (const [category, config] of Object.entries(grammar)) {
        for (const trigger of config.triggers) {
            if (lowerTokens.includes(trigger)) {
                return {
                    category,
                    default_path: config.default_path,
                    tier: config.tier,
                    matched_trigger: trigger,
                };
            }
        }
    }
    return null;
}
