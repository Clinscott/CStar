import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import {
    assert,
    fs,
    invokeForgeAdapterForTest,
    path,
    validForgeExecuteRequest,
} from './shared_test_setup.js';
import {
    cleanupPreparedForgeAdapterInvocation,
    prepareForgeHermesMinimaxAdapterInvocation,
    resolveForgeExecutionAdapterRef,
    sealForgeAdapterRuntime,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';
import {
    forgeHermesRuntimeExpectationEquals,
    sealForgeHermesRuntimeExpectation,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';
import { createForgeOAuthHorizon } from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_oauth_contract.js';

const roots: string[] = [];
const originalHermes = process.env.HERMES_BIN;
const originalHome = process.env.HOME;
const originalArtifactRoot = process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT;
const originalModelResponse = process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE;

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function makeRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join('/tmp', prefix));
    roots.push(root);
    return root;
}

function writePreflightOnlyHermes(root: string) {
    const executable = path.join(root, 'preflight-only-hermes.mjs');
    const audit = path.join(root, 'hermes-audit.jsonl');
    fs.writeFileSync(executable, [
        `#!${process.execPath}`,
        'const fs = await import("node:fs");',
        `const audit = ${JSON.stringify(audit)};`,
        'const args = process.argv.slice(2);',
        'fs.appendFileSync(audit, JSON.stringify({args,horizon:{started:process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS,until:process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS,binding:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}}) + "\\n");',
        'if (args.length === 1 && args[0] === "--version") process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if (args.length === 1 && args[0] === "--help") process.stdout.write("--profile --provider --model\\n");',
        'else if (args.length === 2 && args[0] === "chat" && args[1] === "--help") process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");',
        'else if (args.length === 1 && args[0] === "--oauth-status") process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v2",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,horizon_seconds:2100,horizon_started_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS),required_until_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS),horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}));',
        'else process.exit(91);',
    ].join('\n'));
    fs.chmodSync(executable, 0o700);
    return { executable, audit };
}

function writeSixRoleHermes(
    root: string,
    callbackPacket: string,
    failRole = '',
    outputPath = 'generated.ts',
    requiredSentinel = '',
) {
    const executable = path.join(root, 'six-role-hermes.mjs');
    fs.writeFileSync(executable, [
        `#!${process.execPath}`,
        `const failRole=${JSON.stringify(failRole)};`,
        `const callback=${JSON.stringify(callbackPacket)};`,
        `const outputPath=${JSON.stringify(outputPath)};`,
        `const requiredSentinel=${JSON.stringify(requiredSentinel)};`,
        'const args=process.argv.slice(2); const role=process.env.CSTAR_FORGE_ROLE;',
        'if(!role){if(args.length===1&&args[0]==="--version")process.stdout.write("Hermes synthetic 1.0\\n");else if(args.length===1&&args[0]==="--help")process.stdout.write("--profile --provider --model\\n");else if(args.length===2&&args[0]==="chat"&&args[1]==="--help")process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");else if(args.length===1&&args[0]==="--oauth-status")process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v2",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,horizon_seconds:2100,horizon_started_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS),required_until_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS),horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}));else process.exit(91);process.exit();}',
        'if(role===failRole)process.exit(23);',
        'if(role==="specifier"&&requiredSentinel){const fs=await import("node:fs");const query=fs.readFileSync(0,"utf8");if(!query.includes(requiredSentinel)||Buffer.byteLength(query,"utf8")<=72363)process.exit(92);}',
        'const payload=role==="specifier"?{specification:`Change only ${outputPath} and retain focused synthetic proof.`}:{manifest:{status:"success",summary:"six-role CStar evidence",files:[{path:outputPath,content:"export const generated = true;\\n"}],artifacts:{},validation:{focused:"pass"},metrics:{},boundaries:{git_mutation:false},callback_packet:callback}};',
        'const handoff={schema:"cstar.forge_role_handoff.v1",plan_id:process.env.CSTAR_FORGE_ROLE_PLAN_ID,plan_sha256:process.env.CSTAR_FORGE_ROLE_PLAN_SHA256,role,status:"pass",previous_handoff_sha256:role==="specifier"?null:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,summary:`${role} complete`,payload};',
        'const execution_identity={forge_request_receipt_id:process.env.CSTAR_FORGE_REQUEST_RECEIPT_ID,forge_execute_receipt_id:process.env.CSTAR_FORGE_EXECUTE_RECEIPT_ID,decision_id:process.env.CSTAR_FORGE_EXECUTE_DECISION_ID,adapter_ref:process.env.CSTAR_FORGE_EXECUTE_ADAPTER_REF};',
        'const packet={schema:"hermes.cstar_forge_provider_response.v1",execution_identity,runtime_content_sha256:process.env.CSTAR_FORGE_RUNTIME_CONTENT_SHA256,forge_role:role,forge_phase:process.env.CSTAR_FORGE_PHASE,role_plan_id:process.env.CSTAR_FORGE_ROLE_PLAN_ID,role_plan_sha256:process.env.CSTAR_FORGE_ROLE_PLAN_SHA256,input_handoff_sha256:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,specification_handoff_sha256:process.env.CSTAR_FORGE_SPECIFICATION_HANDOFF_SHA256,oauth_horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256,auth_provider:"minimax-oauth",auth_mode:"oauth",provider_model:"MiniMax-M3",usage:{input_tokens:10,output_tokens:20},text:JSON.stringify(handoff)};process.stdout.write(JSON.stringify(packet));',
    ].join('\n'));
    fs.chmodSync(executable, 0o700);
    return executable;
}

