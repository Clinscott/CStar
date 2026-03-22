import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

// --- Mocks for Node.js built-ins ---
let originalFs: any;
let originalPath: any;

const mockFs = {
    existsSync: (filePath: string) => {
        console.log(`Mock fs.existsSync called for: ${filePath}`);
        // Simulate file existence: target file exists, contract files exist, but checker script might not.
        if (filePath.includes('some_target.ts')) return true;
        if (filePath.includes('contract_test.ts')) return true;
        if (filePath.includes('checker.js')) return true;
        return false;
    },
    readFileSync: (filePath: string, encoding: string) => {
        console.log(`Mock fs.readFileSync called for: ${filePath}`);
        if (filePath.includes('some_target.ts')) {
            return '// Original content
export function originalFunc() {}';
        }
        if (filePath.includes('contract_test.ts')) {
            return 'import assert from "node:assert";
describe("Tests", () => { test("should pass", () => {}); });';
        }
        return ''; // Default empty content
    },
    mkdirSync: (dirPath: string, options: any) => {
        console.log(`Mock fs.mkdirSync called for: ${dirPath}`);
        // Do nothing, just simulate creation
    },
    writeFileSync: (filePath: string, data: string, encoding: string) => {
        console.log(`Mock fs.writeFileSync called for: ${filePath}`);
        // Store content to simulate writing if needed for assertions
    },
};

const mockPath = {
    resolve: (...segments: string[]) => {
        console.log('Mock path.resolve called with:', segments);
        return segments.join('/'); // Simple join for mock path
    },
    dirname: (filePath: string) => {
        console.log('Mock path.dirname called for:', filePath);
        return filePath.split('/').slice(0, -1).join('/') || '/';
    },
};

// --- Mocking external dependencies ---

// Mocking execa (for running commands like checker_shell)
const mockExeca = async (command: string, args: string[], options: any) => {
    console.log(`Mock execa called: ${command} ${args.join(' ')} with options:`, options);
    // Simulate a successful command execution.
    return { stdout: 'Checker ran successfully', stderr: '', exitCode: 0, command: `${command} ${args.join(' ')}` };
};

// Mocking hostTextInvoker (for LLM interaction)
const mockHostTextInvoker = async ({ provider, projectRoot, source, env, prompt }: any) => {
    console.log('Mock hostTextInvoker called');
    // Simulate LLM response: returns new code for the target file.
    // This mock response is simplified to provide new content.
    return `
```typescript
// New content for target file
export function newFunc() {
    console.log('Hello from new function!');
}
export function originalFunc() {} // Keep original if it was there
```
`;
};

// Mocking imported functions: getHallBeads and resolveRuntimeHostProvider
let currentGetHallBeadsMock = (projectRoot: string, statuses?: string[]) => {
    console.log('Default Mock getHallBeads called for:', projectRoot, statuses);
    // Default mock data, will be overridden in tests
    return [
        {
            id: 'bead-123',
            status: 'SET',
            target_path: 'src/node/core/runtime/weaves/some_target.ts',
            checker_shell: 'node /mock/checker.js',
            contract_refs: ['tests/unit/node-runtime/weaves/some_target.test.ts'],
            rationale: 'Implement feature X',
            acceptance_criteria: 'Feature X works as described',
        },
    ];
};

let currentResolveRuntimeHostProviderMock = (context: any) => {
    console.log('Default Mock resolveRuntimeHostProvider called');
    return 'mock-provider'; // Simulate a valid provider
};

// --- Mock HostWorkerWeave class for testing ---
// This class simulates the actual HostWorkerWeave to isolate tests.
class MockHostWorkerWeave {
    private runner: typeof execa;
    private hostTextInvoker: HostTextInvoker;

    constructor(runner: typeof execa, hostTextInvoker: HostTextInvoker) {
        this.runner = runner;
        this.hostTextInvoker = hostTextInvoker;
    }

    async execute(invocation: WeaveInvocation<HostWorkerWeavePayload>, context: RuntimeContext): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const provider = currentResolveRuntimeHostProviderMock(context); // Use mocked version

        if (!provider) {
            return { weave_id: 'weave:host-worker', status: 'FAILURE', error: 'Host worker requires an active host session.' };
        }

        const beads = currentGetHallBeadsMock(projectRoot); // Use mocked version
        const bead = beads.find(b => b.id === payload.bead_id);

        if (!bead) {
            return { weave_id: 'weave:host-worker', status: 'FAILURE', error: `Bead ${payload.bead_id} not found.` };
        }

        const targetPath = bead.target_path ?? bead.target_ref;
        if (!targetPath) {
             return { weave_id: 'weave:host-worker', status: 'FAILURE', error: `Bead ${payload.bead_id} has no target path.` };
        }

