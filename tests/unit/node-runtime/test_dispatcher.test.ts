import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeDispatcher } from  '../../../src/node/core/runtime/dispatcher.js';
import { WeaveInvocation, WeaveResult } from  '../../../src/node/core/runtime/contracts.js';
import { registry } from  '../../../src/tools/pennyone/pathRegistry.js';

describe('RuntimeDispatcher', () => {
    it('should correctly dispatch to a registered adapter', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:test',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:test',
                status: 'SUCCESS',
                output: 'test-output'
            }))
        };

        const mockResolveEstateTarget = mock.fn(() => ({
            workspaceRoot,
            targetDomain: 'brain' as const,
            requestedRoot: workspaceRoot,
        }));

        const mockStateRegistry = {
            updateMission: mock.fn(),
            updateFramework: mock.fn()
        };

        // Create isolated dispatcher with injected mocks
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: mockResolveEstateTarget,
            // @ts-ignore
            stateRegistry: mockStateRegistry,
            activePersona: { name: 'ALFRED' }
        });

        dispatcher.registerAdapter(mockAdapter);

        const invocation: WeaveInvocation<any> = {
            weave_id: 'weave:test',
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        };

        const result = await dispatcher.dispatch(invocation);

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'test-output');
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
        assert.strictEqual(mockResolveEstateTarget.mock.callCount(), 1);
        assert.strictEqual(mockStateRegistry.updateMission.mock.callCount(), 1);
    });

    it('should return failure if adapter is not registered', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        const invocation: WeaveInvocation<any> = {
            weave_id: 'weave:unknown',
            payload: {}
        };

        const result = await dispatcher.dispatch(invocation);

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('spine remains disconnected'));
    });

    it('should handle adapter execution failures', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:fail',
            execute: mock.fn(async (): Promise<WeaveResult> => {
                throw new Error('Explosion');
            })
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {} }
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:fail',
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('catastrophic failure: Explosion'));
    });

    it('allows pennyone search observation calls from the CLI without a trace block', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:pennyone',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:pennyone',
                status: 'TRANSITIONAL',
                output: 'PennyOne search completed.',
            })),
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {}, updateFramework: () => {} },
            activePersona: { name: 'ALFRED' },
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'search',
                query: 'host governor',
                path: '.',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
            target: {
                domain: 'brain',
                workspace_root: workspaceRoot,
                requested_path: workspaceRoot,
            },
        });

        assert.strictEqual(result.status, 'TRANSITIONAL');
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
    });

    it('routes agent-native skill beads through the host bridge before runtime state updates', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-skill-dispatch-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    hall: {
                        execution: {
                            mode: 'agent-native',
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'hall',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        const hostTextInvoker = mock.fn(async () => ({
            provider: 'codex' as const,
            text: 'Host fulfilled hall search.',
        }));
        const updateMission = mock.fn();
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            stateRegistry: { updateMission, updateFramework: mock.fn() },
            // @ts-ignore
            hostTextInvoker,
            activePersona: { name: 'ALFRED' },
        });

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-host-skill';

        const result = await dispatcher.dispatch({
            id: 'activation:hall:1',
            skill_id: 'hall',
            target_path: 'src/core/host_session.ts',
            intent: 'find host bridge state',
            params: {
                query: 'host bridge state',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            status: 'PENDING',
            priority: 1,
        });

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'Host fulfilled hall search.');
        assert.strictEqual(result.metadata?.adapter, 'host-session:agent-native-skill');
        assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
        assert.strictEqual(updateMission.mock.callCount(), 0);
    });

    it('asks the host to supervise a failed kernel-backed skill and retries once when directed', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-kernel-recovery-retry-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    autobot: {
                        execution: {
                            mode: 'kernel-backed',
                            adapter_id: 'weave:autobot',
                        },
                        host_support: {
                            codex: 'supported',
                        },
                        runtime_trigger: 'autobot',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        let attempts = 0;
        const autobotAdapter = {
            id: 'weave:autobot',
            execute: mock.fn(async (): Promise<WeaveResult> => {
                attempts += 1;
                if (attempts === 1) {
                    return {
                        weave_id: 'weave:autobot',
                        status: 'FAILURE',
                        output: '',
                        error: 'checker process crashed',
                    };
                }
                return {
                    weave_id: 'weave:autobot',
                    status: 'SUCCESS',
                    output: 'retry succeeded',
                };
            }),
        };
        const hostTextInvoker = mock.fn(async () => ({
            provider: 'codex' as const,
            text: JSON.stringify({
                action: 'retry',
                summary: 'Transient checker failure. Retry once.',
                operator_message: 'Retrying autobot after transient checker failure.',
            }),
        }));
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            stateRegistry: { updateMission: mock.fn(), updateFramework: mock.fn() },
            // @ts-ignore
            hostTextInvoker,
            activePersona: { name: 'ALFRED' },
        });
        dispatcher.registerAdapter(autobotAdapter);

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-kernel-retry';

        const result = await dispatcher.dispatch({
            id: 'activation:autobot:1',
            skill_id: 'autobot',
            target_path: 'src/example.ts',
            intent: 'execute bounded bead',
            params: {
                bead_id: 'bead-1',
                project_root: tmpRoot,
                cwd: tmpRoot,
                source: 'runtime',
            },
            status: 'PENDING',
            priority: 1,
        });

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'retry succeeded');
        assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
        assert.strictEqual(autobotAdapter.execute.mock.callCount(), 2);
        assert.equal((result.metadata as any)?.host_recovery?.action, 'retry');
    });

    it('can escalate a failed kernel-backed skill to the host governor for replanning', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-kernel-recovery-replan-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    autobot: {
                        execution: {
                            mode: 'kernel-backed',
                            adapter_id: 'weave:autobot',
                        },
                        host_support: {
                            codex: 'supported',
                        },
                        runtime_trigger: 'autobot',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        const autobotAdapter = {
            id: 'weave:autobot',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:autobot',
                status: 'FAILURE',
                output: '',
                error: 'bead payload is invalid for execution',
            })),
        };
        const governorAdapter = {
            id: 'weave:host-governor',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:host-governor',
                status: 'SUCCESS',
                output: 'Replanned and promoted a corrected bead.',
            })),
        };
        const hostTextInvoker = mock.fn(async () => ({
            provider: 'codex' as const,
            text: JSON.stringify({
                action: 'replan',
                summary: 'Execution route is wrong.',
                operator_message: 'Replan this bead through the host governor.',
                recovery_task: 'Replan the failed autobot bead with corrected execution boundaries.',
            }),
        }));
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            stateRegistry: { updateMission: mock.fn(), updateFramework: mock.fn() },
            // @ts-ignore
            hostTextInvoker,
            activePersona: { name: 'ALFRED' },
        });
        dispatcher.registerAdapter(autobotAdapter);
        dispatcher.registerAdapter(governorAdapter);

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-kernel-replan';

        const result = await dispatcher.dispatch({
            id: 'activation:autobot:2',
            skill_id: 'autobot',
            target_path: 'src/example.ts',
            intent: 'execute bounded bead',
            params: {
                bead_id: 'bead-2',
                project_root: tmpRoot,
                cwd: tmpRoot,
                source: 'runtime',
            },
            status: 'PENDING',
            priority: 1,
        });

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'Replanned and promoted a corrected bead.');
        assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
        assert.strictEqual(governorAdapter.execute.mock.callCount(), 1);
        assert.equal((result.metadata as any)?.host_recovery?.action, 'replan');
    });
});
