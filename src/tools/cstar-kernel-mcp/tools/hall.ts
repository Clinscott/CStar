import path from 'node:path';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    buildTraceAgentHandoffPayload,
    resolveActivePlanningSession,
    resolveActiveTraceHandoffPayload,
    buildActiveAuguryDoctorPayload,
} from '../../../node/core/commands/trace.js';
import { mcpGuardrail, textResponse } from '../contracts/responses.js';
import { detectAuguryTargetDivergence } from './augury_routing.js';
import {
    summarizeRecentMcpUsage,
    summarizeRecentMcpUsefulness,
} from '../telemetry/usage.js';
import { summarizeRecentTokenPathIntegration } from '../telemetry/token_path.js';

export async function handleHallMaintenance(args: { action: 'study' | 'harvest'; limit?: number; memory_id?: string }) {
    void args;
    return textResponse({
        error: 'Hall lesson study and harvesting are decommissioned; model output cannot write or promote canonical CStar memory.',
        decommissioned: true,
        actuated: false,
        replacement: 'Use cstar_hall_search for bounded read-only inspection of existing ENGRAM or LESSON records.',
    }, true);
}

export interface HandoffArgs {
    prompt?: string;
    scope?: string;
    target_paths?: string[];
}

function compactHandoffSession(handoff: any) {
    return {
        execution_gate: handoff.execution_gate,
        phase: handoff.phase,
        next_action: handoff.next_action,
        route: handoff.designation ? {
            intent_category: handoff.designation.intent_category,
            selection_tier: handoff.designation.selection_tier,
            selection_name: handoff.designation.selection_name,
        } : undefined,
        lead_bead_id: handoff.lead_bead_id,
        target_paths: handoff.target_paths.slice(0, 5),
        checker_shells: handoff.checker_shells.slice(0, 3),
        work_items: handoff.work_items.slice(0, 3).map((w: any) => ({
            bead_id: w.bead_id,
            status: w.status,
            target_path: w.target_path,
        })),
    };
}

function guardrailForActiveHandoff(executionGate: string) {
    switch (executionGate) {
        case 'execution_guarded':
            return mcpGuardrail(
                'caution',
                'verify',
                'Execution is staged; operator release and verification evidence are required before follow-on work.',
                [],
                ['execution_gate'],
            );
        case 'review_required':
        case 'worker_review_required':
            return mcpGuardrail(
                'caution',
                'verify',
                'Review is required before this handoff can authorize follow-on execution.',
                [],
                ['review_gate'],
            );
        case 'input_required':
            return mcpGuardrail(
                'block',
                'recover',
                'Required input is unresolved; do not execute from this handoff.',
                ['input_gate'],
            );
        case 'operator_release_required':
            return mcpGuardrail(
                'block',
                'refuse',
                'Explicit operator release is required before execution.',
                ['operator_release_gate'],
            );
        case 'failure_recovery':
            return mcpGuardrail(
                'block',
                'repair',
                'The active lifecycle state is blocked or failed; repair or recast it before execution.',
                ['failure_recovery_gate'],
            );
        case 'planning_active':
            return mcpGuardrail(
                'caution',
                'verify',
                'Planning state is active, but it is not execution authority.',
                [],
                ['planning_gate'],
            );
        case 'work_active':
            return mcpGuardrail(
                'caution',
                'verify',
                'A lifecycle bead is claimed and active, but it does not prove a runtime command is executing.',
                [],
                ['lifecycle_work_gate'],
            );
        default:
            return mcpGuardrail(
                'block',
                'repair',
                `Unknown handoff execution gate '${executionGate}' cannot authorize work.`,
                ['unknown_execution_gate'],
            );
    }
}

export function buildHandoffMcpPayload(handoff: any, root: string, args: HandoffArgs = {}) {
    if (!handoff) {
        return {
            status: 'idle',
            guardrail: mcpGuardrail(
                'caution',
                'recover',
                'No active handoff is available; route through Augury or create a bead before execution.',
                [],
                ['handoff'],
            ),
            next_action: 'Run cstar_augury with a bounded mission or create a Hall bead before execution.',
        };
    }

    if (handoff.execution_gate === 'completed' || handoff.phase === 'COMPLETED') {
        return {
            status: 'historical_handoff',
            authoritative: false,
            active_session_authority: 'historical',
            guardrail: mcpGuardrail(
                'caution',
                'recover',
                'Completed handoff state is historical context and cannot authorize the current mission.',
                [],
                ['terminal_handoff'],
            ),
            next_action: 'Route the current mission through Augury or create/claim a nonterminal bead.',
            historical_session: compactHandoffSession(handoff),
        };
    }

    const requestedTargets = args.target_paths ?? [];
    const divergence = detectAuguryTargetDivergence(requestedTargets, handoff.target_paths, root);
    if (requestedTargets.length > 0 && divergence.diverged) {
        return {
            status: 'background_active_session',
            authoritative: false,
            stale_session_demoted: true,
            active_session_authority: 'background',
            requested_prompt: args.prompt ?? null,
            requested_scope: args.scope ?? null,
            requested_target_paths: requestedTargets,
            divergence,
            guardrail: mcpGuardrail(
                'caution',
                'verify',
                'Active handoff targets diverge from the caller targets; active session is background context, not current mission truth.',
                [],
                ['stale_session_target_divergence'],
            ),
            next_action: 'Run cstar_augury with the current prompt/target_paths or create/claim a matching bead before execution.',
            active_session_suggestion: compactHandoffSession(handoff),
        };
    }

    return {
        status: 'active',
        authoritative: true,
        ...compactHandoffSession(handoff),
        guardrail: guardrailForActiveHandoff(handoff.execution_gate),
    };
}

