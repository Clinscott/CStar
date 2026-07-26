import { describe, it } from 'node:test';
import {
    assert,
    handleForgeExecute,
    validForgeExecuteRequest,
    writeFakeForgeAdapter,
} from './shared_test_setup.js';

describe('CStar MCP Forge execution containment', () => {
    it('validates a no-op execution receipt without live spend', async () => {
        const result = await handleForgeExecute(validForgeExecuteRequest({
            spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
            requested_actions: ['no-op execution contract proof'],
            execution_mode: 'no_op',
            operator_authorization_ref: undefined,
            execution_adapter_ref: undefined,
        }));
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'validated_noop');
        assert.strictEqual(parsed.execution_kind, 'forge');
        assert.strictEqual(parsed.forge_request_receipt_id, 'dispatch-forge-decision-forge-execute-test-receipt');
        assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
        assert.strictEqual(parsed.forge_execution.mode, 'no_op');
        assert.strictEqual(parsed.forge_execution.attempted, false);
        assert.strictEqual(parsed.forge_execution.live_spend, false);
        assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
    });

    it('blocks live execution by default before invoking an adapter', async () => {
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
        const callerAuthorization = 'caller-text-is-not-server-authority';
        const result = await handleForgeExecute(validForgeExecuteRequest({
            operator_authorization_ref: callerAuthorization,
            spend_policy: {
                mode: 'live_authorized',
                max_retries: 1,
                live_source_allowed: false,
                operator_authorization_ref: callerAuthorization,
            },
        }));
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'blocked');
        assert.strictEqual(parsed.forge_execution.attempted, false);
        assert.strictEqual(parsed.forge_execution.adapter_invoked, false);
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'legacy_live_execution_disabled');
        assert.ok(!JSON.stringify(parsed).includes(callerAuthorization));
    });
});
