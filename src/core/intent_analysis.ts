// src/core/intent_analysis.ts
//
// Canonical, deterministic intent analyzer used by both cstar_intent_route
// (public MCP) and the Augury deterministic resolver. One source of truth so
// a compound audit-and-repair mission cannot be misclassified as a pure
// scoring task (and so the public route agrees with the Augury route).
//
// Contract:
//   - Normalize case and punctuation consistently.
//   - Count each distinct matched trigger once; repetition and duplicated
//     prose cannot amplify a category.
//   - Bare "audit" and "quality" are weak SCORE evidence. Explicit repair,
//     fix, harden, build, evolve, or restoration triggers outrank weak SCORE.
//   - Explicit negation of scoring language demotes SCORE so the opposite
//     outcome (e.g. REPAIR) wins.
//   - Prompt is primary. inferred_intent may contribute only an exact
//     category hint or a deterministic tie-break; it must not change the
//     winner the prompt alone produced.
//   - Pure SCORE-only inputs (no repair/build/evolve language) still resolve
//     to SCORE — the weak-evidence rule only demotes SCORE when a stronger
//     non-SCORE category is present or scoring is explicitly negated.

import { tokenize } from '../node/core/runtime/host_workflows/chant_parser.js';

// ----- Trigger vocabulary -----
//
// Categories mirror .agents/skill_registry.json intent_grammar. We carry the
// minimum vocabulary needed for canonical disambiguation here so the module
// is self-contained and does not require a registry read at import time.
// The registry is still consulted by the caller for the default_path/tier of
// the winning category; this module only decides WHO WINS.

export type CanonicalIntentCategory =
    | 'REPAIR'
    | 'BUILD'
    | 'VERIFY'
    | 'SCORE'
    | 'OBSERVE'
    | 'HARDEN'
    | 'EXPAND'
    | 'EVOLVE'
    | 'ORCHESTRATE'
    | 'GUARD'
    | 'DOCUMENT';

export interface CanonicalIntentMatch {
    /** Winning intent category. */
    category: CanonicalIntentCategory;
    /** The strongest single trigger that decided the winner. */
    matched_trigger: string;
    /** All distinct triggers that matched the winner (deduped, normalized). */
    matched_triggers: string[];
    /** Number of distinct triggers that matched the winner. */
    match_count: number;
    /** True iff the bare "audit"/"quality" weak-evidence rule applied. */
    score_demoted_by_weak_evidence: boolean;
    /** True iff explicit negation of scoring language demoted SCORE. */
    score_demoted_by_negation: boolean;
    /** True iff inferred_intent acted as a deterministic tie-break. */
    inferred_intent_tiebreak: boolean;
    /** Provenance of the analyzed prompt/inferred_intent pair. */
    provenance: {
        prompt_token_count: number;
        inferred_intent_token_count: number;
        prompt_normalized: string;
        inferred_intent_normalized: string;
    };
}

export interface CanonicalIntentAnalysis {
    match: CanonicalIntentMatch | null;
    /** Per-category distinct-trigger counts after weak-evidence demotion. */
    category_counts: Record<string, number>;
    /** Detected explicit negation cues (informational). */
    negations_detected: string[];
}

// Strong outcome triggers — explicit repair/harden/build/evolve/restoration
// language. Any hit here outranks weak SCORE evidence (bare audit/quality).
const STRONG_REPAIR_TRIGGERS = new Set<string>([
    'repair', 'repaired', 'repairing',
    'fix', 'fixes', 'fixed', 'fixing',
    'heal', 'healed', 'healing',
    'restore', 'restored', 'restoration', 'restoring',
    'broken', 'failing', 'bug', 'bugs', 'regression', 'regressions',
]);

const STRONG_HARDEN_TRIGGERS = new Set<string>([
    'harden', 'hardened', 'hardening',
    'contract', 'contracts', 'compliance', 'comply',
    'gherkin', 'sterling',
]);

