import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
    WeaveInvocation,
    ChantWeavePayload,
} from '../contracts.ts';
import type { SkillBead } from '../../skills/types.js';

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

export interface ParsedTraceSelectionGate {
    raw_block: string;
    intent_category?: string;
    intent?: string;
    selection_tier?: string;
    selection_name?: string;
    trajectory_status?: string;
    trajectory_reason?: string;
    mimirs_well: string[];
    gungnir_verdict?: string;
    confidence?: number;
    body?: string;
    canonical_intent: string;
    issues: string[];
}

export interface TraceSelectionGateValidation {
    valid: boolean;
    errors: string[];
    trace: ParsedTraceSelectionGate | null;
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

export const TRACE_SELECTION_HEADER = '// Corvus Star Trace [Ω]';

const TRACE_SELECTION_REQUIRED_FIELDS = [
    'Intent Category',
    'Intent',
    'Selection',
    'Trajectory',
    'Mimir\'s Well',
    'Gungnir Verdict',
    'Confidence',
] as const;

export const deps = {
    fs: Object.assign({}, fs),
    path: Object.assign({}, path),
};

export function loadRegistryManifest(projectRoot: string): RegistryManifest | null {
    const manifestPath = deps.path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!deps.fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        return JSON.parse(deps.fs.readFileSync(manifestPath, 'utf-8')) as RegistryManifest;
    } catch {
        return null;
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

export function getRegistryIntentCategories(
    manifest: RegistryManifest | null,
): Record<string, { triggers: string[]; default_path: string; tier: string }> {
    if (!manifest?.intent_grammar || typeof manifest.intent_grammar !== 'object') {
        return INTENT_CATEGORIES;
    }

    const normalized: Record<string, { triggers: string[]; default_path: string; tier: string }> = {};
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

export function tokenize(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function compactTraceText(value: string | undefined): string | undefined {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized || undefined;
}

function splitTraceHeader(lines: string[]): { headerLines: string[]; bodyLines: string[] } {
    const headerLines: string[] = [lines[0] ?? ''];
    let bodyStart = lines.length;

    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmed = line.trim();

        if (!trimmed) {
            headerLines.push(line);
            bodyStart = index + 1;
            break;
        }

        if (/^[A-Za-z' ]+:\s/.test(line)) {
            headerLines.push(line);
            continue;
        }

        bodyStart = index;
        break;
    }

    return {
        headerLines,
        bodyLines: lines.slice(bodyStart),
    };
}

function parseTraceSelectionDirective(value: string | undefined): {
    tier?: string;
    name?: string;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return { error: 'Selection is missing.' };
    }

    const match = trimmed.match(/^(SKILL|WEAVE|SPELL|PRIME)\s*:\s*(.+)$/i);
    if (!match) {
        return { error: 'Selection must follow "<TIER>: <name>".' };
    }

    const selectionName = compactTraceText(match[2]);
    if (!selectionName) {
        return { error: 'Selection path is missing.' };
    }

    return {
        tier: match[1].toUpperCase(),
        name: selectionName,
    };
}

function parseTraceTrajectory(value: string | undefined): {
    status?: string;
    reason?: string;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return { error: 'Trajectory is missing.' };
    }

    const match = trimmed.match(/^(STABLE|OSCILLATING|FAILED)\s*:\s*(.+)$/i);
    if (!match) {
        return { error: 'Trajectory must follow "<STATE>: <reason>".' };
    }

    const reason = compactTraceText(match[2]);
    if (!reason) {
        return { error: 'Trajectory reason is missing.' };
    }

    return {
        status: match[1].toUpperCase(),
        reason,
    };
}

function parseTraceConfidence(value: string | undefined): {
    confidence?: number;
    error?: string;
} {
    const trimmed = compactTraceText(value);
    if (!trimmed) {
        return { error: 'Confidence is missing.' };
    }

    const confidence = Number(trimmed);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return { error: 'Confidence must be a number between 0.0 and 1.0.' };
    }

    return { confidence };
}

export function parseTraceSelectionGate(query: string): ParsedTraceSelectionGate | null {
    const trimmed = query.trim();
    if (!trimmed.startsWith(TRACE_SELECTION_HEADER)) {
        return null;
    }

    const lines = trimmed.split(/\r?\n/);
    const { headerLines, bodyLines } = splitTraceHeader(lines);
    const fieldValues: Record<string, string> = {};

    for (const line of headerLines.slice(1)) {
        const match = line.match(/^([A-Za-z' ]+):\s*(.*)$/);
        if (!match) {
            continue;
        }
        fieldValues[match[1].trim()] = match[2] ?? '';
    }

    const issues: string[] = [];
    for (const field of TRACE_SELECTION_REQUIRED_FIELDS) {
        if (!compactTraceText(fieldValues[field])) {
            issues.push(`Missing ${field}.`);
        }
    }

    const intentCategory = compactTraceText(fieldValues['Intent Category']);
    if (intentCategory && !INTENT_CATEGORIES[intentCategory.toUpperCase()]) {
        issues.push(`Intent Category '${intentCategory}' is not in the closed grammar.`);
    }

    const selection = parseTraceSelectionDirective(fieldValues.Selection);
    if (selection.error) {
        issues.push(selection.error);
    }

    const trajectory = parseTraceTrajectory(fieldValues.Trajectory);
    if (trajectory.error) {
        issues.push(trajectory.error);
    }

    const mimirsWell = compactTraceText(fieldValues["Mimir's Well"])
        ? compactTraceText(fieldValues["Mimir's Well"])!
            .split('|')
            .map((entry) => entry.replace(/^\s*◈\s*/, '').trim())
            .filter(Boolean)
        : [];
    if (compactTraceText(fieldValues["Mimir's Well"]) && mimirsWell.length === 0) {
        issues.push('Mimir\'s Well must contain at least one source.');
    }

    const confidenceResult = parseTraceConfidence(fieldValues.Confidence);
    if (confidenceResult.error) {
        issues.push(confidenceResult.error);
    }

    const body = compactTraceText(bodyLines.join(' '));
    const intent = compactTraceText(fieldValues.Intent);

    return {
        raw_block: headerLines.join('\n').trimEnd(),
        intent_category: intentCategory?.toUpperCase(),
        intent,
        selection_tier: selection.tier,
        selection_name: selection.name,
        trajectory_status: trajectory.status,
        trajectory_reason: trajectory.reason,
        mimirs_well: mimirsWell,
        gungnir_verdict: compactTraceText(fieldValues['Gungnir Verdict']),
        confidence: confidenceResult.confidence,
        body,
        canonical_intent: body ?? intent ?? '',
        issues,
    };
}

export function validateTraceSelectionGate(query: string): TraceSelectionGateValidation {
    const trace = parseTraceSelectionGate(query);
    if (!trace) {
        return {
            valid: false,
            errors: ['Missing // Corvus Star Trace [Ω] header.'],
            trace: null,
        };
    }

    const errors = trace.issues.filter(Boolean);
    return {
        valid: errors.length === 0,
        errors,
        trace,
    };
}

export function normalizeIntent(query: string): string {
    const trace = parseTraceSelectionGate(query);
    if (trace) {
        return trace.canonical_intent.replace(/\s+/g, ' ').trim();
    }

    return query.trim().replace(/\s+/g, ' ');
}

export function hasAnyToken(tokens: string[], values: string[]): boolean {
    return values.some((value) => tokens.includes(value));
}

export function loadSkillTriggers(projectRoot: string): Set<string> {
    const manifest = loadRegistryManifest(projectRoot);
    return new Set(Object.keys(getRegistryEntries(manifest)).map((entry) => entry.toLowerCase()));
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
    const grammar = getRegistryIntentCategories(loadRegistryManifest(payload.project_root));
    const match = resolveIntentCategoryFromGrammar(lowerTokens, grammar);
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

    // SKILLs and PRIMEs activate as canonical skill beads.
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

export function resolveIntentCategoryFromGrammar(
    lowerTokens: string[],
    grammar: Record<string, { triggers: string[]; default_path: string; tier: string }>,
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
