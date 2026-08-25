import { CODE_ROOT } from '../contracts/runtime.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    tokenize,
    loadRegistryManifest,
    getRegistryIntentCategories,
    resolveIntentCategoryFromGrammar,
} from '../../../node/core/runtime/host_workflows/chant_parser.js';

// cstar_intent_route — expose the intent grammar dispatcher.
// Deterministic tokenization + table lookup against
// `.agents/skill_registry.json` intent_grammar (falls back to in-code
// INTENT_CATEGORIES when the registry is unreadable).
const MCP_INTENT_PROMPT_MAX = 4096;

export async function handleIntentRoute({
    prompt,
    action,
}: {
    prompt: string;
    action?: 'match' | 'explain';
}): Promise<McpTextResponse> {
    try {
        if (typeof prompt !== 'string' || prompt.trim().length === 0) {
            return textResponse({ error: 'prompt must be a non-empty string' }, true);
        }
        if (prompt.length > MCP_INTENT_PROMPT_MAX) {
            return textResponse(
                { error: `prompt exceeds ${MCP_INTENT_PROMPT_MAX} chars (got ${prompt.length})` },
                true,
            );
        }
        const manifest = loadRegistryManifest(CODE_ROOT);
        const grammarSource: 'registry' | 'fallback' = manifest?.intent_grammar ? 'registry' : 'fallback';
        const grammar = getRegistryIntentCategories(manifest);
        const tokens = tokenize(prompt);

        if (action === 'explain') {
            // Enumerate every category whose triggers intersect the tokens.
            const matches: Array<{
                intent_category: string;
                default_path: string;
                tier: string;
                matched_triggers: string[];
            }> = [];
            const tokenSet = new Set(tokens);
            for (const [category, config] of Object.entries(grammar)) {
                const hits = config.triggers.filter((trigger) => tokenSet.has(trigger));
                if (hits.length > 0) {
                    matches.push({
                        intent_category: category,
                        default_path: config.default_path,
                        tier: config.tier,
                        matched_triggers: hits,
                    });
                }
            }
            return textResponse({
                status: matches.length > 0 ? 'matched' : 'unmatched',
                grammar_source: grammarSource,
                guardrail: matches.length > 0
                    ? mcpGuardrail('allow', 'continue', 'Intent grammar matched one or more categories.')
                    : mcpGuardrail(
                        'caution',
                        'recover',
                        'Intent grammar did not match; use Augury or provide clearer trigger language.',
                        [],
                        ['intent_route'],
                    ),
                next_action: matches.length > 0
                    ? 'Use the matched categories as deterministic routing evidence.'
                    : 'Clarify the prompt or call cstar_augury for host-routed interpretation.',
                tokens: tokens.slice(0, 32),
                match_count: matches.length,
                matches,
            });
        }

        // Default 'match' action — single-winner behavior (first registry hit).
        const match = resolveIntentCategoryFromGrammar(tokens, grammar);
        if (!match) {
            return textResponse({
                status: 'unmatched',
                grammar_source: grammarSource,
                guardrail: mcpGuardrail(
                    'caution',
                    'recover',
                    'Intent grammar did not match; use Augury or provide clearer trigger language.',
                    [],
                    ['intent_route'],
                ),
                next_action: 'Clarify the prompt or call cstar_augury for host-routed interpretation.',
                tokens: tokens.slice(0, 32),
                available_categories: Object.keys(grammar),
            });
        }
        return textResponse({
            status: 'matched',
            grammar_source: grammarSource,
            guardrail: mcpGuardrail('allow', 'continue', 'Intent grammar matched a deterministic route.'),
            next_action: 'Use this route as deterministic evidence; use cstar_augury when host context is needed.',
            intent_category: match.category,
            default_path: match.default_path,
            tier: match.tier,
            matched_trigger: match.matched_trigger,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
