import { registry } from '../../pennyone/pathRegistry.js';
import { selectCouncilExpert } from '../../../core/council_experts.js';
import { buildPersonaAdvice, type PersonaAdvice } from '../../../core/persona_advice.js';
import {
    buildTraceAgentHandoffPayload,
    resolveActivePlanningSession,
    buildAuguryExplainPayload,
} from '../../../node/core/commands/trace.js';
import {
    tokenize,
    loadRegistryManifest,
    getRegistryIntentCategories,
    resolveIntentCategoryFromGrammar,
} from '../../../node/core/runtime/host_workflows/chant_parser.js';
import { mcpGuardrail, textResponse } from '../contracts/responses.js';
import { logBootstrapError } from '../contracts/runtime.js';
import {
    appendTokenPathAdvice,
    runTokenPathAdvisor,
    type TokenPathRoutingInput,
} from '../telemetry/token_path.js';
import {
    callerRequestedActiveSessionContinuity,
    decideAugurySessionRouting,
    detectAuguryTargetDivergence,
    resolveAuguryCurrentIntentCategory,
} from './augury_routing.js';

type KernelCouncilExpert = {
    id?: string;
    label?: string;
    lens?: string;
    signature_question?: string;
    anti_behavior?: string[];
    guardrails?: string[];
    selection_reason?: string;
    selection_candidates?: unknown[];
};

function buildCouncilResult(expert: KernelCouncilExpert | null | undefined): Record<string, unknown> {
    const guardrails = expert?.guardrails ?? expert?.anti_behavior ?? [];
    const councilExpert = {
        id: expert?.id,
        label: expert?.label,
        lens: expert?.lens,
        signature_question: expert?.signature_question,
        guardrails,
        selection_reason: expert?.selection_reason,
    };
    return {
        council_expert: councilExpert,
        expert: expert?.id,
        expert_label: expert?.label,
        expert_lens: expert?.lens,
        expert_signature_question: expert?.signature_question ?? '',
        expert_guardrails: guardrails,
        expert_selection_reason: expert?.selection_reason ?? '',
        council_candidates: expert?.selection_candidates?.slice(0, 3) ?? [],
    };
}

