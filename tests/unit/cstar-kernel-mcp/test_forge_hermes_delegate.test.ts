import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DELEGATE = path.join(
    PROJECT_ROOT,
    '.agents',
    'skills',
    'corvus-forge',
    'scripts',
    'hermes_minimax_delegate.mjs',
);
const WORKER = path.join(PROJECT_ROOT, '.agents', 'skills', 'corvus-forge', 'scripts', 'forge_worker_adapter.py');
const SAFETY = path.join(PROJECT_ROOT, '.agents', 'skills', 'corvus-forge', 'scripts', 'forge_worker_safety.py');
const LINEAGE = path.join(PROJECT_ROOT, '.agents/skills/corvus-forge/scripts/hermes_runtime_lineage.mjs');
const ROLE_PLAN = path.join(PROJECT_ROOT, '.agents/skills/corvus-forge/scripts/forge_role_plan.mjs');
const EXECUTION_IDENTITY = {
    forge_request_receipt_id: 'forge-request-test', forge_execute_receipt_id: 'forge-execute-test',
    decision_id: 'decision-test',
    adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter' };
const roots: string[] = [];
function createFixture() {
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-hermes-delegate-'));
    roots.push(root);
    const target = path.join(root, 'target.ts');
    const home = path.join(root, 'home');
    const profileHome = path.join(home, '.hermes', 'profiles', 'cstar-hub');
    const response = path.join(root, 'response.json');
    const intentPath = path.join(root, 'intent.json');
    fs.writeFileSync(target, 'export const target = true;\n');
    fs.mkdirSync(profileHome, { recursive: true, mode: 0o700 });
    const intent = {
        intent: 'Return a bounded Forge worker manifest.',
        execution_identity: EXECUTION_IDENTITY,
        project_root: root,
        target_paths: [target],
        payload: {
            hermes_profile: 'cstar-hub',
            model: 'MiniMax-M3',
            expected_output: 'json',
            write_to: response,
            timeout_seconds: 60,
        },
    };
    fs.writeFileSync(intentPath, JSON.stringify(intent));
    return { root, home, profileHome, target, response, intentPath, intent };
}

function writeFakeHermes(root: string, mode = 0o700) {
    const script = path.join(root, 'fake-hermes.mjs');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const fs = await import("node:fs");',
        'const { createHash } = await import("node:crypto");',
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") { process.stdout.write("Hermes synthetic 1.0\\n"); process.exit(0); }',
        'if (args.length === 1 && args[0] === "--help") { process.stdout.write("--profile --provider --model\\n"); process.exit(0); }',
        'if (args.length === 2 && args[0] === "chat" && args[1] === "--help") { process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n"); process.exit(0); }',
        'const chatIndex = args.indexOf("chat");',
        'const profileIndex = args.indexOf("--profile");',
        'const providerIndex = args.indexOf("--provider");',
        'const modelIndex = args.indexOf("--model");',
        'if (profileIndex < 0 || profileIndex > chatIndex || providerIndex < chatIndex || modelIndex < chatIndex) process.exit(10);',
        'if (args[providerIndex + 1] !== "minimax-oauth" || args[modelIndex + 1] !== "MiniMax-M3") process.exit(11);',
        'if (!process.argv.includes("--forge-query-stdin") || process.argv.includes("-q")) process.exit(4);',
        'const query = fs.readFileSync(0, "utf8");',
        'if (!query.includes("CSTAR BOUNDED FORGE ROLE")) process.exit(4);',
        `if (query.includes(${JSON.stringify(root)})) process.exit(8);`,
        'if (!query.includes("\\"path\\":\\"target.ts\\"")) process.exit(9);',
        'if (process.env.HERMES_FORGE_QUERY_BYTES !== String(Buffer.byteLength(query, "utf8"))) process.exit(16);',
        'if (process.env.HERMES_FORGE_QUERY_SHA256 !== createHash("sha256").update(query, "utf8").digest("hex")) process.exit(17);',
        'const toolsetIndex = process.argv.indexOf("--toolsets");',
        'if (toolsetIndex < 0 || process.argv[toolsetIndex + 1] !== "context_engine") process.exit(5);',
        'if (!process.argv.includes("--safe-mode") || !process.argv.includes("--max-turns")) process.exit(6);',
        `if (process.env.HERMES_HOME !== ${JSON.stringify(path.join(root, 'home', '.hermes', 'profiles', 'cstar-hub'))}) process.exit(18);`,
        'if (process.env.HERMES_SAFE_MODE !== "1" || process.env.HERMES_FORGE_EPHEMERAL !== "1" || process.env.HERMES_SAFE_MODE_PROVIDER !== "minimax-oauth" || process.env.HERMES_SAFE_MODE_CREDENTIAL_NAMES !== "[]" || process.env.HERMES_IGNORE_USER_CONFIG !== "1" || process.env.HERMES_IGNORE_RULES !== "1" || process.env.HERMES_FORGE_CREDENTIAL_FD || process.env.HERMES_INTERACTIVE !== "0") process.exit(12);',
        'if (process.env.XDG_CACHE_HOME || process.env.XDG_CONFIG_HOME || process.env.XDG_DATA_HOME) process.exit(13);',
        'if (process.platform === "linux" && (process.env.TMPDIR !== "/tmp" || process.env.TMP !== "/tmp" || process.env.TEMP !== "/tmp")) process.exit(14);',
        'if (process.env.PYTHONNOUSERSITE !== "1" || process.env.PYTHONDONTWRITEBYTECODE !== "1") process.exit(15);',
        'if (process.env.OPENAI_API_KEY || process.env.AWS_SECRET_ACCESS_KEY || process.env.MINIMAX_API_KEY) process.exit(7);',
        'process.stdout.write(JSON.stringify({',
        '  status: "success",',
        '  summary: "fake MiniMax response",',
        '  files: [{ path: "target.ts", content: "export const target = false;\\n" }],',
        '  artifacts: {}, validation: {}, metrics: {}, boundaries: {}, callback_packet: "TEST",',
        '}));',
    ].join('\n'));
    fs.chmodSync(script, mode);
    return script;
}

