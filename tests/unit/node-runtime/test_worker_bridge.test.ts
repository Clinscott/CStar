import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { deps, OrchestratorWorkerBridge } from '../../../src/node/core/runtime/worker_bridge.ts';
import { OrchestratorProcessManager } from '../../../src/node/core/runtime/process_manager.ts';

describe('OrchestratorWorkerBridge', () => {
    it('should execute a bead successfully', async () => {
        const mockRunner: any = mock.fn(async () => ({
            exitCode: 0,
            stdout: 'worker success',
            stderr: '',
            pid: 123
        }));

        const processManager = new OrchestratorProcessManager();
        mock.method(processManager, 'registerGroup', () => {});
        mock.method(processManager, 'unregisterGroup', () => {});

        const bridge = new OrchestratorWorkerBridge('/mock/root', processManager, mockRunner);

        // Mock dependencies
        mock.method(deps.autobot, 'buildAutobotWorkerNote', () => 'test-note');
        mock.method(deps.autobot, 'resolveAutobotCheckerShell', () => 'test-checker');
        mock.method(deps.db, 'getHallBeads', () => []);

        const result = await bridge.executeBead('bead-1', { timeout: 60 });

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(result.stdout, 'worker success');
        assert.strictEqual(mockRunner.mock.callCount(), 1);
        
        mock.reset();
    });

    it('should handle target symbol slicing', async () => {
        const mockRunner: any = mock.fn(async () => ({
            exitCode: 0,
            stdout: 'worker success',
            stderr: '',
            pid: 123
        }));

        const processManager = new OrchestratorProcessManager();
        mock.method(processManager, 'registerGroup', () => {});
        mock.method(processManager, 'unregisterGroup', () => {});

        const bridge = new OrchestratorWorkerBridge('/mock/root', processManager, mockRunner);

        const mockBead = {
            id: 'bead-1',
            target_path: 'src/file.ts',
            critique_payload: {
                target_symbol: 'MyClass'
            }
        };

        const mockDb = {
            prepare: mock.fn(() => ({
                run: mock.fn()
            }))
        };

        mock.method(deps.db, 'getHallBeads', () => [mockBead]);
        mock.method(deps.db, 'getDb', () => mockDb);
        mock.method(deps.ast, 'extractTargetSymbol', () => 'class MyClass {}');
        mock.method(deps.ast, 'injectTargetSymbol', () => {});
        mock.method(deps.fs, 'mkdirSync', () => {});
        mock.method(deps.fs, 'writeFileSync', () => {});
        mock.method(deps.fs, 'existsSync', () => true);
        mock.method(deps.fs, 'readFileSync', () => 'modified code');

        await bridge.executeBead('bead-1', { timeout: 60 });

        assert.strictEqual(deps.ast.extractTargetSymbol.mock.callCount(), 1);
        assert.strictEqual(deps.ast.injectTargetSymbol.mock.callCount(), 1);
        
        mock.reset();
    });

    it('should handle runner errors', async () => {
        const mockRunner: any = mock.fn(async () => {
            const err: any = new Error('Spawn failed');
            err.exitCode = 1;
            err.stdout = '';
            err.stderr = 'critical failure';
            throw err;
        });

        const processManager = new OrchestratorProcessManager();
        const bridge = new OrchestratorWorkerBridge('/mock/root', processManager, mockRunner);

        mock.method(deps.db, 'getHallBeads', () => []);

        const result = await bridge.executeBead('bead-error', { timeout: 60 });

        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(result.stderr, 'critical failure');
        
        mock.reset();
    });
});
