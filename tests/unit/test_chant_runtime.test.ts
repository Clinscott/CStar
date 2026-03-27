import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildChantInvocation } from  '../../src/node/core/commands/dispatcher.js';
import { ChantWeave } from  '../../src/node/core/runtime/weaves/chant.js';
import type { RuntimeDispatchPort, RuntimeContext, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import { closeDb, getHallPlanningSession } from  '../../src/tools/pennyone/intel/database.js';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'child execution complete.',
            metadata: { emitted_beads: [] },
        };
    }
}

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT',
        trace_id: 'TRACE-CHANT',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Chant runtime remap (CS-P1-11)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                skills: {
                    chant: { entrypoint_path: '.agents/skills/chant/scripts/chant.py' },
                    scan: { entrypoint_path: '.agents/skills/scan/scripts/scan.py' },
                },
            }),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
    });

    it('builds a canonical chant invocation from the CLI fallback', () => {
        assert.deepEqual(
            buildChantInvocation(['ravens', 'status'], tmpRoot, tmpRoot),
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'ravens status',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
        );
    });

    it('resolves a structured chant into a runtime weave and records success', async () => {
        const dispatchPort = new CaptureDispatchPort();
        const chant = new ChantWeave(dispatchPort);

        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'ravens status',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(dispatchPort.invocation?.weave_id, 'weave:ravens');
        assert.equal((dispatchPort.invocation?.payload as { action: string }).action, 'status');
    });

    it('understands natural-language ravens release prompts', async () => {
        const dispatchPort = new CaptureDispatchPort();
        const chant = new ChantWeave(dispatchPort);

        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'release the ravens to fly over this repo',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(dispatchPort.invocation?.weave_id, 'weave:ravens');
        assert.equal((dispatchPort.invocation?.payload as { action: string }).action, 'cycle');
    });

    it('returns a collaborative follow-up envelope instead of unresolved failure', async () => {
        const chant = new ChantWeave(new CaptureDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'contemplate the void',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'RESEARCH_PHASE');
        assert.ok(typeof result.metadata?.planning_session_id === 'string');

        const session = getHallPlanningSession(String(result.metadata?.planning_session_id));
        assert.ok(session);
        assert.equal(session?.status, 'RESEARCH_PHASE');
    });

    it('returns a structured missing capability envelope', async () => {
        const chant = new ChantWeave(new CaptureDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'use impossible-skill',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /not installed/i);
        assert.equal(result.metadata?.resolution, 'missing_capability');
    });

    it('returns a policy-only envelope for direct spell execution requests', async () => {
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    silver_shield: {
                        tier: 'SPELL',
                        spell_classification: 'policy-only',
                        host_support: {
                            codex: 'policy-only',
                        },
                    },
                },
            }),
            'utf-8',
        );

        const chant = new ChantWeave(new CaptureDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'use silver_shield',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.resolution, 'policy_only');
        assert.equal(result.metadata?.spell_classification, 'policy-only');
    });

    it('returns an unsupported-host envelope sourced from registry metadata', async () => {
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    hall: {
                        tier: 'PRIME',
                        execution: { mode: 'agent-native', cli: 'cstar hall' },
                        host_support: {
                            codex: 'unsupported',
                        },
                    },
                },
            }),
            'utf-8',
        );

        const chant = new ChantWeave(new CaptureDispatchPort());
        const context = createContext(tmpRoot);
        context.env = { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-chant' };

        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'use hall',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: tmpRoot,
                    requested_path: tmpRoot,
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
            context,
        );

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.resolution, 'unsupported_host');
        assert.equal(result.metadata?.host_support_status, 'unsupported');
    });
});
