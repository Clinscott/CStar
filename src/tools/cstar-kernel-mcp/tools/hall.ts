import path from 'node:path';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    buildTraceAgentHandoffPayload,
    buildRuntimeTraceHandoffPayload,
    resolveActivePlanningSession,
    resolveActiveTraceHandoffPayload,
    buildAuguryDoctorPayload,
} from '../../../node/core/commands/trace.js';
import { mcpGuardrail, textResponse } from '../contracts/responses.js';
import { detectAuguryTargetDivergence } from './augury_routing.js';
import {
    summarizeRecentMcpUsage,
    summarizeRecentMcpUsefulness,
} from '../telemetry/usage.js';
import { summarizeRecentTokenPathIntegration } from '../telemetry/token_path.js';
import {
    buildKernelRuntimeLineage,
    evaluateKernelForgeReadiness,
    CODE_ROOT,
    CONTROL_ROOT,
    KERNEL_ROOT_BINDING_MODE,
} from '../contracts/runtime.js';

export const RETIRED_HALL_MAINTENANCE_ERROR = (
    'legacy_hall_maintenance_retired_use_bounded_hall_search'
);

export async function handleHallMaintenance(_args: unknown) {
    return textResponse({
        error: RETIRED_HALL_MAINTENANCE_ERROR,
        decommissioned: true,
        actuated: false,
    }, true);
}

export interface HandoffArgs {
    bead_id?: string;
    prompt?: string;
    scope?: string;
    target_paths?: string[];
}

