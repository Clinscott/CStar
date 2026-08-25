import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ANS } from '../../src/node/core/ans.js';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.js';
import { StartAdapter } from '../../src/node/core/runtime/adapters.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-START',
        bead_id: 'bead:start-test',
        trace_id: 'TRACE-START',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Start runtime adapter', () => {
    it('rejects target-driven execution without waking or mutating', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        try {
            const result = await new StartAdapter().execute({
                weave_id: 'weave:start',
                payload: {
                    target: 'src/index.ts',
                    task: 'Refactor entrypoint',
                    ledger: 'ledger',
                },
            }, createContext('/tmp/cstar-start-test'));

            assert.equal(result.status, 'FAILURE');
            assert.match(result.error ?? '', /authorized execution lane/i);
            assert.equal(wakeMock.mock.callCount(), 0);
            assert.equal(result.metadata?.adapter, 'compatibility:start-target-rejected');
        } finally {
            wakeMock.mock.restore();
        }
    });

    it('fails closed on the retired Loki autonomous flag', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        try {
            const result = await new StartAdapter().execute({
                weave_id: 'weave:start',
                payload: { task: 'resume', ledger: 'ledger', loki: true },
            }, createContext('/tmp/cstar-start-test'));

            assert.equal(result.status, 'FAILURE');
            assert.match(result.error ?? '', /permanently decommissioned/i);
            assert.match(result.error ?? '', /cannot bypass operator and CStar execution gates/i);
            assert.equal(wakeMock.mock.callCount(), 0);
            assert.equal(result.metadata?.resume_requested, false);
        } finally {
            wakeMock.mock.restore();
        }
    });

    it('performs a deterministic wake only for a plain start', async () => {
        const wakeMock = mock.method(ANS, 'wake', async () => undefined);
        try {
            const result = await new StartAdapter().execute({
                weave_id: 'weave:start',
                payload: { task: '', ledger: 'ledger' },
            }, createContext('/tmp/cstar-start-test'));

            assert.equal(result.status, 'TRANSITIONAL');
            assert.match(result.output, /Kernel Awakening Complete/i);
            assert.equal(wakeMock.mock.callCount(), 1);
            assert.equal(result.metadata?.supervisor_decision_source, 'deterministic-wake-only');
            assert.equal(result.metadata?.resume_requested, false);
        } finally {
            wakeMock.mock.restore();
        }
    });

    it('contains no hidden git pull or host-governor auto-resume path', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'adapters.ts'),
            'utf-8',
        );
        const startSection = source.slice(
            source.indexOf('export class StartAdapter'),
            source.indexOf('export class RavensAdapter'),
        );

        assert.doesNotMatch(startSection, /git["']?,?\s*["']pull|executeHostGovernorResume|hostTextInvoker/);
        assert.match(startSection, /Loki autonomous start is permanently decommissioned/);
    });
});
