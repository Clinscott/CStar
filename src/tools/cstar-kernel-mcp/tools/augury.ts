import { registry } from '../../pennyone/pathRegistry.js';
import { selectCouncilExpert } from '../../../core/council_experts.js';
import { buildProjectedPersonaAdvice, type PersonaAdvice } from '../../../core/persona_advice.js';
import { readActivePersonaProjectionState } from '../../pennyone/persona_projection.js';
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
import { CODE_ROOT } from '../contracts/runtime.js';
import { buildTokenPathQuarantineStatus } from '../telemetry/token_path.js';
import {
    callerRequestedActiveSessionContinuity,
    decideAugurySessionRouting,
    detectAuguryTargetDivergence,
    resolveAuguryCurrentIntentCategory,
} from './augury_routing.js';

type KernelCouncilExpert = {
    signature_question?: string;
    anti_behavior?: string[];
    selection_candidates?: unknown[];
};

export async function handleAugury({ prompt, inferred_intent, target_paths, scope }: { prompt: string, inferred_intent?: string, target_paths?: string[], scope?: string, bead_id?: string }) {
    try {
        const root = registry.getRoot();
        let explain: ReturnType<typeof buildAuguryExplainPayload>;
        let activeSession: ReturnType<typeof resolveActivePlanningSession> = null;
        let activeHandoff: ReturnType<typeof buildTraceAgentHandoffPayload> = null;
        let sessionFreshnessGap: 'active_session_projection_unavailable' | undefined;
        try {
            activeSession = resolveActivePlanningSession(root);
            activeHandoff = buildTraceAgentHandoffPayload(activeSession, root, CODE_ROOT);
            explain = buildAuguryExplainPayload(activeSession, root, CODE_ROOT);
        } catch {
            // Augury is a read surface. A degraded session projection is
            // returned as bounded provenance instead of writing a bootstrap
            // log from an unauthenticated request path.
            activeSession = null;
            activeHandoff = null;
            sessionFreshnessGap = 'active_session_projection_unavailable';
            explain = {
                status: 'missing',
                guardrail: {
                    verdict: 'caution',
                    action: 'recover',
                    reason: 'Active session projection is unavailable; route only from current deterministic input.',
                    failed_checks: [],
                    warning_checks: ['active_session'],
                },
                agent_next_action: 'Use the current deterministic route and repair Hall session freshness separately.',
                warnings: ['Active session projection is unavailable.'],
            };
        }

        // Run the deterministic grammar resolver in parallel with the
        // session lookup so divergence is always visible to the caller.
        const manifest = loadRegistryManifest(CODE_ROOT);
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
                ...(sessionFreshnessGap ? { session_freshness_gap: sessionFreshnessGap } : {}),
                token_path: buildTokenPathQuarantineStatus(),
            });
        }

        let result: Record<string, unknown>;
        let resolvedIntentCategory: string;
        let routingSource: 'session' | 'deterministic' | 'fallback';

        if (
            routingDecision.source === 'session'
            && explain.status === 'available'
            && explain.route?.intent_category
        ) {
            const expert = explain.expert as (typeof explain.expert & KernelCouncilExpert);
            resolvedIntentCategory = explain.route.intent_category;
            routingSource = 'session';
            result = {
                intent_category: resolvedIntentCategory,
                intent: explain.route.intent,
                scope: explain.scope?.value || scope || 'brain:CStar',
                selection: explain.route.designation,
                expert: expert?.id,
                expert_label: expert?.label,
                expert_lens: expert?.lens,
                expert_signature_question: expert?.signature_question,
                expert_guardrails: expert?.anti_behavior?.slice(0, 3),
                mimir_targets: explain.mimir?.targets.slice(0, 3) || (target_paths || []).slice(0, 3),
                next_action: explain.agent_next_action || 'Perform handoff to verify active state.',
                council_candidates: expert?.selection_candidates?.slice(0, 3) ?? [],
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
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                scope: scope || 'brain:CStar',
                selection: `${selectionTier}: ${selectionName}`,
                expert: selectedExpert.id,
                expert_label: selectedExpert.label,
                expert_lens: selectedExpert.lens,
                expert_signature_question: selectedExpert.signature_question ?? '',
                expert_guardrails: selectedExpert.anti_behavior.slice(0, 3),
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: routingDecision.stale_session_demoted
                    ? 'Route derived from the current prompt and target_paths. Active session context was demoted to background because its targets diverge.'
                    : 'No active planning session; route derived from deterministic grammar. Run cstar_handoff to anchor a session.',
                council_candidates: selectedExpert.selection_candidates?.slice(0, 3) ?? [],
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
                intent_category: resolvedIntentCategory,
                intent: inferred_intent || prompt.substring(0, 100),
                scope: scope || 'brain:CStar',
                selection: 'SKILL: cstar-kernel',
                expert: selectedExpert.id,
                expert_label: selectedExpert.label,
                expert_lens: selectedExpert.lens,
                expert_signature_question: selectedExpert.signature_question ?? '',
                expert_guardrails: selectedExpert.anti_behavior.slice(0, 3),
                mimir_targets: (target_paths || []).slice(0, 3),
                next_action: 'No deterministic grammar match and no active session. Clarify the prompt or run cstar_handoff.',
                council_candidates: selectedExpert.selection_candidates?.slice(0, 3) ?? [],
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
        const routingWarnings = [
            ...routingDecision.divergence_warnings,
            ...(sessionFreshnessGap ? ['Active session projection is unavailable.'] : []),
        ];
        if (routingWarnings.length > 0) {
            result.divergence_warnings = routingWarnings;
        }
        if (sessionFreshnessGap) result.session_freshness_gap = sessionFreshnessGap;
        result.routing_provenance = {
            source: routingSource,
            deterministic: deterministicProvenance,
            session: sessionProvenance,
            diverged,
            active_session_authority: routingDecision.use_session_as_primary ? 'primary' : 'background',
            session_projection: sessionFreshnessGap
                ? { status: 'unavailable', freshness_gap: sessionFreshnessGap }
                : { status: 'available' },
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
        let personaProjection: ReturnType<typeof readActivePersonaProjectionState> | undefined;
        try {
            personaProjection = readActivePersonaProjectionState(root);
        } catch {
            // Persona is optional projection context, never a reason for the
            // read-only routing surface to bootstrap or fail.
            personaProjection = undefined;
        }
        const advice: PersonaAdvice | null = buildProjectedPersonaAdvice(
            resolvedIntentCategory,
            personaProjection?.active_persona ?? undefined,
            personaProjection?.projection_status === 'bounded_config_projection'
                ? 'bounded_active_persona_projection'
                : 'hall_active_persona_projection',
        );
        if (advice) {
            result.persona_advice = advice;
        } else {
            result.persona_freshness_gap = personaProjection?.projection_status
                === 'bounded_config_invalid'
                ? 'active_persona_configuration_invalid'
                : personaProjection?.projection_status === 'bounded_config_reader_unavailable'
                    ? 'active_persona_reader_unavailable'
                    : 'active_persona_projection_unavailable';
        }

        result.token_path = buildTokenPathQuarantineStatus();

        return textResponse(result);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
