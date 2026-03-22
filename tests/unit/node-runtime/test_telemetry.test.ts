import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OrchestratorTelemetryBridge, deps } from  '../../../src/node/core/runtime/telemetry.js';

describe('OrchestratorTelemetryBridge', () => {
    let mockDb: any;
    let bridge: OrchestratorTelemetryBridge;

    beforeEach(() => {
        mockDb = {
            prepare: (sql: string) => ({
                run: (...args: any[]) => {
                    mockDb.lastRun = { sql, args };
                    return { changes: 1 };
                },
                get: () => {
                    mockDb.lastGet = { sql };
                    return { repo_id: 'test-repo-id' };
                }
            }),
            lastRun: null as any,
            lastGet: null as any,
        };
        deps.getDb = () => mockDb;
        bridge = new OrchestratorTelemetryBridge('/project/root');
    });

    test('pulse should update heartbeat', async () => {
        const beadId = 'test-bead';
        await bridge.pulse(beadId);

        assert.ok(mockDb.lastRun);
        assert.ok(mockDb.lastRun.sql.includes('UPDATE hall_beads'));
        assert.strictEqual(mockDb.lastRun.args[1], beadId);
        assert.ok(typeof mockDb.lastRun.args[0] === 'number'); // timestamp
    });

    test('recordExecution should insert validation run', async () => {
        const beadId = 'test-bead';
        const outcome = {
            status: 'SUCCESS',
            exit_code: 0,
            duration_ms: 123,
        };
        await bridge.recordExecution(beadId, outcome);

        assert.ok(mockDb.lastGet);
        assert.ok(mockDb.lastGet.sql.includes('SELECT repo_id FROM hall_repositories'));

        assert.ok(mockDb.lastRun);
        assert.ok(mockDb.lastRun.sql.includes('INSERT INTO hall_validation_runs'));
        assert.strictEqual(mockDb.lastRun.args[1], 'test-repo-id');
        assert.strictEqual(mockDb.lastRun.args[2], beadId);
        assert.strictEqual(mockDb.lastRun.args[3], 'SUCCESS');
        assert.ok(mockDb.lastRun.args[4].includes('Duration 123ms, Exit 0'));
    });
});
