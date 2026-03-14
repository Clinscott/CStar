/**
 * [Ω] THE CANONICAL RUNTIME CONTRACTS (v1.0)
 * Purpose: Define the authoritative interfaces for the Corvus Star Runtime.
 * Mandate: Execution must be structured, traced, and verifiable.
 */

import type { ForgeCandidateResult, ForgeValidationRequest } from '../../../types/forge-candidate.ts';
import type { GungnirMatrix } from '../../../types/gungnir.ts';
import type { RavensCycleResult, RavensStageResult, RavensTargetIdentity } from '../../../types/ravens-stage.ts';

export type WeaveStatus = 'SUCCESS' | 'FAILURE' | 'TRANSITIONAL';
export type OperatorMode = 'cli' | 'tui' | 'automation' | 'subkernel';
export type TargetDomain = 'brain' | 'spoke' | 'estate' | 'external';

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
    dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult>;
}

export interface StartWeavePayload {
    target?: string;
    task: string;
    ledger: string;
    loki?: boolean;
    debug?: boolean;
    verbose?: boolean;
}

export type RavensAction = 'start' | 'stop' | 'status' | 'cycle' | 'sweep';

export interface RavensWeavePayload {
    action: RavensAction;
    shadow_forge?: boolean;
    spoke?: string;
}

export type PennyOneAction = 'scan' | 'view' | 'clean' | 'stats' | 'search' | 'import' | 'topology';

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
    source?: 'cli' | 'python_adapter';
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
    proposal_id?: string;
    proposal_status?: string;
    validation_id?: string;
    proposal_path?: string;
    contract_path?: string;
    promotion_outcome?: string;
}

export interface ResearchWeavePayload {
    intent: string;
    project_root: string;
    cwd: string;
    dry_run?: boolean;
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

/**
 * [🔱] THE RUNTIME ADAPTER
 * Adapters wrap legacy or specialized execution paths (Python, CLI scripts, direct Node modules)
 * to make them compatible with the Skill Runtime Dispatcher.
 */
export interface RuntimeAdapter<T = unknown> {
    readonly id: string;
    execute(invocation: WeaveInvocation<T>, context: RuntimeContext): Promise<WeaveResult>;
}
