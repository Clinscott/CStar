export interface IntentGrammarEntry {
    triggers: string[];
    default_path: string;
    tier: string;
}

export interface IntentCategoryEvidence {
    category: string;
    default_path: string;
    tier: string;
    matched_trigger: string;
    matched_triggers: string[];
    match_count: number;
    effective_score: number;
    suppressed: boolean;
    suppression_reasons: string[];
}

export interface CanonicalIntentAnalysis {
    primary: IntentCategoryEvidence | null;
    matches: IntentCategoryEvidence[];
    tokens: string[];
    inferred_category_hint: string | null;
    negations_detected: string[];
}

const CATEGORY_PRIORITY = [
    'REPAIR',
    'HARDEN',
    'BUILD',
    'EVOLVE',
    'VERIFY',
    'ORCHESTRATE',
    'GUARD',
    'DOCUMENT',
    'OBSERVE',
    'EXPAND',
    'SCORE',
];

export function normalizeIntentText(value: string): string {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenizeIntent(value: string): string[] {
    const normalized = normalizeIntentText(value);
    return normalized ? normalized.split(' ') : [];
}

function triggerTokenForms(trigger: string): Set<string> {
    if (trigger.length < 3) return new Set([trigger]);
    const forms = new Set([
        trigger,
        `${trigger}s`,
        `${trigger}es`,
        `${trigger}ed`,
        `${trigger}ing`,
        ...(trigger.endsWith('e') ? [`${trigger.slice(0, -1)}ing`] : []),
    ]);
    if (trigger.length <= 5 && /[^aeiou][aeiou][^aeiouwxy]$/.test(trigger)) {
        const finalConsonant = trigger.at(-1)!;
        forms.add(`${trigger}${finalConsonant}ed`);
        forms.add(`${trigger}${finalConsonant}ing`);
    }
    return forms;
}

function tokenMatchesTrigger(token: string, trigger: string): boolean {
    if (token === trigger) return true;
    if (trigger.length < 3) return false;
    return triggerTokenForms(trigger).has(token);
}

function triggerMatches(tokens: string[], normalizedText: string, trigger: string): boolean {
    const normalizedTrigger = normalizeIntentText(trigger);
    if (!normalizedTrigger) return false;
    if (normalizedTrigger.includes(' ')) {
        return ` ${normalizedText} `.includes(` ${normalizedTrigger} `);
    }
    return tokens.some((token) => tokenMatchesTrigger(token, normalizedTrigger));
}

function categoryPriority(category: string): number {
    const index = CATEGORY_PRIORITY.indexOf(category.toUpperCase());
    return index < 0 ? CATEGORY_PRIORITY.length : index;
}

function exactInferredCategoryHint(
    inferredIntent: string | undefined,
    grammar: Record<string, IntentGrammarEntry>,
): string | null {
    const normalized = normalizeIntentText(inferredIntent ?? '');
    const match = /^(?:intent category )?([a-z0-9_-]+)$/.exec(normalized);
    if (!match) return null;
    const requested = match[1].toUpperCase();
    return Object.keys(grammar).find((category) => category.toUpperCase() === requested) ?? null;
}

function triggerNegation(normalizedPrompt: string, trigger: string): string | null {
    const normalizedTrigger = normalizeIntentText(trigger);
    if (!normalizedTrigger) return null;
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const triggerPattern = normalizedTrigger.includes(' ')
        ? escapeRegex(normalizedTrigger).replace(/\s+/g, '\\s+')
        : [...triggerTokenForms(normalizedTrigger)]
            .sort((left, right) => right.length - left.length)
            .map(escapeRegex)
            .join('|');
    const pattern = new RegExp(`\\b(?:do\\s+not|dont|never|avoid|exclude|without|no|not)\\b(?:\\s+\\w+){0,3}\\s+(?:${triggerPattern})\\b`);
    return normalizedPrompt.match(pattern)?.[0] ?? null;
}

export function analyzeCanonicalIntent({
    prompt,
    inferred_intent,
    grammar,
}: {
    prompt: string;
    inferred_intent?: string;
    grammar: Record<string, IntentGrammarEntry>;
}): CanonicalIntentAnalysis {
    const normalizedPrompt = normalizeIntentText(prompt);
    const tokens = tokenizeIntent(prompt);
    const negations: string[] = [];
    const inferredHint = exactInferredCategoryHint(inferred_intent, grammar);
    const rawMatches: IntentCategoryEvidence[] = [];

    for (const [category, config] of Object.entries(grammar)) {
        const matchedTriggers = [...new Set(
            config.triggers
                .map(normalizeIntentText)
                .filter((trigger) => triggerMatches(tokens, normalizedPrompt, trigger)),
        )];
        if (matchedTriggers.length === 0) continue;
        const negatedTriggers = matchedTriggers.filter((trigger) => {
            const negation = triggerNegation(normalizedPrompt, trigger);
            if (negation) negations.push(negation);
            return Boolean(negation);
        });
        const positiveTriggers = matchedTriggers.filter((trigger) => !negatedTriggers.includes(trigger));
        rawMatches.push({
            category,
            default_path: config.default_path,
            tier: config.tier,
            matched_trigger: positiveTriggers[0] ?? matchedTriggers[0],
            matched_triggers: matchedTriggers,
            match_count: matchedTriggers.length,
            effective_score: positiveTriggers.length,
            suppressed: positiveTriggers.length === 0,
            suppression_reasons: negatedTriggers.length > 0
                ? [`category_triggers_explicitly_negated:${negatedTriggers.join(',')}`]
                : [],
        });
    }

    const matches = rawMatches;

    const candidates = matches.filter((match) => match.effective_score > 0);
    candidates.sort((left, right) =>
        right.effective_score - left.effective_score
        || categoryPriority(left.category) - categoryPriority(right.category)
        || left.category.localeCompare(right.category),
    );

    let primary = candidates[0] ?? null;
    const inferredHintExplicitlyNegated = matches.some((match) => match.category === inferredHint && match.suppressed);
    if (!primary && inferredHint && !inferredHintExplicitlyNegated) {
        const config = grammar[inferredHint];
        primary = {
            category: inferredHint,
            default_path: config.default_path,
            tier: config.tier,
            matched_trigger: inferredHint.toLowerCase(),
            matched_triggers: [inferredHint.toLowerCase()],
            match_count: 1,
            effective_score: 1,
            suppressed: false,
            suppression_reasons: ['exact_inferred_category_hint'],
        };
    } else if (primary && inferredHint) {
        const tied = candidates.filter((match) => match.effective_score === primary!.effective_score);
        primary = tied.find((match) => match.category === inferredHint) ?? primary;
    }

    return {
        primary,
        matches: [...matches].sort((left, right) =>
            right.effective_score - left.effective_score
            || categoryPriority(left.category) - categoryPriority(right.category)
            || left.category.localeCompare(right.category),
        ),
        tokens,
        inferred_category_hint: inferredHint,
        negations_detected: [...new Set(negations)],
    };
}
