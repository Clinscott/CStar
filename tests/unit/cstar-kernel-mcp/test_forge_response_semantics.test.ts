import { describe, it } from 'node:test';
import {
    assert,
    fs,
    invokeForgeAdapterForTest,
    os,
    path,
    validForgeExecuteRequest,
} from './shared_test_setup.js';

function writeResponseAdapter(response: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-response-semantics-'));
    const script = path.join(root, 'adapter.py');
    fs.writeFileSync(script, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file, encoding="utf-8") as handle:',
        '    intent = json.load(handle)',
        `response = json.loads(${JSON.stringify(JSON.stringify(response))})`,
        'write_to = intent["payload"]["write_to"]',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'with open(write_to, "w", encoding="utf-8") as handle:',
        '    json.dump(response, handle)',
        'print(json.dumps({"status":"ok","wrote_to":write_to,"live_spend":False,"live_source_collection":False}))',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return script;
}

function response(callback: unknown, status = 'success'): Record<string, unknown> {
    return {
        status,
        summary: 'bounded response semantics fixture',
        files_changed: [],
        artifacts: {},
        validation: {},
        metrics: {},
        boundaries: { codex_worker_fallback_allowed: false },
        ...(callback === undefined ? {} : { callback_packet: callback }),
    };
}

describe('CStar Forge response semantic validation', () => {
    for (const fixture of [
        { name: 'inner failure', packet: response('TEST_FORGE_WORKER_PACKET', 'failure'), error: 'adapter_response_reported_failure' },
        { name: 'missing callback', packet: response(undefined), error: 'adapter_response_callback_packet_missing' },
        { name: 'mismatched callback', packet: response('WRONG_PACKET'), error: 'adapter_response_callback_packet_mismatch' },
        {
            name: 'callback-only packet',
            packet: { callback_id: 'TEST_FORGE_WORKER_PACKET', summary: 'missing execution evidence' },
            error: 'adapter_response_missing_status',
        },
    ]) {
        it(`rejects outer-ok ${fixture.name}`, async () => {
            process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeResponseAdapter(fixture.packet);
            process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-response-artifacts-'));
            const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
            const parsed = JSON.parse(result.content[0].text);
            assert.equal(result.isError, true);
            assert.equal(parsed.status, 'adapter_degraded');
            assert.equal(parsed.forge_execution.adapter_result.error, fixture.error);
            assert.equal(parsed.forge_execution.adapter_result.envelope.response_contract, null);
        });
    }
});
