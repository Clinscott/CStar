function isAmbiguous(input) {
  const text = `${input.prompt ?? ''} ${input.inferred_intent ?? ''}`.toLowerCase();
  return /\b(maybe|something|somehow|figure out|not sure)\b/.test(text);
}

export function getTokenPathAdviceForRouting(input) {
  const ambiguous = isAmbiguous(input);
  const mode = ambiguous ? 'ask-first' : 'execute-verify';
  return {
    advisor: 'augury-token-path',
    schema_version: 1,
    mode,
    selected_policy: ambiguous ? 'clarify-before-context-expansion' : 'bounded-context-then-verify',
    scenario_class: ambiguous ? 'ambiguous-mission' : 'bounded-implementation',
    context_strategy: {
      target_count: Array.isArray(input.target_paths) ? input.target_paths.length : 0,
      expand_only_after_gap: true,
    },
    budget: {
      raw_token_ceiling: ambiguous ? 1200 : 4000,
      billable_token_ceiling: ambiguous ? 600 : 2200,
    },
    decision_reason: ambiguous
      ? 'The mission lacks a concrete target or outcome.'
      : 'The mission has a bounded route and explicit verification path.',
    confidence: ambiguous ? 0.7 : 0.9,
    rationale: ambiguous
      ? ['Ask one bounded question before loading more context.']
      : ['Use explicit targets first.', 'Verify the bounded change before expanding scope.'],
    expected_billable_tokens: ambiguous ? 450 : 1800,
    expected_raw_tokens: ambiguous ? 900 : 3200,
    requires_followup: ambiguous,
    execution_deferred: ambiguous,
  };
}