function auditedProbes(audit: string): any[] {
    return fs.readFileSync(audit, 'utf-8').trim().split('\n').map(JSON.parse);
}

function assertExpectedPreflightProbes(audit: string, copies = 1): void {
    const probes = auditedProbes(audit);
    const onePass = [
        ['--version'],
        ['--help'],
        ['chat', '--help'],
        ['--oauth-status'],
    ];
    assert.deepEqual(probes.map((entry) => entry.args),
        Array.from({ length: copies }, () => onePass).flat());
    const oauth = probes.filter((entry) => entry.args[0] === '--oauth-status');
    assert.equal(oauth.length, copies);
    assert.equal(new Set(oauth.map((entry) => JSON.stringify(entry.horizon))).size, 1);
    assert.match(oauth[0].horizon.binding, /^[a-f0-9]{64}$/);
    assert.equal(Number(oauth[0].horizon.until) - Number(oauth[0].horizon.started), 2_100_000);
}

const PREFLIGHT_KEYS = [
    'auth_mode', 'auth_provider', 'bootstrap_mode', 'checks', 'dependency_mode', 'executable_sha256',
    'credential_profile_owner', 'live_source_collection', 'live_spend', 'live_spend_unknown',
    'locator_path', 'oauth_horizon_binding_sha256', 'oauth_horizon_seconds',
    'oauth_horizon_started_unix_ms', 'oauth_profile', 'oauth_refresh_required',
    'oauth_required_until_unix_ms', 'oauth_status', 'python_sha256',
    'runtime_content_sha256', 'runtime_instance_sha256', 'runtime_manifest_sha256',
    'runtime_owner', 'runtime_root', 'runtime_schema', 'schema', 'source_bytes', 'source_file_count', 'status',
    'system_python_path', 'version_sha256',
].sort();

