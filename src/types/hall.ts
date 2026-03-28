import type { GungnirMatrix } from  './gungnir.js';

export type HallRepositoryStatus = 'DORMANT' | 'AWAKE' | 'AGENT_LOOP';
export type HallScanStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type HallBeadStatus =
    | 'OPEN'
    | 'SET-PENDING'
    | 'SET'
    | 'IN_PROGRESS'
    | 'READY_FOR_REVIEW'
    | 'NEEDS_TRIAGE'
    | 'BLOCKED'
    | 'RESOLVED'
    | 'ARCHIVED'
    | 'SUPERSEDED';
export type HallBeadTargetKind = 'FILE' | 'SECTOR' | 'REPOSITORY' | 'CONTRACT' | 'SPOKE' | 'WORKFLOW' | 'VALIDATION' | 'OTHER';
export type HallValidationVerdict =
    | 'ACCEPTED'
    | 'REJECTED'
    | 'INCONCLUSIVE'
    | 'SUCCESS'
    | 'FAILURE';
export type HallSkillProposalStatus =
    | 'PROPOSED'
    | 'VALIDATED'
    | 'PROMOTED'
    | 'REJECTED'
    | 'SUPERSEDED';
export type HallSkillActivationStatus =
    | 'PENDING'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';
export type HallPlanningSessionStatus =
    | 'INTENT_RECEIVED'
    | 'RESEARCH_PHASE'
    | 'PROPOSAL_REVIEW'
    | 'BEAD_CRITIQUE_LOOP'
    | 'BEAD_USER_REVIEW'
    | 'PLAN_CONCRETE'
    | 'FORGE_EXECUTION'
    | 'NEEDS_INPUT'
    | 'PLAN_READY'
    | 'ROUTED'
    | 'COMPLETED'
    | 'FAILED';
export type HallMountedSpokeKind = 'local' | 'git' | 'mirror' | 'archive';
export type HallMountedSpokeStatus = 'active' | 'disconnected' | 'pending';
export type HallMountedSpokeTrust = 'trusted' | 'observe' | 'quarantined';
export type HallMountedSpokeWritePolicy = 'read_write' | 'read_only';
export type HallMountedSpokeProjectionStatus = 'current' | 'stale' | 'missing';
export type HallOneMindBrokerStatus = 'OFFLINE' | 'READY' | 'ERROR';
export type HallOneMindBindingState = 'UNBOUND' | 'BOUND';
export type HallOneMindRequestStatus = 'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type HallOneMindBranchStatus = 'COMPLETED' | 'FAILED';

