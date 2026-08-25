import { describe, it } from 'node:test';
import {
    assert,
    fs,
    invokeForgeAdapterForTest,
    os,
    path,
    validForgeExecuteRequest,
} from './shared_test_setup.js';
import {
    cleanupPreparedForgeAdapterInvocation,
    invokeForgeHermesMinimaxAdapter,
    prepareForgeHermesMinimaxAdapterInvocation,
    resolveForgeExecutionAdapterRef,
    sealForgeAdapterRuntime,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';

function writePreflightOnlyHermes(root: string) {
    const script = path.join(root, 'preflight-hermes.mjs');
    const audit = path.join(root, 'preflight-audit.jsonl');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const fs = await import("node:fs");',
        `const audit = ${JSON.stringify(audit)};`,
        'const args = process.argv.slice(2);',
        'fs.appendFileSync(audit, JSON.stringify(args) + "\\n");',
        'if (args.length === 1 && args[0] === "--version") process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if (args.length === 1 && args[0] === "--help") process.stdout.write("--profile --provider --model\\n");',
        'else if (args.length === 2 && args[0] === "chat" && args[1] === "--help") process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");',
        'else if (args.length === 1 && args[0] === "--oauth-status") process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v1",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,min_ttl_seconds:2100}));',
        'else process.exit(81);',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return { script, audit };
}

function writeEnvironmentInspectorAdapter(root: string): string {
    const adapterPath = path.join(root, 'environment-inspector.py');
    fs.writeFileSync(adapterPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file, encoding="utf-8") as handle:',
        '    intent = json.load(handle)',
        'write_to = intent["payload"]["write_to"]',
        'response = {"status":"pass","summary":",".join(sorted(os.environ)),"files_changed":[],"artifacts":{},"validation":{},"metrics":{},"boundaries":{},"callback_packet":intent["expected_callback_packet"]}',
        'with open(write_to, "w", encoding="utf-8") as handle:',
        '    json.dump(response, handle)',
        'print(json.dumps({"status":"ok","wrote_to":write_to,"live_spend":False,"live_source_collection":False}))',
    ].join('\n'));
    fs.chmodSync(adapterPath, 0o700);
    return adapterPath;
}

