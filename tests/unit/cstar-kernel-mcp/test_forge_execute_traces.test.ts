import { describe, it } from 'node:test';
import {
    assert,
    fs,
    handleForgeExecute,
    os,
    path,
    validForgeExecuteRequest,
} from './shared_test_setup.js';

describe('CStar MCP Forge execute trace artifacts', () => {
    it('persists a worker execution trace when the adapter exits without response artifact', async () => {
        const canary = 'FORGE_FAILURE_RAW_CANARY';
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
        const suiteRoot = path.join(projectRoot, 'tests', 'truth-verification-red-team');
        fs.mkdirSync(suiteRoot, { recursive: true });
        const adapterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'degraded-forge-worker-adapter-'));
        const adapterPath = path.join(adapterDir, 'adapter.py');
        fs.writeFileSync(adapterPath, [
            '#!/usr/bin/env python3',
            'import json',
            `canary = ${JSON.stringify(canary)}`,
            'print(json.dumps({"schema":"cstar.forge_delegate_failure.v1","status":"degraded","degraded_reason":"forge_synthetic_adapter_failure","provider":"minimax","requested_model":"MiniMax-M3","actual_model":canary,"model_source":"unreported","hermes_profile":"cstar-hub","live_spend":False,"live_spend_unknown":False,"live_source_collection":False,"unknown_raw":canary}))',
            'import sys; sys.stderr.write(canary)',
            'raise SystemExit(1)',
        ].join('\n'));
        fs.chmodSync(adapterPath, 0o755);
        process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = adapterPath;
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await handleForgeExecute(validForgeExecuteRequest({
            objective: 'Build bounded test fixture through the Forge worker adapter',
            target_paths: [suiteRoot],
            requested_actions: ['build deterministic suite files'],
            artifact_expectations: ['changed source files'],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        }));
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'adapter_degraded');
        assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
        assert.strictEqual(parsed.forge_execution.adapter_result.status, 'degraded');
        const tracePath = parsed.forge_execution.adapter_result.execution_trace_artifact.path;
        assert.ok(fs.existsSync(tracePath));
        const trace = JSON.parse(fs.readFileSync(tracePath, 'utf-8'));
        assert.strictEqual(trace.status, 'degraded');
        assert.strictEqual(trace.response_artifact_exists, false);
        assert.strictEqual(trace.envelope.status, 'degraded');
        assert.strictEqual(trace.envelope.schema, 'cstar.forge_delegate_failure.v1');
        assert.strictEqual(trace.envelope.degraded_reason, 'forge_synthetic_adapter_failure');
        assert.strictEqual(trace.envelope.provider, 'minimax');
        assert.strictEqual(trace.envelope.requested_model, 'MiniMax-M3');
        assert.strictEqual(trace.envelope.actual_model, null);
        assert.strictEqual(trace.envelope.model_source, 'unreported');
        assert.strictEqual(trace.envelope.live_spend, false);
        assert.strictEqual(trace.envelope.live_spend_unknown, false);
        assert.doesNotMatch(JSON.stringify(parsed), new RegExp(canary));
        assert.doesNotMatch(JSON.stringify(trace), new RegExp(canary));
    });
});
