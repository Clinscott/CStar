import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PRODUCTION_FILES = [
    'src/node/core/runtime/dispatcher.ts',
    'src/node/core/runtime/dispatch_augury.ts',
    'src/node/core/runtime/dispatch_lifecycle.ts',
    'src/node/core/runtime/agent_native_dispatch.ts',
    'src/node/core/runtime/failure_authority.ts',
    'src/node/core/runtime/host_workflows/chant_planner.ts',
    'src/node/core/runtime/host_workflows/chant_planner_artifacts.ts',
];
const HOST_GOVERNOR_FILES = [
    'src/node/core/runtime/weaves/host_governor.ts',
    'src/node/core/runtime/weaves/host_governor_candidates.ts',
    'src/node/core/runtime/weaves/host_governor_governance.ts',
    'src/node/core/runtime/weaves/estate_ritual.ts',
];
const FOCUSED_TEST_FILES = [
    'tests/unit/test_host_governor_runtime.test.ts',
    'tests/unit/test_host_governor_replan_runtime.test.ts',
    'tests/unit/test_host_governor_support.ts',
    'tests/unit/node-runtime/test_estate_ritual.test.ts',
];

describe('runtime dispatcher source contract', () => {
    it('keeps each dispatcher module below 500 lines', () => {
        for (const relative of [...PRODUCTION_FILES, ...HOST_GOVERNOR_FILES, ...FOCUSED_TEST_FILES]) {
            const lines = fs.readFileSync(path.join(ROOT, relative), 'utf8').split('\n').length;
            assert.ok(lines < 500, `${relative} has ${lines} lines`);
        }
    });

    it('contains no implicit recovery, retry, replan, or host-governor dispatch path', () => {
        const source = PRODUCTION_FILES
            .map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'))
            .join('\n');

        for (const forbidden of [
            'tryRecoverKernelFailure',
            'runtime:recovery',
            'host_recovery',
            'auto_replan_blocked',
            'retry|replan|abandon',
        ]) {
            assert.equal(source.includes(forbidden), false, forbidden);
        }
        assert.doesNotMatch(source, /auto_execute\s*:\s*true/);
        assert.doesNotMatch(source, /weave_id:\s*['"]weave:host-governor['"]/);
    });
});
