export type ForgeCandidateStatus = 'STAGED' | 'FAILED';

export interface ForgeCandidateRequest {
    bead_id: string;
    repo_id: string;
    scan_id: string;
    target_path: string;
    rationale: string;
    contract_refs: string[];
    baseline_scores: Record<string, unknown>;
    acceptance_criteria?: string;
    operator_constraints: Record<string, unknown>;
    request_source: string;
    created_at: number;
    trace_metadata: Record<string, unknown>;
}

export interface GeneratedTestArtifact {
    path: string;
    reason: string;
    contract_refs: string[];
    template: string;
}

export interface ForgeValidationRequest {
    bead_id: string;
    candidate_id: string;
    repo_id: string;
    scan_id: string;
    target_path: string;
    staged_path: string;
    contract_refs: string[];
    acceptance_criteria: string;
    required_validations: string[];
    baseline_scores: Record<string, unknown>;
    generated_tests: GeneratedTestArtifact[];
}

export interface ForgeCandidateResult {
    status: ForgeCandidateStatus;
    candidate_id: string;
    bead_id: string;
    target_path: string;
    staged_path: string;
    candidate_patch: string;
    candidate_content: string;
    summary: string;
    generated_tests: GeneratedTestArtifact[];
    required_validations: string[];
    validation_request: ForgeValidationRequest;
    trace_metadata: Record<string, unknown>;
    errors: string[];
}

export function createForgeCandidateRequest(
    request: Omit<ForgeCandidateRequest, 'contract_refs' | 'baseline_scores' | 'operator_constraints' | 'request_source' | 'created_at' | 'trace_metadata'> &
        Partial<Pick<ForgeCandidateRequest, 'contract_refs' | 'baseline_scores' | 'operator_constraints' | 'request_source' | 'created_at' | 'trace_metadata'>>,
): ForgeCandidateRequest {
    return {
        ...request,
        contract_refs: [...(request.contract_refs ?? [])],
        baseline_scores: { ...(request.baseline_scores ?? {}) },
        operator_constraints: { ...(request.operator_constraints ?? {}) },
        request_source: request.request_source ?? 'bead',
        created_at: request.created_at ?? Date.now(),
        trace_metadata: { ...(request.trace_metadata ?? {}) },
    };
}

export function createForgeValidationRequest(request: ForgeValidationRequest): ForgeValidationRequest {
    return {
        ...request,
        contract_refs: [...request.contract_refs],
        required_validations: [...request.required_validations],
        baseline_scores: { ...request.baseline_scores },
        generated_tests: [...request.generated_tests],
    };
}

export function createForgeCandidateResult(
    result: Omit<ForgeCandidateResult, 'generated_tests' | 'required_validations' | 'validation_request' | 'trace_metadata' | 'errors'> &
        Partial<Pick<ForgeCandidateResult, 'generated_tests' | 'required_validations' | 'trace_metadata' | 'errors'>> & {
            validation_request: ForgeValidationRequest;
        },
): ForgeCandidateResult {
    return {
        ...result,
        generated_tests: [...(result.generated_tests ?? [])],
        required_validations: [...(result.required_validations ?? [])],
        validation_request: createForgeValidationRequest(result.validation_request),
        trace_metadata: { ...(result.trace_metadata ?? {}) },
        errors: [...(result.errors ?? [])],
    };
}