function assertTerminalRuntimeEvidence(parsed: any, expectedTraceStatus: string): void {
    const result = parsed.forge_execution.adapter_result;
    const traceArtifact = result.execution_trace_artifact;
    assert.ok(traceArtifact);
    assert.deepEqual(result.envelope.execution_trace_artifact, traceArtifact);
    const traceBytes = fs.readFileSync(traceArtifact.path);
    assert.equal(traceArtifact.bytes, traceBytes.byteLength);
    assert.equal(traceArtifact.sha256,
        createHash('sha256').update(traceBytes).digest('hex'));

    const trace = JSON.parse(traceBytes.toString('utf-8'));
    const preflight = result.hermes_preflight;
    assert.equal(trace.status, expectedTraceStatus);
    assert.ok(preflight);
    assert.equal(result.envelope.provider, 'minimax-oauth');
    assert.equal(result.envelope.auth_provider, 'minimax-oauth');
    assert.equal(result.envelope.auth_mode, 'oauth');
    assert.equal(trace.envelope.provider, 'minimax-oauth');
    assert.equal(trace.envelope.auth_provider, 'minimax-oauth');
    assert.equal(trace.envelope.auth_mode, 'oauth');
    assert.deepEqual(trace.hermes_preflight, preflight);
    assert.deepEqual(result.envelope.hermes_preflight, preflight);
    assert.deepEqual(Object.keys(preflight).sort(), PREFLIGHT_KEYS);
    assert.equal(preflight.schema, 'cstar.forge_hermes_preflight.v2');
    assert.equal(preflight.status, 'ok');
    assert.equal(preflight.live_spend, false);
    assert.equal(preflight.live_spend_unknown, false);
    assert.equal(preflight.live_source_collection, false);
    assert.equal(preflight.auth_provider, 'minimax-oauth');
    assert.equal(preflight.auth_mode, 'oauth');
    assert.equal(preflight.oauth_profile, 'cstar-hub');
    assert.equal(preflight.oauth_status, 'ready');
    assert.equal(preflight.oauth_refresh_required, false);
    assert.equal(preflight.oauth_horizon_seconds, 2100);
    assert.equal(preflight.oauth_required_until_unix_ms
        - preflight.oauth_horizon_started_unix_ms, 2_100_000);
    assert.match(preflight.oauth_horizon_binding_sha256, /^[a-f0-9]{64}$/);
    assert.equal(preflight.runtime_schema, 'synthetic_test_executable_v1');
    assert.equal(preflight.runtime_owner, 'synthetic_test');
    assert.equal(preflight.credential_profile_owner, 'synthetic_test');
    assert.deepEqual(preflight.checks, {
        version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass',
    });
    assert.match(preflight.runtime_content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.hermes_runtime_content_sha256,
        preflight.runtime_content_sha256);
    assert.doesNotMatch(JSON.stringify(preflight),
        /access_token|api[_-]?key|auth_path|environment|stdout|stderr/i);
}

async function invokeSyntheticTerminal(manifest: Record<string, unknown>) {
    const root = makeRoot('forge-runtime-terminal-');
    const project = path.join(root, 'project');
    fs.mkdirSync(project, { mode: 0o700 });
    const requiredOutput = path.join(project, 'generated.ts');
    const modelResponse = path.join(project, 'model-response.json');
    fs.writeFileSync(modelResponse, JSON.stringify(manifest));
    const fake = writePreflightOnlyHermes(root);
    process.env.HERMES_BIN = fake.executable;
    process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = makeRoot('forge-runtime-artifacts-');
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build one bounded synthetic runtime-evidence fixture',
        target_paths: [project],
        required_output_paths: [requiredOutput],
        requested_actions: ['build one synthetic file'],
        artifact_expectations: ['terminal runtime evidence'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        callback_contract: {
            expected_packet: 'RUNTIME_EVIDENCE_PACKET', callback_required: true,
        },
    }));
    return { result, parsed: JSON.parse(result.content[0].text), fake, requiredOutput };
}

async function invokeSixRoleTerminal(failRole = '') {
    const root = makeRoot('forge-runtime-six-role-');
    const project = path.join(root, 'project');
    const home = path.join(project, 'home');
    fs.mkdirSync(path.join(home, '.hermes/profiles/cstar-hub'), { recursive: true, mode: 0o700 });
    const seed = path.join(project, 'seed.ts');
    const requiredOutput = path.join(project, 'generated.ts');
    fs.writeFileSync(seed, 'export const seed = true;\n');
    process.env.HOME = home;
    process.env.HERMES_BIN = writeSixRoleHermes(project, 'ROLE_EVIDENCE_PACKET', failRole);
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = makeRoot('forge-runtime-six-artifacts-');
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build one bounded six-role evidence fixture',
        target_paths: [seed, requiredOutput], required_output_paths: [requiredOutput],
        requested_actions: ['build one synthetic file'],
        artifact_expectations: ['ordered six-role receipts'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        callback_contract: { expected_packet: 'ROLE_EVIDENCE_PACKET', callback_required: true },
    }));
    return { result, parsed: JSON.parse(result.content[0].text), requiredOutput };
}

