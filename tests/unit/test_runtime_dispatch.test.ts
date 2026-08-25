import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bootstrapRuntime } from '../../src/node/core/runtime/bootstrap.js';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

type EffectCounts = {
    adapter: number;
    provider: number;
    state: number;
};

class TrapAdapter implements RuntimeAdapter<Record<string, unknown>> {
    public constructor(
        public readonly id: string,
        private readonly effects: EffectCounts,
    ) {}

    public async execute(
        _invocation: WeaveInvocation<Record<string, unknown>>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        this.effects.adapter += 1;
        throw new Error('trap adapter must never execute');
    }
}

function createEffectHarness(root: string): {
    dispatcher: RuntimeDispatcher;
    effects: EffectCounts;
} {
    const effects: EffectCounts = { adapter: 0, provider: 0, state: 0 };
    const countState = () => {
        effects.state += 1;
        return undefined;
    };
    const stateRegistry = {
        get: countState,
        save: countState,
        updateMission: countState,
        updateFramework: countState,
        postToBlackboard: countState,
    };
    const dispatcher = RuntimeDispatcher.createIsolated({
        stateRegistry: stateRegistry as never,
        resolveEstateTarget: (() => ({
            workspaceRoot: root,
            targetDomain: 'brain' as const,
            requestedRoot: root,
        })) as never,
        hostTextInvoker: (async () => {
            effects.provider += 1;
            throw new Error('provider trap must never execute');
        }) as never,
    });
    return { dispatcher, effects };
}

function snapshotTree(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const rows: string[] = [];
    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
            if (entry.isDirectory()) {
                rows.push(`${relative}/`);
                visit(absolute);
            } else {
                rows.push(`${relative}:${fs.readFileSync(absolute).toString('hex')}`);
            }
        }
    };
    visit(root);
    return rows.sort();
}

function invocation(id: string, root: string): WeaveInvocation<Record<string, unknown>> {
    return {
        weave_id: id,
        payload: {},
        target: { domain: 'brain', workspace_root: root, requested_path: root },
        session: { mode: 'subkernel', interactive: false },
    };
}

