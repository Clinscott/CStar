import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { OrchestratorProcessManager, deps } from '../../../src/node/core/runtime/process_manager.ts';

describe('OrchestratorProcessManager', () => {
    it('should register and unregister process groups', () => {
        const manager = new OrchestratorProcessManager();
        manager.registerGroup(1234);
        manager.unregisterGroup(1234);
        // No error means it works as expected (internal state is private)
    });

    it('should reap a registered process group', async () => {
        const manager = new OrchestratorProcessManager();
        const pgid = 1234;
        manager.registerGroup(pgid);

        const killMock = mock.method(deps, 'kill', () => {});
        mock.method(deps, 'setTimeout', (fn: () => void) => fn());

        await manager.reapGroup(pgid);

        // SIGTERM, then isGroupAlive(0), then SIGKILL (since 0 didn't throw)
        assert.strictEqual(killMock.mock.callCount(), 3);
        assert.strictEqual(killMock.mock.calls[0].arguments[0], -pgid);
        assert.strictEqual(killMock.mock.calls[0].arguments[1], 'SIGTERM');
        assert.strictEqual(killMock.mock.calls[1].arguments[0], -pgid);
        assert.strictEqual(killMock.mock.calls[1].arguments[1], 0); // isGroupAlive check
        assert.strictEqual(killMock.mock.calls[2].arguments[1], 'SIGKILL');
    });

    it('should escalate to SIGKILL if group is still alive', async () => {
        const manager = new OrchestratorProcessManager();
        const pgid = 1234;
        manager.registerGroup(pgid);

        let killCount = 0;
        const killMock = mock.method(deps, 'kill', (id: number, signal: string | number) => {
            killCount++;
            if (signal === 0) return true; // Pretend it's alive
            return;
        });
        mock.method(deps, 'setTimeout', (fn: () => void) => fn());

        await manager.reapGroup(pgid);

        // SIGTERM, then isGroupAlive check (0), then SIGKILL
        assert.strictEqual(killCount, 3);
        assert.strictEqual(killMock.mock.calls[0].arguments[1], 'SIGTERM');
        assert.strictEqual(killMock.mock.calls[1].arguments[1], 0);
        assert.strictEqual(killMock.mock.calls[2].arguments[1], 'SIGKILL');
    });

    it('should not escalate to SIGKILL if group is dead', async () => {
        const manager = new OrchestratorProcessManager();
        const pgid = 1234;
        manager.registerGroup(pgid);

        const killMock = mock.method(deps, 'kill', (id: number, signal: string | number) => {
            if (signal === 0) {
                const err = new Error('Process not found');
                (err as any).code = 'ESRCH';
                throw err;
            }
            return;
        });
        mock.method(deps, 'setTimeout', (fn: () => void) => fn());

        await manager.reapGroup(pgid);

        // SIGTERM, then isGroupAlive check (0)
        assert.strictEqual(killMock.mock.callCount(), 2);
        assert.strictEqual(killMock.mock.calls[0].arguments[1], 'SIGTERM');
        assert.strictEqual(killMock.mock.calls[1].arguments[1], 0);
    });

    it('should reap all registered groups', async () => {
        const manager = new OrchestratorProcessManager();
        manager.registerGroup(1001);
        manager.registerGroup(1002);

        const killMock = mock.method(deps, 'kill', () => {});
        mock.method(deps, 'setTimeout', (fn: () => void) => fn());

        await manager.reapAll();

        // 2 groups * (SIGTERM + isGroupAlive check + SIGKILL) = 6 calls
        assert.strictEqual(killMock.mock.callCount(), 6);
    });

    it('should handle ESRCH error when killing', async () => {
        const manager = new OrchestratorProcessManager();
        manager.registerGroup(1234);

        mock.method(deps, 'kill', () => {
            const err = new Error('Process not found');
            (err as any).code = 'ESRCH';
            throw err;
        });
        mock.method(deps, 'setTimeout', (fn: () => void) => fn());

        // Should not throw
        await manager.reapGroup(1234);
    });
});
