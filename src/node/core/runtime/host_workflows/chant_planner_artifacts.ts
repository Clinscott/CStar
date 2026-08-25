export const CHANT_PLANNER_ARTIFACTS_RETIRED_ERROR =
    'legacy_chant_planner_artifacts_retired_use_cstar_kernel';

export const deps = Object.freeze({ compatibility: 'retired' as const });

function retired(args: unknown[]): never {
    void args;
    throw new Error(CHANT_PLANNER_ARTIFACTS_RETIRED_ERROR);
}

export function getSessionStringMetadata(...args: unknown[]): never { return retired(args); }
export function getSessionNumberMetadata(...args: unknown[]): never { return retired(args); }
export function asStringArray(...args: unknown[]): never { return retired(args); }
export function isTerminalPlanningStatus(...args: unknown[]): never { return retired(args); }
export function normalizeIdFragment(...args: unknown[]): never { return retired(args); }
export function isVerificationLikeTarget(...args: unknown[]): never { return retired(args); }
export function extractArtifactPathCandidates(...args: unknown[]): never { return retired(args); }
export function augmentResearchPayloadForArchitect(...args: unknown[]): never { return retired(args); }
export function normalizeArchitectProposal(...args: unknown[]): never { return retired(args); }
export function buildSessionId(...args: unknown[]): never { return retired(args); }
export function buildAuguryContractMetadata(...args: unknown[]): never { return retired(args); }
export function mergeNormalizedIntent(...args: unknown[]): never { return retired(args); }
export function writePlanningSession(...args: unknown[]): never { return retired(args); }
export function buildResearchPayload(...args: unknown[]): never { return retired(args); }
export function normalizeResearchPayload(...args: unknown[]): never { return retired(args); }
export function buildArchitectPayload(...args: unknown[]): never { return retired(args); }
export function persistArchitectProposal(...args: unknown[]): never { return retired(args); }
