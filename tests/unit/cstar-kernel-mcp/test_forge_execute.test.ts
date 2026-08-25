import { describe, it } from 'node:test';
import {
    assert,
    fs,
    os,
    path,
    mock,
    database,
    spokeStore,
    beadStore,
    makeSpoke,
    validDispatchRequest,
    validForgeExecuteRequest,
    writeFakeForgeAdapter,
    writeMissingClaimForgeAdapter,
    writeAdvisoryOnlyForgeAdapter,
    writeInspectingForgeWorkerDelegate,
    handleHandoff,
    handleHallSearch,
    handleAugury,
    handleDoctor,
    handleVerifyPlan,
    handleBead,
    handleRecordResult,
    handleSpokeBeadImport,
    resolveSpokeAnchor,
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
    handleStatus,
    handleEvolve,
    handleSpoke,
    handleIntentRoute,
    handleWarden,
    handleTelemetry,
    handleResearcherRequest,
    handleForgeRequest,
    handleForgeExecute,
    invokeForgeAdapterForTest,
    detectAuguryTargetDivergence,
    decideAugurySessionRouting,
    callerRequestedActiveSessionContinuity,
    resolveAuguryCurrentIntentCategory
} from './shared_test_setup.js';

function writeInspectingResponseOnlyForgeAdapter(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-report-forge-adapter-'));
    const scriptPath = path.join(tmpDir, 'adapter.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os, sys',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'prompt = intent.get("intent", "")',
        'required = [',
        '    "top-level object MUST be the Forge execution packet",',
        '    "Do not return packet_name",',
        '    "\\"status\\": \\"pass\\"",',
        '    "\\"files_changed\\": []",',
        '    "\\"callback_packet\\"",',
        ']',
        'missing = [item for item in required if item not in prompt]',
        'if missing:',
        '    print(json.dumps({"status": "degraded", "missing": missing}))',
        '    sys.exit(2)',
        'write_to = intent["payload"]["write_to"]',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'response = {',
        '    "status": "pass",',
        '    "summary": "Strict report-only execution packet template was present.",',
        '    "files_changed": [],',
        '    "artifacts": {"strict_template": "present"},',
        '    "validation": {"template_checked": "pass"},',
        '    "metrics": {"contract_compliance": "pass"},',
        '    "boundaries": {"codex_worker_fallback_allowed": False, "live_source_collection": False},',
        '    "callback_packet": {"callback_id": "TEST_FORGE_REPORT_PACKET", "headline": "bounded report"},',
        '}',
        'with open(write_to, "w") as out:',
        '    out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-report-adapter",',
        '    "duration_ms": 1,',
        '    "response_chars": len(json.dumps(response)),',
        '    "est_prompt_tokens": 1,',
        '    "est_response_tokens": 1,',
        '    "model": "MiniMax-M3",',
        '    "hermes_profile": "cstar-hub",',
        '    "wrote_to": write_to,',
        '    "live_spend": False,',
        '    "live_source_collection": False,',
        '}))',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o755);
    return scriptPath;
}