function runtimeIdentity() {
    const lineage = buildKernelRuntimeLineage();
    return {
        code_root: lineage.code_root,
        control_root: lineage.control_root,
        binding_sha256: lineage.binding_sha256,
    };
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

export function buildHandoffMcpPayload(handoff: any, root: string, args: HandoffArgs = {}) {
    if (args.bead_id?.trim()) {
        const bead = database.getHallBead(args.bead_id.trim());
        if (!bead) {
            return {
                status: 'missing_explicit_bead',
                authoritative: false,
                requested_bead_id: args.bead_id.trim(),
                runtime_identity: runtimeIdentity(),
                guardrail: mcpGuardrail(
                    'block',
                    'recover',
                    'The requested current bead was not found in CStar.',
                    ['handoff_bead_not_found'],
                    ['handoff'],
                ),
                next_action: 'Inspect the exact bead id through cstar_bead or create a bounded bead before execution.',
            };
        }
        const targetDivergence = detectAuguryTargetDivergence(
            args.target_paths ?? [],
            bead.target_path ? [bead.target_path] : [],
            CODE_ROOT,
        );
        if (args.target_paths && args.target_paths.length > 0 && targetDivergence.diverged) {
            return {
                status: 'explicit_bead_target_divergence',
                authoritative: false,
                requested_bead_id: bead.id,
                requested_target_paths: args.target_paths,
                divergence: targetDivergence,
                runtime_identity: runtimeIdentity(),
                guardrail: mcpGuardrail(
                    'caution',
                    'verify',
                    'The exact bead exists, but its target does not cover the caller targets.',
                    [],
                    ['explicit_bead_target_divergence'],
                ),
                next_action: 'Use the exact bead target or create a separately scoped bead; do not widen this handoff.',
            };
        }
        const explicitHandoff = buildRuntimeTraceHandoffPayload(bead, root, CODE_ROOT);
        const terminal = ['RESOLVED', 'ARCHIVED', 'SUPERSEDED'].includes(bead.status);
        return {
            status: terminal ? 'completed_explicit_bead' : 'active_explicit_bead',
            authoritative: !terminal,
            active_session_authority: 'explicit_bead',
            requested_bead_id: bead.id,
            runtime_identity: runtimeIdentity(),
            ...compactHandoffSession(explicitHandoff),
            guardrail: terminal
                ? mcpGuardrail(
                    'caution',
                    'recover',
                    'The exact bead is terminal and cannot become current execution truth.',
                    ['handoff_bead_terminal'],
                    ['handoff'],
                )
                : mcpGuardrail('allow', 'continue', 'The exact CStar bead is the current handoff target.'),
        };
    }

    if (!handoff) {
        return {
            status: 'idle',
            runtime_identity: runtimeIdentity(),
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

    const requestedTargets = args.target_paths ?? [];
    const divergence = detectAuguryTargetDivergence(requestedTargets, handoff.target_paths, CODE_ROOT);
    if (requestedTargets.length > 0 && divergence.diverged) {
        return {
            status: 'background_active_session',
            authoritative: false,
            stale_session_demoted: true,
            active_session_authority: 'background',
            runtime_identity: runtimeIdentity(),
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
        runtime_identity: runtimeIdentity(),
        ...compactHandoffSession(handoff),
        guardrail: handoff.execution_gate === 'execution_guarded'
            ? mcpGuardrail(
                'caution',
                'verify',
                'Execution is staged; operator release and verification evidence are required before follow-on work.',
                [],
                ['execution_gate'],
            )
            : mcpGuardrail('allow', 'continue', 'Active handoff is available.'),
    };
}

export async function handleHandoff(args: HandoffArgs = {}) {
    try {
        const root = registry.getRoot();
        const handoff = resolveActiveTraceHandoffPayload(root, CODE_ROOT);
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
        const session = resolveActivePlanningSession(root);
        const doctor = buildAuguryDoctorPayload(session, root, CODE_ROOT);
        const db = database.getReadDb(root);
        const runtimeLineage = buildKernelRuntimeLineage();
        const liveRootBinding = KERNEL_ROOT_BINDING_MODE === 'live_launcher';
        const rootBindingHealthy = liveRootBinding
            && root === CONTROL_ROOT
            && process.env.CSTAR_CODE_ROOT === runtimeLineage.code_root
            && process.env.CSTAR_CONTROL_ROOT === runtimeLineage.control_root
            && process.env.CSTAR_PROJECT_ROOT === runtimeLineage.control_root
            && process.env.CSTAR_WORKSPACE_ROOT === runtimeLineage.control_root;
        const dependencyLineageHealthy = runtimeLineage.dependency_lineage === 'verified_lock_match';
        const forgeRuntimePresent = runtimeLineage.forge_runtime_manifest_present;
        const forgeReadiness = evaluateKernelForgeReadiness(runtimeLineage);
        const forgeReady = rootBindingHealthy && forgeReadiness.ready;
        return textResponse({
            status: doctor.status === 'pass' && (!liveRootBinding || rootBindingHealthy)
                ? 'healthy'
                : 'degraded',
            score: doctor.score,
            warnings: doctor.warnings,
            active: true,
            checks: {
                database: db !== null,
                registry: !!root,
                augury: doctor.status === 'pass',
                root_binding: rootBindingHealthy,
                dependency_lineage: dependencyLineageHealthy,
                forge_runtime_manifest: forgeRuntimePresent,
                forge_readiness: forgeReady,
            },
            readiness: {
                kernel_root_binding: rootBindingHealthy,
                forge: forgeReady,
                forge_failures: forgeReadiness.failures,
            },
            runtime_lineage: runtimeLineage,
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
        const handoff = buildTraceAgentHandoffPayload(session, root, CODE_ROOT);
        let last_validation: { verdict: string; recorded_at: number; validation_id: string } | null = null;
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
                    };
                }
            } catch {
                // last_validation stays null on lookup failure.
            }
        }
        const commandCount = handoff?.checker_shells.length ?? 0;
        return textResponse({
            status: commandCount > 0 || last_validation ? 'ready' : 'empty',
            recommended_commands: (handoff?.checker_shells || []).slice(0, 3),
            reason: commandCount > 0 ? 'Verified from active bead checker shells.' : 'No checker_shell is attached to the active bead.',
            bead_id: handoff?.lead_bead_id,
            target_paths: handoff?.target_paths || [],
            last_validation,
            guardrail: commandCount > 0 || last_validation
                ? mcpGuardrail('allow', 'verify', 'Verification path is available.')
                : mcpGuardrail(
                    'caution',
                    'repair',
                    'No checker command or prior validation is available for the active bead.',
                    [],
                    ['verification'],
                ),
            next_action: commandCount > 0
                ? 'Run the recommended checker command before recording the result.'
                : 'Add checker_shell evidence to the bead or record a validation result before resolving work.',
        });
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
