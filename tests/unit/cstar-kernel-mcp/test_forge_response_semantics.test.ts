import { describe, it } from 'node:test';
import {
    assert,
    fs,
    invokeForgeAdapterForTest,
    os,
    path,
    validForgeExecuteRequest,
} from './shared_test_setup.js';
import { validateForgeAdapterResponseContract } from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_response_contract.js';

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

function writeRawResponseAdapter(response: string): string {
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
        `response = ${JSON.stringify(response)}`,
        'write_to = intent["payload"]["write_to"]',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'with open(write_to, "w", encoding="utf-8") as handle:',
        '    handle.write(response)',
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
    it('rejects deeply nested artifact evidence without recursive stack exhaustion', () => {
        const depth = 20_000;
        const artifacts = `${'{"child":'.repeat(depth)}{}${'}'.repeat(depth)}`;
        const raw = `{"status":"success","summary":"bounded","files_changed":[],"artifacts":${artifacts},"validation":{},"metrics":{},"boundaries":{},"callback_packet":"TEST_FORGE_WORKER_PACKET"}`;

        const contract = validateForgeAdapterResponseContract(
            raw,
            [],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, false);
        assert.equal(contract.error, 'adapter_response_artifact_structure_too_deep');
    });

    it('bounds wide artifact evidence before filesystem claim checks', () => {
        const artifacts = `[${new Array(10_001).fill('null').join(',')}]`;
        const raw = `{"status":"success","summary":"bounded","files_changed":[],"artifacts":${artifacts},"validation":{},"metrics":{},"boundaries":{},"callback_packet":"TEST_FORGE_WORKER_PACKET"}`;

        const contract = validateForgeAdapterResponseContract(
            raw,
            [],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, false);
        assert.equal(contract.error, 'adapter_response_artifact_structure_too_large');
    });

    it('bounds artifact path claims before filesystem probes', () => {
        const packet = response('TEST_FORGE_WORKER_PACKET');
        packet.artifacts = new Array(1_001).fill(null).map((_, index) => `claim/${index}`);

        const contract = validateForgeAdapterResponseContract(
            JSON.stringify(packet),
            [],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, false);
        assert.equal(contract.error, 'adapter_response_path_claim_limit_exceeded');
    });

    it('applies the path-claim cap to files_changed before filesystem probes', () => {
        const packet = response('TEST_FORGE_WORKER_PACKET');
        packet.files_changed = new Array(1_001).fill('existing/result.json');

        const contract = validateForgeAdapterResponseContract(
            JSON.stringify(packet),
            [],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, false);
        assert.equal(contract.error, 'adapter_response_path_claim_limit_exceeded');
    });

    it('enforces one combined files_changed and artifact path-claim cap', () => {
        const packet = response('TEST_FORGE_WORKER_PACKET');
        packet.files_changed = new Array(600).fill('existing/result.json');
        packet.artifacts = new Array(401).fill('evidence/result.json');

        const contract = validateForgeAdapterResponseContract(
            JSON.stringify(packet),
            [],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, false);
        assert.equal(contract.error, 'adapter_response_path_claim_limit_exceeded');
    });

    it('rejects blank or padded files_changed claims', () => {
        for (const claim of ['', '   ', ' evidence/result.json ']) {
            const packet = response('TEST_FORGE_WORKER_PACKET');
            packet.files_changed = [claim];

            const contract = validateForgeAdapterResponseContract(
                JSON.stringify(packet),
                [],
                'TEST_FORGE_WORKER_PACKET',
            );

            assert.equal(contract.ok, false);
            assert.equal(contract.error, 'adapter_response_invalid_files_changed');
        }
    });

    it('rejects blank or padded explicit artifact path claims', () => {
        for (const claim of ['', '   ', ' evidence/result.json ']) {
            const packet = response('TEST_FORGE_WORKER_PACKET');
            packet.artifacts = { path: claim };

            const contract = validateForgeAdapterResponseContract(
                JSON.stringify(packet),
                [],
                'TEST_FORGE_WORKER_PACKET',
            );

            assert.equal(contract.ok, false);
            assert.equal(contract.error, 'adapter_response_artifact_path_claim_invalid');
        }
    });

    it('rejects non-string singular artifact path fields', () => {
        for (const claim of [null, { value: 'missing.json' }, ['missing.json']]) {
            const packet = response('TEST_FORGE_WORKER_PACKET');
            packet.artifacts = { path: claim };

            const contract = validateForgeAdapterResponseContract(
                JSON.stringify(packet),
                [],
                'TEST_FORGE_WORKER_PACKET',
            );

            assert.equal(contract.ok, false);
            assert.equal(contract.error, 'adapter_response_artifact_path_claim_invalid');
        }
    });

    it('rejects non-array plural fields and non-string plural path items', () => {
        for (const artifacts of [
            { paths: 'missing.json' },
            { paths: [null] },
            { files: [{ path: 'missing.json' }] },
        ]) {
            const packet = response('TEST_FORGE_WORKER_PACKET');
            packet.artifacts = artifacts;

            const contract = validateForgeAdapterResponseContract(
                JSON.stringify(packet),
                [],
                'TEST_FORGE_WORKER_PACKET',
            );

            assert.equal(contract.ok, false);
            assert.equal(contract.error, 'adapter_response_artifact_path_claim_invalid');
        }
    });

    for (const fixture of [
        { name: 'an explicit path field', artifacts: { path: 'missing.json' } },
        { name: 'a path-like object key', artifacts: { 'missing/path.json': {} } },
        { name: 'a raw artifact-array basename', artifacts: ['missing.json'] },
    ]) {
        it(`validates ${fixture.name} as a claimed path`, () => {
            const packet = response('TEST_FORGE_WORKER_PACKET');
            packet.artifacts = fixture.artifacts;

            const contract = validateForgeAdapterResponseContract(
                JSON.stringify(packet),
                [],
                'TEST_FORGE_WORKER_PACKET',
            );

            assert.equal(contract.ok, false);
            assert.equal(contract.error, 'adapter_response_missing_claimed_path');
        });
    }

    it('preserves the exact artifact-depth code through adapter rejection evidence', async () => {
        const depth = 65;
        const artifacts = `${'{"child":'.repeat(depth)}{}${'}'.repeat(depth)}`;
        const raw = `{"status":"success","summary":"bounded","files_changed":[],"artifacts":${artifacts},"validation":{},"metrics":{},"boundaries":{},"callback_packet":"TEST_FORGE_WORKER_PACKET"}`;
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeRawResponseAdapter(raw);
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
            path.join(os.tmpdir(), 'forge-response-depth-artifacts-'),
        );

        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
        const parsed = JSON.parse(result.content[0].text);

        assert.equal(result.isError, true);
        assert.equal(parsed.status, 'adapter_degraded');
        assert.equal(
            parsed.forge_execution.adapter_result.error,
            'adapter_response_artifact_structure_too_deep',
        );
    });

    it('accepts bounded nested artifact path evidence inside the workspace', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-response-nested-path-'));
        fs.mkdirSync(path.join(root, 'evidence'));
        fs.writeFileSync(path.join(root, 'evidence', 'result.json'), '{}');
        const packet = response('TEST_FORGE_WORKER_PACKET');
        packet.artifacts = { nested: [{ path: 'evidence/result.json' }] };

        const contract = validateForgeAdapterResponseContract(
            JSON.stringify(packet),
            [root],
            'TEST_FORGE_WORKER_PACKET',
        );

        assert.equal(contract.ok, true);
        assert.equal(contract.error, null);
    });

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

    it('persists only parent-sanitized evidence for an invalid private response', async () => {
        const canary = 'RAW_INVALID_RESPONSE_CANARY';
        process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeResponseAdapter({
            ...response('WRONG_PACKET'),
            summary: canary,
            artifacts: { raw: canary },
        });
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = fs.mkdtempSync(
            path.join(os.tmpdir(), 'forge-response-sanitized-artifacts-'),
        );

        const result = await invokeForgeAdapterForTest(validForgeExecuteRequest());
        const parsed = JSON.parse(result.content[0].text);
        const artifact = parsed.forge_execution.adapter_result.envelope.response_artifact;
        const durable = fs.readFileSync(artifact.path, 'utf-8');

        assert.equal(parsed.status, 'adapter_degraded');
        assert.equal(parsed.forge_execution.adapter_result.error, 'adapter_response_callback_packet_mismatch');
        assert.doesNotMatch(durable, new RegExp(canary));
        assert.equal(
            JSON.parse(durable).schema,
            'cstar.forge_worker_response_rejection.v1',
        );
    });
});
