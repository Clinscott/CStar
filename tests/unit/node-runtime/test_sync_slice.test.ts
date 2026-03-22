import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

// Import the module to test and its dependencies
import { runSyncSlice } from  '../../../../src/node/core/runtime/sync_slice.js';

// Import fs directly - we will stub its methods
import * as fs from 'node:fs'; 

// --- Mocking Setup ---

describe('Sync Slice Logic', () => {
    let mockAstSlicer: any;
    let mockRegistry: any;
    let mockDb: any;

    beforeEach(() => {
        // Mock fs functions
        const mockFs = {
            existsSync: mock.fn(),
            readFileSync: mock.fn(),
            writeFileSync: mock.fn(),
        };

        // Mock astSlicer functions
        mockAstSlicer = {
            injectTargetSymbol: mock.fn(),
            extractTargetSymbol: mock.fn(),
        };

        // Mock registry functions used by sync_slice.ts
        mockRegistry = {
            getRoot: mock.fn(() => '/mock/root'),
            normalize: (p: string) => p,
            isSpokeUri: (p: string) => p.startsWith('spoke://'),
            parseSpokeUri: (uri: string) => ({ slug: uri.replace('spoke://', '').split('/')[0] }),
            resolveEstatePath: mock.fn(),
        };

        // Mock database facade and its methods
        mockDb = {
            getDb: mock.fn((rootPath: string) => ({
                prepare: mock.fn(() => ({
                    all: mock.fn(() => []),
                    get: mock.fn(() => ({})),
                    run: mock.fn(() => ({})),
                })),
            })),
        };

        // Use mock.stub for built-in module methods
        mock.stub(fs, 'existsSync', mockFs.existsSync);
        mock.stub(fs, 'readFileSync', mockFs.readFileSync);
        mock.stub(fs, 'writeFileSync', mockFs.writeFileSync);
        
        // Mock other dependencies via the deps object
        mock.method(syncSliceModule.deps, 'astSlicer', mockAstSlicer);
        mock.method(syncSliceModule.deps.registry, 'getRoot', mockRegistry.getRoot);
        mock.method(syncSliceModule.deps.registry, 'normalize', mockRegistry.normalize);
        mock.method(syncSliceModule.deps.registry, 'isSpokeUri', mockRegistry.isSpokeUri);
        mock.method(syncSliceModule.deps.registry, 'parseSpokeUri', mockRegistry.parseSpokeUri);
        mock.method(syncSliceModule.deps.registry, 'resolveEstatePath', mockRegistry.resolveEstatePath);
        mock.method(syncSliceModule.deps, 'database', mockDb);
    });

    afterEach(() => {
        // Reset all mocks after each test
        mock.reset();
    });

    it('should inject code when sliced file exists', async () => {
        const mockBead = {
            id: 'bead-123',
            target_path: 'src/file.ts',
            critique_payload: {
                target_symbol: 'MyClass'
            }
        };

        mockDb.getDb.mock.mockImplementation(() => ({
            prepare: mock.fn(() => ({
                all: mock.fn(() => [mockBead]),
                get: mock.fn(() => mockBead)
            }))
        }));

        // fs mocks are now applied via mock.stub
        mockFs.existsSync.mockImplementation((p) => p === '/mock/root/src/file.ts');
        mockFs.readFileSync.mockImplementation((path, encoding) => 'modified code');
        mockAstSlicer.injectTargetSymbol.mockImplementation(() => {});

        // Dynamically import sync_slice to ensure mocks are active
        const syncSliceModule = await import(`../../../src/node/core/runtime/sync_slice.ts?update=${Date.now()}`);
        // Manually call the function after mocking dependencies
        await syncSliceModule.runSyncSlice('/mock/root', 'bead-123');

        assert.strictEqual(mockDb.getDb.mock.callCount(), 1);
        assert.strictEqual(mockFs.existsSync.mock.callCount(), 1);
        assert.strictEqual(mockFs.readFileSync.mock.callCount(), 1);
        assert.strictEqual(mockAstSlicer.injectTargetSymbol.mock.callCount(), 1);

        const injectArgs = mockAstSlicer.injectTargetSymbol.mock.calls[0].arguments;
        assert.strictEqual(injectArgs[0], '/mock/root');
        assert.strictEqual(injectArgs[1], 'src/file.ts');
        assert.strictEqual(injectArgs[2], 'MyClass');
        assert.strictEqual(injectArgs[3], 'modified code');
    });

    it('should exit quietly if arguments are missing', async () => {
        const originalArgv = process.argv;
        let exitCode: number | undefined;
        // @ts-ignore
        process.exit = (code?: number) => {
            exitCode = code;
            throw new Error('EXIT');
        };

        try {
            // Use a cache-busting query to ensure module is re-evaluated
            await import(`../../../src/node/core/runtime/sync_slice.ts?update=${Date.now()}`);
        } catch (e: any) {
            if (e.message !== 'EXIT') throw e;
        } finally {
            process.argv = originalArgv;
            // @ts-ignore
            process.exit = process.exit; // Restore original
        }

        assert.strictEqual(exitCode, 0);
    });
});
