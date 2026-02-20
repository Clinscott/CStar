import { test, describe, it, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs/promises';
import { executeCycle } from '../../src/node/agent_loop.js';
import * as deploymentModule from '../../src/node/deployment.js';

describe('Gungnir Flight - The Agent Loop Takeover', () => {

    let mockReadFile;
    let mockWriteFile;
    let mockDeploy;
    let mockConsoleLog;
    let mockConsoleError;
    let loggedMessages = [];
    let loggedErrors = [];

    // Dependency Injectable stub for CortexLink
    class MockCortexLink {
        constructor() {
            this.calledCommands = [];
            this.failAsk = false;
            this.failVerify = false;
        }

        async sendCommand(cmd, args) {
            this.calledCommands.push({ cmd, args });
            if (cmd === 'ask') {
                if (this.failAsk) return { status: 'error', reason: 'LLM timeout' };
                return { status: 'success', data: 'console.log("refactored");' };
            }
            if (cmd === 'verify') {
                if (this.failVerify) return { status: 'error', reason: 'linting failed' };
                return { status: 'success' };
            }
            return { status: 'success' };
        }
    }

    beforeEach(() => {
        loggedMessages = [];
        loggedErrors = [];

        // Mock node:fs/promises
        mockReadFile = mock.method(fs, 'readFile', async (path) => {
            if (path.includes('missing_target')) throw new Error('ENOENT: no such file');
            if (path.includes('ledger.json')) return '{"context": "none"}';
            return 'console.log("original code");';
        });

        mockWriteFile = mock.method(fs, 'writeFile', async () => { });

        // Intercept console to verify output strings
        mockConsoleLog = mock.method(console, 'log', (msg) => { loggedMessages.push(msg); });
        mockConsoleError = mock.method(console, 'error', (msg) => { loggedErrors.push(msg); });
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('Executes the 7-step cycle in chronological order successfully', async () => {
        const cortexLink = new MockCortexLink();
        const mockFnDeploy = mock.fn();

        await executeCycle('/my/target.js', '/my/ledger', 'Refactor me', cortexLink, mockFnDeploy);

        // Verify FS mocking calls
        assert.equal(mockReadFile.mock.callCount(), 2); // Read ledger, read target
        assert.equal(mockWriteFile.mock.callCount(), 1); // Write candidate

        // Verify Cortex Network mocking calls
        assert.equal(cortexLink.calledCommands.length, 2);
        assert.equal(cortexLink.calledCommands[0].cmd, 'ask');
        assert.equal(cortexLink.calledCommands[1].cmd, 'verify');

        // Check the explicit ALFRED logs
        const output = loggedMessages.join(' | ');
        assert.ok(output.includes('Consulting the Archives...'), 'Missing Step 1');
        assert.ok(output.includes('Transmitting constraints...'), 'Missing Step 4');
        assert.ok(output.includes('Candidate forged...'), 'Missing Step 5');
        assert.ok(output.includes('Summoning the Raven for judgment...'), 'Missing Step 6');
        assert.ok(output.includes('Cycle complete. The stars await...'), 'Missing Step 7/9');
    });

    it('Fails gracefully, triggering SYSTEM FAILURE, if target file is missing', async () => {
        const cortexLink = new MockCortexLink();
        const mockFnDeploy = mock.fn();

        try {
            await executeCycle('/my/missing_target.js', '/my/ledger', 'Refactor me', cortexLink, mockFnDeploy);
            assert.fail('Should have thrown error on missing file.');
        } catch (e) {
            assert.equal(e.message, 'Target file not found: /my/missing_target.js');
        }

        // Verify error styling was used
        const errorOut = loggedErrors.join(' | ');
        assert.ok(errorOut.includes('[SYSTEM FAILURE]'));
        assert.ok(errorOut.includes('Critical Failure: Target file not found'));

        // Important: Should NOT have called the daemon, written files, or deployed
        assert.equal(cortexLink.calledCommands.length, 0);
        assert.equal(mockWriteFile.mock.callCount(), 0);
        assert.equal(mockFnDeploy.mock.callCount(), 0);
    });

    it('Aborts cycle immediately and does not write candidate if the ask daemon payload errors', async () => {
        const cortexLink = new MockCortexLink();
        cortexLink.failAsk = true;
        const mockFnDeploy = mock.fn();

        try {
            await executeCycle('/my/target.js', '/my/ledger', 'Refactor me', cortexLink, mockFnDeploy);
            assert.fail('Should have thrown error on bad ask payload.');
        } catch (e) {
            assert.ok(e.message.includes('Execution aborted: Cortex Daemon reported failure'));
        }

        // Verify chronological abortion
        assert.equal(cortexLink.calledCommands.length, 1);
        assert.equal(cortexLink.calledCommands[0].cmd, 'ask');

        assert.equal(mockWriteFile.mock.callCount(), 0, 'Candidate must not be forged on error');
        assert.equal(mockFnDeploy.mock.callCount(), 0, 'Must not deploy on ask failure');

        const output = loggedMessages.join(' | ');
        assert.ok(!output.includes('Candidate forged...'));
        assert.ok(!output.includes('Summoning the Raven for judgment...'));
    });

    it('Aborts cycle immediately if the verification payload errors', async () => {
        const cortexLink = new MockCortexLink();
        cortexLink.failVerify = true;
        const mockFnDeploy = mock.fn();

        try {
            await executeCycle('/my/target.js', '/my/ledger', 'Refactor me', cortexLink, mockFnDeploy);
            assert.fail('Should have thrown error on verification rejection.');
        } catch (e) {
            assert.ok(e.message.includes('Verification failed: Cortex Daemon rejected the candidate.'));
        }

        assert.equal(cortexLink.calledCommands.length, 2);
        assert.equal(cortexLink.calledCommands[1].cmd, 'verify');

        assert.equal(mockFnDeploy.mock.callCount(), 0, 'Must not deploy on verification failure');

        const output = loggedMessages.join(' | ');
        assert.ok(!output.includes('Cycle complete. The stars await...'), 'Should never reach Step 7');
    });
});
