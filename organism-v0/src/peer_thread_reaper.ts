import {
    evaluateThreadReap,
    type ThreadReapCandidate,
} from './peer_thread_lifecycle.ts';

export interface EngramRecordAck {
    status: string;
    memoryId: string;
}

export interface ThreadArchiveAck {
    archived: boolean;
}

export interface ThreadArchiveReceipt {
    schema: 'cstar.organism.thread-archive-receipt.v1';
    actor: 'organism_reaper';
    threadId: string;
    hostId: string;
    beadId: string;
    effectId: string;
    memoryId: string;
    terminalSha256: string;
    archived: true;
    deleted: false;
}

export interface ThreadReaperPorts {
    recordEngram: (args: {
        intent: string;
        bead_id: string;
        memory_id: string;
        metadata: Record<string, unknown>;
    }) => Promise<EngramRecordAck>;
    archiveThread: (args: {
        threadId: string;
        hostId: string;
        archived: true;
    }) => Promise<ThreadArchiveAck>;
    persistArchiveReceipt: (receipt: ThreadArchiveReceipt) => Promise<void>;
}

export type ThreadReaperRunStatus =
    | 'ARCHIVED'
    | 'HELD'
    | 'REJECTED'
    | 'ENGRAM_RECORD_FAILED'
    | 'ARCHIVE_FAILED'
    | 'ARCHIVE_RECEIPT_FAILED';

export interface ThreadReaperRunResult {
    status: ThreadReaperRunStatus;
    policyVerdict: string;
    receipt: ThreadArchiveReceipt | null;
    failure: string | null;
}

function heldOrRejected(verdict: string, failure: string | null): ThreadReaperRunResult {
    return {
        status: verdict === 'REJECTED' ? 'REJECTED' : 'HELD',
        policyVerdict: verdict,
        receipt: null,
        failure,
    };
}

export async function runThreadReaper(
    candidate: ThreadReapCandidate,
    ports: ThreadReaperPorts,
): Promise<ThreadReaperRunResult> {
    let current = candidate;
    let decision = evaluateThreadReap(current);

    if (decision.verdict === 'RECORD_ENGRAM') {
        try {
            const action = decision.engramAction;
            if (!action) throw new Error('ENGRAM_ACTION_MISSING');
            const ack = await ports.recordEngram(action.args);
            if (ack.status !== 'recorded' || ack.memoryId !== action.args.memory_id) {
                return {
                    status: 'ENGRAM_RECORD_FAILED',
                    policyVerdict: decision.verdict,
                    receipt: null,
                    failure: 'ENGRAM_ACK_MISMATCH',
                };
            }
            current = {
                ...current,
                engram: {
                    durable: true,
                    memoryId: ack.memoryId,
                    threadId: current.threadId,
                    terminalSha256: current.terminalSha256,
                },
            };
            decision = evaluateThreadReap(current);
        } catch (error) {
            return {
                status: 'ENGRAM_RECORD_FAILED',
                policyVerdict: decision.verdict,
                receipt: null,
                failure: error instanceof Error ? error.message : String(error),
            };
        }
    }

    if (decision.verdict !== 'REAP_ELIGIBLE') {
        return heldOrRejected(decision.verdict, decision.failures[0] ?? null);
    }

    const archiveAction = decision.archiveAction;
    if (!archiveAction) {
        return {
            status: 'ARCHIVE_FAILED',
            policyVerdict: decision.verdict,
            receipt: null,
            failure: 'ARCHIVE_ACTION_MISSING',
        };
    }

    let archiveAck: ThreadArchiveAck;
    try {
        archiveAck = await ports.archiveThread(archiveAction.args);
    } catch (error) {
        return {
            status: 'ARCHIVE_FAILED',
            policyVerdict: decision.verdict,
            receipt: null,
            failure: error instanceof Error ? error.message : String(error),
        };
    }
    if (!archiveAck.archived) {
        return {
            status: 'ARCHIVE_FAILED',
            policyVerdict: decision.verdict,
            receipt: null,
            failure: 'ARCHIVE_ACK_NON_PASS',
        };
    }

    const memoryId = current.engram?.memoryId;
    if (!memoryId) {
        return {
            status: 'ARCHIVE_FAILED',
            policyVerdict: decision.verdict,
            receipt: null,
            failure: 'ENGRAM_MEMORY_ID_MISSING',
        };
    }
    const receipt: ThreadArchiveReceipt = {
        schema: 'cstar.organism.thread-archive-receipt.v1',
        actor: 'organism_reaper',
        threadId: current.threadId,
        hostId: current.hostId,
        beadId: current.beadId,
        effectId: current.effectId,
        memoryId,
        terminalSha256: current.terminalSha256,
        archived: true,
        deleted: false,
    };
    try {
        await ports.persistArchiveReceipt(receipt);
    } catch (error) {
        return {
            status: 'ARCHIVE_RECEIPT_FAILED',
            policyVerdict: decision.verdict,
            receipt,
            failure: error instanceof Error ? error.message : String(error),
        };
    }
    return {
        status: 'ARCHIVED',
        policyVerdict: decision.verdict,
        receipt,
        failure: null,
    };
}