function writeCallbackOnlyReportForgeAdapter(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-callback-only-forge-adapter-'));
    const scriptPath = path.join(tmpDir, 'adapter.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'write_to = intent["payload"]["write_to"]',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'response = {',
        '    "name": "TEST_FORGE_CALLBACK_ONLY_PACKET",',
        '    "headline": "Researcher pipeline analysis complete.",',
        '    "root_cause_summary": "The reusable skill path is not exercised by the live SUT runner.",',
        '}',
        'with open(write_to, "w") as out:',
        '    out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-callback-only-adapter",',
        '    "duration_ms": 1,',
        '    "response_chars": len(json.dumps(response)),',
        '    "est_prompt_tokens": 1,',
        '    "est_response_tokens": 1,',
        '    "model": "MiniMax-M3",',
        '    "hermes_profile": "cstar-hub",',
        '    "wrote_to": write_to,',
        '    "live_spend": False,',
        '    "live_source_collection": False,',
        '}))',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o755);
    return scriptPath;
}

describe("CStar MCP Forge execute tool", () => {
it('cstar_forge_execute validates a no-op execution receipt without live spend', async () => {
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

it('cstar_forge_execute rejects live execution without operator authorization', async () => {
    const result = await handleForgeExecute(validForgeExecuteRequest({
        spend_policy: { mode: 'live_authorized', max_retries: 1, live_source_allowed: false },
        operator_authorization_ref: undefined,
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /operator_authorization_ref/);
});

it('cstar_forge_execute rejects mismatched receipt linkage', async () => {
    const result = await handleForgeExecute(validForgeExecuteRequest({
        decision_id: 'decision-other',
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /decision_id must match/);
});

it('cstar_forge_execute rejects inconsistent package locks', async () => {
    const result = await handleForgeExecute(validForgeExecuteRequest({
        package_locks: [
            { path: 'work/packages/forge.tar.gz', sha256: 'abc123' },
            { path: 'work/packages/forge.tar.gz', sha256: 'def456' },
        ],
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /package_locks/);
});

it('Forge adapter internals invoke the approved adapter without Codex fallback', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'executed');
    assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
    assert.strictEqual(parsed.authorized_execution_adapter.found, true);
    assert.strictEqual(parsed.authorized_execution_adapter.selected.ref, 'cstar-forge-hermes-minimax-adapter');
    assert.strictEqual(parsed.authorized_execution_adapter.selected.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.forge_execution.attempted, true);
    assert.strictEqual(parsed.forge_execution.live_spend, false);
    assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
    assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
    assert.strictEqual(parsed.forge_execution.adapter_result.status, 'ok');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.model, 'MiniMax-M3');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.hermes_profile, 'cstar-hub');
    assert.ok(parsed.forge_execution.adapter_result.envelope.wrote_to.startsWith(artifactRoot));
    assert.match(parsed.forge_execution.adapter_result.envelope.response_artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(parsed.forge_execution.adapter_result.envelope.response_artifact.bytes > 0);
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.status, 'pass');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.files_changed_count, 0);
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.artifacts_count, 1);
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.validation_count, 1);
});

it('Forge adapter internals give report-only adapters an exact execution-packet template', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeInspectingResponseOnlyForgeAdapter();
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Analyze retained artifacts and return report-only decision packet',
        requested_actions: ['report-only analysis'],
        artifact_expectations: ['compact callback packet'],
        execution_adapter_ref: 'cstar-forge-report-only',
        callback_contract: {
            expected_packet: 'TEST_FORGE_REPORT_PACKET',
            callback_required: true,
        },
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'executed');
    assert.strictEqual(parsed.authorized_execution_adapter.selected.write_capability, 'response_only');
    assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
    assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
    assert.strictEqual(parsed.forge_execution.adapter_result.status, 'ok');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.status, 'pass');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.files_changed_count, 0);
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.callback_packet, 'TEST_FORGE_REPORT_PACKET');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.callback_packet_kind, 'object');
});

it('Forge adapter internals reject matching callback-only report packets', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCallbackOnlyReportForgeAdapter();
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Analyze retained artifacts and return report-only decision packet',
        requested_actions: ['report-only analysis'],
        artifact_expectations: ['compact callback packet'],
        execution_adapter_ref: 'cstar-forge-report-only',
        callback_contract: {
            expected_packet: 'TEST_FORGE_CALLBACK_ONLY_PACKET',
            callback_required: true,
        },
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'adapter_degraded');
    assert.strictEqual(parsed.forge_execution.adapter_result.status, 'degraded');
    assert.strictEqual(parsed.forge_execution.adapter_result.error, 'adapter_response_missing_status');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract, null);
});