function writeLingeringFakeHermes(root: string) {
    const script = path.join(root, 'fake-hermes-lingering.mjs');
    const marker = path.join(root, 'descendant-survived');
    const child = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 600)`;
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const { spawn } = await import("node:child_process");',
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") { process.stdout.write("Hermes synthetic 1.0\\n"); process.exit(0); }',
        'if (args.length === 1 && args[0] === "--help") { process.stdout.write("--profile --provider --model\\n"); process.exit(0); }',
        'if (args.length === 2 && args[0] === "chat" && args[1] === "--help") { process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n"); process.exit(0); }',
        `spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore' }).unref();`,
        'process.stdout.write(JSON.stringify({status:"success",summary:"contained",files:[{path:"target.ts",content:"export const target = false;\\n"}],artifacts:{},validation:{},metrics:{},boundaries:{},callback_packet:"TEST"}));',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return { script, marker };
}

function writeFailingFakeHermes(root: string, stderrCanary: string) {
    const script = path.join(root, 'fake-hermes-failure.mjs');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") { process.stdout.write("Hermes synthetic 1.0\\n"); process.exit(0); }',
        'if (args.length === 1 && args[0] === "--help") { process.stdout.write("--profile --provider --model\\n"); process.exit(0); }',
        'if (args.length === 2 && args[0] === "chat" && args[1] === "--help") { process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n"); process.exit(0); }',
        `process.stderr.write(${JSON.stringify(stderrCanary)});`,
        'process.exit(23);',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return script;
}