describe('retired Node runtime boundary', () => {
    it('bootstraps an exact empty adapter inventory without environment or registry mutation', () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        const beforeEnv = { ...process.env };
        const beforeRegistryRoot = registry.getRoot();

        try {
            bootstrapRuntime(dispatcher);
            assert.deepStrictEqual(dispatcher.listAdapterIds(), []);
            assert.deepStrictEqual({ ...process.env }, beforeEnv);
            assert.equal(registry.getRoot(), beforeRegistryRoot);
        } finally {
            for (const key of Object.keys(process.env)) {
                if (!(key in beforeEnv)) delete process.env[key];
            }
            Object.assign(process.env, beforeEnv);
            registry.setRoot(beforeRegistryRoot);
        }
    });

    it('does not dynamically register a registry-declared legacy adapter', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-empty-bootstrap-'));
        const previousRoot = process.env.CSTAR_PROJECT_ROOT;
        try {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                entries: {
                    legacy: {
                        runtime_trigger: 'legacy',
                        execution: { mode: 'kernel-backed', adapter_id: 'weave:legacy' },
                    },
                },
            }));
            process.env.CSTAR_PROJECT_ROOT = root;
            const before = snapshotTree(root);
            const dispatcher = RuntimeDispatcher.createIsolated();

            bootstrapRuntime(dispatcher);

            assert.deepStrictEqual(dispatcher.listAdapterIds(), []);
            assert.deepStrictEqual(snapshotTree(root), before);
        } finally {
            if (previousRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
            else process.env.CSTAR_PROJECT_ROOT = previousRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    for (const id of ['weave:unknown', 'weave:orchestrate', 'weave:host-governor']) {
        it(`rejects ${id} before state, provider, adapter, or filesystem effects`, async () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-runtime-refusal-'));
            const beforeRegistryRoot = registry.getRoot();
            const previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
            try {
                process.env.CSTAR_PROJECT_ROOT = root;
                const before = snapshotTree(root);
                const { dispatcher, effects } = createEffectHarness(root);
                assert.throws(
                    () => dispatcher.registerAdapter(new TrapAdapter(id, effects)),
                    new RegExp(`legacy_runtime_adapter_registration_retired:${id}`),
                );
                assert.deepStrictEqual(dispatcher.listAdapterIds(), []);

                const result = await dispatcher.dispatch(invocation(id, root));

                assert.equal(result.status, 'FAILURE');
                assert.equal(result.metadata?.execution_dispatched, false);
                assert.equal(result.metadata?.hall_mutation_started, false);
                assert.equal(result.metadata?.provider_attempted, false);
                assert.equal(result.metadata?.process_started, false);
                assert.equal(result.metadata?.source_access_started, false);
                assert.deepStrictEqual(effects, { adapter: 0, provider: 0, state: 0 });
                assert.deepStrictEqual(snapshotTree(root), before);
                assert.equal(registry.getRoot(), beforeRegistryRoot);
            } finally {
                if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
                else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
                registry.setRoot(beforeRegistryRoot);
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    }

    it('rejects a registry-declared host-only skill before every execution effect', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-host-only-'));
        const beforeRegistryRoot = registry.getRoot();
        const previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        try {
            process.env.CSTAR_PROJECT_ROOT = root;
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                entries: {
                    'corvus-forge': {
                        entry_surface: 'host-only',
                        execution: {
                            mode: 'agent-native',
                            ownership_model: 'host-workflow',
                            adapter_id: 'corvus-forge',
                        },
                    },
                },
            }));
            const before = snapshotTree(root);
            const { dispatcher, effects } = createEffectHarness(root);
            assert.throws(
                () => dispatcher.registerAdapter(new TrapAdapter('corvus-forge', effects)),
                /legacy_runtime_adapter_registration_retired:corvus-forge/,
            );
            assert.deepStrictEqual(dispatcher.listAdapterIds(), []);

            const result = await dispatcher.dispatch({
                id: 'activation:forbidden',
                skill_id: 'corvus-forge',
                target_path: root,
                intent: 'attempt forbidden kernel execution',
                params: {},
                status: 'PENDING',
                priority: 1,
            });

            assert.equal(result.status, 'FAILURE');
            assert.equal(result.metadata?.execution_dispatched, false);
            assert.equal(result.metadata?.hall_mutation_started, false);
            assert.equal(result.metadata?.provider_attempted, false);
            assert.equal(result.metadata?.process_started, false);
            assert.equal(result.metadata?.source_access_started, false);
            assert.deepStrictEqual(effects, { adapter: 0, provider: 0, state: 0 });
            assert.deepStrictEqual(snapshotTree(root), before);
            assert.equal(registry.getRoot(), beforeRegistryRoot);
        } finally {
            if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
            else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
            registry.setRoot(beforeRegistryRoot);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps registry-declared calculus compatibility out of runtime dispatch', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-calculus-compat-'));
        const previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        try {
            process.env.CSTAR_PROJECT_ROOT = root;
            fs.mkdirSync(path.join(root, '.agents'));
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                entries: {
                    calculus: {
                        id: 'calculus',
                        entry_surface: 'compatibility',
                        execution: {
                            mode: 'compatibility',
                            adapter_id: 'prime:calculus',
                            ownership_model: 'kernel-primitive',
                        },
                    },
                },
            }));
            const dispatcher = RuntimeDispatcher.createIsolated();
            bootstrapRuntime(dispatcher);
            const before = snapshotTree(root);

            const result = await dispatcher.dispatch(invocation('calculus', root));

            assert.equal(result.status, 'FAILURE');
            assert.equal(
                result.metadata?.failure_code,
                'legacy_runtime_capability_retired_use_cstar_kernel',
            );
            assert.deepEqual(dispatcher.listAdapterIds(), []);
            assert.deepEqual(snapshotTree(root), before);
        } finally {
            if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
            else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('contains no generic Hall lifecycle, host callback, or provider-selection path', () => {
        const source = fs.readFileSync(
            new URL('../../src/node/core/runtime/dispatcher.ts', import.meta.url),
            'utf8',
        );
        for (const forbidden of [
            'dispatch_lifecycle',
            'dispatchAgentNativeSkill',
            'getHallBead',
            'upsertMissionBead',
            'upsertExecutionBead',
            'finalizeExecutionResult',
            'resolveHostProvider',
            'updateMission(',
            'postToBlackboard(',
        ]) {
            assert.equal(source.includes(forbidden), false, `dispatcher retained ${forbidden}`);
        }
    });
});
