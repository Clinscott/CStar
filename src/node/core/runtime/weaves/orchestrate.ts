import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    OrchestrateWeavePayload,
    OrchestrateWeaveMetadata,
    HostWorkerWeavePayload,
    CompressWeavePayload,
    RuntimeDispatchPort
} from '../contracts.ts';
import { OrchestratorScheduler } from  '../scheduler.js';
import { OrchestratorWorkerBridge } from  '../worker_bridge.js';
import { OrchestratorProcessManager } from  '../process_manager.js';
import { OrchestratorReaper } from  '../reaper.js';
import { OrchestratorTelemetryBridge } from  '../telemetry.js';
import { getHallBeads, getHallBead, upsertHallBead } from  '../../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../../../types/hall.js';
import chalk from 'chalk';

/**
 * [Ω] ORCHESTRATE WEAVE
 * Purpose: The sovereign execution engine for SET beads.
 * Mandate: Stateless, Deterministic, and Aggressively Reaped (Yo-Yo).
 */
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
        
        // 1. Deterministic Spin-up: Orphan Adoption & Scheduling
        const scheduler = new OrchestratorScheduler(projectRoot);
        const telemetry = new OrchestratorTelemetryBridge(projectRoot);
        const reaper = new OrchestratorReaper(projectRoot);
        
        const reapedZombies = await scheduler.reclaimZombies();
        
        // Identify beads to process
        let targetBeads = payload.bead_ids || [];
        if (targetBeads.length === 0) {
            const batchLimit = payload.limit || payload.max_parallel || 1;
            const batch = await scheduler.getNextBatch(batchLimit);
            targetBeads = batch.map(b => b.id);
        }

        if (targetBeads.length === 0) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: '[ORCHESTRATOR]: No beads in SET state. Swarm remains idle.',
                metadata: { total_processed: 0, reaped_zombies: reapedZombies }
            };
        }

        // 2. Compute: Ephemeral Worker Swarm
        const bridge = new OrchestratorWorkerBridge(projectRoot, this.processManager);
        const outcomes: OrchestrateWeaveMetadata['bead_outcomes'] = {};
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const hallBeads = getHallBeads(repoId);
        
        console.log(chalk.dim(`[DEBUG] Orchestrator: repoId=${repoId}, hallBeadsCount=${hallBeads.length}`));
        if (hallBeads.length > 0) {
            console.log(chalk.dim(`[DEBUG] Orchestrator: sampleBeadId=${hallBeads[0].id}`));
        }

        if (payload.dry_run) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `[DRY-RUN]: Would process ${targetBeads.length} beads: ${targetBeads.join(', ')}`,
                metadata: { total_processed: targetBeads.length, reaped_zombies: reapedZombies }
            };
        }

        // Process beads in parallel within the concurrency limit
        const limit = payload.max_parallel || 1;
        const tasks = targetBeads.slice(0, limit).map(async (beadId) => {
            const start = Date.now();
            try {
                const bead = hallBeads.find(b => b.id === beadId);
                if (!bead) return;

                // [🔱] THE SWARM PROTOCOL: Fractal Shattering
                // Only shatter if it's a SET bead, doesn't already have :child: in the ID, 
                // AND doesn't have a target_ref (which indicates it's already a child).
                const isChild = bead.id.includes(':child:') || (bead as any).target_ref;
                if (bead.status === 'SET' && !isChild) {
                    console.log(chalk.magenta(`  ↳ [SWARM]: Shattering Mission ${beadId} into specialized tasks...`));
                    
                    const children = [
                        { id: `${beadId}:child:architecture`, agent: 'ONE-MIND', kind: 'SECTOR' },
                        { id: `${beadId}:child:technical`, agent: 'AUTOBOT', kind: 'VALIDATION' }
                    ];

                    for (const child of children) {
                        upsertHallBead({
                            bead_id: child.id,
                            repo_id: bead.repo_id,
                            target_kind: child.kind as any,
                            target_path: bead.target_path,
                            rationale: `Sovereign sub-task for ${beadId}`,
                            status: 'SET',
                            assigned_agent: child.agent,
                            created_at: Date.now(),
                            updated_at: Date.now()
                        } as any);
                    }
                    
                    // Mark parent as IN_PROGRESS
                    upsertHallBead({
                        ...bead,
                        bead_id: bead.id,
                        status: 'IN_PROGRESS',
                        updated_at: Date.now()
                    } as any);
                    return;
                }

                const isHostWorker = bead?.assigned_agent === 'HOST-WORKER' || bead?.assigned_agent === 'ONE-MIND';

                if (isHostWorker && this.dispatchPort) {
                     const hostResult = await this.dispatchPort.dispatch<HostWorkerWeavePayload>({
                         weave_id: 'weave:host-worker',
                         payload: {
                             bead_id: beadId,
                             project_root: projectRoot,
                             cwd: context.workspace_root
                         },
                         session: invocation.session,
                         target: invocation.target
                     });
                     
                     const finalStatus = hostResult.status === 'SUCCESS' ? 'READY_FOR_REVIEW' : 'BLOCKED';
                     await reaper.mapOutcome(beadId, {
                         exitCode: hostResult.status === 'SUCCESS' ? 0 : 1,
                         stdout: hostResult.output ?? '',
                         stderr: hostResult.error ?? '',
                         timedOut: false
                     });

                     outcomes[beadId] = {
                         status: finalStatus,
                         exit_code: hostResult.status === 'SUCCESS' ? 0 : 1,
                         duration_ms: Date.now() - start
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
                    
                    outcomes[beadId] = {
                        status: finalStatus,
                        exit_code: workerResult.exitCode,
                        duration_ms: Date.now() - start
                    };
                }

                if (outcomes[beadId]?.status === 'READY_FOR_REVIEW' && this.dispatchPort) {
                    console.log(chalk.dim(`  ↳ Engraving episodic memory for ${beadId}...`));
                    try {
                        const { execa } = await import('execa');
                        const diffResult = await execa('git', ['diff', 'HEAD'], { cwd: projectRoot });
                        await this.dispatchPort.dispatch<CompressWeavePayload>({
                            weave_id: 'weave:distill',
                            payload: {
                                bead_id: beadId,
                                bead_intent: bead.rationale,
                                project_root: projectRoot,
                                cwd: context.workspace_root,
                                git_diff: diffResult.stdout,
                                target_paths: bead.target_path ? [bead.target_path] : []
                            }
                        });
                    } catch (e) {
                        // Ignore engraving failures so we don't break the orchestrator
                        console.error(chalk.yellow(`  [!] Failed to engrave episodic memory: ${e}`));
                    }
                }

                await telemetry.recordExecution(beadId, outcomes[beadId]!);
            } catch (err: any) {
                outcomes[beadId] = {
                    status: 'BLOCKED',
                    error: err.message,
                    duration_ms: Date.now() - start
                };
            }
        });

        await Promise.all(tasks);

        // 3. Forced Termination: Aggressive Reaping
        await this.processManager.reapAll();

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ORCHESTRATOR]: Batch complete. Processed ${targetBeads.length} beads.`,
            metadata: {
                bead_outcomes: outcomes,
                reaped_zombies: reapedZombies,
                total_processed: targetBeads.length
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
