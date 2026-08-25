export const THREAD_TOPOLOGY_COMMAND = 'INDEPENDENT_PEERS_ONLY' as const;
export const THREAD_REAP_COMMAND = 'ENGRAM_THEN_ARCHIVE' as const;
export const PEER_CREATION_SURFACE = 'codex_app.create_thread' as const;
export const ENGRAM_RECORD_SURFACE = 'cstar_engram_record' as const;
export const ARCHIVE_SURFACE = 'codex_app.set_thread_archived' as const;

export const FORBIDDEN_THREAD_SURFACES = Object.freeze([
    'collaboration.spawn_agent',
    'codex_app.fork_thread',
    'fork_turns',
] as const);

export type EstateThreadRole =
    | 'worker'
    | 'watcher'
    | 'researcher'
    | 'reviewer'
    | 'validator';

export interface PeerLaunchRequest {
    surface: string;
    role: EstateThreadRole;
    beadId: string;
    effectId: string;
    controllerThreadId: string;
    requestedSelector: string;
    requestedReasoning: string;
}

export interface PeerLaunchDecision {
    verdict: 'ADMITTED' | 'REJECTED';
    topology: typeof THREAD_TOPOLOGY_COMMAND;
    surface: typeof PEER_CREATION_SURFACE;
    failures: string[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'unknown']);

function nonEmpty(value: string): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

export function admitPeerLaunch(request: PeerLaunchRequest): PeerLaunchDecision {
    const failures: string[] = [];
    if (request.surface !== PEER_CREATION_SURFACE) failures.push('NON_PEER_CREATION_SURFACE');
    if (!nonEmpty(request.beadId)) failures.push('MISSING_BEAD_ID');
    if (!nonEmpty(request.effectId)) failures.push('MISSING_EFFECT_ID');
    if (!nonEmpty(request.controllerThreadId)) failures.push('MISSING_CONTROLLER_THREAD_ID');
    if (!nonEmpty(request.requestedSelector)) failures.push('MISSING_REQUESTED_SELECTOR');
    if (!nonEmpty(request.requestedReasoning)) failures.push('MISSING_REQUESTED_REASONING');
    return {
        verdict: failures.length === 0 ? 'ADMITTED' : 'REJECTED',
        topology: THREAD_TOPOLOGY_COMMAND,
        surface: PEER_CREATION_SURFACE,
        failures,
    };
}

export interface ThreadEngramBinding {
    durable: boolean;
    memoryId: string;
    threadId: string;
    terminalSha256: string;
}

export interface ThreadReapCandidate {
    actor: string;
    threadId: string;
    hostId: string;
    role: EstateThreadRole;
    beadId: string;
    effectId: string;
    controllerGeneration: string;
    requestedSelector: string;
    requestedReasoning: string;
    actualIdentity: string;
    terminalState: string;
    terminalVerdict: string;
    terminalReceiptPath: string;
    terminalSha256: string;
    validationStatus: string;
    decisions: string[];
    gaps: string[];
    artifactReferences: string[];
    openEffects: number;
    engram: ThreadEngramBinding | null;
    alreadyArchived?: boolean;
}

export type ReapVerdict =
    | 'RECORD_ENGRAM'
    | 'REAP_ELIGIBLE'
    | 'ALREADY_ARCHIVED'
    | 'HOLD_FOR_TERMINAL'
    | 'HOLD_FOR_ENGRAM'
    | 'HOLD_FOR_EFFECTS'
    | 'REJECTED';

export interface ThreadReapDecision {
    verdict: ReapVerdict;
    command: typeof THREAD_REAP_COMMAND;
    engramAction: {
        tool: typeof ENGRAM_RECORD_SURFACE;
        args: {
            intent: string;
            bead_id: string;
            memory_id: string;
            metadata: Record<string, unknown>;
        };
    } | null;
    archiveAction: {
        tool: typeof ARCHIVE_SURFACE;
        args: { threadId: string; hostId: string; archived: true };
    } | null;
    deleteAllowed: false;
    failures: string[];
}

export function evaluateThreadReap(candidate: ThreadReapCandidate): ThreadReapDecision {
    const base = {
        command: THREAD_REAP_COMMAND,
        deleteAllowed: false as const,
    };
    if (candidate.actor !== 'organism_reaper') {
        return { ...base, verdict: 'REJECTED', engramAction: null, archiveAction: null, failures: ['RETIREMENT_ACTOR_NOT_REAPER'] };
    }
    if (candidate.alreadyArchived) {
        return { ...base, verdict: 'ALREADY_ARCHIVED', engramAction: null, archiveAction: null, failures: [] };
    }
    if (!TERMINAL_STATES.has(candidate.terminalState)) {
        return { ...base, verdict: 'HOLD_FOR_TERMINAL', engramAction: null, archiveAction: null, failures: ['THREAD_NOT_TERMINAL'] };
    }
    if (!nonEmpty(candidate.terminalReceiptPath) || !SHA256.test(candidate.terminalSha256)) {
        return { ...base, verdict: 'HOLD_FOR_TERMINAL', engramAction: null, archiveAction: null, failures: ['TERMINAL_BINDING_INVALID'] };
    }
    if (!Number.isInteger(candidate.openEffects) || candidate.openEffects !== 0) {
        return { ...base, verdict: 'HOLD_FOR_EFFECTS', engramAction: null, archiveAction: null, failures: ['OPEN_EFFECTS_REMAIN'] };
    }
    const engram = candidate.engram;
    if (!engram) {
        const memoryId = `thread_${candidate.threadId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${candidate.terminalSha256.slice(0, 16)}`;
        return {
            ...base,
            verdict: 'RECORD_ENGRAM',
            engramAction: {
                tool: ENGRAM_RECORD_SURFACE,
                args: {
                    intent: `cstar/thread-terminal/${candidate.threadId}`,
                    bead_id: candidate.beadId,
                    memory_id: memoryId,
                    metadata: {
                        thread_id: candidate.threadId,
                        host_id: candidate.hostId,
                        role: candidate.role,
                        effect_id: candidate.effectId,
                        controller_generation: candidate.controllerGeneration,
                        requested_selector: candidate.requestedSelector,
                        requested_reasoning: candidate.requestedReasoning,
                        actual_identity: candidate.actualIdentity,
                        terminal_state: candidate.terminalState,
                        terminal_verdict: candidate.terminalVerdict,
                        terminal_receipt_path: candidate.terminalReceiptPath,
                        terminal_sha256: candidate.terminalSha256,
                        validation_status: candidate.validationStatus,
                        decisions: [...candidate.decisions],
                        gaps: [...candidate.gaps],
                        artifact_references: [...candidate.artifactReferences],
                        open_effects: candidate.openEffects,
                    },
                },
            },
            archiveAction: null,
            failures: [],
        };
    }
    if (!engram.durable || !nonEmpty(engram.memoryId)) {
        return { ...base, verdict: 'HOLD_FOR_ENGRAM', engramAction: null, archiveAction: null, failures: ['DURABLE_ENGRAM_ACK_PENDING'] };
    }
    if (engram.threadId !== candidate.threadId || engram.terminalSha256 !== candidate.terminalSha256) {
        return { ...base, verdict: 'HOLD_FOR_ENGRAM', engramAction: null, archiveAction: null, failures: ['ENGRAM_TERMINAL_BINDING_MISMATCH'] };
    }
    return {
        ...base,
        verdict: 'REAP_ELIGIBLE',
        engramAction: null,
        archiveAction: {
            tool: ARCHIVE_SURFACE,
            args: { threadId: candidate.threadId, hostId: candidate.hostId, archived: true },
        },
        failures: [],
    };
}