export async function handleAugury({ prompt, inferred_intent, target_paths, scope, bead_id }: { prompt: string, inferred_intent?: string, target_paths?: string[], scope?: string, bead_id?: string }) {
    try {
        let explain: ReturnType<typeof buildAuguryExplainPayload> = {
            status: 'missing',
            agent_next_action: 'Perform handoff to verify active state.',
            warnings: [],
            guardrail: {
                verdict: 'block',
                action: 'repair',
                reason: 'No active Augury contract was loaded.',
                failed_checks: ['active_augury'],
                warning_checks: [],
            },
        };
        const root = registry.getRoot();
        let activeSession: ReturnType<typeof resolveActivePlanningSession> = null;
        let activeHandoff: ReturnType<typeof buildTraceAgentHandoffPayload> = null;
        try {
            activeSession = resolveActivePlanningSession(root);
            activeHandoff = buildTraceAgentHandoffPayload(activeSession, root);
            explain = buildAuguryExplainPayload(activeSession, root);
        } catch (error) {
            logBootstrapError(error);
        }

        // Run the deterministic grammar resolver in parallel with the
        // session lookup so divergence is always visible to the caller.
        const manifest = loadRegistryManifest(root);
        const grammarSource: 'registry' | 'fallback' = manifest?.intent_grammar ? 'registry' : 'fallback';
        const grammar = getRegistryIntentCategories(manifest);
        const tokens = tokenize(`${prompt} ${inferred_intent ?? ''}`);
        const deterministicMatch = resolveAuguryCurrentIntentCategory(tokens, grammar)
            ?? resolveIntentCategoryFromGrammar(tokens, grammar);
        const deterministicProvenance = deterministicMatch
            ? {
                intent_category: deterministicMatch.category,
                default_path: deterministicMatch.default_path,
                tier: deterministicMatch.tier,
                matched_trigger: deterministicMatch.matched_trigger,
                grammar_source: grammarSource,
            }
            : null;
        const sessionTargetPaths = explain.status === 'available'
            ? explain.mimir?.targets ?? []
            : [];
        const sessionProvenance = explain.status === 'available' && explain.route
            ? {
                intent_category: explain.route.intent_category,
                selection: explain.route.designation,
            }
            : null;
        const targetDivergence = detectAuguryTargetDivergence(target_paths, sessionTargetPaths, root);
        const intentDivergence = Boolean(
            sessionProvenance
                && deterministicProvenance
                && sessionProvenance.intent_category !== deterministicProvenance.intent_category,
        );
        const routingDecision = decideAugurySessionRouting({
            hasSessionRoute: Boolean(sessionProvenance),
            hasExplicitTargetPaths: (target_paths ?? []).length > 0,
            targetDiverged: targetDivergence.diverged,
            deterministicAvailable: Boolean(deterministicProvenance),
            currentRouteDiverged: intentDivergence,
            activeSessionContinuityRequested: callerRequestedActiveSessionContinuity(prompt, inferred_intent),
        });

        if (routingDecision.stale_session_divergence_blocker) {
            return textResponse({
                status: 'blocked',
                routing_authority: 'cstar_augury',
                augury_contract_version: 1,
                stale_session_divergence_blocker: true,
                intent_category: deterministicProvenance?.intent_category ?? 'UNRESOLVED',
                intent: inferred_intent || prompt.substring(0, 160),
                scope: scope || explain.scope?.value || 'brain:CStar',
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: 'Do not use the active handoff route as current mission truth. Clarify routing input, select a matching session, or clear/supersede the stale session.',
                required_operator_decision: routingDecision.required_operator_decision
                    ?? 'Select or create a current mission bead/session, or explicitly clear/supersede the stale active session before routing work.',
                current_mission_route: {
                    source: deterministicProvenance ? 'deterministic' : 'unresolved',
                    prompt: prompt.substring(0, 240),
                    inferred_intent,
                    intent_category: deterministicProvenance?.intent_category ?? null,
                    selection: deterministicProvenance
                        ? `${deterministicProvenance.tier}: ${deterministicProvenance.default_path}`
                        : null,
                    target_paths: target_paths ?? [],
                },
                active_session_suggestion: {
                    session_id: activeSession?.session_id,
                    status: activeSession?.status,
                    lead_bead_id: activeHandoff?.lead_bead_id,
                    authoritative: false,
                    intent_category: sessionProvenance?.intent_category ?? null,
                    selection: sessionProvenance?.selection ?? null,
                    target_paths: sessionTargetPaths,
                },
                guardrail: mcpGuardrail(
                    'block',
                    'verify',
                    'Augury could not safely derive a current mission route without operator clarification.',
                    routingDecision.divergence_warnings,
                    ['active_session'],
                ),
                routing_provenance: {
                    source: 'blocked',
                    deterministic: deterministicProvenance,
                    session: sessionProvenance,
                    diverged: intentDivergence || targetDivergence.diverged,
                    ...(intentDivergence ? {
                        intent_divergence: {
                            kind: 'intent_category',
                            deterministic_intent_category: deterministicProvenance?.intent_category,
                            session_intent_category: sessionProvenance?.intent_category,
                            reason: 'Active session intent category diverges from the current deterministic route.',
                        },
                    } : {}),
                    divergence: {
                        kind: 'target_paths',
                        ...targetDivergence,
                    },
                },
            });
        }

        let result: Record<string, unknown>;
        let routingInput: TokenPathRoutingInput;
        let resolvedIntentCategory: string;
        let routingSource: 'session' | 'deterministic' | 'fallback';

        if (routingDecision.source === 'session' && explain.status === 'available' && explain.route) {
            const expert = explain.expert as (typeof explain.expert & KernelCouncilExpert);
            const designation = explain.route.designation || '';
            const colonIdx = designation.indexOf(':');
            const selectionTier = colonIdx >= 0 ? designation.slice(0, colonIdx).trim() : designation.trim();
            const selectionName = colonIdx >= 0 ? designation.slice(colonIdx + 1).trim() : undefined;
            resolvedIntentCategory = explain.route.intent_category || 'ORCHESTRATE';
            routingSource = 'session';
            result = {
                status: 'routed',
                routing_authority: 'cstar_augury',
                augury_contract_version: 1,
                intent_category: resolvedIntentCategory,
                intent: explain.route.intent,
                scope: explain.scope?.value || scope || 'brain:CStar',
                selection: explain.route.designation,
                ...buildCouncilResult(expert),
                mimir_targets: explain.mimir?.targets.slice(0, 3) || (target_paths || []).slice(0, 3),
                next_action: explain.agent_next_action || 'Perform handoff to verify active state.',
                guardrail: explain.guardrail,
                confidence: 1.0,
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths,
                mimirs_well: explain.mimir?.targets,
                scope: explain.scope?.value || scope,
                selection_tier: selectionTier || undefined,
                selection_name: selectionName,
            };
        } else if (deterministicMatch) {
            // Prefer the current prompt/target_paths route when an active
            // session is stale or absent. Stale sessions are surfaced below as
            // non-authoritative background, not route truth.
            resolvedIntentCategory = deterministicMatch.category;
            routingSource = 'deterministic';
            const selectionTier = deterministicMatch.tier || 'SKILL';
            const selectionName = deterministicMatch.default_path || 'cstar-kernel';
            const selectedExpert = selectCouncilExpert({
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                selection_tier: selectionTier,
                selection_name: selectionName,
                mimirs_well: (target_paths || []).slice(0, 3),
            }) as ReturnType<typeof selectCouncilExpert> & KernelCouncilExpert;
            result = {
                status: 'routed',
                routing_authority: 'cstar_augury',
                augury_contract_version: 1,
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                scope: scope || 'brain:CStar',
                selection: `${selectionTier}: ${selectionName}`,
                ...buildCouncilResult(selectedExpert),
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: routingDecision.stale_session_demoted
                    ? 'Route derived from the current prompt and target_paths. Active session context was demoted to background because its targets diverge.'
                    : 'No active planning session; route derived from deterministic grammar. Run cstar_handoff to anchor a session.',
                guardrail: mcpGuardrail(
                    'allow',
                    'continue',
                    'Current mission route resolved from the canonical intent grammar and Council selector.',
                ),
                confidence: 0.85,
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths,
                scope,
                selection_tier: selectionTier,
                selection_name: selectionName,
            };
        } else {
            // Neither session nor grammar matched. Last-resort ORCHESTRATE fallback.
            resolvedIntentCategory = 'ORCHESTRATE';
            routingSource = 'fallback';
            const selectedExpert = selectCouncilExpert({
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                selection_tier: 'SKILL',
                selection_name: 'cstar-kernel',
                mimirs_well: (target_paths || []).slice(0, 3),
            }) as ReturnType<typeof selectCouncilExpert> & KernelCouncilExpert;
            result = {
                status: 'routed',
                routing_authority: 'cstar_augury',
                augury_contract_version: 1,
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                scope: scope || 'brain:CStar',
                selection: 'SKILL: cstar-kernel',
                ...buildCouncilResult(selectedExpert),
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: 'No deterministic grammar match and no active session. Clarify the prompt or run cstar_handoff.',
                guardrail: mcpGuardrail(
                    'caution',
                    'recover',
                    'No deterministic grammar trigger or active session was available; the bounded MCP fallback requires prompt clarification.',
                    [],
                    ['fallback_route'],
                ),
                confidence: 0.6,
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths,
                scope,
                selection_tier: 'SKILL',
                selection_name: 'cstar-kernel',
            };
        }

        // Routing provenance: deterministic grammar vs session selection.
        const diverged = Boolean(
            intentDivergence || targetDivergence.diverged,
        );
        result.current_mission_route = {
            source: routingSource,
            prompt: prompt.substring(0, 240),
            inferred_intent,
            intent_category: resolvedIntentCategory,
            selection: result.selection,
            target_paths: target_paths ?? [],
        };
        if (sessionProvenance) {
            result.active_session_suggestion = {
                session_id: activeSession?.session_id,
                status: activeSession?.status,
                lead_bead_id: activeHandoff?.lead_bead_id,
                authoritative: routingDecision.use_session_as_primary,
                demoted: routingDecision.stale_session_demoted,
                intent_category: sessionProvenance.intent_category,
                selection: sessionProvenance.selection,
                target_paths: sessionTargetPaths,
            };
        }
        if (routingDecision.divergence_warnings.length > 0) {
            result.divergence_warnings = routingDecision.divergence_warnings;
        }
        result.routing_provenance = {
            source: routingSource,
            deterministic: deterministicProvenance,
            session: sessionProvenance,
            diverged,
            active_session_authority: routingDecision.use_session_as_primary ? 'primary' : 'background',
            ...(intentDivergence ? {
                intent_divergence: {
                    kind: 'intent_category',
                    deterministic_intent_category: deterministicProvenance?.intent_category,
                    session_intent_category: sessionProvenance?.intent_category,
                    reason: 'Active session intent category diverges from the current deterministic route.',
                },
            } : {}),
            ...(targetDivergence.diverged ? {
                divergence: {
                    kind: 'target_paths',
                    ...targetDivergence,
                },
            } : {}),
        };

        // Persona Advice — wires the active CStar persona into the Augury payload.
        const advice: PersonaAdvice = buildPersonaAdvice(resolvedIntentCategory);
        result.persona_advice = advice;

        const tokenPath = await runTokenPathAdvisor(routingInput);
        if (tokenPath) {
            appendTokenPathAdvice(routingInput, tokenPath, bead_id);
            result.token_path = tokenPath;
        }

        return textResponse(result);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