it('Forge adapter internals block response-only adapters before implementation work', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build the CorvusEye deterministic truth-verification red-team suite',
        requested_actions: ['build deterministic suite files', 'package validation artifacts'],
        artifact_expectations: ['changed source files', 'tarball package', 'dashboard artifacts'],
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.authorized_execution_adapter.found, true);
    assert.strictEqual(parsed.authorized_execution_adapter.selected.write_capability, 'response_only');
    assert.strictEqual(parsed.forge_execution.attempted, false);
    assert.strictEqual(parsed.forge_execution.adapter_invoked, false);
    assert.strictEqual(parsed.forge_execution.live_spend, false);
    assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'adapter_lacks_implementation_write_capability');
});

it('Forge adapter internals treat repair/update/refactor language as implementation work', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Repair the dashboard workflow and update the reusable skill surface',
        requested_actions: ['refactor the implementation path'],
        artifact_expectations: ['source patch'],
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.authorized_execution_adapter.selected.write_capability, 'response_only');
    assert.strictEqual(parsed.forge_execution.attempted, false);
    assert.strictEqual(parsed.forge_execution.adapter_invoked, false);
    assert.strictEqual(parsed.forge_execution.fail_closed_reason, 'adapter_lacks_implementation_write_capability');
});

it('Forge adapter internals invoke the write-capable worker on bounded target roots', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
    const suiteRoot = path.join(projectRoot, 'tests', 'truth-verification-red-team');
    fs.mkdirSync(suiteRoot, { recursive: true });
    const modelResponse = path.join(suiteRoot, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify({
        status: 'success',
        summary: 'Applied bounded test fixture.',
        files: [
            { path: 'generated-fixture.json', content: '{"ok":true}\n' },
        ],
        artifacts: {},
        validation: { unit: 'pass' },
        metrics: { files_written: 1 },
        boundaries: { no_codex_worker_fallback: true },
        callback_packet: 'TEST_FORGE_WORKER_PACKET',
    }));
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build bounded test fixture through the Forge worker adapter',
        target_paths: [suiteRoot],
        required_output_paths: [path.join(suiteRoot, 'generated-fixture.json')],
        requested_actions: ['build deterministic suite files'],
        artifact_expectations: ['changed source files'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    const generatedPath = path.join(suiteRoot, 'generated-fixture.json');
    assert.strictEqual(parsed.status, 'executed');
    assert.strictEqual(parsed.authorized_execution_adapter.selected.write_capability, 'project_files');
    assert.strictEqual(parsed.forge_execution.attempted, true);
    assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
    assert.strictEqual(parsed.forge_execution.live_source_collection, false);
    assert.strictEqual(parsed.forge_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
    assert.strictEqual(parsed.forge_execution.adapter_result.status, 'ok');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.status, 'success');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.files_changed_count, 1);
    assert.strictEqual(fs.readFileSync(generatedPath, 'utf-8'), '{"ok":true}\n');
});

it('Forge worker rejects incomplete required output manifests before writing any file', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-incomplete-'));
    const suiteRoot = path.join(projectRoot, 'src');
    fs.mkdirSync(suiteRoot, { recursive: true });
    const firstPath = path.join(suiteRoot, 'first.ts');
    const missingPath = path.join(suiteRoot, 'second.ts');
    const modelResponse = path.join(suiteRoot, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify({
        status: 'success',
        summary: 'Incorrectly claims a complete implementation.',
        files: [{ path: 'first.ts', content: 'export const first = true;\n' }],
        artifacts: {},
        validation: { claimed: 'pass' },
        metrics: { files_written: 1 },
        boundaries: {},
        callback_packet: 'TEST_FORGE_WORKER_PACKET',
    }));
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
        path.join(os.tmpdir(), 'fake-forge-artifacts-'),
    );
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build both required implementation files',
        target_paths: [suiteRoot],
        required_output_paths: [firstPath, missingPath],
        requested_actions: ['build both files'],
        artifact_expectations: ['two changed source files'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    }));
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(result.isError, true);
    assert.strictEqual(parsed.status, 'adapter_degraded');
    assert.match(parsed.forge_execution.adapter_result.envelope.degraded_reason, /missing_required_output/);
    assert.strictEqual(fs.existsSync(firstPath), false);
    assert.strictEqual(fs.existsSync(missingPath), false);
});

