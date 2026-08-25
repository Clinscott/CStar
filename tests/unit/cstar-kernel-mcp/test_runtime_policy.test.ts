import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    assertSupportedNativeRuntime,
    currentRuntimeObservation,
    evaluateRuntimePolicy,
    loadRuntimePolicy,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_policy.js';

describe('canonical Node native runtime policy', () => {
    it('matches the supported Node, ABI, N-API, npm, and native package contract', () => {
        const policy = loadRuntimePolicy();
        assert.deepEqual(policy, {
            schema: 'cstar.node-runtime-policy.v1',
            node: { version: '25.8.1', node_module_version: '141', napi_version: '10' },
            npm: '11.11.0',
            native: {
                dependency: 'better-sqlite3',
                version: '12.6.2',
                artifact: 'build/Release/better_sqlite3.node',
            },
        });
        assert.deepEqual(evaluateRuntimePolicy(policy).mismatches, []);
        assert.equal(assertSupportedNativeRuntime(policy).compatible, true);
    });

    it('fails closed on a version or ABI mismatch before native loading', () => {
        const policy = loadRuntimePolicy();
        const observed = currentRuntimeObservation(policy);
        const check = evaluateRuntimePolicy(policy, {
            ...observed,
            node_version: '26.5.0',
            node_module_version: '147',
        });
        assert.deepEqual(check.mismatches, ['node_version', 'node_module_version']);
        assert.equal(check.compatible, false);
        assert.throws(
            () => assertSupportedNativeRuntime({
                ...policy,
                node: { ...policy.node, node_module_version: '147' },
            }),
            /cstar_runtime_policy_mismatch:node_module_version/,
        );
    });
});
