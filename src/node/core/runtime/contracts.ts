/**
 * [Ω] THE CANONICAL RUNTIME CONTRACTS (v1.0)
 * Purpose: Define the authoritative interfaces for the Corvus Star Runtime.
 * Mandate: Execution must be structured, traced, and verifiable.
 */

import type { ForgeCandidateResult, ForgeValidationRequest } from  '../../../types/forge-candidate.js';
import type { GungnirMatrix } from  '../../../types/gungnir.js';
import type { RavensCycleResult, RavensStageResult, RavensTargetIdentity } from  '../../../types/ravens-stage.js';

export type WeaveStatus = 'SUCCESS' | 'FAILURE' | 'TRANSITIONAL';
export type OperatorMode = 'cli' | 'tui' | 'automation' | 'subkernel';
export type TargetDomain = 'brain' | 'spoke' | 'estate' | 'external';
export type CapabilityTier = 'PRIME' | 'SKILL' | 'WEAVE' | 'SPELL';
export type SpellClassification = 'runtime-backed' | 'policy-only' | 'deprecated';
export type OperationalContextPolicy = 'project' | 'silent';

export const CAPABILITY_TIERS: CapabilityTier[] = ['PRIME', 'SKILL', 'WEAVE', 'SPELL'];
export const SPELL_CLASSIFICATIONS: SpellClassification[] = ['runtime-backed', 'policy-only', 'deprecated'];

export interface OperatorSession {
    mode: OperatorMode;
    interactive: boolean;
    session_id?: string;
}

export interface WorkspaceTarget {
    domain: TargetDomain;
    workspace_root?: string;
    spoke?: string;
    requested_path?: string;
}

export interface RuntimeContext {
    mission_id: string;
    bead_id: string;
    trace_id: string;
    persona: string;
    workspace_root: string;
    operator_mode: OperatorMode;
    target_domain: TargetDomain;
    interactive: boolean;
    spoke_name?: string;
    spoke_root?: string;
    requested_root?: string;
    session_id?: string;
    env: Record<string, string | undefined>;
    timestamp: number;
}

export interface WeaveInvocation<T = unknown> {
    weave_id: string;
    payload: T;
    target?: WorkspaceTarget;
    session?: OperatorSession;
}

export interface SkillInvocation<T = unknown> {
    skill_id: string;
    target_path: string;
    intent: string;
    params: T;
}

export interface WeaveResult {
    weave_id: string;
    status: WeaveStatus;
    output: string;
    metrics_delta?: Partial<GungnirMatrix>;
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface RuntimeDispatchPort {
    dispatch<T>(invocation: WeaveInvocation<T> | import('../skills/types.js').SkillBead<T>): Promise<WeaveResult>;
}

export interface StartWeavePayload {
    target?: string;
    task: string;
    ledger: string;
    loki?: boolean;
    debug?: boolean;
    verbose?: boolean;
}

export interface HostGovernorWeavePayload {
    task?: string;
    ledger?: string;
    auto_execute?: boolean;
    auto_replan_blocked?: boolean;
    max_parallel?: number;
    max_promotions?: number;
    dry_run?: boolean;
    project_root?: string;
    cwd?: string;
    source?: 'cli' | 'runtime';
    policy?: Partial<HostGovernorPolicy>;
}

export interface HostGovernorPolicy {
    max_total_targets: number;
    max_implementation_targets: number;
    max_acceptance_items: number;
    max_acceptance_item_length: number;
    max_implementation_lines: number;
    max_total_target_lines: number;
}

export type RavensAction = 'start' | 'stop' | 'status' | 'cycle' | 'sweep';

export interface RavensWeavePayload {
    action: RavensAction;
    shadow_forge?: boolean;
    spoke?: string;
}

export type PennyOneAction = 'scan' | 'view' | 'clean' | 'stats' | 'search' | 'import' | 'topology' | 'refresh_intents';

export interface PennyOneWeavePayload {
    action: PennyOneAction;
    path?: string;
    query?: string;
    remote_url?: string;
    slug?: string;
    port?: number;
    total_reset?: boolean;
    ghosts?: boolean;
}

export interface DynamicCommandPayload {
    command: string;
    args: string[];
    project_root: string;
    cwd: string;
}

export interface ChantWeavePayload {
    query: string;
    project_root: string;
    cwd: string;
    dry_run?: boolean;
    source?: 'cli' | 'python_adapter' | 'runtime';
}

export interface AutobotWeavePayload {
    bead_id?: string;
    claim_next?: boolean;
    checker_shell?: string;
    max_attempts?: number;
    timeout?: number;
    startup_timeout?: number;
    checker_timeout?: number;
    grace_seconds?: number;
    agent_id?: string;
    worker_note?: string;
    autobot_dir?: string;
    command?: string;
    command_args?: string[];
    ready_regex?: string;
    done_regexes?: string[];
    env?: Record<string, string>;
    stream?: boolean;
    project_root: string;
    cwd: string;
    source: string;
}

export interface HostWorkerWeavePayload {
    bead_id: string;
    project_root: string;
    cwd: string;
}

export interface AutobotWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    outcome?: string;
    bead_id?: string | null;
    target_path?: string | null;
    attempt_count?: number;
    max_attempts?: number;
    final_bead_status?: string | null;
    validation_id?: string | null;
}

export interface EvolveWeavePayload {
    action?: 'propose' | 'promote';
    bead_id?: string;
    proposal_id?: string;
    dry_run?: boolean;
    simulate?: boolean;
    focus_axes?: string[];
    validation_profile?: string;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter';
}

