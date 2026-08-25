import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    FORGE_AUTHORIZATION_DIAGNOSTIC_CLASSES,
    forgeAuthorizeErrorResponse,
    type ForgeAuthorizeErrorState,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize_error.js';
import { isNonRecordablePreAuthorization } from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';

const initial: ForgeAuthorizeErrorState = {
    request_identity_verified: false,
    operator_authorization_verified: false,
    request_read_failed: false,
    request_read_with_valid_identity: false,
};

function parse(error: Error, state: Partial<ForgeAuthorizeErrorState> = {}) {
    const response = forgeAuthorizeErrorResponse(error, { ...initial, ...state });
    return { response, payload: JSON.parse(response.content[0]!.text) as Record<string, any> };
}

describe('Forge authorize bounded error diagnostics', () => {
    it('classifies every catch outcome without changing its public error code', () => {
        const cases: Array<{
            error: Error;
            state?: Partial<ForgeAuthorizeErrorState>;
            errorCode: string;
            diagnostic: string;
        }> = [
            {
                error: new Error('codex_request_identity_turn_match_count:0'),
                errorCode: 'forge_operator_signal_required',
                diagnostic: 'root_user_signal_missing',
            },
            {
                error: new Error('forge_request_receipt_not_found'),
                state: { request_read_failed: true, request_read_with_valid_identity: true },
                errorCode: 'forge_request_receipt_not_found',
                diagnostic: 'request_receipt_read',
            },
            {
                error: new Error('forge_runtime_not_ready:live_launcher_required'),
                state: { request_identity_verified: true, operator_authorization_verified: true },
                errorCode: 'forge_runtime_not_ready',
                diagnostic: 'post_authorization_runtime',
            },
            {
                error: new Error('codex_request_identity_session_changed_during_read'),
                errorCode: 'forge_operator_authorization_required',
                diagnostic: 'caller_identity_session',
            },
            {
                error: new Error('forge_set_request_candidate_ambiguous'),
                state: { request_identity_verified: true },
                errorCode: 'forge_operator_authorization_required',
                diagnostic: 'historical_set_request',
            },
            {
                error: new Error('forge_authorization_request_id_invalid'),
                errorCode: 'forge_authorization_request_id_invalid',
                diagnostic: 'request_contract',
            },
        ];
        for (const entry of cases) {
            const { payload } = parse(entry.error, entry.state);
            assert.equal(payload.error_code, entry.errorCode);
            assert.equal(payload.authorization_diagnostic_class, entry.diagnostic);
            assert.ok(FORGE_AUTHORIZATION_DIAGNOSTIC_CLASSES.includes(
                payload.authorization_diagnostic_class,
            ));
        }
    });

    it('keeps preauthorization responses non-recordable after adding diagnostics', () => {
        for (const [error, state] of [
            [new Error('codex_request_identity_turn_match_count:0'), initial],
            [new Error('forge_set_manifest_parent_identity_invalid'), {
                ...initial, request_identity_verified: true,
            }],
            [new Error('codex_request_identity_metadata_required'), initial],
        ] as const) {
            const response = forgeAuthorizeErrorResponse(error, state);
            assert.equal(isNonRecordablePreAuthorization(response), true);
        }
    });

    it('never copies unknown error material into the diagnostic field or masked response', () => {
        const secret = '/private/session/path token=do-not-expose stack trace';
        const { payload } = parse(new Error(secret), { request_identity_verified: true });
        assert.equal(payload.error_code, 'forge_operator_authorization_required');
        assert.equal(payload.error, 'forge_operator_authorization_required');
        assert.equal(payload.authorization_diagnostic_class, 'operator_authority_other');
        assert.doesNotMatch(JSON.stringify(payload), /private|do-not-expose|stack trace/);
    });

    it('does not turn an unverified missing receipt into an existence oracle', () => {
        const unknownAuthority = parse(new Error('forge_authorization_challenge_invalid'), {
            request_identity_verified: true,
        }).payload;
        const unreadableReceipt = parse(new Error('codex_request_identity_turn_match_count:0'), {
            request_read_failed: true,
        }).payload;
        assert.deepEqual(unreadableReceipt, unknownAuthority);
    });

    it('distinguishes bounded authority families without returning raw detail', () => {
        const cases = [
            ['codex_request_identity_turn_metadata_required', 'caller_identity_metadata'],
            ['codex_request_identity_duplicate_turn_record', 'caller_identity_session'],
            ['forge_set_request_candidate_ambiguous', 'historical_set_request'],
            ['forge_set_manifest_operator_signal_missing', 'historical_set_manifest'],
            ['forge_operator_intent_required', 'operator_intent'],
            ['forge_goal_resume_id_invalid', 'goal_resume_authority'],
            ['operator_authorization_reference_format_invalid', 'legacy_operator_authorization'],
        ] as const;
        for (const [message, diagnostic] of cases) {
            const { payload } = parse(new Error(message), { request_identity_verified: true });
            assert.equal(payload.error_code, 'forge_operator_authorization_required');
            assert.equal(payload.error, 'forge_operator_authorization_required');
            assert.equal(payload.authorization_diagnostic_class, diagnostic);
        }
    });

    it('separates post-authorization runtime and persistence classifications', () => {
        const state = { request_identity_verified: true, operator_authorization_verified: true };
        assert.equal(parse(new Error('forge_runtime_not_ready'), state)
            .payload.authorization_diagnostic_class, 'post_authorization_runtime');
        assert.equal(parse(new Error('forge_request_authority_drift_before_authorization'), state)
            .payload.authorization_diagnostic_class, 'post_authorization_commit');
    });
});
