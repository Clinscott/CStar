import type { WorkerResult } from './worker_bridge.js';


export const RETIRED_ORCHESTRATOR_RUNTIME_ERROR =
    'legacy_orchestrator_runtime_retired_use_cstar_kernel';

export interface WorkerOutcomeClassification {
    finalStatus: 'BLOCKED' | 'NEEDS_TRIAGE' | 'READY_FOR_REVIEW' | 'RESOLVED';
    triageReason: string | null;
}


function compactFailure(stderr: string): string {
    return stderr
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-5)
        .join(' ') || 'no bounded failure output';
}


/** Pure classification only; it never reads or writes lifecycle state. */
export function classifyWorkerOutcome(
    result: WorkerResult,
    currentStatus: string = 'IN_PROGRESS',
    originalAssignment: string = 'unassigned',
): WorkerOutcomeClassification {
    if (result.timedOut || result.exitCode === 124) {
        return {
            finalStatus: 'BLOCKED',
            triageReason: `Worker timed out. Original assignment preserved: ${originalAssignment}. Suggested recovery: operator reviews the evidence and resumes through the durable request boundary.`,
        };
    }
    if (result.exitCode !== 0) {
        return {
            finalStatus: 'BLOCKED',
            triageReason: `Worker failed (exit ${result.exitCode}). Last log: ${compactFailure(result.stderr)}. Original assignment preserved: ${originalAssignment}. Suggested recovery: operator reviews the evidence and resumes through the durable request boundary.`,
        };
    }
    if (result.stdout.trim().length < 10) {
        return {
            finalStatus: 'NEEDS_TRIAGE',
            triageReason: 'Worker exited with 0 but provided no meaningful bounded output.',
        };
    }
    return {
        finalStatus: currentStatus === 'RESOLVED' ? 'RESOLVED' : 'READY_FOR_REVIEW',
        triageReason: null,
    };
}


export class OrchestratorReaper {
    constructor(projectRoot: string) {
        void projectRoot;
    }

    public async mapOutcome(beadId: string, result: WorkerResult): Promise<never> {
        void beadId;
        void result;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }
}
