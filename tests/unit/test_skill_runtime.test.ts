import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SkillBead } from '../../src/node/core/skills/types.js';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { UniversalAdapter } from '../../src/node/core/runtime/universal_adapter.js';
import {
    PythonSkillAdapter,
    RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE,
} from '../../src/node/core/runtime/python_adapter.js';

function assertRetiredAdapterFailure(result: Awaited<ReturnType<UniversalAdapter['execute']>>): void {
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.error, RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE);
    assert.equal(result.metadata?.failure_code, RETIRED_UNIVERSAL_PYTHON_ADAPTER_FAILURE);
    assert.deepEqual(
        {
            execution_dispatched: result.metadata?.execution_dispatched,
            hall_mutation_started: result.metadata?.hall_mutation_started,
            provider_attempted: result.metadata?.provider_attempted,
            process_started: result.metadata?.process_started,
            source_access_started: result.metadata?.source_access_started,
        },
        {
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        },
    );
}

describe('retired skill runtime contract', () => {
    let root: string;
    let previousProjectRoot: string | undefined;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-skill-runtime-'));
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        process.env.CSTAR_PROJECT_ROOT = root;
    });

    afterEach(() => {
        if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
        else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects adapter registration and retains an exact empty inventory', () => {
        const manager = RuntimeDispatcher.createIsolated();
        const adapter = {
            id: 'mock_skill',
            async execute() {
                throw new Error('must not execute');
            },
        };

        assert.throws(
            () => manager.registerAdapter(adapter as any),
            /legacy_runtime_adapter_registration_retired:mock_skill/,
        );
        assert.deepStrictEqual(manager.listAdapterIds(), []);
    });

    it('refuses a registry-declared skill because no Node adapter is authorized', async () => {
        fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
            entries: {
                mock_skill: {
                    entry_surface: 'cli',
                    execution: {
                        mode: 'kernel-backed',
                        ownership_model: 'kernel-primitive',
                        adapter_id: 'mock_skill',
                    },
                },
            },
        }));
        const manager = RuntimeDispatcher.createIsolated();
        const bead: SkillBead = {
            id: 'bead_001',
            skill_id: 'mock_skill',
            target_path: 'src/mock.ts',
            intent: 'Prove the retired Node skill cutoff.',
            params: {},
            status: 'PENDING',
            priority: 1,
        };

        const result = await manager.dispatch(bead);

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.failure_code, 'runtime_adapter_not_registered');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });

    it('fails closed for an unknown skill without execution', async () => {
        fs.writeFileSync(
            path.join(root, '.agents', 'skill_registry.json'),
            JSON.stringify({ entries: {} }),
        );
        const manager = RuntimeDispatcher.createIsolated();
        const bead: SkillBead = {
            id: 'bead_002',
            skill_id: 'unknown_skill',
            target_path: 'src/mock.ts',
            intent: 'Expect a bounded failure.',
            params: {},
            status: 'PENDING',
            priority: 1,
        };

        const result = await manager.dispatch(bead);

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.failure_code, 'runtime_registry_entry_missing');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });

    it('tombstones host-workflow entries through direct universal construction', async () => {
        const adapter = new UniversalAdapter('mock_host_workflow', {
            tier: 'WEAVE',
            description: 'Host-native workflow record',
            execution: {
                mode: 'agent-native',
                cli: 'echo should-not-run',
                ownership_model: 'host-workflow',
            },
        });

        const result = await adapter.execute(
            { weave_id: 'mock_host_workflow', payload: {} },
            universalContext(root),
        );

        assertRetiredAdapterFailure(result);
    });

    it('tombstones agent-native entries through direct universal construction', async () => {
        const adapter = new UniversalAdapter('mock_agent_native', {
            tier: 'SKILL',
            description: 'Legacy agent-native CLI record',
            execution: { mode: 'agent-native', cli: 'echo should-not-run' },
        });

        const result = await adapter.execute(
            { weave_id: 'mock_agent_native', payload: { query: 'test' } },
            universalContext(root),
        );

        assertRetiredAdapterFailure(result);
    });

    it('does not execute a registry script through the universal adapter', async () => {
        const marker = path.join(root, 'universal-adapter-executed');
        const script = path.join(root, 'legacy.py');
        fs.writeFileSync(script, `from pathlib import Path\nPath(${JSON.stringify(marker)}).touch()\n`);
        const adapter = new UniversalAdapter('mock_kernel_script', {
            tier: 'SKILL',
            description: 'Retired generic script route',
            execution: { mode: 'kernel-backed', script_path: script },
        });

        const result = await adapter.execute(
            { weave_id: 'mock_kernel_script', payload: { live: true } },
            universalContext(root),
        );

        assertRetiredAdapterFailure(result);
        assert.equal(fs.existsSync(marker), false);
    });

    it('does not execute a script through direct Python adapter construction', async () => {
        const marker = path.join(root, 'python-adapter-executed');
        const script = path.join(root, 'legacy-direct.py');
        fs.writeFileSync(script, `from pathlib import Path\nPath(${JSON.stringify(marker)}).touch()\n`);
        const adapter = new PythonSkillAdapter('mock_direct_python', script);

        const result = await adapter.execute(
            { weave_id: 'mock_direct_python', payload: { live: true } },
            universalContext(root),
        );

        assertRetiredAdapterFailure(result);
        assert.equal(fs.existsSync(marker), false);
    });
});

function universalContext(root: string) {
    return {
        mission_id: 'MISSION-1',
        bead_id: 'bead-1',
        trace_id: 'trace-1',
        persona: '',
        workspace_root: root,
        operator_mode: 'subkernel' as const,
        target_domain: 'brain' as const,
        interactive: false,
        env: {},
        timestamp: Date.now(),
    };
}
