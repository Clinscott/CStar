import fs from 'node:fs';
import path from 'node:path';

import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { analyzeCanonicalIntent } from '../../../core/intent_analysis.js';
import { selectCouncilExpert } from '../../../core/council_experts.js';
import { buildPersonaAdvice, type PersonaAdvice } from '../../../core/persona_advice.js';
import {
    resolveActiveTraceHandoffPayload,
    resolveActiveTraceStatusPayload,
    buildActiveAuguryExplainPayload,
} from '../../../node/core/commands/trace.js';
import {
    loadRegistryManifest,
    getRegistryIntentCategories,
} from '../../../node/core/runtime/host_workflows/chant_parser.js';
import { mcpGuardrail, textResponse } from '../contracts/responses.js';
import { logBootstrapError, resolveProspectiveRelativePathInside } from '../contracts/runtime.js';
import {
    runTokenPathAdvisor,
    type TokenPathRoutingInput,
} from '../telemetry/token_path.js';
import {
    callerRequestedActiveSessionContinuity,
    decideAugurySessionRouting,
    detectAuguryTargetDivergence,
} from './augury_routing.js';

type KernelCouncilExpert = {
    signature_question?: string;
    anti_behavior?: string[];
};

const AUGURY_PROMPT_MAX_CHARS = 4096;
const AUGURY_SCOPE_MAX_CHARS = 120;
const AUGURY_TARGET_MAX_CHARS = 1024;
const AUGURY_TARGET_MAX_COUNT = 20;

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveAuguryScopeAndTargets(
    root: string,
    requestedScope: string | undefined,
    requestedTargets: string[] | undefined,
): { scope: string; target_paths: string[] } {
    if ((requestedScope?.length ?? 0) > AUGURY_SCOPE_MAX_CHARS) throw new Error('augury_scope_too_long');
    if ((requestedTargets?.length ?? 0) > AUGURY_TARGET_MAX_COUNT) throw new Error('augury_target_count_exceeded');
    const mounted = database.listHallMountedSpokes(root)
        .filter((spoke) => spoke.mount_status === 'active' && spoke.trust_level === 'trusted');
    const canonicalRoot = fs.realpathSync(root);
    const scopeText = requestedScope?.trim() || 'brain:CStar';
    let scope = 'brain:CStar';
    let scopeRoot = canonicalRoot;
    if (!/^brain:cstar$/i.test(scopeText)) {
        const match = /^spoke:([A-Za-z0-9._-]+)$/i.exec(scopeText);
        const spoke = match ? mounted.find((entry) => entry.slug.toLowerCase() === match[1].toLowerCase()) : undefined;
        if (!spoke) throw new Error(`augury_scope_not_authorized:${scopeText}`);
        scope = `spoke:${spoke.slug}`;
        scopeRoot = fs.realpathSync(spoke.root_path);
    }
    const allowedRoots = [
        { label: 'brain:CStar', root: canonicalRoot },
        ...mounted.flatMap((spoke) => {
            try { return [{ label: `spoke:${spoke.slug}`, root: fs.realpathSync(spoke.root_path) }]; } catch { return []; }
        }),
    ];
    const targets = (requestedTargets ?? []).map((rawTarget) => {
        if (typeof rawTarget !== 'string' || !rawTarget.trim() || rawTarget.length > AUGURY_TARGET_MAX_CHARS || rawTarget.includes('\0')) {
            throw new Error('augury_target_invalid');
        }
        let candidate: string;
        if (registry.isSpokeUri(rawTarget)) {
            candidate = registry.resolveEstatePath(rawTarget, mounted);
        } else if (path.isAbsolute(rawTarget)) {
            candidate = path.resolve(rawTarget);
        } else {
            candidate = path.resolve(scopeRoot, rawTarget);
        }
        const authority = allowedRoots.find((entry) => isInside(candidate, entry.root));
        if (!authority) throw new Error(`augury_target_outside_authorized_estate:${rawTarget}`);
        const relative = path.relative(authority.root, candidate);
        return relative === ''
            ? authority.root
            : resolveProspectiveRelativePathInside(authority.root, relative);
    });
    return { scope, target_paths: [...new Set(targets)] };
}