const STRONG_BUILD_TRIGGERS = new Set<string>([
    'build', 'builds', 'built', 'building',
    'create', 'creates', 'created', 'creating',
    'scaffold', 'scaffolded', 'scaffolding',
    'implement', 'implements', 'implemented', 'implementing',
    'add', 'added', 'adding',
    'feature', 'features',
]);

const STRONG_EVOLVE_TRIGGERS = new Set<string>([
    'evolve', 'evolved', 'evolving',
    'optimize', 'optimized', 'optimizing',
    'refactor', 'refactored', 'refactoring',
    'improve', 'improved', 'improving',
]);

// Weak SCORE evidence — bare "audit"/"quality" without an explicit repair
// outcome. These cannot beat explicit repair/harden/build/evolve.
const WEAK_SCORE_TRIGGERS = new Set<string>([
    'audit', 'audits', 'audited', 'auditing',
    'quality', 'qualities',
]);

// Strong SCORE triggers — explicit grading/rating/benchmarking language.
const STRONG_SCORE_TRIGGERS = new Set<string>([
    'score', 'scores', 'scored', 'scoring',
    'grade', 'grades', 'graded', 'grading',
    'rate', 'rates', 'rated', 'rating',
    'rank', 'ranks', 'ranked', 'ranking',
    'benchmark', 'benchmarks', 'benchmarked', 'benchmarking',
    'gungnir', 'metric', 'metrics',
]);

const VERIFY_TRIGGERS = new Set<string>([
    'test', 'tests', 'tested', 'testing',
    'verify', 'verifies', 'verified', 'verifying',
    'validate', 'validates', 'validated', 'validating',
    'check', 'checks', 'checked', 'checking',
    'assert', 'asserts', 'asserted',
    'spec', 'specs',
]);

const OBSERVE_TRIGGERS = new Set<string>([
    'scan', 'scans', 'scanned', 'scanning',
    'search', 'searches', 'searched', 'searching',
    'find', 'finds', 'found',
    'query', 'queries', 'queried',
    'status', 'health', 'look', 'looks', 'looked',
    'show', 'shows', 'showed', 'showing',
]);

const EXPAND_TRIGGERS = new Set<string>([
    'deploy', 'deploys', 'deployed', 'deploying',
    'link', 'links', 'linked', 'linking',
    'mount', 'mounts', 'mounted', 'mounting',
    'spoke', 'spokes',
    'onboard', 'onboards', 'onboarded', 'onboarding',
]);

const ORCHESTRATE_TRIGGERS = new Set<string>([
    'plan', 'plans', 'planned', 'planning',
    'dispatch', 'dispatches', 'dispatched',
    'orchestrate', 'orchestrates', 'orchestrated',
]);

const GUARD_TRIGGERS = new Set<string>([
    'protect', 'protects', 'protected',
    'shield', 'shields', 'shielded',
    'lock', 'locks', 'locked',
    'guard', 'guards',
    'drift',
]);

const DOCUMENT_TRIGGERS = new Set<string>([
    'document', 'documents', 'documented',
    'explain', 'explains', 'explained',
    'chronicle', 'chronicles', 'chronicled',
    'architecture',
]);

// Explicit negation cues that target scoring language. A negation in the
// prompt demotes SCORE regardless of weak-vs-strong score evidence.
const SCORE_NEGATION_CUES = [
    'not a scoring task',
    'not a score task',
    'not a scoring mission',
    'not scoring',
    'not about scoring',
    'isn\u2019t a scoring task',
    'isnt a scoring task',
    "isn't a scoring task",
    'no scoring',
    'without scoring',
    'not grade',
    'not grades',
    'not grading',
    'not rank',
    'not ranking',
];

// ----- Normalization -----