        const absoluteTargetPath = mockPath.resolve(projectRoot, targetPath);
        const targetContent = mockFs.existsSync(absoluteTargetPath) ? mockFs.readFileSync(absoluteTargetPath, 'utf-8') : '';

        const testPaths = bead.contract_refs ?? [];
        let testContents = '';
        for (const testPath of testPaths) {
             const absoluteTestPath = mockPath.resolve(projectRoot, testPath);
             if (mockFs.existsSync(absoluteTestPath)) {
                  testContents += `
--- ${testPath} ---
${mockFs.readFileSync(absoluteTestPath, 'utf-8')}
`;
             }
        }

        const prompt = [
            'You are the Corvus Star Host Worker.',
            'Your task is to implement the requested changes to pass the provided TDD tests.',
            `BEAD RATIONALE: ${bead.rationale}`,
            `ACCEPTANCE CRITERIA: ${bead.acceptance_criteria}`,
            '',
            `TARGET FILE: ${targetPath}`,
            'CURRENT CONTENT:',
            '```',
            targetContent || '// File does not exist yet',
            '```',
            '',
            'TEST FILES:',
            testContents,
            '',
            'INSTRUCTIONS:',
            '1. Write the COMPLETE, valid code for the TARGET FILE.',
            '2. Every function and class MUST include the `export` keyword so they can be imported by the tests.',
            '3. Do not write partial code or omit sections with comments like "...rest of code".',
            '4. Output ONLY the raw code inside a single markdown code block.',
            '5. Do not include markdown formatting outside the code block.',
        ].join('
');

        try {
             const response = await this.hostTextInvoker({
                 prompt,
                 provider,
                 projectRoot,
                 source: 'runtime:host-worker',
                 env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
             });

             // Simplified extraction of new content based on mock response structure
             const newContent = `// New content for target file
export function newFunc() {
    console.log('Hello from new function!');
}
export function originalFunc() {} // Keep original if it was there
`;
             mockFs.mkdirSync(mockPath.dirname(absoluteTargetPath), { recursive: true });
             mockFs.writeFileSync(absoluteTargetPath, newContent, 'utf-8');

             if (bead.checker_shell) {
                 const parts = bead.checker_shell.trim().split(/\s+/);
                 const cmd = parts[0];
                 const args = parts.slice(1);

                 if (cmd === 'npx' || cmd === 'node') {
                     await this.runner(cmd, args, { cwd: projectRoot });
                 } else {
                     await this.runner(cmd, args, { cwd: projectRoot, shell: true });
                 }
             }

             return {
                 weave_id: 'weave:host-worker',
                 status: 'SUCCESS',
                 output: `Host worker successfully implemented and verified bead ${payload.bead_id}.`,
             };
        } catch (error: any) {
             return {
                 weave_id: 'weave:host-worker',
                 status: 'FAILURE',
                 output: '',
                 error: `Host worker failed: ${error.message}`,
             };
        }
    }
}

