import { describe, it } from 'node:test';

import {
    assert,
    fs,
    handleForgeExecute,
    invokeForgeAdapterForTest,
    os,
    path,
    database,
    mock,
    validForgeExecuteRequest,
} from './shared_test_setup.js';

describe('CStar MCP Forge live-authority containment', () => {
    it('contains no active adapter route to the decommissioned AutoBot skill', () => {
        const adapterSource = fs.readFileSync(
            path.resolve(import.meta.dirname, '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.ts'),
            'utf-8',
        );

        assert.doesNotMatch(adapterSource, /\.agents\/skills\/autobot/);
    });

    it('keeps the report-only adapter unavailable without explicit Forge-native registration', async () => {
        delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;

        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
            execution_adapter_ref: 'cstar-forge-report-only',
            objective: 'Analyze retained evidence and return a bounded report',
            requested_actions: ['report-only analysis'],
            artifact_expectations: ['callback report'],
        }));

        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'blocked');
        assert.strictEqual(parsed.authorized_execution_adapter.found, false);
        assert.strictEqual(
            parsed.forge_execution.fail_closed_reason,
            'missing_authorized_execution_adapter',
        );
        const reportAdapter = parsed.authorized_execution_adapter.checked.find(
            (entry: { ref?: string }) => entry.ref === 'cstar-forge-hermes-minimax-adapter',
        );
        assert.match(reportAdapter.registration_error, /explicit Forge-native adapter registration is required/);
    });

    it('rejects a fabricated request receipt before spawn or writes', async () => {
        const adapterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-public-boundary-adapter-'));
        const adapterPath = path.join(adapterRoot, 'must-not-run.py');
        const invocationSentinel = path.join(adapterRoot, 'invoked');
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-public-boundary-artifacts-'));
        fs.writeFileSync(adapterPath, [
            '#!/usr/bin/env python3',
            'from pathlib import Path',
            `Path(${JSON.stringify(invocationSentinel)}).write_text("invoked")`,
        ].join('\n'));
        fs.chmodSync(adapterPath, 0o755);
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = adapterPath;
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;

        const writable = mock.method(database, 'getWritableDb', () => {
            throw new Error('pre_authorization_writable_hall_forbidden');
        });
        const result = await handleForgeExecute(validForgeExecuteRequest());

        assert.strictEqual(result.isError, undefined);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.error_code, 'forge_execution_authorization_required');
        assert.strictEqual(parsed.error, 'Forge execution authorization was not established.');
        assert.strictEqual(writable.mock.callCount(), 0);
        assert.strictEqual(fs.existsSync(invocationSentinel), false);
        assert.deepStrictEqual(fs.readdirSync(artifactRoot), []);
        writable.mock.restore();
    });
});
