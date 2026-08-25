import { describe, it } from 'node:test';

import {
    assert,
    fs,
    os,
    path,
    invokeForgeAdapterForTest,
    validForgeExecuteRequest,
    writeAdvisoryOnlyForgeAdapter,
    writeMissingClaimForgeAdapter,
} from './shared_test_setup.js';

describe('CStar MCP Forge adapter fail-close boundaries', () => {
    it('rejects an advisory packet in place of the execution contract', async () => {
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeAdvisoryOnlyForgeAdapter();
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'adapter_degraded');
        assert.strictEqual(parsed.forge_execution.attempted, true);
        assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
        assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'adapter_degraded');
        assert.strictEqual(parsed.forge_execution.adapter_result.status, 'degraded');
        assert.strictEqual(parsed.forge_execution.adapter_result.error, 'adapter_response_missing_status');
        assert.match(parsed.forge_execution.adapter_result.envelope.response_artifact.sha256, /^[a-f0-9]{64}$/);
        assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract, null);
    });

    it('rejects a success packet that claims missing artifacts', async () => {
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeMissingClaimForgeAdapter();
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'adapter_degraded');
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'adapter_degraded');
        assert.strictEqual(parsed.forge_execution.adapter_result.status, 'degraded');
        assert.strictEqual(parsed.forge_execution.adapter_result.error, 'adapter_response_missing_claimed_path');
        assert.match(parsed.forge_execution.adapter_result.envelope.response_artifact.sha256, /^[a-f0-9]{64}$/);
        assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract, null);
    });

    it('rejects an unknown execution adapter before invocation', async () => {
        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
            execution_adapter_ref: 'unknown-forge-adapter',
        }));
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'blocked');
        assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
        assert.strictEqual(parsed.authorized_execution_adapter.found, false);
        assert.strictEqual(parsed.forge_execution.attempted, false);
        assert.strictEqual(parsed.forge_execution.live_spend, false);
        assert.strictEqual(parsed.forge_execution.adapter_invoked, false);
        assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'missing_authorized_execution_adapter');
    });
});
