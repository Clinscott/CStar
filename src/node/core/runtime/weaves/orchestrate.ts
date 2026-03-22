import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    OrchestrateWeavePayload,
    OrchestrateWeaveMetadata,
    HostWorkerWeavePayload,
    RuntimeDispatchPort
} from '../contracts.ts';
import { OrchestratorScheduler } from  '../scheduler.js';
import { OrchestratorWorkerBridge } from  '../worker_bridge.js';
import { OrchestratorProcessManager } from  '../process_manager.js';
import { OrchestratorReaper } from  '../reaper.js';
import { OrchestratorTelemetryBridge } from  '../telemetry.js';
import { getHallBeads } from  '../../../../tools/pennyone/intel/database.js';

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
            const batch = await scheduler.getNextBatch(payload.max_parallel || 1);
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
        const hallBeads = getHallBeads(projectRoot);

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
                const isHostWorker = bead?.assigned_agent === 'HOST-WORKER';

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