export async function handleAugury({ prompt, inferred_intent, target_paths, scope, bead_id }: { prompt: string, inferred_intent?: string, target_paths?: string[], scope?: string, bead_id?: string }) {
    try {
        if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('augury_prompt_required');
        if (prompt.length > AUGURY_PROMPT_MAX_CHARS) throw new Error('augury_prompt_too_long');
        if ((inferred_intent?.length ?? 0) > 120) throw new Error('augury_inferred_intent_too_long');
        if ((bead_id?.length ?? 0) > 240) throw new Error('augury_bead_id_too_long');
        let explain: ReturnType<typeof buildActiveAuguryExplainPayload> = {
            status: 'missing',
            guardrail: {
                verdict: 'caution',
                action: 'recover',
                reason: 'No active Augury session has been resolved yet.',
                failed_checks: [],
                warning_checks: ['active_session'],
            },
            agent_next_action: 'Perform handoff to verify active state.',
            warnings: [],
        };
        const root = registry.getRoot();
        const bounded = resolveAuguryScopeAndTargets(root, scope, target_paths);
        const boundedScope = bounded.scope;
        const boundedTargetPaths = bounded.target_paths;
        let activeState: ReturnType<typeof resolveActiveTraceStatusPayload> = null;
        let activeHandoff: ReturnType<typeof resolveActiveTraceHandoffPayload> = null;
        try {
            activeState = resolveActiveTraceStatusPayload(root);
            activeHandoff = resolveActiveTraceHandoffPayload(root);
            explain = buildActiveAuguryExplainPayload(root);
        } catch (error) {
            logBootstrapError(error);
        }

        // Run the deterministic grammar resolver in parallel with the
        // session lookup so divergence is always visible to the caller.
        const manifest = loadRegistryManifest(root);
        const grammarSource: 'registry' | 'fallback' = manifest?.intent_grammar ? 'registry' : 'fallback';
        const grammar = getRegistryIntentCategories(manifest);
        const deterministicAnalysis = analyzeCanonicalIntent({
            prompt,
            inferred_intent,
            grammar,
        });
        const deterministicMatch = deterministicAnalysis.primary;
        const deterministicProvenance = deterministicMatch
            ? {
                intent_category: deterministicMatch.category,
                default_path: deterministicMatch.default_path,
                tier: deterministicMatch.tier,
                matched_trigger: deterministicMatch.matched_trigger,
                matched_triggers: deterministicMatch.matched_triggers,
                secondary_evidence: deterministicAnalysis.matches
                    .filter((match) => match.category !== deterministicMatch.category)
                    .map((match) => ({
                        intent_category: match.category,
                        matched_triggers: match.matched_triggers,
                        effective_score: match.effective_score,
                        suppressed: match.suppressed,
                        suppression_reasons: match.suppression_reasons,
                    })),
                negations_detected: deterministicAnalysis.negations_detected,
                grammar_source: grammarSource,
            }
            : null;
        let sessionTargetPaths: string[] = [];
        if (explain.status === 'available') {
            try {
                sessionTargetPaths = resolveAuguryScopeAndTargets(
                    root,
                    explain.scope?.value,
                    explain.mimir?.targets ?? [],
                ).target_paths;
            } catch (error) {
                logBootstrapError(error);
                explain = {
                    status: 'missing',
                    guardrail: { verdict: 'block', action: 'repair', reason: 'Stored Augury scope or targets are outside the authorized estate.', failed_checks: ['scope'], warning_checks: [] },
                    agent_next_action: 'Repair the stored Augury scope and Mimir target contract.',
                    warnings: ['Stored Augury scope or targets failed containment.'],
                };
            }
        }
        const sessionProvenance = explain.status === 'available' && explain.route
            ? {
                intent_category: explain.route.intent_category,
                selection: explain.route.designation,
            }
            : null;
        const targetDivergence = detectAuguryTargetDivergence(boundedTargetPaths, sessionTargetPaths, root);
        const intentDivergence = Boolean(
            sessionProvenance
                && deterministicProvenance
                && sessionProvenance.intent_category !== deterministicProvenance.intent_category,
        );
        const scopeDivergence = Boolean(
            scope && explain.status === 'available' && explain.scope?.value && explain.scope.value !== boundedScope,
        );
        const routingDecision = decideAugurySessionRouting({
            hasSessionRoute: Boolean(sessionProvenance),
            hasExplicitTargetPaths: boundedTargetPaths.length > 0,
            targetDiverged: targetDivergence.diverged,
            deterministicAvailable: Boolean(deterministicProvenance),
            currentRouteDiverged: intentDivergence || scopeDivergence,
            activeSessionContinuityRequested: callerRequestedActiveSessionContinuity(prompt, inferred_intent),
        });

        if (routingDecision.stale_session_divergence_blocker) {
            return textResponse({
                status: 'blocked',
                stale_session_divergence_blocker: true,
                intent_category: deterministicProvenance?.intent_category ?? 'UNRESOLVED',
                intent: inferred_intent || prompt.substring(0, 160),
                scope: boundedScope,
                mimir_targets: boundedTargetPaths.slice(0, 3),
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
                    target_paths: boundedTargetPaths,
                },
                active_session_suggestion: {
                    session_id: activeState?.session_id ?? activeState?.handle,
                    status: activeState?.status,
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
                    diverged: intentDivergence || scopeDivergence || targetDivergence.diverged,
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
        let routingSource: 'session' | 'deterministic' | 'unresolved';

        if (routingDecision.source === 'session' && explain.status === 'available' && explain.route) {
            const expert = explain.expert as (typeof explain.expert & KernelCouncilExpert);
            const designation = explain.route.designation || '';
            const colonIdx = designation.indexOf(':');
            const selectionTier = colonIdx >= 0 ? designation.slice(0, colonIdx).trim() : designation.trim();
            const selectionName = colonIdx >= 0 ? designation.slice(colonIdx + 1).trim() : undefined;
            resolvedIntentCategory = explain.route.intent_category ?? 'UNRESOLVED';
            routingSource = 'session';
            result = {
                intent_category: resolvedIntentCategory,
                intent: explain.route.intent,
                scope: scope ? boundedScope : explain.scope?.value || boundedScope,
                selection: explain.route.designation,
                expert: expert?.id,
                expert_label: expert?.label,
                expert_lens: expert?.lens,
                expert_signature_question: expert?.signature_question,
                expert_guardrails: expert?.anti_behavior?.slice(0, 3),
                mimir_targets: sessionTargetPaths.slice(0, 3),
                next_action: explain.agent_next_action || 'Perform handoff to verify active state.',
                confidence: null,
                confidence_source: 'not_measured',
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths: boundedTargetPaths,
                mimirs_well: explain.mimir?.targets,
                scope: scope ? boundedScope : explain.scope?.value || boundedScope,
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
                intent: prompt.substring(0, 4096),
                selection_tier: selectionTier,
                selection_name: selectionName,
                mimirs_well: boundedTargetPaths.slice(0, 3),
            }) as ReturnType<typeof selectCouncilExpert> & KernelCouncilExpert;
            result = {
                intent_category: resolvedIntentCategory,
                intent: prompt.substring(0, 4096),
                scope: boundedScope,
                selection: `${selectionTier}: ${selectionName}`,
                expert: selectedExpert.id,
                expert_label: selectedExpert.label,
                expert_lens: selectedExpert.lens,
                expert_signature_question: selectedExpert.signature_question ?? '',
                expert_guardrails: selectedExpert.anti_behavior.slice(0, 3),
                mimir_targets: boundedTargetPaths.slice(0, 3),
                next_action: routingDecision.stale_session_demoted
                    ? 'Route derived from the current prompt and target_paths. Active session context was demoted to background because its targets diverge.'
                    : 'No active planning session; route derived from deterministic grammar. Run cstar_handoff to anchor a session.',
                confidence: null,
                confidence_source: 'not_measured',
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths: boundedTargetPaths,
                scope: boundedScope,
                selection_tier: selectionTier,
                selection_name: selectionName,
            };
        } else {
            // Neither session nor grammar matched. Do not invent a route.
            resolvedIntentCategory = 'UNRESOLVED';
            routingSource = 'unresolved';
            const selectedExpert = selectCouncilExpert({
                intent_category: resolvedIntentCategory,
                intent: prompt.substring(0, 4096),
                selection_tier: undefined,
                selection_name: undefined,
                mimirs_well: boundedTargetPaths.slice(0, 3),
            }) as ReturnType<typeof selectCouncilExpert> & KernelCouncilExpert;
            result = {
                intent_category: resolvedIntentCategory,
                intent: prompt.substring(0, 4096),
                scope: boundedScope,
                selection: null,
                expert: selectedExpert.id,
                expert_label: selectedExpert.label,
                expert_lens: selectedExpert.lens,
                expert_signature_question: selectedExpert.signature_question ?? '',
                expert_guardrails: selectedExpert.anti_behavior.slice(0, 3),
                mimir_targets: boundedTargetPaths.slice(0, 3),
                next_action: 'No deterministic grammar match and no active session. Clarify the prompt or run cstar_handoff.',
                confidence: null,
                confidence_source: 'not_measured',
            };
            routingInput = {
                prompt,
                inferred_intent,
                intent_category: resolvedIntentCategory,
                target_paths: boundedTargetPaths,
                scope: boundedScope,
                selection_tier: undefined,
                selection_name: undefined,
            };
        }

        // Routing provenance: deterministic grammar vs session selection.
        const diverged = Boolean(
            intentDivergence || scopeDivergence || targetDivergence.diverged,
        );
        result.current_mission_route = {
            source: routingSource,
            prompt: prompt.substring(0, 240),
            inferred_intent,
            intent_category: resolvedIntentCategory,
            selection: result.selection,
            target_paths: boundedTargetPaths,
        };
        if (sessionProvenance) {
            result.active_session_suggestion = {
                session_id: activeState?.session_id ?? activeState?.handle,
                status: activeState?.status,
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
            ...(scopeDivergence ? {
                scope_divergence: {
                    requested_scope: boundedScope,
                    session_scope: explain.scope?.value,
                    reason: 'Caller scope diverges from the active session scope.',
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

        const routeUnresolved = routingSource === 'unresolved';
        const routeTargets = routingSource === 'session' ? sessionTargetPaths : boundedTargetPaths;
        const needsTargets = !routeUnresolved && routeTargets.length === 0;
        result.status = routeUnresolved ? 'unresolved' : needsTargets ? 'needs_targets' : 'routed_advisory';
        result.actionable = false;
        result.guardrail = routeUnresolved
            ? mcpGuardrail('block', 'recover', 'No deterministic Augury route was found.', ['unresolved_intent'], ['augury_route'])
            : needsTargets
                ? mcpGuardrail('caution', 'recover', 'The route is advisory but has no bounded target path.', [], ['mimir_targets'])
                : mcpGuardrail('caution', 'verify', 'Augury provides typed advisory routing, not execution authority.', [], ['augury_advisory']);

        const tokenPath = await runTokenPathAdvisor(routingInput);
        if (tokenPath) {
            result.token_path = {
                ...tokenPath,
                shadow_only: true,
                actionable: false,
            };
        }

        return textResponse(result);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