export async function handleHandoff(args: HandoffArgs = {}) {
    try {
        const root = registry.getRoot();
        const handoff = resolveActiveTraceHandoffPayload(root);
        return textResponse(buildHandoffMcpPayload(handoff, root, args));
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

export async function handleHallSearch({ query, limit, types }: { query: string; limit?: number; types?: string[] }) {
    try {
        const actualLimit = Math.min(limit || 5, 10);
        const results = database.searchIntents(query);
        let filtered = results;
        if (types && types.length > 0) {
            const typeSet = new Set(types.map((t) => t.toUpperCase()));
            filtered = results.filter((r) => typeSet.has(r.type));
        }
        const output = filtered.slice(0, actualLimit).map((r) => ({
            type: r.type,
            path_or_id: r.path,
            title: r.type === 'CODE' || r.type === 'DOC' ? path.basename(r.path) : (r.intent || 'Untitled'),
            summary: (r.intent || '').substring(0, 240),
            rank: r.rank,
        }));
        return textResponse({
            status: output.length > 0 ? 'matched' : 'empty',
            query,
            count: output.length,
            result_limit: actualLimit,
            guardrail: output.length > 0
                ? mcpGuardrail('allow', 'continue', 'Hall search returned bounded results.')
                : mcpGuardrail(
                    'caution',
                    'recover',
                    'Hall search returned no results; refine the query or use Augury for routing.',
                    [],
                    ['search'],
                ),
            next_action: output.length > 0
                ? 'Inspect the returned Hall records and keep follow-up reads bounded.'
                : 'Refine the Hall query or route the mission through Augury.',
            results: output,
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}

export async function handleDoctor() {
    try {
        const root = registry.getRoot();
        const doctor = buildActiveAuguryDoctorPayload(root);
        const db = database.getDb(root);
        const databaseHealthy = db !== null;
        const registryHealthy = Boolean(root);
        const kernelHealthy = databaseHealthy && registryHealthy;
        return textResponse({
            status: kernelHealthy ? 'healthy' : 'degraded',
            score: null,
            score_source: 'not_measured',
            warnings: kernelHealthy ? [] : ['Kernel database or registry health check failed.'],
            advisory_warnings: doctor.warnings,
            active: true,
            checks: {
                database: databaseHealthy,
                registry: registryHealthy,
                augury: doctor.status === 'pass',
                augury_required: false,
                augury_status: doctor.status,
            },
            telemetry: summarizeRecentMcpUsage(),
            usefulness: summarizeRecentMcpUsefulness(),
            token_path: summarizeRecentTokenPathIntegration(),
        });
    } catch (error: any) {
        return textResponse({ status: 'fail', error: error.message }, true);
    }
}

export async function handleVerifyPlan() {
    try {
        const root = registry.getRoot();
        const session = resolveActivePlanningSession(root);
        const handoff = buildTraceAgentHandoffPayload(session, root);
        let last_validation: { verdict: string; recorded_at: number; validation_id: string; authority_class: string } | null = null;
        if (handoff?.lead_bead_id) {
            try {
                const runs = database.getValidationRuns(handoff.lead_bead_id);
                if (runs && runs.length > 0) {
                    const sorted = [...runs].sort((a: any, b: any) => (b.created_at ?? 0) - (a.created_at ?? 0));
                    const latest: any = sorted[0];
                    last_validation = {
                        verdict: String(latest.verdict ?? 'INCONCLUSIVE'),
                        recorded_at: Number(latest.created_at ?? 0),
                        validation_id: String(latest.validation_id ?? ''),
                        authority_class: String(latest.authority_class ?? 'legacy_unverified'),
                    };
                }
            } catch {
                // last_validation stays null on lookup failure.
            }
        }
        const commandCount = handoff?.checker_shells.length ?? 0;
        const authoritativeValidation = last_validation?.authority_class === 'verified' || last_validation?.authority_class === 'internal';
        return textResponse({
            status: authoritativeValidation ? 'evidence_available' : commandCount > 0 ? 'declared_unexecuted' : 'empty',
            recommended_commands: (handoff?.checker_shells || []).slice(0, 3),
            command_authority: commandCount > 0 ? 'bead_declared_unexecuted' : 'none',
            reason: commandCount > 0 ? 'The active bead declares focused checker text; CStar has not executed or verified it.' : 'No checker_shell is attached to the active bead.',
            bead_id: handoff?.lead_bead_id,
            target_paths: handoff?.target_paths || [],
            last_validation,
            guardrail: authoritativeValidation
                ? mcpGuardrail('allow', 'continue', 'An authoritative validation record is available.')
                : commandCount > 0
                    ? mcpGuardrail('caution', 'verify', 'Checker text is unexecuted bead metadata and cannot prove validation.')
                : mcpGuardrail(
                    'caution',
                    'repair',
                    'No checker command or prior validation is available for the active bead.',
                    [],
                    ['verification'],
                ),
            next_action: commandCount > 0
                ? 'Inspect the declared command, run it only through an authorized harness, and bind its transcript hash before recording the result.'
                : 'Add checker_shell evidence to the bead or record a validation result before resolving work.',
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
