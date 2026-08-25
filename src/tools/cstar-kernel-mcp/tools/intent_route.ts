import { registry } from '../../pennyone/pathRegistry.js';
import { analyzeCanonicalIntent } from '../../../core/intent_analysis.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    loadRegistryManifest,
    getRegistryIntentCategories,
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
        const root = registry.getRoot();
        const manifest = loadRegistryManifest(root);
        const grammarSource: 'registry' | 'fallback' = manifest?.intent_grammar ? 'registry' : 'fallback';
        const grammar = getRegistryIntentCategories(manifest);
        const analysis = analyzeCanonicalIntent({ prompt, grammar });
        const tokens = analysis.tokens;

        if (action === 'explain') {
            // Enumerate every category whose triggers intersect the tokens.
            const matches = analysis.matches.map((match) => ({
                intent_category: match.category,
                default_path: match.default_path,
                tier: match.tier,
                matched_triggers: match.matched_triggers,
                effective_score: match.effective_score,
                suppressed: match.suppressed,
                suppression_reasons: match.suppression_reasons,
                primary: analysis.primary?.category === match.category,
            }));
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

        const match = analysis.primary;
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
