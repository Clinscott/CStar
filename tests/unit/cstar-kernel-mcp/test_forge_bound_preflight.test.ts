import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DELEGATE = path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs');
const CANONICAL_HERMES = path.join(ROOT, '.agents/skills/corvus-forge/runtime/bin/hermes');
const roots: string[] = [];
const identity = {
    forge_request_receipt_id: 'forge-request-bound-test',
    forge_execute_receipt_id: 'forge-execute-bound-test',
    decision_id: 'decision-bound-test',
    adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
};
const identityEnv = {
    CSTAR_FORGE_REQUEST_RECEIPT_ID: identity.forge_request_receipt_id,
    CSTAR_FORGE_EXECUTE_RECEIPT_ID: identity.forge_execute_receipt_id,
    CSTAR_FORGE_EXECUTE_DECISION_ID: identity.decision_id,
    CSTAR_FORGE_EXECUTE_ADAPTER_REF: identity.adapter_ref,
};

function fixture(preflight?: Record<string, unknown>) {
    const root = fs.mkdtempSync(path.join('/tmp', 'forge-bound-preflight-'));
    roots.push(root);
    const home = path.join(root, 'home');
    const target = path.join(root, 'target.ts');
    const response = path.join(root, 'response.json');
    const intentPath = path.join(root, 'intent.json');
    fs.mkdirSync(home); fs.writeFileSync(target, 'export const bounded = true;\n');
    fs.writeFileSync(intentPath, JSON.stringify({
        intent: 'Return a bounded synthetic manifest.', execution_identity: identity,
        project_root: root, target_paths: [target], hermes_preflight: preflight,
        payload: { hermes_profile: 'cstar-hub', model: 'MiniMax-M3', expected_output: 'json',
            write_to: response, timeout_seconds: 60 },
    }));
    return { root, home, intentPath, response };
}

function writeSyntheticHermes(root: string): string {
    const executable = path.join(root, 'synthetic-hermes.mjs');
    fs.writeFileSync(executable, [
        `#!${process.execPath}`,
        'const args = process.argv.slice(2);',
        'if (args.length === 1 && args[0] === "--version") process.stdout.write("Hermes synthetic 1.0\\n");',
        'else if (args.length === 1 && args[0] === "--help") process.stdout.write("--profile --provider --model\\n");',
        'else if (args.length === 2 && args[0] === "chat" && args[1] === "--help") process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");',
        'else if (args.length === 1 && args[0] === "--oauth-status") process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v2",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,horizon_seconds:2100,horizon_started_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS),required_until_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS),horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}));',
        'else process.stdout.write(JSON.stringify({status:"pass",summary:"synthetic bound proof",files:[],artifacts:{},validation:{},metrics:{},boundaries:{},callback_packet:"packet"}));',
    ].join('\n'));
    fs.chmodSync(executable, 0o700);
    return executable;
}

function preflight(hermes: string) {
    const result = spawnSync(process.execPath, [DELEGATE, '--preflight'], {
        cwd: ROOT, env: { HOME: os.homedir(), LANG: 'C.UTF-8', HERMES_BIN: hermes,
            NODE_TEST_CONTEXT: 'cstar-synthetic', CSTAR_FORGE_TEST_MODE: '1', ...identityEnv },
        encoding: 'utf-8', timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
}

function executeSynthetic(item: ReturnType<typeof fixture>, hermes: string, extra: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', item.intentPath], {
        cwd: ROOT, env: { HOME: item.home, LANG: 'C.UTF-8', HERMES_BIN: hermes,
            NODE_TEST_CONTEXT: 'cstar-synthetic', CSTAR_FORGE_TEST_MODE: '1',
            ...identityEnv, ...extra }, encoding: 'utf-8', timeout: 15_000,
    });
}

function execute(item: ReturnType<typeof fixture>, extra: Record<string, string> = {}) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', item.intentPath], {
        cwd: ROOT, env: { HOME: item.home, LANG: 'C.UTF-8',
            CSTAR_FORGE_HERMES_LOCATOR: CANONICAL_HERMES,
            ...identityEnv, ...extra }, encoding: 'utf-8', timeout: 15_000,
    });
}

afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('CStar-bound Hermes Forge preflight', () => {
    it('rejects an executable ambient Hermes override before credentials or provider spend', () => {
        const item = fixture();
        const audit = path.join(item.root, 'ambient-hermes-invoked');
        const ambientHermes = path.join(item.root, 'ambient-hermes.mjs');
        fs.writeFileSync(ambientHermes, [
            `#!${process.execPath}`,
            "import fs from 'node:fs';",
            `fs.writeFileSync(${JSON.stringify(audit)}, 'invoked\\n');`,
        ].join('\n'));
        fs.chmodSync(ambientHermes, 0o700);

        const result = execute(item, { HERMES_BIN: ambientHermes });
        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.degraded_reason, 'forge_hermes_ambient_override_forbidden');
        assert.equal(envelope.provider_requests_started, 0);
        assert.equal(envelope.provider_requests_completed, 0);
        assert.equal(envelope.live_spend, false);
        assert.equal(envelope.live_spend_unknown, false);
        assert.equal(fs.existsSync(audit), false);
        assert.equal(fs.existsSync(item.response), false);
    });

    it('requires a CStar-bound proof outside the dual synthetic test gate', () => {
        const item = fixture();
        const result = execute(item);
        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.degraded_reason, 'forge_hermes_bound_preflight_required');
        assert.equal(envelope.live_spend, false);
        assert.equal(fs.existsSync(item.response), false);
    });

    it('rejects forged proof/identity and reaches the synthetic worker only with the exact bound proof', () => {
        const runtimeRoot = fs.mkdtempSync(path.join('/tmp', 'forge-bound-runtime-'));
        roots.push(runtimeRoot);
        const hermes = writeSyntheticHermes(runtimeRoot);
        const proof = preflight(hermes);
        const forged = fixture({ ...proof, runtime_content_sha256: '0'.repeat(64) });
        const forgedResult = executeSynthetic(forged, hermes);
        assert.equal(forgedResult.status, 1);
        assert.equal(JSON.parse(forgedResult.stdout).degraded_reason, 'forge_hermes_runtime_lineage_drift');
        assert.equal(JSON.parse(forgedResult.stdout).live_spend, false);

        const mismatched = fixture(proof);
        const mismatchResult = executeSynthetic(mismatched, hermes, { CSTAR_FORGE_EXECUTE_DECISION_ID: 'wrong-decision' });
        assert.equal(JSON.parse(mismatchResult.stdout).degraded_reason, 'forge_hermes_execution_identity_invalid');

        const valid = fixture(proof);
        const validResult = executeSynthetic(valid, hermes);
        assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);
        const envelope = JSON.parse(validResult.stdout);
        assert.equal(envelope.status, 'ok');
        assert.equal(envelope.provider, 'minimax-oauth');
        assert.equal(envelope.live_spend_unknown, false);
        assert.equal(fs.existsSync(valid.response), true);
    });
});