it('Forge adapter internals do not let a file target authorize sibling writes', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
    const exactTarget = path.join(projectRoot, 'package.json');
    fs.writeFileSync(exactTarget, '{}\n');
    const modelResponse = path.join(projectRoot, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify({
        status: 'success',
        summary: 'Attempt unsafe sibling write.',
        files: [
            { path: 'not-package.json', content: '{"bad":true}\n' },
        ],
        artifacts: {},
        validation: {},
        metrics: {},
        boundaries: {},
        callback_packet: 'TEST_FORGE_WORKER_PACKET',
    }));
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build bounded package update through the Forge worker adapter',
        target_paths: [exactTarget],
        required_output_paths: [exactTarget],
        requested_actions: ['build package update'],
        artifact_expectations: ['changed source file'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'adapter_degraded');
    assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
    assert.strictEqual(parsed.forge_execution.live_spend, false);
    assert.match(parsed.forge_execution.adapter_result.envelope.degraded_reason, /undeclared_output/);
    assert.strictEqual(fs.existsSync(path.join(projectRoot, 'not-package.json')), false);
});

it('Forge adapter internals ask delegates for files manifests, not files_changed packets', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
    const suiteRoot = path.join(projectRoot, 'tests', 'truth-verification-red-team');
    fs.mkdirSync(suiteRoot, { recursive: true });
    process.env.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT = writeInspectingForgeWorkerDelegate();
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build bounded test fixture through the Forge worker adapter',
        target_paths: [suiteRoot],
        required_output_paths: [path.join(suiteRoot, 'generated-by-delegate.json')],
        requested_actions: ['build deterministic suite files'],
        artifact_expectations: ['changed source files'],
        execution_adapter_ref: 'cstar-forge-edit-files',
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    const generatedPath = path.join(suiteRoot, 'generated-by-delegate.json');
    assert.strictEqual(parsed.status, 'executed');
    assert.strictEqual(parsed.authorized_execution_adapter.requested_ref, 'cstar-forge-edit-files');
    assert.strictEqual(parsed.authorized_execution_adapter.canonical_ref, 'cstar-forge-hermes-minimax-worker-adapter');
    assert.strictEqual(parsed.authorized_execution_adapter.selected.ref, 'cstar-forge-hermes-minimax-worker-adapter');
    assert.strictEqual(parsed.forge_execution.adapter_result.status, 'ok');
    assert.strictEqual(parsed.forge_execution.adapter_result.envelope.response_contract.files_changed_count, 1);
    assert.strictEqual(fs.readFileSync(generatedPath, 'utf-8'), '{"ok":true}\n');
});

it('Forge adapter internals explain files_changed manifest mistakes', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
    const suiteRoot = path.join(projectRoot, 'tests', 'truth-verification-red-team');
    fs.mkdirSync(suiteRoot, { recursive: true });
    const modelResponse = path.join(suiteRoot, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify({
        status: 'success',
        summary: 'Wrong packet shape.',
        files_changed: ['generated-fixture.json'],
        artifacts: {},
        validation: {},
        metrics: {},
        boundaries: {},
    }));
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build bounded test fixture through the Forge worker adapter',
        target_paths: [suiteRoot],
        required_output_paths: [path.join(suiteRoot, 'generated-fixture.json')],
        requested_actions: ['build deterministic suite files'],
        artifact_expectations: ['changed source files'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'adapter_degraded');
    assert.strictEqual(parsed.forge_execution.adapter_invoked, true);
    assert.match(
        parsed.forge_execution.adapter_result.envelope.degraded_reason,
        /files_changed_legacy/,
    );
    assert.strictEqual(fs.existsSync(path.join(suiteRoot, 'generated-fixture.json')), false);
});

});