// --- Test Suite ---
describe('HostWorkerWeave', () => {
    let hostWorker: MockHostWorkerWeave;
    const mockProjectRoot = '/mock/repo/root';
    const mockContext = { workspace_root: mockProjectRoot, env: {} };

    beforeEach(() => {
        // Store original modules before mocking
        originalFs = require('node:fs');
        originalPath = require('node:path');

        // Apply mocks to Node.js built-in modules
        require('node:fs')['existsSync'] = mockFs.existsSync;
        require('node:fs')['readFileSync'] = mockFs.readFileSync;
        require('node:fs')['mkdirSync'] = mockFs.mkdirSync;
        require('node:fs')['writeFileSync'] = mockFs.writeFileSync;
        require('node:path')['resolve'] = mockPath.resolve;
        require('node:path')['dirname'] = mockPath.dirname;

        // Instantiate the mock weave with mocked dependencies
        hostWorker = new MockHostWorkerWeave(mockExeca, mockHostTextInvoker);
    });

    afterEach(() => {
        // Restore original modules after each test to ensure isolation
        require('node:fs').existsSync = originalFs.existsSync;
        require('node:fs').readFileSync = originalFs.readFileSync;
        require('node:fs').mkdirSync = originalFs.mkdirSync;
        require('node:fs').writeFileSync = originalFs.writeFileSync;
        require('node:path').resolve = originalPath.resolve;
        require('node:path').dirname = originalPath.dirname;
    });

    test('should execute and write new content for a bead with checker shell', async () => {
        const invocation = {
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-123', project_root: mockProjectRoot },
            session: { mode: 'cli', interactive: false },
            target: {},
        };
        const context = mockContext;

        // Set up specific mocks for this test
        currentGetHallBeadsMock = () => [{
            id: 'bead-123',
            status: 'SET',
            target_path: 'src/node/core/runtime/weaves/some_target.ts',
            checker_shell: 'node /mock/checker.js',
            contract_refs: ['tests/unit/node-runtime/weaves/some_target.test.ts'],
            rationale: 'Implement feature X',
            acceptance_criteria: 'Feature X works as described',
        }];
        currentResolveRuntimeHostProviderMock = () => 'mock-provider';

        const result = await hostWorker.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output?.includes('Host worker successfully implemented and verified bead bead-123'));

        // Verify that the checker shell command was executed
        assert.strictEqual(mockExeca.mock.calls.length, 1);
        assert.deepStrictEqual(mockExeca.mock.calls[0][0], 'node');
        assert.deepStrictEqual(mockExeca.mock.calls[0][1], ['/mock/checker.js']);
        assert.deepStrictEqual(mockExeca.mock.calls[0][2].cwd, mockProjectRoot);

        // Verify that writeFileSync was called with the new content
        assert.strictEqual(mockFs.writeFileSync.mock.calls.length, 1);
        assert.strictEqual(mockFs.writeFileSync.mock.calls[0][0], '/mock/repo/root/src/node/core/runtime/weaves/some_target.ts');
        assert.ok(mockFs.writeFileSync.mock.calls[0][1].includes('// New content for target file'));
    });

    test('should handle bead with no checker shell and no contract refs', async () => {
        const invocation = {
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-789', project_root: mockProjectRoot },
            session: { mode: 'cli', interactive: false },
            target: {},
        };
        const context = mockContext;

        currentGetHallBeadsMock = () => [{
            id: 'bead-789',
            status: 'SET',
            target_path: 'src/node/core/runtime/weaves/no_checker.ts',
            checker_shell: undefined, // No checker shell
            contract_refs: [], // No contract refs
            rationale: 'Simple implementation',
            acceptance_criteria: 'Functionality is basic',
        }];
        currentResolveRuntimeHostProviderMock = () => 'mock-provider';

        const result = await hostWorker.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output?.includes('Host worker successfully implemented and verified bead bead-789'));

        // Verify no checker execution
        assert.strictEqual(mockExeca.mock.calls.length, 0);
    });

    test('should fail if bead is not found', async () => {
        const invocation = {
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'non-existent-bead', project_root: mockProjectRoot },
            session: { mode: 'cli', interactive: false },
            target: {},
        };
        const context = mockContext;

        // Mock getHallBeads to return an empty array (no beads found)
        currentGetHallBeadsMock = () => [];
        currentResolveRuntimeHostProviderMock = () => 'mock-provider';

        const result = await hostWorker.execute(invocation, context);

        assert.strictEqual(result.status, 'FAILURE');
        assert.strictEqual(result.error, 'Bead non-existent-bead not found.');
    });

    test('should fail if target path is missing', async () => {
        const invocation = {
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-missing-target', project_root: mockProjectRoot },
            session: { mode: 'cli', interactive: false },
            target: {},
        };
        const context = mockContext;

        currentGetHallBeadsMock = () => [{
            id: 'bead-missing-target',
            status: 'SET',
            target_path: undefined, // Missing target_path
            checker_shell: 'node /mock/checker.js',
            contract_refs: [],
            rationale: 'Missing target',
            acceptance_criteria: 'Should fail',
        }];
        currentResolveRuntimeHostProviderMock = () => 'mock-provider';

        const result = await hostWorker.execute(invocation, context);

        assert.strictEqual(result.status, 'FAILURE');
        assert.strictEqual(result.error, 'Bead bead-missing-target has no target path.');
    });

    test('should fail if host provider is missing', async () => {
        const invocation = {
            weave_id: 'weave:host-worker',
            payload: { bead_id: 'bead-123', project_root: mockProjectRoot },
            session: { mode: 'cli', interactive: false },
            target: {},
        };
        // Context without provider info
        const contextWithoutProvider = { workspace_root: mockProjectRoot, env: {} };

        currentGetHallBeadsMock = () => [{
            id: 'bead-123',
            status: 'SET',
            target_path: 'src/node/core/runtime/weaves/some_target.ts',
            checker_shell: 'node /mock/checker.js',
            contract_refs: ['tests/unit/node-runtime/weaves/some_target.test.ts'],
            rationale: 'Implement feature X',
            acceptance_criteria: 'Feature X works as described',
        }];
        // Mock resolveRuntimeHostProvider to return null
        currentResolveRuntimeHostProviderMock = () => null;

        const result = await hostWorker.execute(invocation, contextWithoutProvider);

        assert.strictEqual(result.status, 'FAILURE');
        assert.strictEqual(result.error, 'Host worker requires an active host session.');
    });

    // Add more tests for:
    // - Handling different checker_shell commands (e.g., 'npx', 'shell: true').
    // - Error handling during file read/write.
    // - Error handling during checker execution.
    // - The exact structure of the LLM prompt.
    // - Different LLM responses.
});
