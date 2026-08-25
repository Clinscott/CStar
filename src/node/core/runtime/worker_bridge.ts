import type { OrchestratorProcessManager } from './process_manager.js';


export interface WorkerOptions {
    timeout: number;
    worker_identity?: string;
}

export interface WorkerResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    execution_dispatched?: false;
    hall_mutation_started?: false;
    provider_attempted?: false;
    process_started?: false;
    source_access_started?: false;
}

export class OrchestratorWorkerBridge {
    constructor(
        workspaceRoot: string,
        processManager: OrchestratorProcessManager,
        runner?: unknown,
    ) {
        void workspaceRoot;
        void processManager;
        void runner;
    }

    public async executeBead(beadId: string, options: WorkerOptions): Promise<WorkerResult> {
        void beadId;
        void options;
        return {
            exitCode: 1,
            stdout: '',
            stderr: 'legacy_orchestrator_worker_bridge_retired_use_cstar_forge',
            timedOut: false,
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        };
    }
}