function writePreflightFakeHermes(root: string, omitSourceFlag = false, leakStatusField = false) {
    const script = path.join(root, 'fake-hermes-preflight.mjs');
    const audit = path.join(root, 'preflight-audit.jsonl');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const fs = await import("node:fs");',
        `const audit = ${JSON.stringify(audit)};`,
        'fs.appendFileSync(audit, JSON.stringify({args:process.argv.slice(2),env:Object.keys(process.env).sort()}) + "\\n");',
        'const args = process.argv.slice(2);',
        'if (args.some((item) => ["--profile","--provider","--model","-q","--forge-query-stdin"].includes(item))) process.exit(71);',
        'if (args.length === 1 && args[0] === "--version") process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if (args.length === 1 && args[0] === "--help") process.stdout.write("--profile --provider --model\\n");',
        `else if (args.length === 2 && args[0] === "chat" && args[1] === "--help") process.stdout.write(${JSON.stringify(`--forge-query-stdin --quiet --toolsets --safe-mode --max-turns${omitSourceFlag ? '' : ' --source'} --provider --model\n`)});`,
        'else if (args.length === 1 && args[0] === "--oauth-status") {',
        `  if(process.env.HERMES_HOME!==${JSON.stringify(path.join(root, 'home', '.hermes', 'profiles', 'cstar-hub'))}||process.env.HERMES_SAFE_MODE_PROVIDER!=="minimax-oauth"||process.env.HERMES_SAFE_MODE_CREDENTIAL_NAMES!=="[]"||process.env.HERMES_FORGE_CREDENTIAL_FD)process.exit(73);`,
        `  const packet={schema:"hermes.forge_minimax_oauth_status.v1",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,min_ttl_seconds:2100};${leakStatusField ? 'packet.access_token="OAUTH_STATUS_CANARY";' : ''}process.stdout.write(JSON.stringify(packet));`,
        '}',
        'else process.exit(72);',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return { script, audit };
}

function runDelegate(intentPath: string, hermesBin: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', intentPath], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            HOME: path.join(path.dirname(intentPath), 'home'),
            HERMES_BIN: hermesBin,
            NODE_TEST_CONTEXT: '1', CSTAR_FORGE_TEST_MODE: '1',
            CSTAR_FORGE_REQUEST_RECEIPT_ID: EXECUTION_IDENTITY.forge_request_receipt_id,
            CSTAR_FORGE_EXECUTE_RECEIPT_ID: EXECUTION_IDENTITY.forge_execute_receipt_id,
            CSTAR_FORGE_EXECUTE_DECISION_ID: EXECUTION_IDENTITY.decision_id,
            CSTAR_FORGE_EXECUTE_ADAPTER_REF: EXECUTION_IDENTITY.adapter_ref,
            ...extraEnv,
        },
        encoding: 'utf-8',
        timeout: 5000,
    });
}

function runPreflight(hermesBin: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--preflight'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, HOME: path.join(path.dirname(hermesBin), 'home'), HERMES_BIN: hermesBin,
            NODE_TEST_CONTEXT: '1', CSTAR_FORGE_TEST_MODE: '1', ...extraEnv },
        encoding: 'utf-8',
        timeout: 10000,
    });
}

function runtimeFileProof(file: string) {
    const stat = fs.statSync(file);
    return {
        path: file,
        sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        bytes: stat.size,
        owner_uid: stat.uid,
    };
}

