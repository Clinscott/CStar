import path from 'node:path';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    buildTraceAgentHandoffPayload,
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

export async function handleHallMaintenance({ action, limit, memory_id }: { action: 'study' | 'harvest'; limit?: number; memory_id?: string }) {
    try {
        if (action === 'study') {
            if (!memory_id) return textResponse({ error: 'study action requires memory_id' }, true);
            const result = await database.getDb().prepare('SELECT * FROM hall_episodic_memory WHERE memory_id = ?').get(memory_id);
            if (!result) return textResponse({ error: `Engram ${memory_id} not found` }, true);
            return textResponse({ status: 'ready_to_study', memory_id });
        }
        if (action === 'harvest') {
            const unstudied = database.listUnstudiedEngrams(true);
            const targetIds = unstudied.slice(0, limit || 5).map((e) => e.memory_id);
            return textResponse({
                status: 'harvest_queue_ready',
                total_unstudied: unstudied.length,
                queue: targetIds,
            });
        }
        return textResponse({ error: 'Invalid action' }, true);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
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
        const session = resolveActivePlanningSession(root);
        const doctor = buildAuguryDoctorPayload(session, root);
        const db = database.getDb(root);
        return textResponse({
            status: doctor.status === 'pass' ? 'healthy' : 'degraded',
            score: doctor.score,
            warnings: doctor.warnings,
            active: true,
            checks: {
                database: db !== null,
                registry: !!root,
                augury: doctor.status === 'pass',
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
