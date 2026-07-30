import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DELEGATE = path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs');
const roots: string[] = [];
const identity = {
    forge_request_receipt_id: 'request-envelope-test',
    forge_execute_receipt_id: 'execute-envelope-test',
    decision_id: 'decision-envelope-test',
    adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
};
const materialPolicy = {
    schema: 'cstar.forge_material_policy.v1',
    file_max_bytes: 512 * 1024, total_max_bytes: 512 * 1024,
    prompt_max_bytes: 1024 * 1024,
};

function fixture(forgeIdentity = false) {
    const root = fs.mkdtempSync('/tmp/forge-provider-envelope-'); roots.push(root);
    const home = path.join(root, 'home');
    fs.mkdirSync(path.join(home, '.hermes/profiles/cstar-hub'), { recursive: true, mode: 0o700 });
    const target = path.join(root, 'target.ts'); fs.writeFileSync(target, 'export const before = true;\n');
    const response = path.join(root, 'response.json');
    const intentPath = path.join(root, 'intent.json');
    fs.writeFileSync(intentPath, JSON.stringify({
        intent: 'Return the exact bounded manifest.', execution_identity: identity,
        material_policy: materialPolicy, project_root: root, target_paths: [target],
        payload: { hermes_profile: 'cstar-hub', model: 'MiniMax-M3', expected_output: 'json',
            write_to: response, timeout_seconds: 60 },
    }));
    const fake = path.join(root, 'fake-hermes.mjs');
    fs.writeFileSync(fake, [
        `#!${process.execPath}`,
        'const identity={forge_request_receipt_id:process.env.CSTAR_FORGE_REQUEST_RECEIPT_ID,forge_execute_receipt_id:process.env.CSTAR_FORGE_EXECUTE_RECEIPT_ID,decision_id:process.env.CSTAR_FORGE_EXECUTE_DECISION_ID,adapter_ref:process.env.CSTAR_FORGE_EXECUTE_ADAPTER_REF};',
        forgeIdentity ? 'identity.decision_id="forged-decision";' : '',
        'const text=JSON.stringify({status:"success",summary:"bounded",files:[{path:"target.ts",content:"export const after = true;\\n"}],artifacts:{},validation:{},metrics:{},boundaries:{},callback_packet:"TEST"});',
        'process.stdout.write(JSON.stringify({schema:"hermes.cstar_forge_provider_response.v1",execution_identity:identity,runtime_content_sha256:process.env.CSTAR_FORGE_RUNTIME_CONTENT_SHA256,forge_role:process.env.CSTAR_FORGE_ROLE,forge_phase:process.env.CSTAR_FORGE_PHASE,role_plan_id:process.env.CSTAR_FORGE_ROLE_PLAN_ID,role_plan_sha256:process.env.CSTAR_FORGE_ROLE_PLAN_SHA256,input_handoff_sha256:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,specification_handoff_sha256:process.env.CSTAR_FORGE_SPECIFICATION_HANDOFF_SHA256,auth_provider:"minimax-oauth",auth_mode:"oauth",provider_model:"MiniMax-M3",usage:{input_tokens:7,output_tokens:11},text}));',
    ].join('\n'));
    fs.chmodSync(fake, 0o700);
    return { root, home, intentPath, response, fake };
}

function run(item: ReturnType<typeof fixture>) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', item.intentPath], {
        cwd: ROOT, encoding: 'utf-8', timeout: 5_000,
        env: { HOME: item.home, HERMES_BIN: item.fake, LANG: 'C.UTF-8',
            NODE_TEST_CONTEXT: '1', CSTAR_FORGE_TEST_MODE: '1',
            CSTAR_FORGE_REQUEST_RECEIPT_ID: identity.forge_request_receipt_id,
            CSTAR_FORGE_EXECUTE_RECEIPT_ID: identity.forge_execute_receipt_id,
            CSTAR_FORGE_EXECUTE_DECISION_ID: identity.decision_id,
            CSTAR_FORGE_EXECUTE_ADAPTER_REF: identity.adapter_ref },
    });
}

afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('Hermes Forge private provider envelope', () => {
    it('accepts only the echoed execution/runtime tuple and provider-reported M3 identity', () => {
        const accepted = fixture(); const acceptedResult = run(accepted);
        assert.equal(acceptedResult.status, 0, acceptedResult.stdout);
        const envelope = JSON.parse(acceptedResult.stdout);
        assert.equal(envelope.provider, 'minimax-oauth');
        assert.equal(envelope.auth_mode, 'oauth');
        assert.equal(envelope.actual_model, 'MiniMax-M3');
        assert.equal(envelope.model_source, 'provider_reported');
        assert.equal(JSON.parse(fs.readFileSync(accepted.response, 'utf-8')).summary, 'bounded');

        const forged = fixture(true); const forgedResult = run(forged);
        assert.equal(forgedResult.status, 1);
        assert.equal(JSON.parse(forgedResult.stdout).degraded_reason,
            'forge_hermes_provider_envelope_invalid');
        assert.equal(fs.existsSync(forged.response), false);
    });
});
