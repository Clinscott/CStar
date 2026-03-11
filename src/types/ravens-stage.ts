import { buildHallRepositoryId, normalizeHallPath } from './hall.ts';

export type RavensStageName = 'memory' | 'hunt' | 'validate' | 'promote';
export type RavensStageStatus = 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'NO_ACTION' | 'TRANSITIONAL';
export type RavensTargetKind = 'FILE' | 'SECTOR' | 'REPOSITORY' | 'CONTRACT' | 'SPOKE' | 'WORKFLOW' | 'VALIDATION' | 'OTHER';

export interface RavensTargetIdentity {
    target_kind: RavensTargetKind;
    target_ref?: string;
    target_path?: string;
    bead_id?: string;
    rationale?: string;
    acceptance_criteria?: string;
    baseline_scores?: Record<string, unknown>;
    compatibility_source?: string;
}

export interface RavensHallReferenceSet {
    repo_id: string;
    observation_id?: string;
    validation_id?: string;
    scan_id?: string;
    bead_id?: string;
}

export interface RavensStageResult {
    stage: RavensStageName;
    status: RavensStageStatus;
    summary: string;
    target?: RavensTargetIdentity;
    hall?: RavensHallReferenceSet;
    metadata?: Record<string, unknown>;
}

export interface RavensCycleResult {
    status: RavensStageStatus;
    summary: string;
    mission_id: string;
    trace_id?: string;
    target?: RavensTargetIdentity;
    stages: RavensStageResult[];
    hall?: RavensHallReferenceSet;
    metadata?: Record<string, unknown>;
}

export function materializeRavensTargetIdentity(
    input: Partial<RavensTargetIdentity> = {},
): RavensTargetIdentity {
    const targetPath = input.target_path ? normalizeHallPath(input.target_path) : undefined;
    const rawTargetRef = input.target_ref ?? targetPath;
    const targetRef =
        rawTargetRef && (rawTargetRef.includes('/') || rawTargetRef.includes('\\'))
            ? normalizeHallPath(rawTargetRef)
            : rawTargetRef;

    return {
        target_kind: input.target_kind ?? (targetPath ? 'FILE' : 'OTHER'),
        target_ref: targetRef,
        target_path: targetPath,
        bead_id: input.bead_id,
        rationale: input.rationale,
        acceptance_criteria: input.acceptance_criteria,
        baseline_scores: { ...(input.baseline_scores ?? {}) },
        compatibility_source: input.compatibility_source,
    };
}

export function createRavensHallReferenceSet(
    workspaceRoot: string,
    input: Partial<RavensHallReferenceSet> = {},
): RavensHallReferenceSet {
    return {
        repo_id: input.repo_id ?? buildHallRepositoryId(workspaceRoot),
        observation_id: input.observation_id,
        validation_id: input.validation_id,
        scan_id: input.scan_id,
        bead_id: input.bead_id,
    };
}
