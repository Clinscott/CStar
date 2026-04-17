import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    OrchestrateWeavePayload,
    OrchestrateWeaveMetadata,
    CompressWeavePayload,
    RuntimeDispatchPort
} from '../contracts.ts';
import { OrchestratorScheduler } from  '../scheduler.js';
import { OrchestratorWorkerBridge } from  '../worker_bridge.js';
import { OrchestratorProcessManager } from  '../process_manager.js';
import { OrchestratorReaper } from  '../reaper.js';
import { OrchestratorTelemetryBridge } from  '../telemetry.js';
import { getHallBeads, saveHallSkillActivation, upsertHallBead } from  '../../../../tools/pennyone/intel/database.js';
import { getHallPlanningSession, listHallPlanningSessions, saveHallPlanningSession } from '../../../../tools/pennyone/intel/session_manager.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../../../types/hall.js';
import { inheritTraceSkillBead } from '../trace_inheritance.js';
import type { HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../../types/hall.js';
import chalk from 'chalk';
import type { SovereignBead } from '../../../../types/bead.js';
import type { SkillBead } from '../../skills/types.js';
import os from 'node:os';
import {
    buildSkillActivationParams,
    createPendingSkillActivationRecord,
    planSkillActivationForBead,
    type PlannedSkillActivation,
    type PlanningExecutionHints,
} from '../skill_activation.js';
import { engraveReadyForReviewMemory } from '../episodic_memory.js';

/**
 * [Ω] ORCHESTRATE WEAVE
 * Purpose: The sovereign execution engine for SET beads.
 * Mandate: Stateless, Deterministic, and Aggressively Reaped (Yo-Yo).
 */
function getPlanningAuguryContract(session: HallPlanningSessionRecord | null): Record<string, unknown> | undefined {
    const contract = session?.metadata?.augury_contract ?? session?.metadata?.trace_contract;
    return contract && typeof contract === 'object' && !Array.isArray(contract)
        ? contract as Record<string, unknown>
        : undefined;
}

function getTraceSelectionName(session: HallPlanningSessionRecord | null): string | undefined {
    const selectionName = getPlanningAuguryContract(session)?.selection_name;
    return typeof selectionName === 'string' && selectionName.trim()
        ? selectionName.trim().toLowerCase()
        : undefined;
}

export function derivePlanningExecutionHints(session: HallPlanningSessionRecord | null): PlanningExecutionHints | undefined {
    const contract = getPlanningAuguryContract(session);
    const selectionName = getTraceSelectionName(session);
    const selectionTier = typeof contract?.selection_tier === 'string' && contract.selection_tier.trim()
        ? contract.selection_tier.trim().toUpperCase()
        : undefined;
    const intentCategory = typeof contract?.intent_category === 'string' && contract.intent_category.trim()
        ? contract.intent_category.trim().toUpperCase()
        : undefined;

    let executionProfile: PlanningExecutionHints['execution_profile'];
    if (selectionName === 'orchestrate') {
        executionProfile = 'governance';
    } else if (
        (selectionName && ['creation_loop', 'restoration', 'evolve', 'forge', 'chant', 'contract_hardening'].includes(selectionName))
        || (intentCategory && ['BUILD', 'REPAIR', 'EVOLVE', 'HARDEN', 'VERIFY'].includes(intentCategory))
    ) {
        executionProfile = 'implementation';
    }

    if (!session?.session_id && !selectionName && !selectionTier && !executionProfile) {
        return undefined;
    }

    return {
        planning_session_id: session?.session_id,
        trace_selection_name: selectionName,
        trace_selection_tier: selectionTier,
        execution_profile: executionProfile,
    };
}

function rankPlanningSessionForOrchestrate(session: HallPlanningSessionRecord): number {
    const selectionName = getTraceSelectionName(session);
    if (selectionName === 'orchestrate') {
        return 0;
    }
    if (session.status === 'FORGE_EXECUTION') {
        return 1;
    }
    if (session.status === 'PLAN_READY') {
        return 2;
    }
    return 3;
}

export function resolveExecutionRoute(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): 'AUTOBOT' | 'HOST-WORKER' | 'ONE-MIND' {
    const assigned = String(bead.assigned_agent ?? '').trim().toUpperCase();
    if (assigned === 'AUTOBOT' || assigned === 'HOST-WORKER' || assigned === 'ONE-MIND') {
        return assigned;
    }

    if (hints?.execution_profile === 'implementation' && bead.id.includes(':child:technical')) {
        return 'AUTOBOT';
    }
    if (hints?.execution_profile === 'governance' && bead.id.includes(':child:ledger')) {
        return 'ONE-MIND';
    }

    const targetPath = String(bead.target_path ?? bead.target_ref ?? '').trim().toLowerCase();
    const hasChecker = typeof bead.checker_shell === 'string' && bead.checker_shell.trim().length > 0;
    const hasWildcardTarget = /[*?]/.test(targetPath);
    const isCodeTarget = /\.(ts|tsx|js|jsx|py|go|rs|java|c|cc|cpp|h)$/.test(targetPath);
    const isDocsTarget = /\.(md|qmd|feature|txt|rst)$/.test(targetPath);
    const isArchitectureHeavy = typeof bead.architect_opinion === 'string' && bead.architect_opinion.trim().length > 0;
    const hasCritiqueTargets = Array.isArray(bead.critique_payload?.targets) && bead.critique_payload.targets.length > 1;
    const targetsPlanningState = typeof bead.target_ref === 'string' && bead.target_ref.startsWith('chant-session:');
    const isWorkflowTarget = bead.target_kind === 'WORKFLOW' || bead.target_kind === 'REPOSITORY' || bead.target_kind === 'OTHER';

    if (isCodeTarget && hasChecker && !isArchitectureHeavy && !hasCritiqueTargets) {
        return 'AUTOBOT';
    }
    if (hasWildcardTarget || targetsPlanningState || isWorkflowTarget || isDocsTarget || isArchitectureHeavy || hasCritiqueTargets || !hasChecker) {
        return 'ONE-MIND';
    }
    return 'HOST-WORKER';
}

const ORCHESTRATE_ACTIVE_SESSION_STATUSES: HallPlanningSessionStatus[] = [
    'FORGE_EXECUTION',
    'PLAN_READY',
];

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function getSessionBeadIds(session: HallPlanningSessionRecord | null): string[] {
    return Array.from(new Set(asStringArray(session?.metadata?.bead_ids)));
}

export function resolveOrchestratePlanningSession(
    projectRoot: string,
    planningSessionId?: string,
): HallPlanningSessionRecord | null {
    if (typeof planningSessionId === 'string' && planningSessionId.trim()) {
        return getHallPlanningSession(planningSessionId.trim(), projectRoot);
    }

    const sessions = listHallPlanningSessions(projectRoot, { statuses: ORCHESTRATE_ACTIVE_SESSION_STATUSES })
        .sort((left, right) => {
            const rankDiff = rankPlanningSessionForOrchestrate(left) - rankPlanningSessionForOrchestrate(right);
            if (rankDiff !== 0) {
                return rankDiff;
            }
            return Number(right.updated_at ?? 0) - Number(left.updated_at ?? 0);
        });
    return sessions[0] ?? null;
}

export function selectPlanningSessionBeadIds(
    projectRoot: string,
    hallBeads: SovereignBead[],
    planningSessionId?: string,
): {
    planningSession: HallPlanningSessionRecord | null;
    beadIds: string[];
} {
    const planningSession = resolveOrchestratePlanningSession(projectRoot, planningSessionId);
    if (!planningSession) {
        return {
            planningSession: null,
            beadIds: [],
        };
    }

    const shardedParentBeadIds = new Set(asStringArray(planningSession.metadata?.sharded_parent_bead_ids));
    const setBeadIds = new Set(
        hallBeads
            .filter((bead) => bead.status === 'SET')
            .map((bead) => bead.id),
    );
    const sessionBeadIds = getSessionBeadIds(planningSession).filter((beadId) => setBeadIds.has(beadId));
    const childBeadIds = sessionBeadIds.filter((beadId) => beadId.includes(':child:'));
    const parentBeadIds = sessionBeadIds.filter((beadId) => !beadId.includes(':child:') && !shardedParentBeadIds.has(beadId));
    const beadIds = [...childBeadIds, ...parentBeadIds];

    return {
        planningSession,
        beadIds,
    };
}

function markPlanningSessionExecuting(session: HallPlanningSessionRecord | null, selectedBeadIds: string[]): void {
    if (!session || selectedBeadIds.length === 0) {
        return;
    }

    const now = Date.now();
    saveHallPlanningSession({
        ...session,
        status: 'FORGE_EXECUTION',
        summary: session.summary ?? 'Orchestrate claimed the released bead graph for execution.',
        updated_at: now,
        metadata: {
            ...(session.metadata ?? {}),
            active_execution_bead_ids: selectedBeadIds,
            execution_started_at: now,
        },
    });
}

function isWildcardTarget(bead: SovereignBead): boolean {
    return /[*?]/.test(String(bead.target_path ?? '').trim());
}

function isPlanningStateParent(bead: SovereignBead): boolean {
    return (
        (typeof bead.target_ref === 'string' && bead.target_ref.startsWith('chant-session:'))
        || bead.target_kind === 'WORKFLOW'
        || bead.target_kind === 'REPOSITORY'
        || isWildcardTarget(bead)
    );
}

function isChildBead(bead: SovereignBead): boolean {
    if (bead.id.includes(':child:')) {
        return true;
    }

    const targetRef = String(bead.target_ref ?? '').trim();
    return targetRef.startsWith('bead:') || targetRef.startsWith('pb-');
}

function buildShardChildren(
    bead: SovereignBead,
    hints?: PlanningExecutionHints,
): Array<{
    id: string;
    agent: 'AUTOBOT' | 'HOST-WORKER' | 'ONE-MIND';
    kind: SovereignBead['target_kind'];
    rationale: string;
    contract_refs: string[];
    acceptance_criteria: string;
    checker_shell?: string;
}> {
    const inheritedContractRefs = bead.contract_refs.length > 0
        ? [...new Set(bead.contract_refs)]
        : (bead.target_path ? [`file:${bead.target_path}`] : []);
    const inheritedAcceptance = typeof bead.acceptance_criteria === 'string' && bead.acceptance_criteria.trim().length > 0
        ? bead.acceptance_criteria.trim()
        : `Complete the bounded follow-through for ${bead.target_path ?? bead.target_ref ?? bead.id}.`;

    if (isPlanningStateParent(bead)) {
        if (hints?.execution_profile === 'implementation') {
            return [
                {
                    id: `${bead.id}:child:architecture`,
                    agent: 'ONE-MIND',
                    kind: 'SECTOR',
                    rationale: `Architectural decomposition for ${bead.id} under ${hints.trace_selection_name ?? 'implementation'} execution`,
                    contract_refs: inheritedContractRefs,
                    acceptance_criteria: inheritedAcceptance,
                },
                {
                    id: `${bead.id}:child:technical`,
                    agent: 'AUTOBOT',
                    kind: 'VALIDATION',
                    rationale: `Bounded implementation follow-through for ${bead.id} under ${hints.trace_selection_name ?? 'implementation'} execution`,
                    contract_refs: inheritedContractRefs,
                    acceptance_criteria: inheritedAcceptance,
                    checker_shell: bead.checker_shell ?? undefined,
                },
            ];
        }

        return [
            {
                id: `${bead.id}:child:architecture`,
                agent: 'ONE-MIND',
                kind: 'WORKFLOW',
                rationale: `Architectural decomposition and provider-fit planning for ${bead.id}`,
                contract_refs: inheritedContractRefs,
                acceptance_criteria: inheritedAcceptance,
            },
            {
                id: `${bead.id}:child:ledger`,
                agent: 'ONE-MIND',
                kind: 'WORKFLOW',
                rationale: `Hall/state mutation follow-through for ${bead.id}`,
                contract_refs: inheritedContractRefs,
                acceptance_criteria: inheritedAcceptance,
            },
        ];
    }

    return [
        {
            id: `${bead.id}:child:architecture`,
            agent: 'ONE-MIND',
            kind: 'SECTOR',
            rationale: `Architectural decomposition for ${bead.id}`,
            contract_refs: inheritedContractRefs,
            acceptance_criteria: inheritedAcceptance,
        },
        {
            id: `${bead.id}:child:technical`,
            agent: 'AUTOBOT',
            kind: 'VALIDATION',
            rationale: `Bounded implementation follow-through for ${bead.id}`,
            contract_refs: inheritedContractRefs,
            acceptance_criteria: inheritedAcceptance,
            checker_shell: bead.checker_shell ?? undefined,
        },
    ];
}

function attachShardChildrenToPlanningSession(
    session: HallPlanningSessionRecord | null,
    parentBeadId: string,
    childIds: string[],
    projectRoot: string,
): void {
    if (!session || childIds.length === 0) {
        return;
    }

    const persistedSession = getHallPlanningSession(session.session_id, projectRoot) ?? session;

    const currentBeadIds = getSessionBeadIds(persistedSession);
    const nextBeadIds: string[] = [];
    let inserted = false;
    for (const beadId of currentBeadIds) {
        nextBeadIds.push(beadId);
        if (beadId === parentBeadId) {
            nextBeadIds.push(...childIds);
            inserted = true;
        }
    }
    if (!inserted) {
        nextBeadIds.push(...childIds);
    }

    saveHallPlanningSession({
        ...persistedSession,
        updated_at: Date.now(),
        metadata: {
            ...(persistedSession.metadata ?? {}),
            bead_ids: Array.from(new Set(nextBeadIds)),
            sharded_parent_bead_ids: Array.from(new Set([
                ...asStringArray(persistedSession.metadata?.sharded_parent_bead_ids),
                parentBeadId,
            ])),
        },
    });
}

function buildActivationId(beadId: string, now: number): string {
    return `activation:${beadId}:${now}`;
}

function checkSystemVitals(): { ok: boolean; reason?: string; metrics?: any } {
    const memory = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;
    const heapUsedPercent = (memory.heapUsed / memory.heapTotal) * 100;

    // [🔱] THE FAIL-FAST THRESHOLDS
    if (usedMemPercent > 95) {
        return { ok: false, reason: 'SYSTEM_OOM_RISK', metrics: { usedMemPercent } };
    }
    if (heapUsedPercent > 90) {
        return { ok: false, reason: 'NODE_HEAP_PRESSURE', metrics: { heapUsedPercent } };
    }

    return { ok: true, metrics: { usedMemPercent, heapUsedPercent } };
}

function toSkillBead(
    activationId: string,
    bead: SovereignBead,
    planned: PlannedSkillActivation,
    projectRoot: string,
    cwd: string,
    hints?: PlanningExecutionHints,
): SkillBead<Record<string, unknown>> {
    return {
        id: activationId,
        skill_id: planned.skill_id,
        target_path: planned.target_path || bead.target_path || projectRoot,
        intent: planned.intent,
        params: buildSkillActivationParams(bead, planned, projectRoot, cwd, hints),
        status: 'PENDING',
        priority: 1,
    };
}

export class OrchestrateWeave implements RuntimeAdapter<OrchestrateWeavePayload> {
    public readonly id = 'weave:orchestrate';
    private processManager = new OrchestratorProcessManager();

    public constructor(private readonly dispatchPort?: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<OrchestrateWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        
        // [🔱] THE RESOURCE GATE: Fail-Fast if the body is failing
        const vitals = checkSystemVitals();
        if (!vitals.ok) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `[FAIL-FAST]: Orchestration aborted due to resource pressure: ${vitals.reason}. Metrics: ${JSON.stringify(vitals.metrics)}`
            };
        }

        // 1. Deterministic Spin-up: Orphan Adoption & Scheduling
        const scheduler = new OrchestratorScheduler(projectRoot);
        const telemetry = new OrchestratorTelemetryBridge(projectRoot);
        const reaper = new OrchestratorReaper(projectRoot);
        
        const reapedZombies = await scheduler.reclaimZombies();
        const hallBeads = getHallBeads(projectRoot);
        const planningSelection = selectPlanningSessionBeadIds(projectRoot, hallBeads, payload.planning_session_id);
        const planningHints = derivePlanningExecutionHints(planningSelection.planningSession);
        
        // Identify beads to process
        let targetBeads = payload.bead_ids || [];
        if (targetBeads.length === 0) {
            if (planningSelection.beadIds.length > 0) {
                const batchLimit = payload.limit || payload.max_parallel || 1;
                targetBeads = planningSelection.beadIds.slice(0, batchLimit);
                markPlanningSessionExecuting(planningSelection.planningSession, targetBeads);
            } else {
                const batchLimit = payload.limit || payload.max_parallel || 1;
                const batch = await scheduler.getNextBatch(batchLimit);
                targetBeads = batch.map(b => b.id);
            }
        }

        if (targetBeads.length === 0) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: '[ORCHESTRATOR]: No beads in SET state. Swarm remains idle.',
                metadata: {
                    context_policy: 'project',
                    total_processed: 0,
                    reaped_zombies: reapedZombies,
                    planning_session_id: planningSelection.planningSession?.session_id,
                    selected_bead_ids: [],
                }
            };
        }

        // 2. Compute: Ephemeral Worker Swarm
        const bridge = new OrchestratorWorkerBridge(projectRoot, this.processManager);
        const outcomes: OrchestrateWeaveMetadata['bead_outcomes'] = {};
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        
        console.log(chalk.dim(`[DEBUG] Orchestrator: repoId=${repoId}, hallBeadsCount=${hallBeads.length}`));
        if (hallBeads.length > 0) {
            console.log(chalk.dim(`[DEBUG] Orchestrator: sampleBeadId=${hallBeads[0].id}`));
        }

        if (payload.dry_run) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `[DRY-RUN]: Would process ${targetBeads.length} beads: ${targetBeads.join(', ')}`,
                metadata: {
                    context_policy: 'project',
                    total_processed: targetBeads.length,
                    reaped_zombies: reapedZombies,
                    planning_session_id: planningSelection.planningSession?.session_id,
                    selected_bead_ids: targetBeads,
                }
            };
        }

        // Process beads in parallel within the concurrency limit
        const limit = payload.max_parallel || 1;
        let stopOrchestration = false;
        let failReason = '';

        const tasks = targetBeads.slice(0, limit).map(async (beadId) => {
            if (stopOrchestration) return;
            const start = Date.now();
            let bead: SovereignBead | undefined;
            try {
                bead = hallBeads.find(b => b.id === beadId);
                if (!bead) return;

                // [🔱] THE SWARM PROTOCOL: Fractal Shattering
                // Planning/session beads stay as parents and must shard before provider routing.
                const isChild = isChildBead(bead as SovereignBead);
                if (bead.status === 'SET' && !isChild) {
                    console.log(chalk.magenta(`  ↳ [SWARM]: Shattering Mission ${beadId} into specialized tasks...`));
                    
                    const children = buildShardChildren(bead as SovereignBead, planningHints);
                    const childIds: string[] = [];

                    for (const child of children) {
                        // [🔱] DETERMINISTIC ROUTING
                        const assignedAgent = resolveExecutionRoute({
                            ...bead,
                            id: child.id,
                            assigned_agent: child.agent,
                        } as SovereignBead, planningHints);

                        upsertHallBead({
                            bead_id: child.id,
                            repo_id: bead.repo_id,
                            target_kind: child.kind as any,
                            target_ref: bead.id,
                            target_path: bead.target_path,
                            rationale: child.rationale,
                            contract_refs: child.contract_refs,
                            acceptance_criteria: child.acceptance_criteria,
                            checker_shell: child.checker_shell,
                            status: 'SET',
                            assigned_agent: assignedAgent,
                            created_at: Date.now(),
                            updated_at: Date.now()
                        } as any);
                        childIds.push(child.id);
                    }

                    attachShardChildrenToPlanningSession(planningSelection.planningSession, beadId, childIds, projectRoot);
                    
                    // Mark parent as IN_PROGRESS
                    upsertHallBead({
                        ...bead,
                        bead_id: bead.id,
                        status: 'IN_PROGRESS',
                        updated_at: Date.now()
                    } as any);
                    return;
                }

                const executionRoute = resolveExecutionRoute(bead as SovereignBead, planningHints);
                if (this.dispatchPort) {
                    const now = Date.now();
                    const planned = planSkillActivationForBead(bead as SovereignBead, planningHints);
                    const activationId = buildActivationId(beadId, now);
                    const activationRecord = createPendingSkillActivationRecord(
                        repoId,
                        planningSelection.planningSession?.session_id,
                        bead as SovereignBead,
                        activationId,
                        planned,
                        now,
                    );
                    saveHallSkillActivation(activationRecord);

                    const skillBead = toSkillBead(
                        activationId,
                        bead as SovereignBead,
                        planned,
                        projectRoot,
                        context.workspace_root,
                        planningHints,
                    );
                    const skillResult = await this.dispatchPort.dispatch(inheritTraceSkillBead(skillBead, context));
                    const completedAt = Date.now();

                    let finalStatus = 'IN_PROGRESS';
                    let exitCode = 0;

                    if (skillResult.status === 'SUCCESS' || skillResult.status === 'FAILURE') {
                        exitCode = skillResult.status === 'SUCCESS' ? 0 : 1;
                        finalStatus = await reaper.mapOutcome(beadId, {
                            exitCode,
                            stdout: skillResult.output ?? '',
                            stderr: skillResult.error ?? '',
                            timedOut: false,
                        });
                    } else {
                        upsertHallBead({
                            ...bead,
                            bead_id: bead.id,
                            status: 'IN_PROGRESS',
                            updated_at: completedAt,
                            assigned_agent: planned.role?.toUpperCase(),
                        } as any);
                    }

                    if (finalStatus === 'BLOCKED' || finalStatus === 'FAILED') {
                        stopOrchestration = true;
                        failReason = `Bead ${beadId} ${finalStatus}: ${skillResult.error || 'Unknown skill error'}`;
                    }

                    saveHallSkillActivation({
                        ...activationRecord,
                        status: skillResult.status === 'SUCCESS'
                            ? 'COMPLETED'
                            : skillResult.status === 'FAILURE'
                                ? 'FAILED'
                                : 'ACTIVE',
                        result_summary: skillResult.output || undefined,
                        error_text: skillResult.error || undefined,
                        updated_at: completedAt,
                        completed_at: skillResult.status === 'TRANSITIONAL' ? undefined : completedAt,
                        metadata: {
                            ...(activationRecord.metadata ?? {}),
                            dispatch_status: skillResult.status,
                            result_weave_id: skillResult.weave_id,
                            result_metadata: skillResult.metadata ?? {},
                        },
                    });

                    outcomes[beadId] = {
                        status: finalStatus,
                        exit_code: exitCode,
                        duration_ms: completedAt - start,
                        route: `SKILL:${planned.skill_id}`,
                    };
                } else {
                    // Heartbeat pulse setup
                    const pulseInterval = setInterval(() => {
                        telemetry.pulse(beadId);
                    }, 30000); // 30s heartbeats

                    const workerResult = await bridge.executeBead(beadId, {
                        timeout: payload.tick_timeout || 300,
                        worker_identity: payload.worker_identity
                    });

                    clearInterval(pulseInterval);

                    const finalStatus = await reaper.mapOutcome(beadId, workerResult);
                    
                    if (finalStatus === 'BLOCKED' || finalStatus === 'FAILED') {
                        stopOrchestration = true;
                        failReason = `Bead ${beadId} ${finalStatus}: ${workerResult.stderr || 'Unknown worker error'}`;
                    }

                    outcomes[beadId] = {
                        status: finalStatus,
                        exit_code: workerResult.exitCode,
                        duration_ms: Date.now() - start,
                        route: executionRoute,
                    };
                }

                if (outcomes[beadId]?.status === 'READY_FOR_REVIEW' && this.dispatchPort) {
                    console.log(chalk.dim(`  ↳ Engraving episodic memory for ${beadId}...`));
                    try {
                        await engraveReadyForReviewMemory({
                            bead_id: beadId,
                            bead_intent: bead.rationale,
                            project_root: projectRoot,
                            cwd: context.workspace_root,
                            target_paths: bead.target_path ? [bead.target_path] : [],
                            context,
                            dispatchPort: this.dispatchPort,
                            session_id: invocation.session?.session_id,
                            target_domain: invocation.target?.domain ?? context.target_domain,
                            spoke: invocation.target?.spoke,
                        });
                    } catch (e) {
                        // Ignore engraving failures so we don't break the orchestrator
                        console.error(chalk.yellow(`  [!] Failed to engrave episodic memory: ${e}`));
                    }
                }

                await telemetry.recordExecution(beadId, outcomes[beadId]!);
            } catch (err: any) {
                stopOrchestration = true;
                failReason = `Critical failure processing bead ${beadId}: ${err.message}`;
                    outcomes[beadId] = {
                        status: 'BLOCKED',
                        error: err.message,
                        duration_ms: Date.now() - start,
                        route: bead ? resolveExecutionRoute(bead as SovereignBead, planningHints) : undefined,
                    };
                }
        });

        await Promise.all(tasks);

        // 3. Forced Termination: Aggressive Reaping
        await this.processManager.reapAll();

        if (stopOrchestration) {
            console.error(chalk.red(`\n[FAIL-FAST]: Orchestration halted. ${failReason}`));
            return {
                weave_id: this.id,
                status: 'FAILURE',
                error: failReason,
                output: `[ORCHESTRATOR]: Failed fast due to blocked bead.`,
                metadata: {
                    context_policy: 'project',
                    bead_outcomes: outcomes,
                    reaped_zombies: reapedZombies,
                    total_processed: Object.keys(outcomes).length,
                    planning_session_id: planningSelection.planningSession?.session_id,
                    selected_bead_ids: targetBeads,
                }
            };
        }

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ORCHESTRATOR]: Batch complete. Processed ${targetBeads.length} beads.`,
                metadata: {
                context_policy: 'project',
                bead_outcomes: outcomes,
                reaped_zombies: reapedZombies,
                total_processed: targetBeads.length,
                planning_session_id: planningSelection.planningSession?.session_id,
                selected_bead_ids: targetBeads,
            }
        };
    }

    /**
     * [Ω] Emergency Shutdown
     */
    public async shutdown(): Promise<void> {
        await this.processManager.reapAll();
    }
}