export interface EvolveWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    proposal_id?: string;
    proposal_status?: string;
    validation_id?: string;
    proposal_path?: string;
    contract_path?: string;
    promotion_outcome?: string;
}

export interface ResearchWeavePayload {
    intent: string;
    rationale?: string;
    subquestions?: string[];
    project_root: string;
    cwd: string;
    dry_run?: boolean;
}

export interface ResearchHostResponse {
    summary?: unknown;
    research_artifacts?: unknown;
}

export interface ResearchWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    delegated?: boolean;
    parallel?: boolean;
    branch_count?: number;
    provider?: string;
    intent?: string;
    research_artifacts?: string[];
    research_payload?: ResearchHostResponse;
    research_branches?: Array<{
        question: string;
        summary: string;
        research_artifacts: string[];
    }>;
}

export interface CritiqueWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    delegated?: boolean;
    provider?: string;
    bead_title?: unknown;
    branch_group_id?: string;
    branch_ledger_digest?: Record<string, unknown>;
    parallel?: boolean;
    branch_count?: number;
    critique_payload?: Record<string, unknown>;
}

export interface HostWorkerWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    delegated?: boolean;
    provider?: string | null;
}

export interface ArchitectWeavePayload {
    action?: 'build_proposal' | 'review_critique';
    intent?: string;
    rationale?: string;
    research?: Record<string, unknown>;
    bead?: Record<string, unknown>;
    critique_payload?: Record<string, unknown>;
    context?: string;
    project_root?: string;
    cwd: string;
}

export interface ArchitectProposalHostResponse {
    proposal_summary?: unknown;
    beads?: unknown;
}

export interface ArchitectReviewHostResponse {
    is_approved?: unknown;
    architect_opinion?: unknown;
    final_proposed_path?: unknown;
}

export interface DistillHostResponse {
    tactical_summary?: unknown;
    files_touched?: unknown;
    successes?: unknown;
    bead_id?: unknown;
}

export interface HostGovernorDecision {
    approved_bead_ids?: unknown;
    deferred_bead_ids?: unknown;
    reason_code?: unknown;
    notes?: unknown;
}

export interface CompressWeavePayload {
    bead_id: string;
    bead_intent: string;
    project_root: string;
    cwd: string;
    git_diff?: string;
    target_paths?: string[];
    proposal_id?: string;
    validation_id?: string;
    tactical_summary?: string;
    files_touched?: string[];
    successes?: string[];
    metadata?: Record<string, unknown>;
    source?: 'cli' | 'python_adapter' | 'runtime';
}

export interface TaliesinForgeWeavePayload {
    bead_id?: string;
    persona?: string;
    model?: string;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter';
}

export interface RavensCycleWeavePayload {
    dry_run?: boolean;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter';
}

export interface RavensStageWeavePayload {
    target?: RavensTargetIdentity;
    metadata?: Record<string, unknown>;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter';
}

export interface RavensStageWeaveMetadata extends Record<string, unknown> {
    stage_result?: RavensStageResult;
}

export interface RavensCycleWeaveMetadata extends Record<string, unknown> {
    cycle_result?: RavensCycleResult;
}

export interface TaliesinForgeWeaveMetadata extends Record<string, unknown> {
    candidate?: ForgeCandidateResult;
    validation_request?: ForgeValidationRequest;
}

export interface OrchestrateWeavePayload {
    planning_session_id?: string;
    max_parallel?: number;
    limit?: number;
    tick_timeout?: number;
    dry_run?: boolean;
    worker_identity?: string;
    bead_ids?: string[];
    project_root: string;
    cwd: string;
    source?: 'cli' | 'python_adapter' | 'runtime';
}

export interface OrchestrateWeaveMetadata extends Record<string, unknown> {
    context_policy?: OperationalContextPolicy;
    planning_session_id?: string;
    selected_bead_ids?: string[];
    bead_outcomes?: Record<string, {
        status: string;
        exit_code?: number;
        duration_ms?: number;
        error?: string;
        route?: string;
    }>;
    reaped_zombies?: number;
    total_processed?: number;
}

export interface TemporalLearningWeavePayload {
    lookback_days?: number;
    min_churn?: number;
    limit?: number;
    project_root: string;
    cwd: string;
    source?: 'cli' | 'runtime';
}

export interface TemporalLearningWeaveMetadata extends Record<string, unknown> {
    analyzed_commits?: number;
    identified_sectors?: number;
    emitted_beads?: string[];
}

export interface RestorationWeavePayload {
    bead_ids?: string[];
    epic?: string;
    max_beads?: number;
    project_root: string;
    cwd: string;
}

export interface EstateExpansionWeavePayload {
    remote_url: string;
    slug?: string;
    project_root: string;
    cwd: string;
}

export interface VigilanceWeavePayload {
    spoke?: string;
    aggressive?: boolean;
    project_root: string;
    cwd: string;
}

/**
 * [🔱] THE RUNTIME ADAPTER
 * Adapters wrap legacy or specialized execution paths (Python, CLI scripts, direct Node modules)
 * to make them compatible with the Skill Runtime Dispatcher.
 */
export interface RuntimeAdapter<T = unknown> {
    readonly id: string;
    execute(invocation: WeaveInvocation<T>, context: RuntimeContext): Promise<WeaveResult>;
    shutdown?(): Promise<void>;
}
