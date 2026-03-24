import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
    WeaveInvocation,
    ChantWeavePayload,
} from '../contracts.ts';

export type DirectChantResolution =
    | {
          kind: 'weave';
          trigger: string;
          invocation: WeaveInvocation<unknown>;
          summary: string;
      }
    | {
          kind: 'skill';
          trigger: string;
          invocation: WeaveInvocation<unknown>;
          summary: string;
      }
    | {
          kind: 'missing_capability';
          trigger: string;
          summary: string;
      };

export const CONTROL_WORDS = new Set(['chant', 'use', 'run', 'invoke']);
export const TARGET_TERMS = [
    'bead',
    'brain',
    'chant',
    'corvus',
    'estate',
    'evolve',
    'forge',
    'hall',
    'kernel',
    'matrix',
    'pennyone',
    'plan',
    'repo',
    'repository',
    'ravens',
    'search',
    'skill',
    'spoke',
    'system',
    'topology',
    'tui',
    'validation',
];

export interface IntentCategoryMatch {
    category: string;
    default_path: string;
    tier: string;
    matched_trigger: string;
}

export const INTENT_CATEGORIES: Record<string, {
    triggers: string[];
    default_path: string;
    tier: string;
}> = {
    REPAIR:      { triggers: ['fix', 'repair', 'heal', 'restore', 'broken', 'failing', 'bug'], default_path: 'restoration', tier: 'WEAVE' },
    BUILD:       { triggers: ['build', 'create', 'scaffold', 'implement', 'new', 'add', 'feature'], default_path: 'creation_loop', tier: 'WEAVE' },
    VERIFY:      { triggers: ['test', 'verify', 'validate', 'check', 'assert', 'spec'], default_path: 'empire', tier: 'SKILL' },
    SCORE:       { triggers: ['score', 'grade', 'rate', 'audit', 'quality', 'gungnir'], default_path: 'calculus', tier: 'PRIME' },
    OBSERVE:     { triggers: ['scan', 'search', 'find', 'query', 'status', 'health', 'look', 'show'], default_path: 'scan', tier: 'PRIME' },
    HARDEN:      { triggers: ['contract', 'comply', 'sterling', 'harden', 'gherkin'], default_path: 'contract_hardening', tier: 'WEAVE' },
    EXPAND:      { triggers: ['deploy', 'link', 'mount', 'spoke', 'onboard'], default_path: 'expansion', tier: 'WEAVE' },
    EVOLVE:      { triggers: ['optimize', 'refactor', 'evolve', 'improve'], default_path: 'evolve', tier: 'WEAVE' },
    ORCHESTRATE: { triggers: ['plan', 'dispatch', 'autobot', 'orchestrate'], default_path: 'orchestrate', tier: 'WEAVE' },
    GUARD:       { triggers: ['protect', 'shield', 'lock', 'guard', 'drift'], default_path: 'silver_shield', tier: 'SPELL' },
    DOCUMENT:    { triggers: ['document', 'explain', 'chronicle', 'architecture'], default_path: 'living_architecture', tier: 'WEAVE' },
};

export const deps = {
    fs: Object.assign({}, fs),
    path: Object.assign({}, path),
};

export function tokenize(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export function normalizeIntent(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
}

export function hasAnyToken(tokens: string[], values: string[]): boolean {
    return values.some((value) => tokens.includes(value));
}

export function loadSkillTriggers(projectRoot: string): Set<string> {
    const manifestPath = deps.path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!deps.fs.existsSync(manifestPath)) {
        return new Set();
    }

    try {
        const manifest = JSON.parse(deps.fs.readFileSync(manifestPath, 'utf-8')) as {
            entries?: Record<string, unknown>;
        };
        return new Set(Object.keys(manifest.entries ?? {}).map((entry) => entry.toLowerCase()));
    } catch {
        return new Set();
    }
}

/**
 * Classifies a query into one of the 11 Intent Categories using the closed grammar.
 * Returns null if no category matches (agent must ask user to clarify).
 */