async function invokeLargeMaterialTerminal() {
    const root = makeRoot('forge-runtime-large-material-');
    const project = path.join(root, 'project');
    const home = path.join(project, 'home');
    fs.mkdirSync(path.join(home, '.hermes/profiles/cstar-hub'), { recursive: true, mode: 0o700 });
    const requiredOutput = path.join(project, 'large-target.ts');
    const sentinel = 'CSTAR_72363_BYTE_EXISTING_TARGET';
    const prefix = `${sentinel}\n`;
    fs.writeFileSync(requiredOutput, prefix + 'x'.repeat(72_363 - Buffer.byteLength(prefix)));
    assert.equal(fs.statSync(requiredOutput).size, 72_363);
    process.env.HOME = home;
    process.env.HERMES_BIN = writeSixRoleHermes(
        project, 'LARGE_MATERIAL_PACKET', '', path.basename(requiredOutput), sentinel,
    );
    process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = makeRoot('forge-runtime-large-artifacts-');
    delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    delete process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE;
    const result = await invokeForgeAdapterForTest(validForgeExecuteRequest({
        objective: 'Build one bounded large-material worker fixture',
        target_paths: [requiredOutput], required_output_paths: [requiredOutput],
        requested_actions: ['project_files'],
        artifact_expectations: ['existing 72,363-byte target accepted by the worker'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        callback_contract: { expected_packet: 'LARGE_MATERIAL_PACKET', callback_required: true },
    }));
    return { result, parsed: JSON.parse(result.content[0].text), requiredOutput };
}

afterEach(() => {
    restoreEnv('HERMES_BIN', originalHermes);
    restoreEnv('HOME', originalHome);
    restoreEnv('CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT', originalArtifactRoot);
    restoreEnv('CSTAR_FORGE_WORKER_MODEL_RESPONSE', originalModelResponse);
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CStar Forge Hermes runtime evidence', () => {
    it('compares a persisted runtime expectation independent of object key order', () => {
        const expectation = {
            schema: 'cstar.forge_hermes_runtime_expectation.v2' as const,
            locator_path: '/tmp/hermes', executable_sha256: '1'.repeat(64),
            runtime_content_sha256: '2'.repeat(64), runtime_manifest_sha256: '4'.repeat(64),
            runtime_schema: 'cstar.forge_private_runtime_manifest.v2' as const,
            runtime_owner: 'cstar' as const, credential_profile_owner: 'hermes' as const,
            python_sha256: '3'.repeat(64),
            source_file_count: 7, source_bytes: 4096,
            bootstrap_mode: 'cstar_owned_python_system_stdlib_snapshot_v2' as const,
            dependency_mode: 'stdlib_only_no_site_packages_v2' as const,
            system_python_path: '/usr/bin/python3', runtime_root: '/tmp/runtime',
        };
        const persisted = JSON.parse(JSON.stringify(expectation, Object.keys(expectation).sort()));
        assert.equal(forgeHermesRuntimeExpectationEquals(expectation, persisted), true);
        assert.equal(forgeHermesRuntimeExpectationEquals(expectation, {
            ...persisted, source_bytes: 4097,
        }), false);
    });

    it('preflights the private delegate copy against a request-bound synthetic runtime', async () => {
        const testContext = process.env.NODE_TEST_CONTEXT;
        const testMode = process.env.CSTAR_FORGE_TEST_MODE;
        const hermesOverride = process.env.HERMES_BIN;
        process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? 'child-v8';
        process.env.CSTAR_FORGE_TEST_MODE = '1';
        const root = makeRoot('forge-runtime-synthetic-preflight-');
        const fake = writePreflightOnlyHermes(root);
        process.env.HERMES_BIN = fake.executable;
        const target = path.join(root, 'target.ts');
        fs.writeFileSync(target, 'export const bounded = true;\n');
        let prepared: Awaited<ReturnType<
            typeof prepareForgeHermesMinimaxAdapterInvocation
        >> | undefined;
        try {
            const adapter = resolveForgeExecutionAdapterRef(
                'cstar-forge-hermes-minimax-worker-adapter',
            ).selected;
            assert.ok(adapter);
            const runtime = sealForgeAdapterRuntime(adapter);
            const expected = await sealForgeHermesRuntimeExpectation(runtime);
            const args = validForgeExecuteRequest({
                objective: 'Prove a bounded synthetic preflight without spend',
                target_paths: [target], required_output_paths: [target],
                requested_actions: ['project_files'],
                execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            });
            const oauthHorizon = createForgeOAuthHorizon(
                args, 'decision-synthetic-preflight', 'forge-execute-synthetic-preflight',
                adapter, expected,
            );
            prepared = await prepareForgeHermesMinimaxAdapterInvocation(
                args,
                'decision-synthetic-preflight', 'forge-execute-synthetic-preflight',
                root, adapter, runtime, expected, null, oauthHorizon,
            );
            assert.equal(prepared.hermesPreflight?.locator_path, expected.locator_path);
            assert.equal(prepared.hermesPreflight?.runtime_content_sha256,
                expected.runtime_content_sha256);
            assert.equal(prepared.hermesPreflight?.bootstrap_mode,
                'synthetic_test_executable_v1');
            assert.equal(prepared.hermesPreflight?.auth_provider, 'minimax-oauth');
            assert.equal(prepared.hermesPreflight?.live_spend, false);
            assertExpectedPreflightProbes(fake.audit);
        } finally {
            await cleanupPreparedForgeAdapterInvocation(prepared);
            restoreEnv('NODE_TEST_CONTEXT', testContext);
            restoreEnv('CSTAR_FORGE_TEST_MODE', testMode);
            restoreEnv('HERMES_BIN', hermesOverride);
        }
    });

    it('rejects request-to-execute runtime drift before a provider request', async () => {
        const root = makeRoot('forge-runtime-drift-');
        const fake = writePreflightOnlyHermes(root);
        const target = path.join(root, 'target.ts');
        fs.writeFileSync(target, 'export const before = true;\n');
        process.env.HERMES_BIN = fake.executable;
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = makeRoot('forge-runtime-drift-artifacts-');
        const adapter = resolveForgeExecutionAdapterRef(
            'cstar-forge-hermes-minimax-worker-adapter',
        ).selected;
        assert.ok(adapter);
        const runtime = sealForgeAdapterRuntime(adapter);
        const expected = await sealForgeHermesRuntimeExpectation(runtime);
        const args = validForgeExecuteRequest({
            objective: 'Build one bounded drift fixture',
            target_paths: [target], required_output_paths: [target],
            requested_actions: ['project_files'],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        });
        const oauthHorizon = createForgeOAuthHorizon(
            args, 'decision-runtime-drift', 'forge-execute-runtime-drift', adapter, expected,
        );
        fs.appendFileSync(fake.executable, '\n// request-to-execute drift\n');

        let prepared: Awaited<ReturnType<
            typeof prepareForgeHermesMinimaxAdapterInvocation
        >> | undefined;
        try {
            await assert.rejects(async () => {
                prepared = await prepareForgeHermesMinimaxAdapterInvocation(
                    args,
                    'decision-runtime-drift', 'forge-execute-runtime-drift',
                    path.resolve('.'), adapter, runtime, expected, null, oauthHorizon,
                );
            }, /forge_hermes_preflight_invalid/);
            assertExpectedPreflightProbes(fake.audit);
            assert.equal(fs.readFileSync(target, 'utf-8'), 'export const before = true;\n');
        } finally {
            await cleanupPreparedForgeAdapterInvocation(prepared);
        }
    });

    it('retains complete redacted Hermes preflight in the success terminal trace', async () => {
        const run = await invokeSyntheticTerminal({
            status: 'success', summary: 'Synthetic success.',
            files: [{ path: 'generated.ts', content: 'export const generated = true;\n' }],
            artifacts: {}, validation: { focused: 'pass' }, metrics: {}, boundaries: {},
            callback_packet: 'RUNTIME_EVIDENCE_PACKET',
        });
        assert.equal(run.result.isError, undefined, JSON.stringify(run.parsed));
        assert.equal(run.parsed.status, 'executed');
        assert.equal(fs.readFileSync(run.requiredOutput, 'utf-8'),
            'export const generated = true;\n');
        assertTerminalRuntimeEvidence(run.parsed, 'ok');
        assertExpectedPreflightProbes(run.fake.audit, 2);
    });

    it('retains complete redacted Hermes preflight in the failure terminal trace', async () => {
        const run = await invokeSyntheticTerminal({
            status: 'success', summary: 'Synthetic rejected manifest.',
            files: [{ path: 'undeclared.ts', content: 'export const forbidden = true;\n' }],
            artifacts: {}, validation: {}, metrics: {}, boundaries: {},
            callback_packet: 'RUNTIME_EVIDENCE_PACKET',
        });
        assert.equal(run.result.isError, true);
        assert.equal(run.parsed.status, 'adapter_degraded');
        assert.equal(fs.existsSync(run.requiredOutput), false);
        assertTerminalRuntimeEvidence(run.parsed, 'degraded');
        assertExpectedPreflightProbes(run.fake.audit, 2);
    });

    it('retains exact ordered role receipts and aggregate usage through CStar delivery', async () => {
        const run = await invokeSixRoleTerminal();
        assert.equal(run.result.isError, undefined, JSON.stringify(run.parsed));
        assert.equal(run.parsed.status, 'executed');
        const envelope = run.parsed.forge_execution.adapter_result.envelope;
        assert.equal(envelope.role_evidence_valid, true);
        assert.deepEqual(envelope.role_receipts.map((item: any) => item.role),
            ['specifier', 'coder', 'cleaner', 'architect', 'hardener', 'qa']);
        assert.equal(envelope.provider_requests_started, 6);
        assert.equal(envelope.provider_requests_completed, 6);
        assert.equal(envelope.input_tokens, 60);
        assert.equal(envelope.output_tokens, 120);
        assert.equal(envelope.role_receipts[1].specification_handoff_sha256,
            envelope.role_receipts[0].output_handoff_sha256);
        const tracePath = envelope.execution_trace_artifact.path;
        const trace = JSON.parse(fs.readFileSync(tracePath, 'utf-8'));
        assert.deepEqual(trace.envelope.role_receipts, envelope.role_receipts);
        assert.equal(fs.readFileSync(run.requiredOutput, 'utf-8'),
            'export const generated = true;\n');
    });

    it('accepts an existing 72,363-byte target through the real worker and synthetic Hermes', async () => {
        const run = await invokeLargeMaterialTerminal();
        assert.equal(process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS, undefined);
        assert.equal(process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE, undefined);
        assert.equal(run.result.isError, undefined, JSON.stringify(run.parsed));
        assert.equal(run.parsed.status, 'executed');
        const envelope = run.parsed.forge_execution.adapter_result.envelope;
        assert.equal(envelope.role_evidence_valid, true);
        assert.equal(envelope.provider_requests_started, 6);
        assert.equal(envelope.provider_requests_completed, 6);
        assert.equal(fs.readFileSync(run.requiredOutput, 'utf-8'),
            'export const generated = true;\n');
    });

    it('retains partial role evidence when a later role fails without retry', async () => {
        const run = await invokeSixRoleTerminal('architect');
        assert.equal(run.result.isError, true);
        const envelope = run.parsed.forge_execution.adapter_result.envelope;
        assert.equal(envelope.role_evidence_valid, true);
        assert.equal(envelope.provider_requests_started, 4);
        assert.equal(envelope.provider_requests_completed, 3);
        assert.deepEqual(envelope.role_receipts.map((item: any) => item.role),
            ['specifier', 'coder', 'cleaner']);
        assert.equal(fs.existsSync(run.requiredOutput), false);
    });
});
