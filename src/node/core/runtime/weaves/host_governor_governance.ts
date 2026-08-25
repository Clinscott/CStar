import type {
    HostGovernorWeavePayload,
    RuntimeDispatchPort,
} from '../contracts.js';
import type { HostTextInvoker } from './host_bridge.js';

export interface ReplanResult {
    invoked: boolean;
    planningSessionId?: string;
    planningStatus?: string;
    output?: string;
    beadIds: string[];
}

export interface GovernancePassResult {
    source: 'existing' | 'replan';
    planningSessionId?: string;
    candidateBeadIds: string[];
    promotedBeadIds: string[];
    deferredBeadIds: string[];
    reasonCode?: string;
    notes?: string;
}

export interface HostGovernorRuntimeDependencies {
    dispatchPort: RuntimeDispatchPort;
    hostTextInvoker: HostTextInvoker;
}

function retired(): never {
    throw new Error('legacy_host_governor_governance_retired_use_cstar_kernel');
}

export async function evaluateCandidates(..._args: unknown[]): Promise<GovernancePassResult> {
    void _args;
    return retired();
}

export async function triggerBlockedBeadReplan(..._args: unknown[]): Promise<ReplanResult> {
    void _args;
    return retired();
}

export async function governReplannedSession(..._args: unknown[]): Promise<GovernancePassResult | null> {
    void _args;
    return retired();
}

export type RetiredHostGovernorPayload = HostGovernorWeavePayload;
