export type TraceExecutionGate =
    | 'planning_active'
    | 'review_required'
    | 'worker_review_required'
    | 'operator_release_required'
    | 'execution_guarded'
    | 'input_required'
    | 'failure_recovery'
    | 'completed';

export interface TraceFailureDiagnosticsPayload {
    phase?: string;
    error?: string;
    recovery_hint?: string;
    failed_at?: number;
}

export interface TraceHostContextPayload {
    trace_line?: string;
    trace_summary?: string;
    note_line?: string;
    note?: string;
    updated_at?: number;
    updated_at_iso?: string;
}

export interface TraceContractPayload {
    intent_category?: string;
    intent?: string;
    selection_tier?: string;
    selection_name?: string;
    trajectory_status?: string;
    trajectory_reason?: string;
    mimirs_well: string[];
    gungnir_verdict?: string;
    confidence?: number;
    body?: string;
    canonical_intent?: string;
    council_expert?: {
        id?: string;
        label?: string;
        profile?: string;
        protocol?: string;
        lens?: string;
        anti_behavior?: string[];
        root_persona_directive?: string;
        selection_reason?: string;
    };
}

export interface TraceLineagePayload {
    origin: 'planning_session' | 'runtime_execution';
    planning_session_id?: string;
    mission_id?: string;
    mission_bead_id?: string;
    runtime_bead_id?: string;
    trace_scope?: string;
    trace_weave_id?: string;
    target_domain?: string;
    spoke_name?: string;
    requested_root?: string;
    augury_designation_source?: string;
    /** @deprecated Use augury_designation_source. */
    trace_designation_source?: string;
}

export interface TraceWorkItemPayload {
    bead_id: string;
    status: string;
    target_path?: string;
    rationale: string;
    acceptance_criteria?: string;
    checker_shell?: string;
}

export interface TraceAgentHandoffPayload {
    execution_gate: TraceExecutionGate;
    phase: string;
    next_action: string;
    resume_command: string;
    validation_command?: string;
    lead_bead_id?: string;
    target_paths: string[];
    checker_shells: string[];
    proposal_ids: string[];
    bead_ids: string[];
    host_context?: TraceHostContextPayload;
    designation?: TraceContractPayload;
    work_items: TraceWorkItemPayload[];
}

export interface TraceStatusPayload {
    origin?: 'planning_session' | 'runtime_execution';
    trace_id?: string;
    session_id?: string;
    runtime_bead_id?: string;
    mission_bead_id?: string;
    handle?: string;
    status: string;
    updated_at: number;
    updated_at_iso: string;
    user_intent: string;
    normalized_intent: string;
    focus?: string;
    digest_badge?: string;
    current_bead_id?: string;
    bead_ids: string[];
    proposal_ids: string[];
    bead_summary: {
        total: number;
        set: number;
        open: number;
        review: number;
    };
    artifacts: string[];
    failure?: TraceFailureDiagnosticsPayload;
    host_context?: TraceHostContextPayload;
    augury_contract?: TraceContractPayload;
    /** @deprecated Use augury_contract. */
    trace_contract?: TraceContractPayload;
    lineage?: TraceLineagePayload;
    agent_handoff: TraceAgentHandoffPayload;
    branches: Array<{
        kind: string;
        count: number;
        needs_revision: boolean;
        labels: string[];
        summary?: string;
        artifacts: string[];
        evidence_sources: string[];
        proposed_paths: string[];
    }>;
}

export interface TraceFailureEntryPayload extends TraceStatusPayload {}

export interface TraceFailuresPayload {
    count: number;
    sessions: TraceFailureEntryPayload[];
}

export type AuguryDiagnosticStatus = 'pass' | 'warn' | 'fail';
export type AuguryGuardrailVerdict = 'allow' | 'caution' | 'block';
export type AuguryGuardrailAction = 'continue' | 'recover' | 'repair';

export interface AuguryDiagnosticCheck {
    status: AuguryDiagnosticStatus;
    ok: boolean;
    message: string;
    details?: Record<string, unknown>;
}

export interface AuguryGuardrailPayload {
    verdict: AuguryGuardrailVerdict;
    action: AuguryGuardrailAction;
    reason: string;
    failed_checks: string[];
    warning_checks: string[];
}

export interface AuguryDoctorPayload {
    status: AuguryDiagnosticStatus;
    score: number;
    scope_ok: boolean;
    route_ok: boolean;
    expert_ok: boolean;
    mimir_ok: boolean;
    noise_score: number;
    guardrail: AuguryGuardrailPayload;
    agent_next_action: string;
    warnings: string[];
    active?: {
        origin?: 'planning_session' | 'runtime_execution';
        handle?: string;
        status?: string;
        route?: string;
        scope?: string;
        expert?: string;
        mimir_count: number;
        target_paths: string[];
    };
    checks: {
        scope: AuguryDiagnosticCheck;
        route: AuguryDiagnosticCheck;
        expert: AuguryDiagnosticCheck;
        mimir: AuguryDiagnosticCheck;
        noise: AuguryDiagnosticCheck;
    };
}

export interface AuguryExplainPayload {
    status: 'available' | 'missing';
    route?: {
        intent_category?: string;
        intent?: string;
        selection_tier?: string;
        selection_name?: string;
        designation?: string;
        basis: string;
    };
    scope?: {
        value: string;
        basis: string;
        target_domain?: string;
        spoke_name?: string;
        requested_root?: string;
    };
    expert?: {
        id?: string;
        label?: string;
        lens?: string;
        selection_reason?: string;
        basis: string;
    };
    mimir?: {
        targets: string[];
        count: number;
        prompt_limit: number;
        omitted_from_prompt: number;
        basis: string;
    };
    mode?: {
        basis: string;
    };
    confidence?: {
        value?: number;
        source: 'explicit_or_stored' | 'missing';
        basis: string;
    };
    guardrail: AuguryGuardrailPayload;
    agent_next_action: string;
    warnings: string[];
}
