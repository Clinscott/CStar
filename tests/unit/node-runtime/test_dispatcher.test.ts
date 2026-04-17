import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeDispatcher } from  '../../../src/node/core/runtime/dispatcher.js';
import { WeaveInvocation, WeaveResult } from  '../../../src/node/core/runtime/contracts.js';
import { getHallBead } from '../../../src/tools/pennyone/intel/database.js';
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

    function createAgentStateFixture(agentId: 'gemini' | 'autobot' | 'codex' | 'droid' = 'gemini') {
        const state = {
            framework: {
                active_persona: 'ALFRED',
                status: 'AGENT_LOOP',
                gungnir_score: 0,
                intent_integrity: 0,
                last_awakening: Date.now(),
            },
            agents: {
                gemini: {
                    id: 'gemini',
                    name: 'Gemini',
                    status: 'SLEEPING',
                    last_seen: 0,
                },
                codex: {
                    id: 'codex',
                    name: 'Codex',
                    status: 'SLEEPING',
                    last_seen: 0,
                },
                autobot: {
                    id: 'autobot',
                    name: 'AutoBot (Hermes)',
                    status: 'SLEEPING',
                    last_seen: 0,
                },
                droid: {
                    id: 'droid',
                    name: 'Droid',
                    status: 'SLEEPING',
                    last_seen: 0,
                },
            },
            blackboard: [] as Array<{ from: string; to: string; message: string; type: string; at?: number }>,
        };
        const saves: Array<typeof state> = [];
        const blackboardPosts: Array<{ from: string; to: string; message: string; type: string }> = [];
        const stateRegistry = {
            get: mock.fn(() => state),
            save: mock.fn((nextState: typeof state) => {
                saves.push({
                    ...nextState,
                    framework: { ...nextState.framework },
                    agents: {
                        gemini: { ...nextState.agents.gemini },
                        codex: { ...nextState.agents.codex },
                        autobot: { ...nextState.agents.autobot },
                        droid: { ...nextState.agents.droid },
                    },
                    blackboard: [...(nextState.blackboard || [])],
                });
            }),
            postToBlackboard: mock.fn((entry: { from: string; to: string; message: string; type: string }) => {
                blackboardPosts.push(entry);
                state.blackboard = [...state.blackboard, { ...entry, at: Date.now() }];
            }),
            updateMission: mock.fn(),
            updateFramework: mock.fn(),
        };

        return { state, saves, blackboardPosts, stateRegistry, agentId };
    }

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

    it('allows pennyone search observation calls from the CLI without an Augury block', async () => {
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

    it('allows pennyone normalize maintenance calls from the CLI without an Augury block', async () => {
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

    it('allows pennyone report observation calls from the CLI without an Augury block', async () => {
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

    it('rejects malformed chant Augury blocks from the CLI before execution', async () => {
        const workspaceRoot = registry.getRoot();
        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'should not execute',
            })),
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {}, updateFramework: () => {} },
            activePersona: { name: 'ALFRED' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:chant',
            payload: {
                query: `// Corvus Star Augury [Ω]
Intent: malformed chant trace
Selection: orchestrate
Trajectory: STABLE
Confidence: 1.4`,
                project_root: workspaceRoot,
                cwd: workspaceRoot,
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

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /machine-valid/);
        assert.match(result.error ?? '', /Missing Intent Category/);
        assert.match(result.error ?? '', /Selection must follow/);
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
    });

    it('accepts machine-valid chant Augury blocks from the CLI', async () => {
        const workspaceRoot = registry.getRoot();
        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'chant accepted',
            })),
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: () => {}, updateFramework: () => {} },
            activePersona: { name: 'ALFRED' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:chant',
            payload: {
                query: `// Corvus Star Augury [Ω]
Intent Category: ORCHESTRATE
Intent: Make chant the only intake gate
Selection: WEAVE: orchestrate
Trajectory: STABLE: Persist and surface the designation for agents.
Mimir's Well: ◈ CStar/AGENTS.qmd | ◈ src/node/core/runtime/dispatcher.ts
Gungnir Verdict: [L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]
Confidence: 0.94

Seed the Hall contract for the scheduler migration.`,
                project_root: workspaceRoot,
                cwd: workspaceRoot,
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

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'chant accepted');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 1);
    });

    it('synthesizes a runtime Augury contract for direct CLI executions without a human-authored Augury block', async () => {
        const workspaceRoot = registry.getRoot();
        const mockAdapter = {
            id: 'weave:evolve',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:evolve',
                status: 'SUCCESS',
                output: 'evolve accepted',
            })),
        };

        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: { updateMission: mock.fn(), updateFramework: () => {} },
            activePersona: { name: 'ALFRED' },
        });
        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:evolve',
            payload: {
                action: 'propose',
                bead_id: 'bead-runtime-1',
                project_root: workspaceRoot,
                cwd: workspaceRoot,
                source: 'cli',
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

        assert.strictEqual(result.status, 'SUCCESS');
        const auguryContract = result.metadata?.augury_contract as Record<string, any>;
        assert.equal(auguryContract.intent_category, 'EVOLVE');
        assert.equal(auguryContract.intent, 'Evolve bead bead-runtime-1.');
        assert.equal(auguryContract.selection_tier, 'WEAVE');
        assert.equal(auguryContract.selection_name, 'evolve');
        assert.equal(auguryContract.trajectory_status, 'STABLE');
        assert.equal(auguryContract.trajectory_reason, 'Dispatcher synthesized the designation from the explicit weave invocation.');
        assert.deepEqual(auguryContract.mimirs_well, ['src/node/core/runtime/dispatcher.ts']);
        assert.equal(auguryContract.confidence, 0.72);
        assert.equal(auguryContract.canonical_intent, 'Evolve bead bead-runtime-1.');
        assert.equal(auguryContract.council_expert?.label, 'CARMACK');
        assert.match(auguryContract.council_expert?.root_persona_directive ?? '', /performance pragmatist/i);
        assert.equal(result.metadata?.council_expert, auguryContract.council_expert);
        assert.equal(result.metadata?.root_persona_directive, auguryContract.council_expert?.root_persona_directive);
        assert.strictEqual(result.metadata?.augury_designation_source, 'dispatcher_synthesized');
        assert.deepEqual(result.metadata?.trace_contract, result.metadata?.augury_contract);
        assert.strictEqual(result.metadata?.trace_designation_source, 'dispatcher_synthesized');
        const executionBead = getHallBead(String(result.metadata?.execution_bead_id));
        assert.equal(executionBead?.status, 'RESOLVED');
        assert.deepEqual(executionBead?.metadata?.augury_contract, result.metadata?.augury_contract);
        assert.deepEqual(executionBead?.metadata?.trace_contract, result.metadata?.augury_contract);
    });

    it('routes agent-native skill beads through the host bridge while still recording runtime mission state', async () => {
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
        assert.strictEqual(updateMission.mock.callCount(), 1);
    });

    it('marks the agent WORKING then SLEEPING and posts a blackboard event during successful dispatch', async () => {
        const workspaceRoot = registry.getRoot();
        const fixture = createAgentStateFixture('gemini');
        const mockAdapter = {
            id: 'weave:test-state',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:test-state',
                status: 'SUCCESS',
                output: 'state transition complete',
            })),
        };
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: fixture.stateRegistry,
            activePersona: { name: 'ALFRED' },
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:test-state',
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'state transition complete');
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
        assert.strictEqual(fixture.saves.length, 2);
        assert.strictEqual(fixture.saves[0].agents.gemini.status, 'WORKING');
        assert.ok(fixture.saves[0].agents.gemini.active_bead_id);
        assert.strictEqual(fixture.saves[1].agents.gemini.status, 'SLEEPING');
        assert.strictEqual(fixture.saves[1].agents.gemini.active_bead_id, undefined);
        assert.strictEqual(fixture.blackboardPosts.length, 1);
        assert.match(fixture.blackboardPosts[0].message, /^Starting task: weave:test-state :: /);
        assert.strictEqual(fixture.blackboardPosts[0].from, 'ALFRED');
        assert.strictEqual(fixture.blackboardPosts[0].to, 'gemini');
    });

    it('still restores the agent to SLEEPING and posts the blackboard event when dispatch fails', async () => {
        const workspaceRoot = registry.getRoot();
        const fixture = createAgentStateFixture('gemini');
        const mockAdapter = {
            id: 'weave:test-failure',
            execute: mock.fn(async (): Promise<WeaveResult> => {
                throw new Error('Explosion');
            }),
        };
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            resolveEstateTarget: () => ({ workspaceRoot, targetDomain: 'brain', requestedRoot: workspaceRoot }),
            // @ts-ignore
            stateRegistry: fixture.stateRegistry,
            activePersona: { name: 'ALFRED' },
        });

        dispatcher.registerAdapter(mockAdapter);

        const result = await dispatcher.dispatch({
            weave_id: 'weave:test-failure',
            payload: {},
            session: {
                mode: 'subkernel',
                interactive: false,
            },
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.ok(result.error?.includes('catastrophic failure: Explosion'));
        assert.strictEqual(mockAdapter.execute.mock.callCount(), 1);
        assert.strictEqual(fixture.saves.length, 2);
        assert.strictEqual(fixture.saves[0].agents.gemini.status, 'WORKING');
        assert.strictEqual(fixture.saves[1].agents.gemini.status, 'SLEEPING');
        assert.strictEqual(fixture.blackboardPosts.length, 1);
        assert.match(fixture.blackboardPosts[0].message, /^Starting task: weave:test-failure :: /);
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

        const originalProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        const originalWorkspaceRoot = process.env.CSTAR_WORKSPACE_ROOT;
        process.env.CSTAR_PROJECT_ROOT = tmpRoot;
        process.env.CSTAR_WORKSPACE_ROOT = tmpRoot;

        try {
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
                    query: '// Corvus Star Augury [Ω]\nIntent: test direct weave path',
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
        } finally {
            if (originalProjectRoot === undefined) {
                delete process.env.CSTAR_PROJECT_ROOT;
            } else {
                process.env.CSTAR_PROJECT_ROOT = originalProjectRoot;
            }
            if (originalWorkspaceRoot === undefined) {
                delete process.env.CSTAR_WORKSPACE_ROOT;
            } else {
                process.env.CSTAR_WORKSPACE_ROOT = originalWorkspaceRoot;
            }
        }
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
