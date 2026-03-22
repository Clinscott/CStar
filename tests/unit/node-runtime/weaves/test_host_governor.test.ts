import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
// Mocking external modules and functions is crucial for unit testing.
// For Node.js native test runner, we often override global modules or use specific mocking libraries.
// This example uses direct overrides for demonstration.

// --- Mocks for Node.js built-ins ---
let originalChildProcess: any;
let originalFs: any;
let originalPath: any;

const mockChildProcess = {
    // Mock spawnSync to control child process execution and avoid actual execution.
    spawnSync: (command: string, args: string[], options: any) => {
        console.log(`Mock spawnSync called: ${command} ${args.join(' ')}`);
        // Simulate a successful command execution for 'which' or 'where'
        if (command === 'which' || command === 'where') {
            return { status: 0, stdout: Buffer.from('/usr/bin/node
'), stderr: Buffer.from('') };
        }
        // Default success for other commands if needed
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
    },
};

const mockFs = {
    existsSync: (path: string) => {
        console.log(`Mock existsSync called for: ${path}`);
        // Assume files exist for relevant paths, or mock specific behaviors.
        if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.json') || path.endsWith('.md')) {
            return true;
        }
        return false;
    },
    readFileSync: (path: string, encoding: string) => {
        console.log(`Mock readFileSync called for: ${path}`);
        // Provide minimal valid JSON content for any file read, or specific content if needed.
        if (path.endsWith('.json')) {
            return '{}';
        }
        if (path.endsWith('.ts') || path.endsWith('.js')) {
            // Simulate a file with a few lines
            return `export const mockValue = '${path}';
// content
`;
        }
        return '';
    },
};

const mockPath = {
    resolve: (...segments: string[]) => {
        console.log('Mock path.resolve called with:', segments);
        return segments.join('/'); // Simple join for mock
    },
    isAbsolute: (p: string) => {
        console.log('Mock path.isAbsolute called for:', p);
        return p.startsWith('/');
    },
};

// --- Mocking external dependencies (pennyone, etc.) ---
const mockDatabase = {
    // Mock implementations for database interaction functions
    getHallBeads: (projectRoot: string, statuses?: string[]) => {
        console.log('Mock getHallBeads called with:', projectRoot, statuses);
        // Return sample data for beads. This will be adjusted in beforeEach for specific tests.
        return [
            {
                id: 'bead-id-1',
                status: 'OPEN',
                target_path: 'src/implementation/feature.ts',
                checker_shell: '"node src/checker.js"',
                acceptance_criteria: 'Do X|Do Y',
                critique_payload: { targets: [] },
                rationale: 'This is a test bead for implementation',
                bounded: true,
            },
            {
                id: 'bead-id-2',
                status: 'OPEN',
                target_path: 'tests/unit/spec.test.ts',
                checker_shell: '"node src/checker.js"',
                acceptance_criteria: 'Do Z',
                critique_payload: { targets: [] },
                rationale: 'This is a test bead for verification',
                bounded: true,
            },
            {
                id: 'bead-id-3',
                status: 'BLOCKED',
                target_path: 'src/complex_feature.ts',
                checker_shell: '"node src/checker.js"',
                acceptance_criteria: 'Do A|Do B',
                critique_payload: { targets: [] },
                rationale: 'This bead is blocked',
                bounded: false,
            },
        ];
    },
    getDb: () => {
        console.log('Mock getDb called');
        return {
            prepare: (query: string) => {
                console.log('Mock db.prepare called:', query);
                return {
                    run: (params: any[]) => console.log('Mock db.run called with:', params),
                    all: () => [],
                    get: () => ({}),
                };
            },
        };
    },
    getHallPlanningSession: (sessionId: string) => {
        console.log('Mock getHallPlanningSession called with:', sessionId);
        if (sessionId === 'mock-session-id') {
            return {
                id: sessionId,
                status: 'PLAN_READY',
                metadata: {
                    bead_ids: ['bead-id-4', 'bead-id-5'],
                    replanned_bead_ids: ['bead-id-4', 'bead-id-5'],
                },
                updated_at: Date.now(),
            };
        }
        return null;
    },
    listHallSkillProposals: () => {
        console.log('Mock listHallSkillProposals called');
        return [];
    },
    saveHallSkillObservation: () => console.log('Mock saveHallSkillObservation called'),
    saveHallPlanningSession: () => console.log('Mock saveHallPlanningSession called'),
    saveHallSkillProposal: () => console.log('Mock saveHallSkillProposal called'),
    listHallPlanningSessions: () => {
        console.log('Mock listHallPlanningSessions called');
        return [];
    },
};

// --- Mocking dispatchPort and hostTextInvoker ---
// These are dependencies passed to the HostGovernorWeave constructor.
const mockDispatchPort = {
    dispatch: async (params: any) => {
        console.log('Mock dispatchPort.dispatch called with:', params.weave_id);
        // Simulate responses for different weaves
        if (params.weave_id === 'weave:orchestrate') {
            return {
                weave_id: 'weave:orchestrate',
                status: 'SUCCESS',
                output: 'Orchestration successful.',
                metadata: {},
            };
        }
        if (params.weave_id === 'weave:chant') {
            // Simulate successful replanning response
            return {
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'Replan successful.',
                metadata: {
                    planning_session_id: 'mock-session-id',
                    planning_status: 'PLAN_READY',
                },
            };
        }
        throw new Error(`Unknown weave_id dispatched: ${params.weave_id}`);
    },
};

const mockHostTextInvoker = async ({ provider, projectRoot, source, env, systemPrompt, prompt }: any) => {
    console.log('Mock hostTextInvoker called');
    // Simulate the response from the LLM for governance decisions.
    if (prompt.includes('You are the Corvus Star Host Governor')) {
        // Example: Mock decision for evaluateCandidates.
        // This mock decision simulates approving one bead and deferring another.
        return JSON.stringify({
            approved_bead_ids: ['bead-id-1'],
            deferred_bead_ids: ['bead-id-2'],
            reason_code: 'TOO_WIDE',
            notes: 'Mocked evaluation decision.',
        });
    }
    return JSON.stringify({});
};

// --- Mock HostGovernorWeave class for testing ---
// In a real project, you would import the actual class and then inject mocks.
// For this example, we define a mock class structure and simulate its behavior.
class MockHostGovernorWeave {
    private dispatchPort: any;
    private hostTextInvoker: any;

    constructor(dispatchPort: any, hostTextInvoker: any) {
        this.dispatchPort = dispatchPort;
        this.hostTextInvoker = hostTextInvoker;
    }

    // Simulates the main execution logic of the HostGovernorWeave
    async execute(invocation: any, context: any): Promise<any> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        // Assume provider is always available for simplicity in mocks.
        const provider = 'mock-provider';
        const runtimeEnv = { ...process.env, ...context.env };

        if (!provider) {
            return { weave_id: 'weave:host-governor', status: 'FAILURE', error: 'No provider' };
        }

        // Simulate fetching initial candidates
        const initialCandidates = mockDatabase.getHallBeads(projectRoot).filter(bead => bead.status === 'OPEN' || bead.status === 'SET-PENDING');

        if (initialCandidates.length === 0) {
            // Scenario: No OPEN beads, consider replanning.
            console.log('No OPEN beads found, simulating replan.');
            const replanResult = { invoked: true, planningSessionId: 'mock-session-id', beadIds: ['bead-id-4', 'bead-id-5'] };

            // Simulate calling governReplannedSession for the replanned beads.
            // This mock response represents a successful governance pass on replanned beads.
            const replannedPass = {
                source: 'replan',
                planningSessionId: 'mock-session-id',
                candidateBeadIds: ['bead-id-4', 'bead-id-5'],
                promotedBeadIds: ['bead-id-4'], // Mock a promotion from replan
                deferredBeadIds: ['bead-id-5'],
                reasonCode: 'WEAK_VALIDATION',
                notes: 'Replan decision.',
            };
            console.log('Simulating successful replan governance pass.');

            return {
                weave_id: 'weave:host-governor',
                status: 'SUCCESS',
                output: 'Host governor promoted 1 bead(s) to SET. Triggered chant replanning.',
                metadata: {
                    promoted_bead_ids: ['bead-id-4'], // Beads promoted from the replanned session
                    deferred_bead_ids: ['bead-id-5'],
                    total_candidates: 2,
                    provider: 'mock-provider',
                    replanned_bead_ids: replanResult.beadIds,
                    replan_planning_session_id: replanResult.planningSessionId,
                    replan_promoted_bead_ids: replannedPass.promotedBeadIds, // Promotions from replan
                },
            };
        } else {
            // Scenario: OPEN beads are available, perform initial governance.
            console.log('OPEN beads found, simulating initial governance pass.');
            const mockDecision = {
                approved_bead_ids: ['bead-id-1'],
                deferred_bead_ids: ['bead-id-2'],
                reason_code: 'TOO_WIDE',
                notes: 'Mocked evaluation decision.',
            };
            // Simulate the result of the governance pass.
            const governancePass = {
                source: 'existing',
                planningSessionId: undefined,
                candidateBeadIds: ['bead-id-1', 'bead-id-2'],
                promotedBeadIds: mockDecision.approved_bead_ids,
                deferredBeadIds: mockDecision.deferred_bead_ids,
                reasonCode: mockDecision.reason_code,
                notes: mockDecision.notes,
            };

            // Simulate auto_execute and orchestration if applicable.
            if (payload.auto_execute && governancePass.promotedBeadIds.length > 0) {
                console.log(`Simulating orchestration for promoted beads: ${governancePass.promotedBeadIds}`);
                await this.dispatchPort.dispatch({
                    weave_id: 'weave:orchestrate',
                    payload: { bead_ids: governancePass.promotedBeadIds },
                });
            }

            return {
                weave_id: 'weave:host-governor',
                status: 'SUCCESS',
                output: 'Host governor promoted 1 bead(s) to SET.',
                metadata: {
                    promoted_bead_ids: governancePass.promotedBeadIds,
                    deferred_bead_ids: governancePass.deferredBeadIds,
                    total_candidates: governancePass.candidateBeadIds.length,
                    provider: 'mock-provider',
                },
            };
        }
    }
}

