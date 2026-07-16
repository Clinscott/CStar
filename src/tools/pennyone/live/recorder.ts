import type { AgentPing } from '../types.js';

export const PENNYONE_LIVE_RETIRED =
    'legacy_pennyone_live_retired_use_cstar_kernel';

export async function recordPing(_ping: AgentPing, _targetRepo: string): Promise<never> {
    throw new Error(PENNYONE_LIVE_RETIRED);
}

export async function recordTrace(_trace: unknown): Promise<never> {
    throw new Error(PENNYONE_LIVE_RETIRED);
}
