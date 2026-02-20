import { test, describe, mock, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project root for path matching in tests
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

import { executeGenesisSequence, getVenvBinaryPath } from '../../src/node/setup.js';

describe('Genesis Bootstrapper (Native Installation)', () => {

    describe('Path Resolution Engine', () => {
        test('Resolves Windows pip path correctly', () => {
            const pipPath = getVenvBinaryPath('win32', '/test/root', 'pip');
            assert.equal(pipPath, path.join('/test/root', '.venv', 'Scripts', 'pip.exe'));
        });

        test('Resolves Unix pip path correctly', () => {
            const pipPath = getVenvBinaryPath('linux', '/test/root', 'pip');
            // Uses specific hardcoded unix slash paths ignoring runner OS translation
            assert.equal(pipPath.replace(/\\/g, '/'), '/test/root/.venv/bin/pip');
        });
    });

    describe('Execution Engine', () => {
        let mockExecFunction;
        let mockFs;

        beforeEach(() => {
            // Default: All execa calls pass
            mockExecFunction = mock.fn(async () => {
                return { stdout: 'Mock Output' };
            });

            // Default: requirements.txt exists, .venv does NOT
            mockFs = {
                access: mock.fn(async (target) => {
                    if (target.includes('.venv')) throw new Error('ENOENT'); // Needs to be created
                    return true; // requirements.txt exists
                })
            };
        });

        test('Standard Unix Bootstrapping (Creates venv)', async () => {
            await executeGenesisSequence('linux', mockExecFunction, mockFs);

            assert.equal(mockExecFunction.mock.callCount(), 3);

            // Call 1: Venv Generation
            assert.deepEqual(mockExecFunction.mock.calls[0].arguments[1], ['-m', 'venv', '.venv']);
            assert.deepEqual(mockExecFunction.mock.calls[0].arguments[2].stdio, ['ignore', 'inherit', 'inherit']);

            // Call 2: Pip Install (Unix path)
            const pipCallArgs = mockExecFunction.mock.calls[1].arguments;
            assert.ok(pipCallArgs[0].replace(/\\/g, '/').endsWith('.venv/bin/pip'));
            assert.deepEqual(pipCallArgs[1], ['install', '-r', 'requirements.txt']);
            assert.equal(pipCallArgs[2].cwd, PROJECT_ROOT);

            // Call 3: npm link
            assert.deepEqual(mockExecFunction.mock.calls[2].arguments.slice(0, 2), ['npm', ['link']]);
        });

        test('Skips venv creation if .venv already exists', async () => {
            mockFs.access = mock.fn(async () => true); // Both .venv and requirements.txt exist

            await executeGenesisSequence('win32', mockExecFunction, mockFs);

            assert.equal(mockExecFunction.mock.callCount(), 2);

            // Call 1 must immediately be pip inside Windows
            const pipCallArgs = mockExecFunction.mock.calls[0].arguments;
            assert.ok(pipCallArgs[0].includes('Scripts'));
            assert.ok(pipCallArgs[0].includes('pip.exe'));
        });

        test('Throws [SYSTEM FAILURE] on pip crash, halting npm link', async () => {
            mockExecFunction = mock.fn(async (cmd, args) => {
                if (args.includes('install')) throw new Error('Pip Crash');
                return { stdout: '' };
            });

            try {
                await executeGenesisSequence('linux', mockExecFunction, mockFs);
                assert.fail('Should have thrown error on pip crash');
            } catch (err) {
                assert.ok(err.message.includes('Pip Crash'));
                // Assert npm link (call 3) was never reached
                assert.equal(mockExecFunction.mock.callCount(), 2);
            }
        });
    });
});