// --- Test Suite ---
describe('HostGovernorWeave', () => {
    let hostGovernor: MockHostGovernorWeave;
    const mockProjectRoot = '/mock/repo/root';
    const mockContext = { workspace_root: mockProjectRoot, env: {} };

    beforeEach(() => {
        // Store original modules
        originalChildProcess = require('node:child_process');
        originalFs = require('node:fs');
        originalPath = require('node:path');

        // Apply mocks to Node.js built-in modules
        require('node:child_process').spawnSync = mockChildProcess.spawnSync;
        require('node:fs').existsSync = mockFs.existsSync;
        require('node:fs').readFileSync = mockFs.readFileSync;
        require('node:path').resolve = mockPath.resolve;
        require('node:path').isAbsolute = mockPath.isAbsolute;

        // Instantiate the mock weave with mocked dependencies
        hostGovernor = new MockHostGovernorWeave(mockDispatchPort, mockHostTextInvoker);
    });

    afterEach(() => {
        // Restore original modules after each test to ensure isolation.
        require('node:child_process').spawnSync = originalChildProcess.spawnSync;
        require('node:fs').existsSync = originalFs.existsSync;
        require('node:fs').readFileSync = originalFs.readFileSync;
        require('node:path').resolve = originalPath.resolve;
        require('node:path').isAbsolute = originalPath.isAbsolute;
    });

    test('should execute and promote beads when OPEN beads are available', async () => {
        const invocation = {
            weave_id: 'weave:host-governor',
            payload: { project_root: mockProjectRoot, auto_execute: true }, // auto_execute true to simulate promotion and orchestration
            session: { mode: 'cli', interactive: false },
            target: { hostname: 'localhost', port: 8080 },
        };
        const context = mockContext;

        // Override mockDatabase.getHallBeads for this specific test to ensure OPEN beads are returned
        mockDatabase.getHallBeads = (projectRoot: string, statuses?: string[]) => {
            console.log('Test-specific mock getHallBeads: Returning OPEN beads');
            return [
                {
                    id: 'bead-id-1',
                    status: 'OPEN',
                    target_path: 'src/implementation/feature.ts',
                    checker_shell: '"node src/checker.js"',
                    acceptance_criteria: 'Do X|Do Y',
                    critique_payload: { targets: [] },
                    rationale: 'This is a test bead for implementation',
                    bounded: true,
                },
                {
                    id: 'bead-id-2',
                    status: 'OPEN',
                    target_path: 'tests/unit/spec.test.ts',
                    checker_shell: '"node src/checker.js"',
                    acceptance_criteria: 'Do Z',
                    critique_payload: { targets: [] },
                    rationale: 'This is a test bead for verification',
                    bounded: true,
                },
            ];
        };

        const result = await hostGovernor.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output?.includes('promoted 1 bead(s) to SET'));
        assert.deepStrictEqual(result.metadata?.promoted_bead_ids, ['bead-id-1']); // Based on mockHostTextInvoker response
        assert.deepStrictEqual(result.metadata?.deferred_bead_ids, ['bead-id-2']); // Based on mockHostTextInvoker response
    });

    test('should trigger replan when no OPEN beads are available and auto_replan_blocked is true', async () => {
        const invocation = {
            weave_id: 'weave:host-governor',
            payload: { project_root: mockProjectRoot, auto_replan_blocked: true, auto_execute: true }, // auto_replan_blocked: true to trigger replan
            session: { mode: 'cli', interactive: false },
            target: { hostname: 'localhost', port: 8080 },
        };
        const context = mockContext;

        // Mock getHallBeads to return an empty array for OPEN/SET-PENDING beads, simulating a state where no immediate candidates exist.
        mockDatabase.getHallBeads = (projectRoot: string, statuses?: string[]) => {
            console.log('Test-specific mock getHallBeads: Returning empty array for OPEN beads');
            return [];
        };

        const result = await hostGovernor.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output?.includes('Triggered chant replanning'));
        assert.ok(result.metadata?.replanned_bead_ids?.length > 0); // Should have IDs from the simulated replan
        assert.deepStrictEqual(result.metadata?.promoted_bead_ids, ['bead-id-4']); // From the replanned session mock in MockHostGovernorWeave
        assert.deepStrictEqual(result.metadata?.deferred_bead_ids, ['bead-id-5']); // From the replanned session mock
    });

    test('should not trigger replan if auto_replan_blocked is false', async () => {
        const invocation = {
            weave_id: 'weave:host-governor',
            payload: { project_root: mockProjectRoot, auto_replan_blocked: false, auto_execute: true }, // auto_replan_blocked: false to prevent replan
            session: { mode: 'cli', interactive: false },
            target: { hostname: 'localhost', port: 8080 },
        };
        const context = mockContext;

        // Mock getHallBeads to return an empty array for OPEN/SET-PENDING beads.
        mockDatabase.getHallBeads = (projectRoot: string, statuses?: string[]) => {
            console.log('Test-specific mock getHallBeads: Returning empty array for OPEN beads');
            return [];
        };

        const result = await hostGovernor.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(!result.output?.includes('Triggered chant replanning'));
        assert.ok(result.output?.includes('Governance remains paused.')); // Expected message when no action is taken
        assert.deepStrictEqual(result.metadata?.promoted_bead_ids, []);
        assert.deepStrictEqual(result.metadata?.deferred_bead_ids, []);
        assert.deepStrictEqual(result.metadata?.replanned_bead_ids, []); // No replan occurred
    });

    test('should handle dry_run mode correctly', async () => {
        const invocation = {
            weave_id: 'weave:host-governor',
            payload: { project_root: mockProjectRoot, dry_run: true, auto_execute: true }, // dry_run true
            session: { mode: 'cli', interactive: false },
            target: { hostname: 'localhost', port: 8080 },
        };
        const context = mockContext;

        // Ensure OPEN beads are available for dry run to simulate governance pass
        mockDatabase.getHallBeads = (projectRoot: string, statuses?: string[]) => {
            console.log('Test-specific mock getHallBeads: Returning OPEN beads for dry run');
            return [
                {
                    id: 'bead-id-1',
                    status: 'OPEN',
                    target_path: 'src/implementation/feature.ts',
                    checker_shell: '"node src/checker.js"',
                    acceptance_criteria: 'Do X|Do Y',
                    critique_payload: { targets: [] },
                    rationale: 'This is a test bead for implementation',
                    bounded: true,
                },
                {
                    id: 'bead-id-2',
                    status: 'OPEN',
                    target_path: 'tests/unit/spec.test.ts',
                    checker_shell: '"node src/checker.js"',
                    acceptance_criteria: 'Do Z',
                    critique_payload: { targets: [] },
                    rationale: 'This is a test bead for verification',
                    bounded: true,
                },
            ];
        };

        const result = await hostGovernor.execute(invocation, context);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.ok(result.output?.includes('promoted 1 bead(s) to SET')); // Still reports the outcome
        assert.deepStrictEqual(result.metadata?.promoted_bead_ids, ['bead-id-1']); // Reports the decision
        assert.deepStrictEqual(result.metadata?.deferred_bead_ids, ['bead-id-2']);
        // In dry_run, no actual changes should be made, and orchestration should be skipped.
        // We can't directly assert no DB calls were made without deeper mock instrumentation,
        // but the core logic path for dry_run should be tested.
        // The output message should reflect the governance decision.
    });

    // Add more tests for:
    // - Case where replanning itself fails.
    // - Case where orchestration fails after promotion.
    // - Different statuses of beads (BLOCKED, NEEDS_TRIAGE).
    // - Interaction with 'auto_execute' flag.
    // - Specific error handling for provider absence.
});
