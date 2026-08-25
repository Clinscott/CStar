import * as path from 'node:path';

import type { ChantWeavePayload, WeaveInvocation } from '../contracts.ts';
import type { SkillBead } from '../../skills/types.js';
import {
    getRegistryEntries,
    getRegistryIntentCategories,
    loadRegistryManifest,
    resolveIntentCategoryFromGrammar,
    type RegistryEntry,
    type RegistryManifest,
} from './chant_intent_grammar.js';

export {
    getRegistryEntries,
    getRegistryIntentCategories,
    INTENT_CATEGORIES,
    loadRegistryManifest,
    loadSkillTriggers,
    resolveIntentCategory,
    resolveIntentCategoryFromGrammar,
} from './chant_intent_grammar.js';
export type {
    IntentCategoryMatch,
    IntentGrammar,
    RegistryEntry,
    RegistryManifest,
} from './chant_intent_grammar.js';
export {
    CORVUS_STAR_AUGURY_HEADER,
    LEGACY_TRACE_SELECTION_HEADER,
    normalizeIntent,
    parseTraceSelectionGate,
    TRACE_SELECTION_HEADER,
    TRACE_SELECTION_HEADERS,
    validateTraceSelectionGate,
} from './chant_trace_parser.js';
export type {
    ParsedTraceSelectionGate,
    TraceSelectionGateValidation,
} from './chant_trace_parser.js';

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
          invocation: SkillBead<Record<string, unknown>>;
          summary: string;
      }
    | {
          kind: 'policy_only';
          trigger: string;
          summary: string;
          spell_classification: string;
      }
    | {
          kind: 'unsupported_host';
          trigger: string;
          summary: string;
          host_support_status: string;
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

export const deps = {
    path: Object.assign({}, path),
};

export function tokenize(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export function hasAnyToken(tokens: string[], values: string[]): boolean {
    return values.some((value) => tokens.includes(value));
}

export function resolveByIntentCategory(
    lowerTokens: string[],
    payload: ChantWeavePayload,
): DirectChantResolution | null {
    const grammar = getRegistryIntentCategories(loadRegistryManifest(payload.project_root));
    const match = resolveIntentCategoryFromGrammar(lowerTokens, grammar);
    if (!match) {
        return null;
    }

    if (match.tier === 'WEAVE') {
        return {
            kind: 'weave',
            trigger: match.default_path,
            invocation: {
                weave_id: `weave:${match.default_path}`,
                payload: {} as any,
            },
            summary: `Intent category '${match.category}' matched on '${match.matched_trigger}'. Routing directly to weave '${match.default_path}'.`,
        };
    }

    return {
        kind: 'skill',
        trigger: match.default_path,
        invocation: buildSkillBeadInvocation(
            match.default_path,
            [],
            payload.project_root,
            payload.cwd,
        ),
        summary: `Intent category '${match.category}' matched on '${match.matched_trigger}'. Routing to skill '${match.default_path}'.`,
    };
}

export function buildSkillBeadInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string,
): SkillBead<Record<string, unknown>> {
    return {
        id: `chant:${command}:${Date.now()}`,
        skill_id: command,
        target_path: projectRoot,
        intent: `Chant activation for ${command}`,
        params: {
            command,
            args,
            project_root: projectRoot,
            cwd,
            source: 'chant',
        },
        status: 'PENDING',
        priority: 1,
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
    skills: Set<string>,
): DirectChantResolution | null {
    const lowerTokens = tokens.map((token) => token.toLowerCase());
    const lead = lowerTokens[0] ?? '';
    const candidate = CONTROL_WORDS.has(lead) ? lowerTokens[1] ?? '' : lead;
    const originalArgs = CONTROL_WORDS.has(lead) ? tokens.slice(2) : tokens.slice(1);

    if (candidate && skills.has(candidate) && candidate !== 'chant') {
        return {
            kind: 'skill',
            trigger: candidate,
            invocation: buildSkillBeadInvocation(candidate, originalArgs, payload.project_root, payload.cwd),
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
                invocation: buildSkillBeadInvocation(token, [], payload.project_root, payload.cwd),
                summary: `Resolved chant to inline skill '${token}'.`,
            };
        }
    }

    return null;
}

export function resolveRegistryInvocation(
    tokens: string[],
    payload: ChantWeavePayload,
    manifest: RegistryManifest | null,
    activeProvider?: string | null,
): DirectChantResolution | null {
    const entries = getRegistryEntries(manifest);
    const lowerTokens = tokens.map((token) => token.toLowerCase());
    const lead = lowerTokens[0] ?? '';
    const candidate = CONTROL_WORDS.has(lead) ? lowerTokens[1] ?? '' : lead;
    const originalArgs = CONTROL_WORDS.has(lead) ? tokens.slice(2) : tokens.slice(1);

    const buildResolution = (trigger: string, entry: RegistryEntry, args: string[]): DirectChantResolution => {
        const tier = String(entry.tier ?? '').toUpperCase();
        const adapterId = typeof entry.execution?.adapter_id === 'string' ? entry.execution.adapter_id : null;
        const spellClassification = String(entry.spell_classification ?? '').trim().toLowerCase() || 'policy-only';
        const hostSupportStatus = activeProvider
            ? String(entry.host_support?.[activeProvider] ?? '').trim().toLowerCase()
            : '';

        if (tier === 'SPELL' && spellClassification !== 'runtime-backed') {
            return {
                kind: 'policy_only',
                trigger,
                spell_classification: spellClassification,
                summary: `Capability '${trigger}' is classified as '${spellClassification}' and cannot execute as a direct runtime command.`,
            };
        }

        if (activeProvider && hostSupportStatus && !['supported', 'native-session', 'exec-bridge'].includes(hostSupportStatus)) {
            return {
                kind: 'unsupported_host',
                trigger,
                host_support_status: hostSupportStatus,
                summary: `Capability '${trigger}' is declared '${hostSupportStatus}' for host provider '${activeProvider}'.`,
            };
        }

        if (tier === 'WEAVE') {
            return {
                kind: 'weave',
                trigger,
                invocation: {
                    weave_id: adapterId ?? `weave:${trigger}`,
                    payload: {} as any,
                },
                summary: `Resolved chant from registry to weave '${trigger}'.`,
            };
        }

        return {
            kind: 'skill',
            trigger,
            invocation: buildSkillBeadInvocation(trigger, args, payload.project_root, payload.cwd),
            summary: `Resolved chant from registry to capability '${trigger}'.`,
        };
    };

    const candidateEntry = candidate ? entries[candidate] ?? entries[candidate.toLowerCase()] : null;
    if (candidate && candidateEntry && candidate !== 'chant') {
        return buildResolution(candidate, candidateEntry, originalArgs);
    }

    if (CONTROL_WORDS.has(lead) && candidate) {
        return {
            kind: 'missing_capability',
            trigger: candidate,
            summary: `The requested capability '${candidate}' is not installed in the authoritative skill registry.`,
        };
    }

    for (const token of lowerTokens) {
        const entry = entries[token];
        if (entry && token !== 'chant') {
            return buildResolution(token, entry, []);
        }
    }

    return null;
}
