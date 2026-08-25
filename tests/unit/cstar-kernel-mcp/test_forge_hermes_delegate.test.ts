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
const roots: string[] = [];

function createFixture() {
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-hermes-delegate-'));
    roots.push(root);
    const target = path.join(root, 'target.ts');
    const response = path.join(root, 'response.json');
    const intentPath = path.join(root, 'intent.json');
    fs.writeFileSync(target, 'export const target = true;\n');
    const intent = {
        intent: 'Return a bounded Forge worker manifest.',
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
    return { root, target, response, intentPath, intent };
}

function writeFakeHermes(root: string, mode = 0o700) {
    const script = path.join(root, 'fake-hermes.mjs');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") { process.stdout.write("Hermes synthetic 1.0\\n"); process.exit(0); }',
        'if (args.length === 1 && args[0] === "--help") { process.stdout.write("--profile --provider --model\\n"); process.exit(0); }',
        'if (args.length === 2 && args[0] === "chat" && args[1] === "--help") { process.stdout.write("-q --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n"); process.exit(0); }',
        'const chatIndex = args.indexOf("chat");',
        'const profileIndex = args.indexOf("--profile");',
        'const providerIndex = args.indexOf("--provider");',
        'const modelIndex = args.indexOf("--model");',
        'if (profileIndex < 0 || profileIndex > chatIndex || providerIndex < chatIndex || modelIndex < chatIndex) process.exit(10);',
        'if (args[providerIndex + 1] !== "minimax" || args[modelIndex + 1] !== "MiniMax-M3") process.exit(11);',
        'const queryIndex = process.argv.indexOf("-q");',
        'if (queryIndex < 0 || !process.argv[queryIndex + 1].includes("SEALED TARGET MATERIALS")) process.exit(4);',
        `if (process.argv[queryIndex + 1].includes(${JSON.stringify(root)})) process.exit(8);`,
        'if (!process.argv[queryIndex + 1].includes("--- target.ts (")) process.exit(9);',
        'const toolsetIndex = process.argv.indexOf("--toolsets");',
        'if (toolsetIndex < 0 || process.argv[toolsetIndex + 1] !== "context_engine") process.exit(5);',
        'if (!process.argv.includes("--safe-mode") || !process.argv.includes("--max-turns")) process.exit(6);',
        'if (process.env.HERMES_SAFE_MODE !== "1" || process.env.HERMES_IGNORE_USER_CONFIG !== "1" || process.env.HERMES_IGNORE_RULES !== "1") process.exit(12);',
        'if (process.env.OPENAI_API_KEY || process.env.AWS_SECRET_ACCESS_KEY) process.exit(7);',
        'process.stdout.write("session_id: fake-session\\n" + JSON.stringify({',
        '  status: "success",',
        '  summary: "fake MiniMax response",',
        '  files: [{ path: "target.ts", content: "export const target = false;\\n" }],',
        '  artifacts: {}, validation: {}, metrics: {}, boundaries: {}, callback_packet: "TEST",',
        '}));',
    ].join('\n'));
    fs.chmodSync(script, mode);
    return script;
}

function writeFailingFakeHermes(root: string, stderrCanary: string) {
    const script = path.join(root, 'fake-hermes-failure.mjs');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") { process.stdout.write("Hermes synthetic 1.0\\n"); process.exit(0); }',
        'if (args.length === 1 && args[0] === "--help") { process.stdout.write("--profile --provider --model\\n"); process.exit(0); }',
        'if (args.length === 2 && args[0] === "chat" && args[1] === "--help") { process.stdout.write("-q --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n"); process.exit(0); }',
        `process.stderr.write(${JSON.stringify(stderrCanary)});`,
        'process.exit(23);',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return script;
}