describe('CStar MCP Forge execute trace artifacts', () => {
    it('proves OAuth readiness before reserving and rechecks it during preparation', () => {
        const source = fs.readFileSync(path.resolve(
            'src/tools/cstar-kernel-mcp/tools/forge_execute.ts',
        ), 'utf-8');
        const replay = source.indexOf('const existingAttempt = getForgeAttemptByIdempotency');
        const preflight = source.indexOf('const preReservationHermesPreflight =');
        const reserve = source.indexOf('const reservation = reserveForgeAttempt');
        const prepare = source.indexOf('preparedInvocation = await prepareForgeHermesMinimaxAdapterInvocation');
        assert.ok(replay > 0 && replay < preflight && preflight < reserve && reserve < prepare);
        assert.match(source.slice(preflight, reserve), /preflightForgeHermesOAuthBeforeReservation/);
        assert.match(source.slice(reserve, prepare), /provider: 'minimax-oauth'/);
    });

    it('retains completed adapter evidence across a later persistence exception', () => {
        const source = fs.readFileSync(path.resolve(
            'src/tools/cstar-kernel-mcp/tools/forge_execute.ts',
        ), 'utf-8');
        const captured = source.indexOf('completedAdapterVersion = durableAdapterVersion;');
        const persistence = source.indexOf('const durable = delivered');
        const catchFallback = source.indexOf('let failureAdapterVersion = completedAdapterVersion;');
        assert.ok(captured > 0 && captured < persistence && persistence < catchFallback);
    });

    it('binds sterile compatibility and redacted OAuth preflight into prepared invocation evidence', async () => {
        const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
        const fixture = fs.mkdtempSync(path.join(secureTmp, 'forge-preflight-binding-'));
        const fake = writePreflightOnlyHermes(fixture);
        const target = path.join(fixture, 'target.ts');
        fs.writeFileSync(target, 'export const fixture = true;\n');
        const previousHermes = process.env.HERMES_BIN;
        const previousWorker = process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
        process.env.HERMES_BIN = fake.script;
        delete process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
            path.join(secureTmp, 'forge-preflight-artifacts-'),
        );
        let prepared: Awaited<ReturnType<typeof prepareForgeHermesMinimaxAdapterInvocation>> | undefined;
        try {
            const adapter = resolveForgeExecutionAdapterRef(
                'cstar-forge-hermes-minimax-worker-adapter',
            ).selected;
            assert.ok(adapter);
            const runtime = sealForgeAdapterRuntime(adapter);
            prepared = await prepareForgeHermesMinimaxAdapterInvocation(
                validForgeExecuteRequest({
                    objective: 'Build one bounded synthetic output',
                    target_paths: [target], required_output_paths: [target],
                    execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
                }),
                'decision-preflight-binding', 'forge-execute-preflight-binding',
                path.resolve('.'), adapter, runtime,
            );
            assert.equal(prepared.hermesPreflight?.schema, 'cstar.forge_hermes_preflight.v1');
            assert.match(prepared.hermesPreflight?.executable_sha256 ?? '', /^[a-f0-9]{64}$/);
            assert.match(prepared.hermesPreflight?.runtime_content_sha256 ?? '', /^[a-f0-9]{64}$/);
            assert.match(prepared.hermesPreflight?.runtime_instance_sha256 ?? '', /^[a-f0-9]{64}$/);
            assert.equal(prepared.hermesPreflight?.bootstrap_mode, 'synthetic_test_executable_v1');
            assert.equal(prepared.hermesPreflight?.auth_provider, 'minimax-oauth');
            assert.equal(prepared.hermesPreflight?.auth_mode, 'oauth');
            assert.equal(prepared.hermesPreflight?.oauth_status, 'ready');
            assert.equal((prepared.intent.hermes_preflight as any).live_spend, false);
            assert.deepEqual(
                fs.readFileSync(fake.audit, 'utf-8').trim().split('\n').map(JSON.parse),
                [['--version'], ['--help'], ['chat', '--help'], ['--oauth-status']],
            );
        } finally {
            await cleanupPreparedForgeAdapterInvocation(prepared);
            if (previousHermes === undefined) delete process.env.HERMES_BIN;
            else process.env.HERMES_BIN = previousHermes;
            if (previousWorker === undefined) delete process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
            else process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = previousWorker;
        }
    });

    it('rejects a symlinked execution artifact root before adapter spawn', async () => {
        const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
        const fixture = fs.mkdtempSync(path.join(secureTmp, 'forge-trace-symlink-'));
        const realArtifacts = path.join(fixture, 'real-artifacts');
        const linkedArtifacts = path.join(fixture, 'linked-artifacts');
        fs.mkdirSync(realArtifacts, { mode: 0o700 });
        fs.symlinkSync(realArtifacts, linkedArtifacts);
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeEnvironmentInspectorAdapter(fixture);
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = linkedArtifacts;
        await assert.rejects(
            () => invokeForgeAdapterForTest(validForgeExecuteRequest({
                objective: 'Return a bounded response-only report',
                requested_actions: ['report-only analysis'],
                artifact_expectations: ['bounded callback packet'],
            })),
            /forge_artifact_directory_unsafe_type/,
        );
        assert.deepStrictEqual(fs.readdirSync(realArtifacts), []);
    });

    it('passes an allowlisted adapter environment without host secrets', async () => {
        const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
        const fixture = fs.mkdtempSync(path.join(secureTmp, 'forge-env-inspector-'));
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeEnvironmentInspectorAdapter(fixture);
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
            path.join(secureTmp, 'forge-env-artifacts-'),
        );
        process.env.OPENAI_API_KEY = 'must-not-cross-forge-boundary';
        process.env.AWS_SECRET_ACCESS_KEY = 'must-not-cross-forge-boundary';
        try {
            const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
                objective: 'Return a bounded response-only report',
                requested_actions: ['report-only analysis'],
                artifact_expectations: ['bounded callback packet'],
            }));
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.status, 'executed');
            const responsePath = parsed.forge_execution.adapter_result.envelope.response_artifact.path;
            const keys = JSON.parse(fs.readFileSync(responsePath, 'utf-8')).summary;
            assert.doesNotMatch(keys, /OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY/);
            assert.match(keys, /CSTAR_FORGE_EXECUTE_RECEIPT_ID/);
        } finally {
            delete process.env.OPENAI_API_KEY;
            delete process.env.AWS_SECRET_ACCESS_KEY;
        }
    });

    it('seals interpreters and direct worker dependencies before spend', async () => {
        const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
        const fixture = fs.mkdtempSync(path.join(secureTmp, 'forge-runtime-seal-'));
        const sourceDir = path.resolve('.agents/skills/corvus-forge/scripts');
        for (const name of ['forge_worker_adapter.py', 'forge_worker_safety.py', 'hermes_minimax_delegate.mjs', 'hermes_runtime_lineage.mjs', 'forge_role_plan.mjs']) {
            fs.copyFileSync(path.join(sourceDir, name), path.join(fixture, name));
        }
        fs.chmodSync(path.join(fixture, 'hermes_minimax_delegate.mjs'), 0o700);
        process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = path.join(
            fixture,
            'forge_worker_adapter.py',
        );
        const adapter = resolveForgeExecutionAdapterRef(
            'cstar-forge-hermes-minimax-worker-adapter',
        ).selected;
        assert.ok(adapter);
        const sealed = sealForgeAdapterRuntime(adapter);
        assert.match(sealed.python_interpreter.sha256, /^[a-f0-9]{64}$/);
        assert.match(sealed.node_interpreter?.sha256 ?? '', /^[a-f0-9]{64}$/);
        assert.deepStrictEqual(
            sealed.dependencies.map((item) => item.role).sort(),
            ['forge_role_plan', 'forge_worker_safety', 'hermes_minimax_delegate', 'hermes_runtime_lineage'],
        );
        fs.appendFileSync(path.join(fixture, 'forge_worker_safety.py'), '\n# drift\n');
        await assert.rejects(
            () => prepareForgeHermesMinimaxAdapterInvocation(
                validForgeExecuteRequest({
                    objective: 'Build a bounded worker output',
                    target_paths: [path.resolve('src')],
                    required_output_paths: [path.resolve('src/sealed-output.ts')],
                    execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
                }),
                'decision-runtime-dependency-drift',
                'forge-execute-runtime-dependency-drift',
                path.resolve('.'),
                adapter,
                sealed,
            ),
            /forge_adapter_runtime_drift_before_invocation/,
        );
    });

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
            'print(json.dumps({"schema":"cstar.forge_delegate_failure.v1","status":"degraded","degraded_reason":"forge_synthetic_adapter_failure","intent_id":canary,"duration_ms":canary,"response_chars":canary,"est_prompt_tokens":canary,"est_response_tokens":canary,"provider":"minimax-oauth","auth_provider":"minimax-oauth","auth_mode":"oauth","requested_model":"MiniMax-M3","actual_model":canary,"model_source":"unreported","hermes_profile":"cstar-hub","wrote_to":canary,"ledger_entry":{"raw":canary},"live_spend":canary,"live_spend_unknown":canary,"live_source_collection":canary,"unknown_raw":canary}))',
            'import sys; sys.stderr.write(canary)',
            'raise SystemExit(1)',
        ].join('\n'));
        fs.chmodSync(adapterPath, 0o755);
        process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = adapterPath;
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
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
        assert.strictEqual(trace.envelope.provider, 'minimax-oauth');
        assert.strictEqual(trace.envelope.auth_provider, 'minimax-oauth');
        assert.strictEqual(trace.envelope.auth_mode, 'oauth');
        assert.strictEqual(trace.envelope.requested_model, 'MiniMax-M3');
        assert.strictEqual(trace.envelope.actual_model, null);
        assert.strictEqual(trace.envelope.model_source, 'unreported');
        assert.strictEqual(trace.envelope.live_spend, null);
        assert.strictEqual(trace.envelope.live_spend_unknown, null);
        assert.strictEqual(trace.envelope.live_source_collection, null);
        for (const key of [
            'intent_id', 'duration_ms', 'response_chars', 'est_prompt_tokens',
            'est_response_tokens', 'wrote_to', 'ledger_entry', 'unknown_raw',
        ]) {
            assert.strictEqual(Object.hasOwn(trace.envelope, key), false, key);
        }
        assert.strictEqual(parsed.forge_execution.adapter_result.live_spend_unknown, true);
        assert.strictEqual(parsed.forge_execution.adapter_result.envelope.wrote_to, null);
        assert.strictEqual(Object.hasOwn(parsed.forge_execution.adapter_result.envelope, 'intent_id'), false);
        assert.strictEqual(Object.hasOwn(parsed.forge_execution.adapter_result.envelope, 'ledger_entry'), false);
        assert.doesNotMatch(JSON.stringify(parsed), new RegExp(canary));
        assert.doesNotMatch(JSON.stringify(trace), new RegExp(canary));
    });

    it('cannot return delivery when the terminal trace artifact disappears', async () => {
        const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-terminal-trace-required-'));
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeEnvironmentInspectorAdapter(fixture);
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
            path.join(os.tmpdir(), 'forge-terminal-trace-artifacts-'),
        );
        const args = validForgeExecuteRequest({
            objective: 'Return a bounded response-only report',
            requested_actions: ['report-only analysis'],
            artifact_expectations: ['mandatory terminal trace'],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        });
        const selected = resolveForgeExecutionAdapterRef(
            'cstar-forge-hermes-minimax-adapter',
        ).selected;
        assert.ok(selected);
        const runtime = sealForgeAdapterRuntime(selected);
        let prepared: Awaited<ReturnType<typeof prepareForgeHermesMinimaxAdapterInvocation>> | undefined;
        try {
            prepared = await prepareForgeHermesMinimaxAdapterInvocation(
                args, 'decision-terminal-trace', 'forge-execute-terminal-trace',
                path.resolve('.'), selected, runtime,
            );
            const writeTrace = prepared.writeExecutionTrace.bind(prepared);
            prepared.writeExecutionTrace = (trace) => {
                writeTrace(trace);
                if (trace.status !== 'started') fs.rmSync(prepared!.executionTracePath);
            };
            await assert.rejects(() => invokeForgeHermesMinimaxAdapter(
                args, 'decision-terminal-trace', 'forge-execute-terminal-trace',
                path.resolve('.'), selected, runtime, prepared,
            ), /forge_adapter_terminal_trace_unavailable/);
        } finally {
            await cleanupPreparedForgeAdapterInvocation(prepared);
        }
    });
});