function pythonInterpreter() {
    const result = spawnSync('python3', ['-c', 'import os,sys;print(os.path.realpath(sys.executable))'], {
        encoding: 'utf-8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge-private Hermes MiniMax delegate', () => {
    it('runs sterile help probes and one redacted OAuth readiness probe', () => {
        const fixture = createFixture();
        const fake = writePreflightFakeHermes(fixture.root);
        const canary = 'PREFLIGHT_SECRET_CANARY';
        const result = runPreflight(fake.script, {
            OPENAI_API_KEY: canary,
            AWS_SECRET_ACCESS_KEY: canary,
            MINIMAX_API_KEY: canary,
            HERMES_FORGE_EPHEMERAL: '1',
            HERMES_SAFE_MODE_CREDENTIAL_NAMES: '["OPENAI_API_KEY"]',
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.schema, 'cstar.forge_hermes_preflight.v1');
        assert.equal(envelope.status, 'ok');
        assert.match(envelope.executable_sha256, /^[a-f0-9]{64}$/);
        assert.match(envelope.version_sha256, /^[a-f0-9]{64}$/);
        assert.deepEqual(envelope.checks, {
            version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass',
        });
        assert.equal(envelope.live_spend, false);
        assert.equal(envelope.live_spend_unknown, false);
        assert.equal(envelope.live_source_collection, false);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(canary));
        const audit = fs.readFileSync(fake.audit, 'utf-8').trim().split('\n').map(JSON.parse);
        assert.deepEqual(audit.map((entry) => entry.args), [
            ['--version'], ['--help'], ['chat', '--help'], ['--oauth-status'],
        ]);
        for (const entry of audit) {
            assert.doesNotMatch(entry.env.join(','), /OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|MINIMAX_API_KEY|HERMES_FORGE_CREDENTIAL_FD|HERMES_FORGE_QUERY_/);
            assert.match(entry.env.join(','), /CSTAR_FORGE_HERMES_DELEGATED/);
            assert.match(entry.env.join(','), /HERMES_SAFE_MODE_CREDENTIAL_NAMES/);
            assert.match(entry.env.join(','), /HERMES_FORGE_EPHEMERAL/);
            assert.match(entry.env.join(','), /HERMES_FORGE_PREFLIGHT/);
            assert.doesNotMatch(entry.args.join(' '), /--profile|--provider|--model|-q\b|--forge-query-stdin/);
        }
        assert.equal(envelope.auth_provider, 'minimax-oauth');
        assert.equal(envelope.auth_mode, 'oauth');
        assert.equal(envelope.oauth_profile, 'cstar-hub');
        assert.equal(envelope.oauth_status, 'ready');
        assert.equal(envelope.oauth_refresh_required, false);
        assert.equal(envelope.oauth_min_ttl_seconds, 2100);
        assert.equal(fs.existsSync(fixture.response), false);
    });

    it('fails preflight with a stable non-spending envelope when a required flag is absent', () => {
        const fixture = createFixture();
        const fake = writePreflightFakeHermes(fixture.root, true);
        const result = runPreflight(fake.script);
        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.schema, 'cstar.forge_delegate_failure.v1');
        assert.equal(envelope.degraded_reason, 'forge_hermes_preflight_missing_source');
        assert.equal(envelope.actual_model, null);
        assert.equal(envelope.model_source, 'unreported');
        assert.equal(envelope.live_spend, false);
        assert.equal(envelope.live_spend_unknown, false);
        assert.equal(envelope.live_source_collection, false);
        assert.equal(result.stderr, '');
    });

    it('rejects and suppresses an OAuth status packet with any extra field', () => {
        const fixture = createFixture();
        const result = runPreflight(writePreflightFakeHermes(fixture.root, false, true).script);
        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stdout).degraded_reason, 'forge_hermes_oauth_status_invalid');
        assert.doesNotMatch(result.stdout + result.stderr, /OAUTH_STATUS_CANARY/);
        assert.equal(fs.existsSync(fixture.response), false);
    });

    it('pins profile/provider/model and writes only the sealed JSON response', () => {
        const fixture = createFixture();
        const result = runDelegate(
            fixture.intentPath,
            writeFakeHermes(fixture.root),
            {
                OPENAI_API_KEY: 'must-not-cross',
                AWS_SECRET_ACCESS_KEY: 'must-not-cross',
                MINIMAX_API_KEY: 'must-not-cross',
                HERMES_FORGE_EPHEMERAL: '0',
                HERMES_SAFE_MODE_CREDENTIAL_NAMES: '["OPENAI_API_KEY"]',
                XDG_CACHE_HOME: '/must-not-cross',
                XDG_CONFIG_HOME: '/must-not-cross',
                XDG_DATA_HOME: '/must-not-cross',
                TMPDIR: '/must-not-cross',
            },
        );
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.status, 'ok');
        assert.equal(envelope.provider, 'minimax-oauth');
        assert.equal(envelope.auth_provider, 'minimax-oauth');
        assert.equal(envelope.auth_mode, 'oauth');
        assert.equal(envelope.requested_model, 'MiniMax-M3');
        assert.equal(envelope.actual_model, null);
        assert.equal(envelope.model_source, 'unreported');
        assert.equal(envelope.model, 'MiniMax-M3');
        assert.equal(envelope.hermes_profile, 'cstar-hub');
        assert.equal(envelope.live_spend, true);
        assert.equal(envelope.live_source_collection, false);
        const response = JSON.parse(fs.readFileSync(fixture.response, 'utf-8'));
        assert.equal(response.summary, 'fake MiniMax response');
        assert.equal(fs.readFileSync(fixture.target, 'utf-8'), 'export const target = true;\n');
    });

    it('streams a source packet larger than Linux MAX_ARG_STRLEN over stdin', () => {
        const fixture = createFixture();
        const largeA = path.join(fixture.root, 'large-a.ts');
        const largeB = path.join(fixture.root, 'large-b.ts');
        const largeC = path.join(fixture.root, 'large-c.ts');
        fs.writeFileSync(largeA, 'a'.repeat(60 * 1024));
        fs.writeFileSync(largeB, 'b'.repeat(60 * 1024));
        fs.writeFileSync(largeC, 'c'.repeat(60 * 1024));
        fixture.intent.target_paths = [fixture.target, largeA, largeB, largeC];
        fs.writeFileSync(fixture.intentPath, JSON.stringify(fixture.intent));

        const result = runDelegate(fixture.intentPath, writeFakeHermes(fixture.root));

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.equal(JSON.parse(result.stdout).status, 'ok');
        assert.equal(fs.existsSync(fixture.response), true);
    });

    it('fails closed instead of truncating an oversized target', () => {
        const fixture = createFixture();
        fs.writeFileSync(fixture.target, 'x'.repeat(64 * 1024 + 1));

        const result = runDelegate(fixture.intentPath, writeFakeHermes(fixture.root));

        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.degraded_reason, 'forge_hermes_target_material_too_large');
        assert.equal(envelope.live_spend, false);
        assert.equal(fs.existsSync(fixture.response), false);
    });

    it('rejects non-UTF-8 target material before invoking Hermes', () => {
        const fixture = createFixture();
        fs.writeFileSync(fixture.target, Buffer.from([0xff]));

        const result = runDelegate(fixture.intentPath, writeFakeHermes(fixture.root));

        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.degraded_reason, 'forge_hermes_target_not_utf8');
        assert.equal(envelope.live_spend, false);
        assert.equal(fs.existsSync(fixture.response), false);
    });

    it('owns and reaps the delegated Hermes process group', () => {
        const fixture = createFixture();
        const fake = writeLingeringFakeHermes(fixture.root);
        const result = runDelegate(fixture.intentPath, fake.script);
        assert.equal(result.status, 0, result.stderr || result.stdout);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900);
        assert.equal(fs.existsSync(fake.marker), false);
    });

    it('rejects unsafe Hermes executables and nested delegation', () => {
        const unsafe = createFixture();
        const unsafeResult = runDelegate(unsafe.intentPath, writeFakeHermes(unsafe.root, 0o722));
        assert.equal(unsafeResult.status, 1);
        assert.match(JSON.parse(unsafeResult.stdout).degraded_reason, /not_found_or_unsafe/);

        const nested = createFixture();
        const nestedResult = runDelegate(
            nested.intentPath,
            writeFakeHermes(nested.root),
            { CSTAR_FORGE_HERMES_DELEGATED: '1' },
        );
        assert.equal(nestedResult.status, 1);
        assert.match(JSON.parse(nestedResult.stdout).degraded_reason, /nested_delegation_forbidden/);
    });

    it('does not expose Hermes stderr when a delegated process fails', () => {
        const fixture = createFixture();
        const stderrCanary = 'FORGE_STDERR_SECRET_CANARY';
        const result = runDelegate(
            fixture.intentPath,
            writeFailingFakeHermes(fixture.root, stderrCanary),
        );

        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stdout).degraded_reason, 'forge_hermes_exit_23');
        assert.doesNotMatch(result.stdout, new RegExp(stderrCanary));
        assert.doesNotMatch(result.stderr, new RegExp(stderrCanary));
        assert.equal(fs.existsSync(fixture.response), false);
    });

    it('preserves only the bounded delegate failure through the Python worker', () => {
        const fixture = createFixture();
        const stderrCanary = 'WORKER_DELEGATE_SECRET_CANARY';
        const hermes = writeFailingFakeHermes(fixture.root, stderrCanary);
        const workerResponse = path.join(fixture.root, 'worker-response.json');
        const workerIntent = path.join(fixture.root, 'worker-intent.json');
        const python = pythonInterpreter();
        fs.writeFileSync(workerIntent, JSON.stringify({
            intent: 'Bounded synthetic delegate failure fixture.',
            execution_identity: EXECUTION_IDENTITY,
            project_root: fixture.root,
            target_paths: [fixture.target],
            required_output_paths: [fixture.target],
            package_locks: [],
            adapter_runtime: {
                ...runtimeFileProof(WORKER),
                dependencies: [
                    { role: 'forge_worker_safety', ...runtimeFileProof(SAFETY) },
                    { role: 'hermes_minimax_delegate', ...runtimeFileProof(DELEGATE) },
                    { role: 'hermes_runtime_lineage', ...runtimeFileProof(LINEAGE) },
                    { role: 'forge_role_plan', ...runtimeFileProof(ROLE_PLAN) },
                ],
                python_interpreter: runtimeFileProof(python),
                node_interpreter: runtimeFileProof(process.execPath),
            },
            expected_callback_packet: 'TEST',
            payload: {
                model: 'MiniMax-M3', hermes_profile: 'cstar-hub',
                write_to: workerResponse, timeout_seconds: 60, tags: [],
            },
        }));
        const result = spawnSync(python, [WORKER, '--intent-file', workerIntent], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env, HOME: fixture.home, HERMES_BIN: hermes,
                NODE_TEST_CONTEXT: '1', CSTAR_FORGE_TEST_MODE: '1',
                CSTAR_FORGE_REQUEST_RECEIPT_ID: EXECUTION_IDENTITY.forge_request_receipt_id,
                CSTAR_FORGE_EXECUTE_RECEIPT_ID: EXECUTION_IDENTITY.forge_execute_receipt_id,
                CSTAR_FORGE_EXECUTE_DECISION_ID: EXECUTION_IDENTITY.decision_id,
                CSTAR_FORGE_EXECUTE_ADAPTER_REF: EXECUTION_IDENTITY.adapter_ref,
            },
            encoding: 'utf-8',
            timeout: 10000,
        });
        assert.equal(result.status, 1, result.stderr || result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.schema, 'cstar.forge_delegate_failure.v1');
        assert.equal(envelope.degraded_reason, 'forge_hermes_exit_23');
        assert.equal(envelope.provider, 'minimax-oauth');
        assert.equal(envelope.auth_provider, 'minimax-oauth');
        assert.equal(envelope.auth_mode, 'oauth');
        assert.equal(envelope.requested_model, 'MiniMax-M3');
        assert.equal(envelope.actual_model, null);
        assert.equal(envelope.model_source, 'unreported');
        assert.equal(envelope.hermes_profile, 'cstar-hub');
        assert.equal(envelope.live_spend, null);
        assert.equal(envelope.live_spend_unknown, true);
        assert.equal(envelope.live_source_collection, false);
        assert.equal(envelope.wrote_to, null);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(stderrCanary));
        assert.equal(fs.existsSync(workerResponse), false);
    });

    it('rejects model drift and target escapes before invoking Hermes', () => {
        const drift = createFixture();
        drift.intent.payload.model = 'MiniMax-M2';
        fs.writeFileSync(drift.intentPath, JSON.stringify(drift.intent));
        const driftResult = runDelegate(drift.intentPath, writeFakeHermes(drift.root));
        assert.equal(driftResult.status, 1);
        assert.match(JSON.parse(driftResult.stdout).degraded_reason, /profile_or_model_mismatch/);

        const escaped = createFixture();
        const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
        const outside = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-hermes-outside-'));
        roots.push(outside);
        const outsideFile = path.join(outside, 'outside.ts');
        fs.writeFileSync(outsideFile, 'outside\n');
        escaped.intent.target_paths = [outsideFile];
        fs.writeFileSync(escaped.intentPath, JSON.stringify(escaped.intent));
        const escapedResult = runDelegate(escaped.intentPath, writeFakeHermes(escaped.root));
        assert.equal(escapedResult.status, 1);
        assert.match(JSON.parse(escapedResult.stdout).degraded_reason, /target_outside_project/);
    });

    it('contains no credential transport or legacy AutoBot delegate route', () => {
        const source = fs.readFileSync(DELEGATE, 'utf-8');
        const worker = fs.readFileSync(
            path.join(PROJECT_ROOT, '.agents', 'skills', 'corvus-forge', 'scripts', 'forge_worker_adapter.py'),
            'utf-8',
        );

        assert.doesNotMatch(source, /MINIMAX_API_KEY|auth\.json|forge-minimax\.env|HERMES_FORGE_CREDENTIAL_FD|openForgeCredential/);
        assert.match(source, /--oauth-status/);
        assert.match(source, /HERMES_HOME/);
        assert.match(source, /HERMES_SAFE_MODE_CREDENTIAL_NAMES/);
        assert.doesNotMatch(worker, /autobot.*delegate|skills\/autobot|delegate\.py/);
        assert.match(worker, /hermes_minimax_delegate\.mjs/);
    });
});
