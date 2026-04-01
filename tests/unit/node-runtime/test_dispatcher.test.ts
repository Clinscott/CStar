import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeDispatcher } from  '../../../src/node/core/runtime/dispatcher.js';
import { WeaveInvocation, WeaveResult } from  '../../../src/node/core/runtime/contracts.js';
import { registry } from  '../../../src/tools/pennyone/pathRegistry.js';

describe('RuntimeDispatcher', () => {
    const hostEnvKeys = [
        'CODEX_SHELL',
        'CODEX_THREAD_ID',
        'CORVUS_HOST_PROVIDER',
        'CORVUS_HOST_SESSION_ACTIVE',
        'GEMINI_CLI_ACTIVE',
        'GEMINI_CLI',
    ] as const;
    let originalHostEnv: Partial<Record<(typeof hostEnvKeys)[number], string | undefined>>;

    beforeEach(() => {
        originalHostEnv = Object.fromEntries(hostEnvKeys.map((key) => [key, process.env[key]]));
        for (const key of hostEnvKeys) {
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of hostEnvKeys) {
            const value = originalHostEnv[key];
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        mock.reset();
    });

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

    it('allows pennyone normalize maintenance calls from the CLI without a trace block', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:pennyone',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:pennyone',
                status: 'TRANSITIONAL',
                output: 'PennyOne normalize completed.',
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
                action: 'normalize',
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

    it('allows pennyone report observation calls from the CLI without a trace block', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:pennyone',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:pennyone',
                status: 'TRANSITIONAL',
                output: 'PennyOne report completed.',
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
                action: 'report',
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

    it('fails closed when chant forbids kernel fallback and no host session is active', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-host-required-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    chant: {
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            allow_kernel_fallback: false,
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'chant',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;
        delete process.env.CORVUS_HOST_PROVIDER;
        process.env.CORVUS_HOST_SESSION_ACTIVE = '0';

        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'legacy node chant should not execute',
            })),
        };
        const dispatcher = RuntimeDispatcher.createIsolated({
            activePersona: { name: 'ODIN' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            id: 'activation:chant:1',
            skill_id: 'chant',
            target_path: tmpRoot,
            intent: 'plan the next Taliesin migration step',
            params: {
                query: 'plan the next Taliesin migration step',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            status: 'PENDING',
            priority: 1,
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires an active host session/i);
        assert.strictEqual(result.metadata?.kernel_fallback_policy, 'forbidden');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
        delete process.env.CORVUS_HOST_SESSION_ACTIVE;
    });

    it('fails closed when chant host activation errors and kernel fallback is forbidden', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-host-error-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    chant: {
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            allow_kernel_fallback: false,
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'chant',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-chant-host-error';

        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'legacy node chant should not execute',
            })),
        };
        const hostTextInvoker = mock.fn(async () => {
            throw new Error('bridge timeout');
        });
        const dispatcher = RuntimeDispatcher.createIsolated({
            hostTextInvoker,
            activePersona: { name: 'ODIN' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            id: 'activation:chant:2',
            skill_id: 'chant',
            target_path: tmpRoot,
            intent: 'plan the next Taliesin migration step',
            params: {
                query: 'plan the next Taliesin migration step',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            status: 'PENDING',
            priority: 1,
        });

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Host-native skill activation failed for 'chant': bridge timeout/);
        assert.strictEqual(result.metadata?.kernel_fallback_policy, 'forbidden');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
        assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
    });

    it('blocks direct weave execution when the registry marks the adapter as a host-workflow with forbidden fallback', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-weave-deny-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    chant: {
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            ownership_model: 'host-workflow',
                            allow_kernel_fallback: false,
                        },
                        runtime_trigger: 'chant',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'node chant should not execute',
            })),
        };
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot: tmpRoot, targetDomain: 'brain', requestedRoot: tmpRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: mock.fn(), updateFramework: mock.fn() },
            activePersona: { name: 'ODIN' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:chant',
            payload: {
                query: '// Corvus Star Trace [Ω]\nIntent: test direct weave path',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            session: {
                mode: 'subkernel',
                interactive: false,
            },
            target: {
                domain: 'brain',
                workspace_root: tmpRoot,
                requested_path: tmpRoot,
            },
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /host-workflow/i);
        assert.equal(result.metadata?.ownership_model, 'host-workflow');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
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
