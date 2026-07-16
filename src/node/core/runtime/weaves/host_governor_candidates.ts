export const HOST_GOVERNOR_CANDIDATES_RETIRED_ERROR =
    'legacy_host_governor_candidates_retired_use_cstar_handoff';

function retired(args: unknown[]): never {
    void args;
    throw new Error(HOST_GOVERNOR_CANDIDATES_RETIRED_ERROR);
}

export function getBeadTargets(...args: unknown[]): never { return retired(args); }
export function fitsLocalWorkerFileBudget(...args: unknown[]): never { return retired(args); }
export function summarizeCandidates(...args: unknown[]): never { return retired(args); }
export function uniqueStrings(...args: unknown[]): never { return retired(args); }
export function getPromotionLimit(...args: unknown[]): never { return retired(args); }
export function buildBlockedBeadReplanQuery(...args: unknown[]): never { return retired(args); }
export function getPendingReplannedBeadIds(...args: unknown[]): never { return retired(args); }
export function getPlanningSessionBeadIds(...args: unknown[]): never { return retired(args); }
export function getPlanningSessionBranchDigest(...args: unknown[]): never { return retired(args); }
export function getProjectBeads(...args: unknown[]): never { return retired(args); }
export function collectGovernableCandidates(...args: unknown[]): never { return retired(args); }
export function normalizeApprovedIds(...args: unknown[]): never { return retired(args); }
