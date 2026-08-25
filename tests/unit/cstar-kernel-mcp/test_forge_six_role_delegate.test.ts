import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DELEGATE = path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs');
const IDENTITY = {
    forge_request_receipt_id: 'request-six-role-test',
    forge_execute_receipt_id: 'execute-six-role-test',
    decision_id: 'decision-six-role-test',
    adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
};
const roots: string[] = [];

function fixture(failRole = '') {
    const root = fs.mkdtempSync('/tmp/cstar-forge-six-role-'); roots.push(root);
    const home = path.join(root, 'home');
    fs.mkdirSync(path.join(home, '.hermes/profiles/cstar-hub'), { recursive: true, mode: 0o700 });
    const target = path.join(root, 'target.ts');
    fs.writeFileSync(target, 'export const before = true;\n');
    const response = path.join(root, 'response.json');
    const intentPath = path.join(root, 'intent.json');
    fs.writeFileSync(intentPath, JSON.stringify({
        intent: 'Change only the synthetic target and return callback TEST.',
        execution_identity: IDENTITY, project_root: root, target_paths: [target],
        payload: { hermes_profile: 'cstar-hub', model: 'MiniMax-M3',
            expected_output: 'json', write_to: response, timeout_seconds: 360 },
    }));
    const audit = path.join(root, 'roles.jsonl');
    const fake = path.join(root, 'fake-hermes.mjs');
    fs.writeFileSync(fake, [
        `#!${process.execPath}`,
        'const fs=await import("node:fs");',
        `const audit=${JSON.stringify(audit)};`,
        `const failRole=${JSON.stringify(failRole)};`,
        'const role=process.env.CSTAR_FORGE_ROLE;',
        'fs.appendFileSync(audit,JSON.stringify({role,phase:process.env.CSTAR_FORGE_PHASE,input:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,specification:process.env.CSTAR_FORGE_SPECIFICATION_HANDOFF_SHA256})+"\\n");',
        'if(role===failRole)process.exit(23);',
        'const payload=role==="specifier"?{specification:"Implement the exact target with focused synthetic validation."}:{manifest:{status:"success",summary:"six-role synthetic manifest",files:[{path:"target.ts",content:"export const after = true;\\n"}],artifacts:{},validation:{focused:"planned"},metrics:{},boundaries:{git_mutation:false},callback_packet:"TEST"}};',
        'const handoff={schema:"cstar.forge_role_handoff.v1",plan_id:process.env.CSTAR_FORGE_ROLE_PLAN_ID,plan_sha256:process.env.CSTAR_FORGE_ROLE_PLAN_SHA256,role,status:"pass",previous_handoff_sha256:role==="specifier"?null:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,summary:`${role} complete`,payload};',
        'const identity={forge_request_receipt_id:process.env.CSTAR_FORGE_REQUEST_RECEIPT_ID,forge_execute_receipt_id:process.env.CSTAR_FORGE_EXECUTE_RECEIPT_ID,decision_id:process.env.CSTAR_FORGE_EXECUTE_DECISION_ID,adapter_ref:process.env.CSTAR_FORGE_EXECUTE_ADAPTER_REF};',
        'process.stdout.write(JSON.stringify({schema:"hermes.cstar_forge_provider_response.v1",execution_identity:identity,runtime_content_sha256:process.env.CSTAR_FORGE_RUNTIME_CONTENT_SHA256,forge_role:role,forge_phase:process.env.CSTAR_FORGE_PHASE,role_plan_id:process.env.CSTAR_FORGE_ROLE_PLAN_ID,role_plan_sha256:process.env.CSTAR_FORGE_ROLE_PLAN_SHA256,input_handoff_sha256:process.env.CSTAR_FORGE_INPUT_HANDOFF_SHA256,specification_handoff_sha256:process.env.CSTAR_FORGE_SPECIFICATION_HANDOFF_SHA256,auth_provider:"minimax-oauth",auth_mode:"oauth",provider_model:"MiniMax-M3",usage:{input_tokens:10,output_tokens:20},text:JSON.stringify(handoff)}));',
    ].join('\n'));
    fs.chmodSync(fake, 0o700);
    return { root, home, response, intentPath, audit, fake };
}

function run(item: ReturnType<typeof fixture>) {
    return spawnSync(process.execPath, [DELEGATE, '--intent-file', item.intentPath], {
        cwd: ROOT, encoding: 'utf-8', timeout: 10_000,
        env: { HOME: item.home, HERMES_BIN: item.fake, LANG: 'C.UTF-8',
            NODE_TEST_CONTEXT: '1', CSTAR_FORGE_TEST_MODE: '1',
            CSTAR_FORGE_REQUEST_RECEIPT_ID: IDENTITY.forge_request_receipt_id,
            CSTAR_FORGE_EXECUTE_RECEIPT_ID: IDENTITY.forge_execute_receipt_id,
            CSTAR_FORGE_EXECUTE_DECISION_ID: IDENTITY.decision_id,
            CSTAR_FORGE_EXECUTE_ADAPTER_REF: IDENTITY.adapter_ref },
    });
}

afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('CStar bounded six-role Hermes delegate', () => {
    it('executes the fixed role plan once and persists only final QA manifest', () => {
        const item = fixture(); const result = run(item);
        assert.equal(result.status, 0, result.stdout);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.provider, 'minimax-oauth');
        assert.equal(envelope.auth_mode, 'oauth');
        assert.equal(envelope.forge_topology, 'bounded-six-role-manifest-v1');
        assert.equal(envelope.provider_requests_started, 6);
        assert.equal(envelope.provider_requests_completed, 6);
        assert.deepEqual(envelope.role_receipts.map((entry: any) => entry.role),
            ['specifier', 'coder', 'cleaner', 'architect', 'hardener', 'qa']);
        assert.equal(envelope.input_tokens, 60); assert.equal(envelope.output_tokens, 120);
        assert.equal(JSON.parse(fs.readFileSync(item.response, 'utf-8')).summary,
            'six-role synthetic manifest');
        const audit = fs.readFileSync(item.audit, 'utf-8').trim().split('\n').map(JSON.parse);
        assert.equal(audit[0].input, '0'.repeat(64));
        assert.equal(audit[0].specification, '0'.repeat(64));
        for (let index = 1; index < audit.length; index += 1) {
            assert.equal(audit[index].input, envelope.role_receipts[index - 1].output_handoff_sha256);
            assert.equal(audit[index].specification, envelope.role_receipts[0].output_handoff_sha256);
        }
    });

    it('does not retry a failed role and reports partial spend conservatively', () => {
        const item = fixture('architect'); const result = run(item);
        assert.equal(result.status, 1);
        const envelope = JSON.parse(result.stdout);
        assert.equal(envelope.degraded_reason, 'forge_hermes_exit_23');
        assert.equal(envelope.provider_requests_started, 4);
        assert.equal(envelope.provider_requests_completed, 3);
        assert.equal(envelope.live_spend, true);
        assert.equal(envelope.live_spend_unknown, true);
        assert.equal(fs.existsSync(item.response), false);
        assert.deepEqual(fs.readFileSync(item.audit, 'utf-8').trim().split('\n').map(JSON.parse)
            .map((entry: any) => entry.role), ['specifier', 'coder', 'cleaner', 'architect']);
    });
});