export interface HallRepositoryRecord {
    repo_id: string;
    root_path: string;
    name: string;
    status: HallRepositoryStatus;
    active_persona: string;
    baseline_gungnir_score: number;
    intent_integrity: number;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallScanRecord {
    scan_id: string;
    repo_id: string;
    scan_kind: string;
    status: HallScanStatus;
    baseline_gungnir_score?: number;
    started_at: number;
    completed_at?: number;
    metadata?: Record<string, unknown>;
}

export interface HallFileRecord {
    repo_id: string;
    scan_id: string;
    path: string;
    content_hash?: string;
    language?: string;
    gungnir_score?: number;
    matrix?: GungnirMatrix;
    imports?: HallFileImport[];
    exports?: string[];
    intent_summary?: string;
    interaction_summary?: string;
    created_at: number;
}

export interface HallFileImport {
    source: string;
    local: string;
    imported: string;
}

export interface HallEvidence {
    source: string;
    confidence: number;
    payload: Record<string, unknown>;
    research_refs?: string[];
}

export interface HallBeadCritiqueRecord {
    critique_id: string;
    bead_id: string;
    repo_id: string;
    agent_id: string;
    agent_expertise: string;
    critique: string;
    proposed_path: string;
    evidence: HallEvidence;
    is_architect_approved: boolean;
    architect_feedback?: string;
    created_at: number;
}

export interface HallBeadRecord {
    bead_id: string;
    repo_id: string;
    scan_id?: string;
    legacy_id?: number;
    target_kind?: HallBeadTargetKind;
    target_ref?: string;
    target_path?: string;
    rationale: string;
    contract_refs?: string[];
    baseline_scores?: Record<string, unknown>;
    acceptance_criteria?: string;
    checker_shell?: string;
    status: HallBeadStatus;
    assigned_agent?: string;
    source_kind?: string;
    triage_reason?: string;
    resolution_note?: string;
    resolved_validation_id?: string;
    superseded_by?: string;
    architect_opinion?: string;
    critique_payload?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallValidationRun {
    validation_id: string;
    repo_id: string;
    scan_id?: string;
    bead_id?: string;
    target_path?: string;
    verdict: HallValidationVerdict;
    sprt_verdict?: string;
    pre_scores?: Record<string, unknown>;
    post_scores?: Record<string, unknown>;
    benchmark?: Record<string, unknown>;
    notes?: string;
    created_at: number;
    legacy_trace_id?: number;
}

export interface HallSkillObservation {
    observation_id: string;
    repo_id: string;
    skill_id: string;
    outcome: string;
    observation: string;
    created_at: number;
    metadata?: Record<string, unknown>;
}

export interface HallSkillActivationRecord {
    activation_id: string;
    repo_id: string;
    bead_id?: string;
    session_id?: string;
    skill_id: string;
    adapter_id?: string;
    role?: string;
    status: HallSkillActivationStatus;
    intent: string;
    target_path?: string;
    payload?: Record<string, unknown>;
    result_summary?: string;
    error_text?: string;
    created_at: number;
    updated_at: number;
    completed_at?: number;
    metadata?: Record<string, unknown>;
}

export interface HallEpisodicMemoryRecord {
    memory_id: string;
    bead_id: string;
    repo_id: string;
    tactical_summary: string;
    files_touched?: string[];
    successes?: string[];
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallSkillProposalRecord {
    proposal_id: string;
    repo_id: string;
    skill_id: string;
    status: HallSkillProposalStatus;
    created_at: number;
    updated_at: number;
    bead_id?: string;
    validation_id?: string;
    target_path?: string;
    contract_path?: string;
    proposal_path?: string;
    summary?: string;
    promotion_note?: string;
    promoted_at?: number;
    promoted_by?: string;
    metadata?: Record<string, unknown>;
}

export interface HallPlanningSessionRecord {
    session_id: string;
    repo_id: string;
    skill_id: string;
    status: HallPlanningSessionStatus;
    user_intent: string;
    normalized_intent: string;
    created_at: number;
    updated_at: number;
    summary?: string;
    latest_question?: string;
    architect_opinion?: string;
    current_bead_id?: string;
    metadata?: Record<string, unknown>;
}

export interface HallMountedSpokeRecord {
    spoke_id: string;
    repo_id: string;
    slug: string;
    kind: HallMountedSpokeKind;
    root_path: string;
    remote_url?: string;
    default_branch?: string;
    mount_status: HallMountedSpokeStatus;
    trust_level: HallMountedSpokeTrust;
    write_policy: HallMountedSpokeWritePolicy;
    projection_status: HallMountedSpokeProjectionStatus;
    last_scan_at?: number;
    last_health_at?: number;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallOneMindBrokerRecord {
    repo_id: string;
    status: HallOneMindBrokerStatus;
    binding_state: HallOneMindBindingState;
    fulfillment_ready: boolean;
    provider?: string;
    session_id?: string;
    control_plane: string;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallOneMindRequestRecord {
    request_id: string;
    repo_id: string;
    caller_source: string;
    boundary: 'primary' | 'subagent' | 'autobot';
    request_status: HallOneMindRequestStatus;
    transport_preference?: 'host_session' | 'synapse_db';
    prompt: string;
    system_prompt?: string;
    response_text?: string;
    error_text?: string;
    lease_owner?: string;
    claimed_at?: number;
    completed_at?: number;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallOneMindBranchRecord {
    branch_id: string;
    repo_id: string;
    source_weave: string;
    branch_group_id: string;
    branch_kind: 'research' | 'critique';
    branch_label: string;
    branch_index: number;
    status: HallOneMindBranchStatus;
    provider?: string;
    session_id?: string;
    trace_id?: string;
    parent_request_id?: string;
    summary?: string;
    error_text?: string;
    artifacts?: string[];
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallOneMindBranchDigestGroup {
    branch_group_id: string;
    source_weave: string;
    branch_kind: 'research' | 'critique';
    provider?: string;
    branch_count: number;
    branch_labels: string[];
    summary: string;
    artifacts: string[];
    needs_revision: boolean;
    evidence_sources: string[];
    proposed_paths: string[];
}

export interface HallOneMindBranchDigest {
    trace_id?: string;
    session_id?: string;
    total_branches: number;
    group_count: number;
    branch_kinds: Array<'research' | 'critique'>;
    artifacts: string[];
    groups: HallOneMindBranchDigestGroup[];
}

export interface HallGitCommitRecord {
    commit_hash: string;
    repo_id: string;
    author_name: string;
    author_email: string;
    authored_at: number;
    committer_name: string;
    committer_email: string;
    committed_at: number;
    message: string;
    parent_hashes: string[];
}

export interface HallDocumentRecord {
    document_id: string;
    repo_id: string;
    root_path: string;
    path: string;
    title: string;
    doc_kind: string;
    status: 'ACTIVE' | 'ARCHIVED';
    latest_version_id: string;
    latest_content_hash: string;
    latest_summary?: string;
    metadata?: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface HallDocumentVersionRecord {
    version_id: string;
    document_id: string;
    repo_id: string;
    content_hash: string;
    title: string;
    summary?: string;
    content: string;
    source_label?: string;
    metadata?: Record<string, unknown>;
    created_at: number;
}

export interface HallGitDiffRecord {
    id?: number;
    commit_hash: string;
    repo_id: string;
    file_path: string;
    change_type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED';
    old_path?: string;
    insertions: number;
    deletions: number;
    patch_text?: string;
}

export interface HallRepositorySummary {
    repo_id: string;
    root_path: string;
    name: string;
    status: HallRepositoryStatus;
    active_persona: string;
    baseline_gungnir_score: number;
    intent_integrity: number;
    last_scan_id?: string;
    last_scan_status?: HallScanStatus;
    last_scan_at?: number;
    open_beads: number;
    validation_runs: number;
    last_validation_at?: number;
}

export function normalizeHallPath(inputPath: string): string {
    return inputPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function buildHallRepositoryId(rootPath: string): string {
    return `repo:${normalizeHallPath(rootPath)}`;
}