/**
 * Lowercase the input and strip punctuation to a single space. Whitespace
 * collapse is handled by the downstream tokenizer; we only guarantee a
 * deterministic character class so "Audit,", "audit.", and "AUDIT" tokenize
 * identically.
 */
export function normalizeIntentText(input: string): string {
    if (input == null) return '';
    return String(input)
        .toLowerCase()
        .replace(/[\u2010-\u2015\u2018\u2019\u201c\u201d\u2026\u00b6'`"]/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// ----- Core analysis -----

/**
 * Compute per-category distinct-trigger counts from a token bag. Repetition
 * and duplicated prose cannot amplify a category: a token that matches
 * multiple triggers still contributes at most once per trigger.
 */
function countCategoryHits(
    tokens: string[],
    triggersByCategory: Record<CanonicalIntentCategory, Set<string>>,
): Record<string, { matched: Set<string>; strong: boolean; weak: boolean }> {
    const result: Record<string, { matched: Set<string>; strong: boolean; weak: boolean }> = {};
    for (const category of Object.keys(triggersByCategory) as CanonicalIntentCategory[]) {
        result[category] = { matched: new Set<string>(), strong: false, weak: false };
        const triggers = triggersByCategory[category];
        for (const token of tokens) {
            if (triggers.has(token)) {
                result[category].matched.add(token);
                // Determine strong-vs-weak from per-category split.
                if (category === 'SCORE') {
                    if (STRONG_SCORE_TRIGGERS.has(token)) result[category].strong = true;
                    if (WEAK_SCORE_TRIGGERS.has(token)) result[category].weak = true;
                } else {
                    result[category].strong = true;
                }
            }
        }
    }
    return result;
}

/**
 * Detect explicit negation of scoring language in the (normalized) prompt.
 */
function detectScoreNegation(normalizedPrompt: string): string[] {
    const hits: string[] = [];
    for (const cue of SCORE_NEGATION_CUES) {
        if (normalizedPrompt.includes(cue)) hits.push(cue);
    }
    return hits;
}

/**
 * Priority order for tie-breaking between non-SCORE categories when more
 * than one has the same distinct-trigger count.
 *
 * Order is intentional: REPAIR outranks HARDEN/EVOLVE because compound
 * "audit and repair" missions are REPAIR-first; HARDEN outranks BUILD;
 * BUILD outranks EVOLVE; EVOLVE outranks VERIFY/OBSERVE.
 */
const NON_SCORE_PRIORITY: CanonicalIntentCategory[] = [
    'REPAIR',
    'HARDEN',
    'BUILD',
    'EVOLVE',
    'VERIFY',
    'OBSERVE',
    'EXPAND',
    'ORCHESTRATE',
    'GUARD',
    'DOCUMENT',
];

function priorityRank(category: CanonicalIntentCategory): number {
    const idx = NON_SCORE_PRIORITY.indexOf(category);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

// ----- Public API -----

/**
 * Analyze a prompt (+ optional inferred_intent) and return the canonical
 * winning intent category. Deterministic, side-effect-free.
 *
 * Rules (in order):
 *   1. Normalize case + punctuation for both prompt and inferred_intent.
 *   2. Count each distinct trigger once per category. Repeated prose and
 *      duplicated language cannot amplify a category.
 *   3. If SCORE matches only weak evidence (bare audit/quality) AND a
 *      non-SCORE category has any distinct trigger, demote SCORE — the
 *      non-SCORE category wins.
 *   4. If the prompt contains explicit negation of scoring language, demote
 *      SCORE — the strongest non-SCORE category wins.
 *   5. Among remaining categories, pick the highest distinct-trigger count.
 *   6. Tie-break by NON_SCORE_PRIORITY (REPAIR first), then by the first
 *      trigger that matched.
 *   7. inferred_intent may contribute an exact category hint when the
 *      prompt produced zero hits (so it can rescue UNRESOLVED). When the
 *      prompt already produced a winner, inferred_intent can only act as a
 *      deterministic tie-break (same priority order) — it MUST NOT amplify
 *      or change the winner.
 */
export function analyzeCanonicalIntent(params: {
    prompt: string;
    inferred_intent?: string;
}): CanonicalIntentAnalysis {
    const promptRaw = params.prompt ?? '';
    const inferredRaw = params.inferred_intent ?? '';
    const promptNormalized = normalizeIntentText(promptRaw);
    const inferredNormalized = normalizeIntentText(inferredRaw);

    const promptTokens = tokenize(promptNormalized);
    const inferredTokens = tokenize(inferredNormalized);

    const triggersByCategory: Record<CanonicalIntentCategory, Set<string>> = {
        REPAIR: STRONG_REPAIR_TRIGGERS,
        BUILD: STRONG_BUILD_TRIGGERS,
        VERIFY: VERIFY_TRIGGERS,
        SCORE: new Set<string>([...STRONG_SCORE_TRIGGERS, ...WEAK_SCORE_TRIGGERS]),
        OBSERVE: OBSERVE_TRIGGERS,
        HARDEN: STRONG_HARDEN_TRIGGERS,
        EXPAND: EXPAND_TRIGGERS,
        EVOLVE: STRONG_EVOLVE_TRIGGERS,
        ORCHESTRATE: ORCHESTRATE_TRIGGERS,
        GUARD: GUARD_TRIGGERS,
        DOCUMENT: DOCUMENT_TRIGGERS,
    };

    const negationsDetected = detectScoreNegation(promptNormalized);
    const promptCounts = countCategoryHits(promptTokens, triggersByCategory);
    const inferredCounts = countCategoryHits(inferredTokens, triggersByCategory);

    const categoryCounts: Record<string, number> = {};
    for (const category of Object.keys(promptCounts)) {
        categoryCounts[category] = promptCounts[category].matched.size;
    }

    // Build the working set of categories with their post-demotion counts.
    type Working = { category: CanonicalIntentCategory; count: number; matched: string[]; firstTrigger: string };
    const working: Working[] = [];

    for (const category of Object.keys(promptCounts) as CanonicalIntentCategory[]) {
        const info = promptCounts[category];
        if (info.matched.size === 0) continue;

        let effectiveCount = info.matched.size;
        let demotedWeak = false;
        let demotedNegation = false;

        if (category === 'SCORE') {
            const hasNonScore = (Object.keys(promptCounts) as CanonicalIntentCategory[])
                .some((c) => c !== 'SCORE' && promptCounts[c].matched.size > 0);
            if (info.weak && !info.strong && hasNonScore) {
                // Bare audit/quality cannot beat an explicit non-SCORE outcome.
                effectiveCount = 0;
                demotedWeak = true;
            }
            if (negationsDetected.length > 0) {
                effectiveCount = 0;
                demotedNegation = true;
            }
        }

        if (effectiveCount === 0) continue;

        const matchedList = Array.from(info.matched).sort();
        working.push({
            category,
            count: effectiveCount,
            matched: matchedList,
            firstTrigger: matchedList[0],
        });
        // Stash demotion flags for the eventual winner record.
        (working[working.length - 1] as Working & { _demotedWeak?: boolean; _demotedNegation?: boolean })._demotedWeak = demotedWeak;
        (working[working.length - 1] as Working & { _demotedWeak?: boolean; _demotedNegation?: boolean })._demotedNegation = demotedNegation;
    }

    let winner: Working | null = null;
    let inferredIntentTiebreak = false;

    if (working.length === 0) {
        // Prompt produced no hits. inferred_intent may contribute a single
        // exact category hint (one category, one trigger). This is the only
        // path where inferred_intent can pick the winner outright.
        const inferredCategory = pickSingleExactCategoryHint(inferredTokens);
        if (inferredCategory) {
            const info = inferredCounts[inferredCategory];
            const matchedList = Array.from(info.matched).sort();
            winner = {
                category: inferredCategory,
                count: info.matched.size,
                matched: matchedList,
                firstTrigger: matchedList[0],
            };
            inferredIntentTiebreak = true;
        }
    } else {
        // Determine the max count.
        const maxCount = Math.max(...working.map((w) => w.count));
        const topTier = working.filter((w) => w.count === maxCount);
        if (topTier.length === 1) {
            winner = topTier[0];
        } else {
            // Tie-break: NON_SCORE_PRIORITY order.
            topTier.sort((a, b) => priorityRank(a.category) - priorityRank(b.category));
            const leader = topTier[0];
            // inferred_intent tie-break: only when its single-category hint
            // is among the tied leaders AND its count does not exceed the
            // prompt-derived count (so it cannot amplify).
            const inferredHint = pickSingleExactCategoryHint(inferredTokens);
            const inferredCandidate = inferredHint
                ? topTier.find((w) => w.category === inferredHint)
                : undefined;
            if (inferredCandidate && inferredCandidate.count <= leader.count) {
                winner = inferredCandidate;
                inferredIntentTiebreak = true;
            } else {
                winner = leader;
            }
        }
    }

    if (!winner) {
        return {
            match: null,
            category_counts: categoryCounts,
            negations_detected: negationsDetected,
        };
    }

    const demotedWeak = Boolean((winner as Working & { _demotedWeak?: boolean })._demotedWeak);
    const demotedNegation = Boolean((winner as Working & { _demotedNegation?: boolean })._demotedNegation);

    return {
        match: {
            category: winner.category,
            matched_trigger: winner.firstTrigger,
            matched_triggers: winner.matched,
            match_count: winner.matched.length,
            score_demoted_by_weak_evidence: demotedWeak,
            score_demoted_by_negation: demotedNegation,
            inferred_intent_tiebreak: inferredIntentTiebreak,
            provenance: {
                prompt_token_count: promptTokens.length,
                inferred_intent_token_count: inferredTokens.length,
                prompt_normalized: promptNormalized,
                inferred_intent_normalized: inferredNormalized,
            },
        },
        category_counts: categoryCounts,
        negations_detected: negationsDetected,
    };
}

/**
 * Pick a single canonical category from inferred_intent when EXACTLY one
 * category's vocabulary is present in the inferred_intent tokens. Returns
 * null otherwise (so inferred_intent cannot steer the winner unless it
 * points unambiguously at one category).
 */
function pickSingleExactCategoryHint(
    inferredTokens: string[],
): CanonicalIntentCategory | null {
    if (inferredTokens.length === 0) return null;
    const triggersByCategory: Record<CanonicalIntentCategory, Set<string>> = {
        REPAIR: STRONG_REPAIR_TRIGGERS,
        BUILD: STRONG_BUILD_TRIGGERS,
        VERIFY: VERIFY_TRIGGERS,
        SCORE: new Set<string>([...STRONG_SCORE_TRIGGERS, ...WEAK_SCORE_TRIGGERS]),
        OBSERVE: OBSERVE_TRIGGERS,
        HARDEN: STRONG_HARDEN_TRIGGERS,
        EXPAND: EXPAND_TRIGGERS,
        EVOLVE: STRONG_EVOLVE_TRIGGERS,
        ORCHESTRATE: ORCHESTRATE_TRIGGERS,
        GUARD: GUARD_TRIGGERS,
        DOCUMENT: DOCUMENT_TRIGGERS,
    };

    const matchedCategories = new Set<CanonicalIntentCategory>();
    for (const category of Object.keys(triggersByCategory) as CanonicalIntentCategory[]) {
        const triggers = triggersByCategory[category];
        for (const token of inferredTokens) {
            if (triggers.has(token)) {
                matchedCategories.add(category);
                break;
            }
        }
    }

    if (matchedCategories.size !== 1) return null;
    return Array.from(matchedCategories)[0];
}