export function resolveIntentCategory(lowerTokens: string[]): IntentCategoryMatch | null {
    for (const [category, config] of Object.entries(INTENT_CATEGORIES)) {
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

export function resolveByIntentCategory(
    lowerTokens: string[],
    payload: ChantWeavePayload,
): DirectChantResolution | null {
    const match = resolveIntentCategory(lowerTokens);
    if (!match) {
        return null;
    }

    // WEAVEs should bypass the dynamic-command adapter and trigger the specific weave ID directly
    if (match.tier === 'WEAVE') {
        return {
            kind: 'weave',
            trigger: match.default_path,
            invocation: {
                weave_id: `weave:${match.default_path}`,
                payload: {} as any, // Most weaves will take the current context
            },
            summary: `Intent category '${match.category}' matched on '${match.matched_trigger}'. Routing directly to weave '${match.default_path}'.`,
        };
    }

    // SKILLs and PRIMEs use the dynamic command adapter
    return {
        kind: 'weave',
        trigger: match.default_path,
        invocation: buildDynamicSkillInvocation(
            match.default_path,
            [],
            payload.project_root,
            payload.cwd,
        ),
        summary: `Intent category '${match.category}' matched on '${match.matched_trigger}'. Routing to skill '${match.default_path}'.`,
    };
}

export function buildDynamicSkillInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string,
): WeaveInvocation<{ command: string; args: string[]; project_root: string; cwd: string }> {
    return {
        weave_id: 'weave:dynamic-command',
        payload: {
            command,
            args,
            project_root: projectRoot,
            cwd,
        },
    };
}

export function resolveBuiltInWeave(
    lowerTokens: string[],
    payload: ChantWeavePayload,
    normalizedIntent: string,
): DirectChantResolution | null {
    const [head, second, ...rest] = lowerTokens;

    if (head === 'ravens') {
        const action = second === 'start' || second === 'stop' || second === 'status' || second === 'cycle' || second === 'sweep'
            ? second
            : 'status';
        return {
            kind: 'weave',
            trigger: 'ravens',
            invocation: {
                weave_id: 'weave:ravens',
                payload: {
                    action,
                    shadow_forge: rest.includes('--shadow-forge'),
                },
            },
            summary: `Resolved chant to ravens lifecycle action '${action}'.`,
        };
    }

    if (
        lowerTokens.includes('ravens') &&
        (hasAnyToken(lowerTokens, ['release', 'fly', 'sweep', 'status', 'cycle', 'start', 'stop']) ||
            /\brelease the ravens\b/i.test(normalizedIntent))
    ) {
        let action: 'start' | 'stop' | 'status' | 'cycle' | 'sweep' = 'cycle';
        if (lowerTokens.includes('status')) {
            action = 'status';
        } else if (lowerTokens.includes('stop')) {
            action = 'stop';
        } else if (lowerTokens.includes('start')) {
            action = 'start';
        } else if (hasAnyToken(lowerTokens, ['sweep', 'estate', 'spokes', 'repos', 'repositories', 'all'])) {
            action = 'sweep';
        }

        return {
            kind: 'weave',
            trigger: 'ravens',
            invocation: {
                weave_id: 'weave:ravens',
                payload: {
                    action,
                    shadow_forge: lowerTokens.includes('shadow-forge'),
                },
            },
            summary: `Resolved chant to natural-language ravens action '${action}'.`,
        };
    }

    if (head === 'scan' || (head === 'pennyone' && (second === undefined || second === 'scan'))) {
        return {
            kind: 'weave',
            trigger: 'pennyone',
            invocation: {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'scan',
                    path: '.',
                },
            },
            summary: 'Resolved chant to PennyOne repository scan.',
        };
    }

    if (
        (lowerTokens.includes('pennyone') || lowerTokens.includes('matrix')) &&
        hasAnyToken(lowerTokens, ['scan', 'search', 'view'])
    ) {
        const action = lowerTokens.includes('search') ? 'search' : lowerTokens.includes('view') ? 'view' : 'scan';
        const queryIndex = lowerTokens.indexOf('search');
        return {
            kind: 'weave',
            trigger: 'pennyone',
            invocation: {
                weave_id: 'weave:pennyone',
                payload: {
                    action,
                    path: '.',
                    query: queryIndex >= 0 ? tokenize(normalizedIntent).slice(queryIndex + 1).join(' ') : undefined,
                },
            },
            summary: `Resolved chant to PennyOne ${action}.`,
        };
    }

    if (head === 'start' || (lowerTokens.includes('corvus') && lowerTokens.includes('start'))) {
        return {
            kind: 'weave',
            trigger: 'start',
            invocation: {
                weave_id: 'weave:start',
                payload: {
                    target: undefined,
                    task: payload.query,
                    ledger: deps.path.join(payload.project_root, '.agents', 'ledger'),
                },
            },
            summary: 'Resolved chant to runtime start weave.',
        };
    }

    return null;
}

export function resolveSkillInvocation(
    tokens: string[],
    payload: ChantWeavePayload,
    skills: Set<string>
): DirectChantResolution | null {
    const lowerTokens = tokens.map((token) => token.toLowerCase());
    const lead = lowerTokens[0] ?? '';
    const candidate = CONTROL_WORDS.has(lead) ? lowerTokens[1] ?? '' : lead;
    const originalArgs = CONTROL_WORDS.has(lead) ? tokens.slice(2) : tokens.slice(1);

    if (candidate && skills.has(candidate) && candidate !== 'chant') {
        return {
            kind: 'skill',
            trigger: candidate,
            invocation: buildDynamicSkillInvocation(candidate, originalArgs, payload.project_root, payload.cwd),
            summary: `Resolved chant to skill '${candidate}'.`,
        };
    }

    if (CONTROL_WORDS.has(lead) && candidate) {
        return {
            kind: 'missing_capability',
            trigger: candidate,
            summary: `The requested capability '${candidate}' is not installed in the authoritative skill registry.`,
        };
    }

    for (const token of lowerTokens) {
        if (skills.has(token) && token !== 'chant') {
            return {
                kind: 'skill',
                trigger: token,
                invocation: buildDynamicSkillInvocation(token, [], payload.project_root, payload.cwd),
                summary: `Resolved chant to inline skill '${token}'.`,
            };
        }
    }

    return null;
}
