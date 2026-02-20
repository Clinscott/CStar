import { test, describe, it, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs/promises';
import { deployCandidate } from '../../src/node/deployment.js';

describe('Deployment Engine (The Final Purge)', () => {
    let mockRename;
    let mockConsoleLog;
    let loggedMessages = [];
    let mockExecFunction;

    beforeEach(() => {
        loggedMessages = [];

        // Mock node:fs/promises rename
        mockRename = mock.method(fs, 'rename', async (source, dest) => {
            if (source.includes('/crash_rename.txt')) throw new Error('EPERM: operation not permitted');
        });

        // Dedicated mock function to pass to deployCandidate
        mockExecFunction = mock.fn(async (bin, args) => {
            if (args.join(' ').includes('/crash_git.txt')) throw new Error('Git EPERM detached head');
            return { stdout: 'simulated output' };
        });

        // Intercept log
        mockConsoleLog = mock.method(console, 'log', (msg) => { loggedMessages.push(msg); });
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('Executes Overwrite, Git Add, and Git Commit successfully', async () => {
        await deployCandidate('/target.txt', '/candidate.txt', 'Auto-Refactor: Tests', mockExecFunction);

        // Check Rename call
        assert.equal(mockRename.mock.callCount(), 1);
        assert.deepStrictEqual(mockRename.mock.calls[0].arguments, ['/candidate.txt', '/target.txt']);

        // Check Git calls
        assert.equal(mockExecFunction.mock.callCount(), 2);

        // We verify the mock tracked the explicit git calls by checking the exact stringified arguments.
        const call1 = JSON.stringify(mockExecFunction.mock.calls[0].arguments);
        const call2 = JSON.stringify(mockExecFunction.mock.calls[1].arguments);

        assert.equal(call1, '["git",["add","/target.txt"]]');
        assert.equal(call2, '["git",["commit","-m","Auto-Refactor: Tests"]]');

        const logs = loggedMessages.join(' | ');
        assert.ok(logs.includes('Deploying candidate to mainline...'));
    });

    it('Aborts Git operations entirely if candidate rename fails', async () => {
        try {
            await deployCandidate('/target.txt', '/crash_rename.txt', 'Commit', mockExecFunction);
            assert.fail('Should have thrown on rename crash.');
        } catch (err) {
            assert.ok(err.message.includes('Deployment Failed during Overwrite (rename). Details: EPERM'));
        }

        assert.equal(mockRename.mock.callCount(), 1);

        // EXTREMELY IMPORTANT: Git MUST NOT be called if overwrite fails!
        assert.equal(mockExecFunction.mock.callCount(), 0);
    });

    it('Throws error accurately if Git Add or Commit fails', async () => {
        try {
            // Trigger failure purely in git phase
            await deployCandidate('/crash_git.txt', '/candidate.txt', 'Commit', mockExecFunction);
            assert.fail('Should have thrown on git crash.');
        } catch (err) {
            assert.ok(err.message.includes('Deployment Failed during Git Operations'));
            assert.ok(err.message.includes('Git EPERM detached head'));
        }

        assert.equal(mockRename.mock.callCount(), 1);
        assert.equal(mockExecFunction.mock.callCount(), 1); // Hit add, immediately crashed
    });
});
