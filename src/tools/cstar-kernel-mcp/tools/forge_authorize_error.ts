import {
    errorResponse,
    mcpErrorCode,
    mcpGuardrail,
    preAuthorizationErrorResponse,
    preAuthorizationResponse,
    type McpTextResponse,
} from '../contracts/responses.js';

export const FORGE_AUTHORIZATION_DIAGNOSTIC_CLASSES = [
    'root_user_signal_missing',
    'caller_identity_metadata',
    'caller_identity_session',
    'historical_set_request',
    'historical_set_manifest',
    'operator_intent',
    'goal_resume_authority',
    'legacy_operator_authorization',
    'request_contract',
    'request_receipt_read',
    'post_authorization_runtime',
    'post_authorization_commit',
    'operator_authority_other',
    'pre_identity_other',
] as const;

export type ForgeAuthorizationDiagnosticClass =
    typeof FORGE_AUTHORIZATION_DIAGNOSTIC_CLASSES[number];

export interface ForgeAuthorizeErrorState {
    request_identity_verified: boolean;
    operator_authorization_verified: boolean;
    request_read_failed: boolean;
    request_read_with_valid_identity: boolean;
}

function diagnosticClass(
    error: unknown,
    state: ForgeAuthorizeErrorState,
): ForgeAuthorizationDiagnosticClass {
    const code = mcpErrorCode(error, 'unknown');
    if (!state.request_identity_verified && !state.request_read_failed
        && error instanceof Error
        && error.message === 'codex_request_identity_turn_match_count:0') {
        return 'root_user_signal_missing';
    }
    if (state.request_read_failed && !state.request_read_with_valid_identity) {
        return 'operator_authority_other';
    }
    if (code === 'codex_request_identity_metadata_required'
        || code === 'codex_request_identity_thread_id_invalid'
        || code === 'codex_request_identity_turn_metadata_required'
        || code === 'codex_request_identity_turn_metadata_ids_invalid'
        || code === 'codex_request_identity_thread_mismatch'
        || code === 'codex_request_identity_requires_root_user_thread'
        || code === 'codex_request_identity_rejects_parent_fork_or_subagent') {
        return 'caller_identity_metadata';
    }
    if (code.startsWith('codex_request_identity_')) return 'caller_identity_session';
    if (code.startsWith('forge_set_request_')) return 'historical_set_request';
    if (code.startsWith('forge_set_manifest_')) return 'historical_set_manifest';
    if (code.startsWith('forge_operator_')) return 'operator_intent';
    if (code.startsWith('forge_goal_resume_')) return 'goal_resume_authority';
    if (code.startsWith('operator_authorization_')) return 'legacy_operator_authorization';
    if (code.startsWith('forge_authorization_request_')
        || code === 'forge_request_summary_invalid'
        || code === 'forge_request_authorization_policy_invalid') {
        return 'request_contract';
    }
    if (state.request_read_with_valid_identity) return 'request_receipt_read';
    if (state.operator_authorization_verified) {
        return code.startsWith('forge_runtime_')
            ? 'post_authorization_runtime' : 'post_authorization_commit';
    }
    return state.request_identity_verified ? 'operator_authority_other' : 'pre_identity_other';
}

function addDiagnostic(
    response: McpTextResponse,
    value: ForgeAuthorizationDiagnosticClass,
): McpTextResponse {
    const content = response.content[0];
    if (!content) return response;
    const payload = JSON.parse(content.text) as Record<string, unknown>;
    content.text = JSON.stringify({ ...payload, authorization_diagnostic_class: value });
    return response;
}

export function forgeAuthorizeErrorResponse(
    error: unknown,
    state: ForgeAuthorizeErrorState,
): McpTextResponse {
    const diagnostic = diagnosticClass(error, state);
    if (diagnostic === 'root_user_signal_missing') {
        return addDiagnostic(preAuthorizationResponse({
            status: 'operator_signal_required',
            mutation: null,
            forge_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
            },
            guardrail: mcpGuardrail(
                'block',
                'recover',
                'The host resumed without a canonical root-user instruction; goal context never grants Forge authority.',
                ['forge_operator_signal_required'],
            ),
            next_action: 'Send a fresh ordinary instruction that names the work, such as: Continue building TokenPath Q0 phase one.',
        }, 'forge_operator_signal_required'), diagnostic);
    }
    if (state.request_read_with_valid_identity || state.operator_authorization_verified) {
        return addDiagnostic(errorResponse(error), diagnostic);
    }
    const errorText = error instanceof Error ? error.message : '';
    const identityFailure = errorText.startsWith('operator_authorization_')
        || errorText.startsWith('codex_request_identity_')
        || errorText === 'forge_authorization_request_integrity_invalid';
    const response = state.request_identity_verified || identityFailure
        ? preAuthorizationErrorResponse(
            'forge_operator_authorization_required',
            'forge_operator_authorization_required',
        )
        : preAuthorizationErrorResponse(
            mcpErrorCode(error, 'forge_operator_authorization_required'),
            error,
        );
    return addDiagnostic(response, diagnostic);
}