function writePreflightFakeHermes(root: string, omitSourceFlag = false) {
    const script = path.join(root, 'fake-hermes-preflight.mjs');
    const audit = path.join(root, 'preflight-audit.jsonl');
    fs.writeFileSync(script, [
        `#!${process.execPath}`,
        'const fs = await import("node:fs");',
        `const audit = ${JSON.stringify(audit)};`,
        'fs.appendFileSync(audit, JSON.stringify({args:process.argv.slice(2),env:Object.keys(process.env).sort()}) + "\\n");',
        'const args = process.argv.slice(2);',
        'if (args.some((item) => ["--profile","--provider","--model","-q"].includes(item))) process.exit(71);',
        'if (args.length === 1 && args[0] === "--version") process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if (args.length === 1 && args[0] === "--help") process.stdout.write("--profile --provider --model\\n");',
        `else if (args.length === 2 && args[0] === "chat" && args[1] === "--help") process.stdout.write(${JSON.stringify(`-q --quiet --toolsets --safe-mode --max-turns${omitSourceFlag ? '' : ' --source'} --provider --model\n`)});`,
        'else process.exit(72);',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return { script, audit };
}

function runDelegate(intentPath: string, hermesBin: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', intentPath], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, HERMES_BIN: hermesBin, ...extraEnv },
        encoding: 'utf-8',
        timeout: 5000,
    });
}

function runPreflight(hermesBin: string, extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--preflight'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, HERMES_BIN: hermesBin, ...extraEnv },
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
    it('runs only sterile help probes during compatibility preflight', () => {
        const fixture = createFixture();
        const fake = writePreflightFakeHermes(fixture.root);
        const canary = 'PREFLIGHT_SECRET_CANARY';
        const result = runPreflight(fake.script, {
            OPENAI_API_KEY: canary,
            AWS_SECRET_ACCESS_KEY: canary,
            MINIMAX_API_KEY: canary,
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
            ['--version'], ['--help'], ['chat', '--help'],
        ]);
        for (const entry of audit) {
            assert.doesNotMatch(entry.env.join(','), /OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|MINIMAX_API_KEY/);
            assert.doesNotMatch(entry.args.join(' '), /--profile|--provider|--model|-q\b/);
        }
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

    it('pins profile/provider/model and writes only the sealed JSON response', () => {
        const fixture = createFixture();
        const result = runDelegate(
            fixture.intentPath,
            writeFakeHermes(fixture.root),
            { OPENAI_API_KEY: 'must-not-cross', AWS_SECRET_ACCESS_KEY: 'must-not-cross' },
        );

        assert.equal(result.status, 0, result.stderr || result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.status, 'ok');
        assert.equal(envelope.provider, 'minimax');
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
            project_root: fixture.root,
            target_paths: [fixture.target],
            required_output_paths: [fixture.target],
            package_locks: [],
            adapter_runtime: {
                ...runtimeFileProof(WORKER),
                dependencies: [
                    { role: 'forge_worker_safety', ...runtimeFileProof(SAFETY) },
                    { role: 'hermes_minimax_delegate', ...runtimeFileProof(DELEGATE) },
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
            env: { ...process.env, HERMES_BIN: hermes },
            encoding: 'utf-8',
            timeout: 10000,
        });
        assert.equal(result.status, 1, result.stderr || result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.schema, 'cstar.forge_delegate_failure.v1');
        assert.equal(envelope.degraded_reason, 'forge_hermes_exit_23');
        assert.equal(envelope.provider, 'minimax');
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

    it('contains no direct credential reads or legacy AutoBot delegate route', () => {
        const source = fs.readFileSync(DELEGATE, 'utf-8');
        const worker = fs.readFileSync(
            path.join(PROJECT_ROOT, '.agents', 'skills', 'corvus-forge', 'scripts', 'forge_worker_adapter.py'),
            'utf-8',
        );

        assert.doesNotMatch(source, /MINIMAX_API_KEY|auth\.json|\.hermes.*\.env/);
        assert.doesNotMatch(worker, /autobot.*delegate|skills\/autobot|delegate\.py/);
        assert.match(worker, /hermes_minimax_delegate\.mjs/);
    });
});
