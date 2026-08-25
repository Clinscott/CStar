import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
    assertForgeHermesPreflightEquivalent,
    createForgeOAuthHorizon,
    minimalForgeAdapterEnvironment,
    preflightForgeHermesOAuthAfterReservation,
    validateAndProjectForgeHermesPreflight,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_oauth_contract.js';
import {
    sealForgeAdapterRuntime,
    type ForgeAdapterRuntimeProof,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_runtime.js';
import { resolveForgeExecutionAdapterRef } from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';
import {
    sealForgeHermesRuntimeExpectation,
    type ForgeHermesRuntimeExpectation,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_hermes_runtime_contract.js';

const saved = {
    nodeTest: process.env.NODE_TEST_CONTEXT,
    forgeMode: process.env.CSTAR_FORGE_TEST_MODE,
    home: process.env.HOME,
    apiKey: process.env.MINIMAX_API_KEY,
    credentialFd: process.env.HERMES_FORGE_CREDENTIAL_FD,
    hermesBin: process.env.HERMES_BIN,
};

const digest = 'a'.repeat(64);
const runtimeProof = {
    python_interpreter: { path: '/usr/bin/python3', sha256: digest },
} as ForgeAdapterRuntimeProof;
const requestArgs = { forge_request_receipt_id: 'dispatch-forge-test' } as any;
const decisionId = 'decision:test';
const executionReceiptId = 'forge-execute:test';
const selectedAdapter = { ref: 'cstar-forge-hermes-minimax-worker-adapter' };
const expectedRuntime = {
    schema: 'cstar.forge_hermes_runtime_expectation.v2',
    locator_path: '/tmp/synthetic-hermes', executable_sha256: digest,
    runtime_content_sha256: digest, runtime_manifest_sha256: null,
    runtime_schema: 'synthetic_test_executable_v1', runtime_owner: 'synthetic_test',
    credential_profile_owner: 'synthetic_test', python_sha256: null,
    source_file_count: 4, source_bytes: 4_096,
    bootstrap_mode: 'synthetic_test_executable_v1',
    dependency_mode: 'synthetic_test_executable_v1',
    system_python_path: null, runtime_root: '/tmp',
} as ForgeHermesRuntimeExpectation;
const horizon = createForgeOAuthHorizon(
    requestArgs, decisionId, executionReceiptId, selectedAdapter, expectedRuntime,
    1_700_000_000_000,
);

function proof(overrides: Record<string, unknown> = {}) {
    return {
        schema: 'cstar.forge_hermes_preflight.v2', status: 'ok',
        executable_sha256: digest, version_sha256: digest,
        locator_path: '/tmp/synthetic-hermes', runtime_content_sha256: digest,
        runtime_instance_sha256: digest, runtime_manifest_sha256: null,
        runtime_schema: 'synthetic_test_executable_v1', runtime_owner: 'synthetic_test',
        credential_profile_owner: 'synthetic_test', python_sha256: null,
        source_file_count: 4, source_bytes: 4_096,
        bootstrap_mode: 'synthetic_test_executable_v1',
        dependency_mode: 'synthetic_test_executable_v1',
        system_python_path: null, runtime_root: '/tmp',
        checks: { version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass' },
        auth_provider: 'minimax-oauth', auth_mode: 'oauth', oauth_profile: 'cstar-hub',
        oauth_status: 'ready', oauth_refresh_required: false, oauth_horizon_seconds: 2_100,
        oauth_horizon_started_unix_ms: horizon.horizon_started_unix_ms,
        oauth_required_until_unix_ms: horizon.required_until_unix_ms,
        oauth_horizon_binding_sha256: horizon.horizon_binding_sha256,
        live_spend: false, live_spend_unknown: false, live_source_collection: false,
        ...overrides,
    };
}

before(() => {
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.HOME = '/tmp/cstar-oauth-test-home';
});

after(() => {
    const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    };
    restore('NODE_TEST_CONTEXT', saved.nodeTest);
    restore('CSTAR_FORGE_TEST_MODE', saved.forgeMode);
    restore('HOME', saved.home);
    restore('MINIMAX_API_KEY', saved.apiKey);
    restore('HERMES_FORGE_CREDENTIAL_FD', saved.credentialFd);
    restore('HERMES_BIN', saved.hermesBin);
});

describe('Forge Hermes OAuth contract', () => {
    it('projects only redacted readiness fields', () => {
        const projected = validateAndProjectForgeHermesPreflight({
            ...proof(), access_token: 'must-not-survive', auth_path: '/secret/path',
        }, runtimeProof, horizon);
        assert.equal(projected.auth_provider, 'minimax-oauth');
        assert.equal(projected.oauth_status, 'ready');
        assert.equal('access_token' in projected, false);
        assert.equal('auth_path' in projected, false);
    });

    it('rejects refresh, non-OAuth providers, and a mismatched fixed horizon', () => {
        for (const candidate of [
            proof({ oauth_refresh_required: true }),
            proof({ auth_provider: 'minimax' }),
            proof({ oauth_horizon_seconds: 2_099 }),
        ]) {
            assert.throws(
                () => validateAndProjectForgeHermesPreflight(candidate, runtimeProof, horizon),
                /forge_hermes_preflight_invalid/,
            );
        }
    });

    it('binds the second check to the pre-reservation proof', () => {
        const first = validateAndProjectForgeHermesPreflight(proof(), runtimeProof, horizon);
        const same = validateAndProjectForgeHermesPreflight(proof(), runtimeProof, horizon);
        assert.doesNotThrow(() => assertForgeHermesPreflightEquivalent(first, same));
        assert.throws(
            () => assertForgeHermesPreflightEquivalent(first, { ...same, version_sha256: 'b'.repeat(64) }),
            /forge_hermes_oauth_preflight_drift/,
        );
    });

    it('selects the Hermes profile without forwarding ambient credentials', () => {
        process.env.MINIMAX_API_KEY = 'ambient-secret';
        process.env.HERMES_FORGE_CREDENTIAL_FD = '3';
        const environment = minimalForgeAdapterEnvironment(
            requestArgs, decisionId, executionReceiptId, selectedAdapter, horizon,
        );
        assert.equal(environment.HERMES_HOME, '/tmp/cstar-oauth-test-home/.hermes/profiles/cstar-hub');
        assert.equal(environment.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256,
            horizon.horizon_binding_sha256);
        assert.equal(environment.MINIMAX_API_KEY, undefined);
        assert.equal(environment.HERMES_FORGE_CREDENTIAL_FD, undefined);
    });

    it('materializes the complete delegate import closure before reservation', async () => {
        const root = fs.mkdtempSync('/tmp/cstar-oauth-preflight-contract-');
        const executable = path.join(root, 'synthetic-hermes.mjs');
        const audit = path.join(root, 'audit.jsonl');
        fs.writeFileSync(executable, [
            `#!${process.execPath}`,
            'const fs = await import("node:fs");',
            `const audit = ${JSON.stringify(audit)};`,
            'const args=process.argv.slice(2);fs.appendFileSync(audit,JSON.stringify(args)+"\\n");',
            'if(args.length===1&&args[0]==="--version")process.stdout.write("Hermes synthetic 1.0\\n");',
            'else if(args.length===1&&args[0]==="--help")process.stdout.write("--profile --provider --model\\n");',
            'else if(args.length===2&&args[0]==="chat"&&args[1]==="--help")process.stdout.write("--forge-query-stdin --quiet --toolsets --safe-mode --max-turns --source --provider --model\\n");',
            'else if(args.length===1&&args[0]==="--oauth-status")process.stdout.write(JSON.stringify({schema:"hermes.forge_minimax_oauth_status.v2",status:"ready",provider:"minimax-oauth",auth_mode:"oauth",profile:"cstar-hub",refresh_required:false,horizon_seconds:2100,horizon_started_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS),required_until_unix_ms:Number(process.env.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS),horizon_binding_sha256:process.env.CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256}));',
            'else process.exit(91);',
        ].join('\n'));
        fs.chmodSync(executable, 0o700);
        process.env.HERMES_BIN = executable;
        try {
            const selected = resolveForgeExecutionAdapterRef(
                'cstar-forge-hermes-minimax-worker-adapter',
            ).selected;
            assert.ok(selected);
            const runtime = sealForgeAdapterRuntime(selected);
            const expected = await sealForgeHermesRuntimeExpectation(runtime);
            const args = { forge_request_receipt_id: 'dispatch-forge-oauth-contract' } as any;
            const executionId = 'forge-execute-oauth-contract';
            const actualHorizon = createForgeOAuthHorizon(
                args, 'decision:oauth-contract', executionId, selected, expected,
            );
            const actual = await preflightForgeHermesOAuthAfterReservation(
                args, 'decision:oauth-contract', executionId,
                path.resolve('.'), selected, runtime, expected, actualHorizon,
            );
            assert.equal(actual?.oauth_status, 'ready');
            assert.deepEqual(
                fs.readFileSync(audit, 'utf-8').trim().split('\n').map(JSON.parse),
                [['--version'], ['--help'], ['chat', '--help'], ['--oauth-status']],
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
