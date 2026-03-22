import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrchestratorReaper } from '../../../src/node/core/runtime/reaper.ts';
import { database } from '../../../src/tools/pennyone/intel/database.ts';

describe('Orchestrator Reaper Unit Tests', () => {
    it('should map success to READY_FOR_REVIEW', async () => {
        const mockDb = {
            prepare: mock.fn((query: string) => ({
                get: mock.fn(() => ({ status: 'SET' })),
                run: mock.fn(() => ({}))
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const reaper = new OrchestratorReaper('/mock/root');
        const result = await reaper.mapOutcome('bead-1', {
            stdout: 'lots of output here',
            stderr: '',
            exitCode: 0,
            timedOut: false
        });

        assert.strictEqual(result, 'READY_FOR_REVIEW');
        mock.reset();
    });

    it('should map timeout to SET with HOST-WORKER escalation', async () => {
        const mockDb: any = {
            prepare: mock.fn((query: string) => ({
                get: mock.fn(() => ({ status: 'SET', assigned_agent: 'SOVEREIGN-WORKER' })),
                run: mock.fn(() => ({}))
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const reaper = new OrchestratorReaper('/mock/root');
        const result = await reaper.mapOutcome('bead-1', {
            stdout: '',
            stderr: 'timed out error',
            exitCode: 124,
            timedOut: true
        });

        assert.strictEqual(result, 'SET');
        // Check if DB update was called with HOST-WORKER
        const updateCall = mockDb.prepare.mock.calls.find((c: any) => c.arguments[0].includes('UPDATE hall_beads'));
        assert.ok(updateCall);
        mock.reset();
    });

    it('should map empty output success to NEEDS_TRIAGE', async () => {
        const mockDb = {
            prepare: mock.fn((query: string) => ({
                get: mock.fn(() => ({ status: 'SET' })),
                run: mock.fn(() => ({}))
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const reaper = new OrchestratorReaper('/mock/root');
        const result = await reaper.mapOutcome('bead-1', {
            stdout: 'tiny',
            stderr: '',
            exitCode: 0,
            timedOut: false
        });

        assert.strictEqual(result, 'NEEDS_TRIAGE');
        mock.reset();
    });

    it('should map general failure to SET/HOST-WORKER escalation if sovereign', async () => {
        const mockDb = {
            prepare: mock.fn((query: string) => ({
                get: mock.fn(() => ({ status: 'SET', assigned_agent: 'SOVEREIGN-WORKER', triage_reason: 'some failure' })),
                run: mock.fn(() => ({}))
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const reaper = new OrchestratorReaper('/mock/root');
        const result = await reaper.mapOutcome('bead-1', {
            stdout: '',
            stderr: 'error\nerror\nerror\nerror\nfinal crash line',
            exitCode: 1,
            timedOut: false
        });

        assert.strictEqual(result, 'SET');
        mock.reset();
    });
});
