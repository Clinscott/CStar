import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ChantWeave } from '../../src/node/core/runtime/weaves/chant.ts';
import type { RuntimeDispatchPort, RuntimeContext, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';
import { closeDb, getHallPlanningSession } from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';

class NoopDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
            metadata: {},
        };
    }
}

function createContext(workspaceRoot: string, sessionId?: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT-PLAN',
        trace_id: `TRACE-${sessionId ?? 'PLAN'}`,
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'tui',
        target_domain: 'brain',
        interactive: true,
        session_id: sessionId,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Chant collaborative planning (CS-P7-03)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-plan-'));
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

    it('advances collaborative planning into proposal review for a concrete request', async () => {
        const chant = new ChantWeave(new NoopDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'plan how to improve the Corvus Star chant system for mounted repos and orchestration',
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
                    mode: 'tui',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const sessionId = String(result.metadata?.planning_session_id);
        const session = getHallPlanningSession(sessionId);
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
    });

    it('maintains a multi-turn planning session across follow-up prompts', async () => {
        const chant = new ChantWeave(new NoopDispatchPort());
        const first = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'help me improve this',
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
                    mode: 'tui',
                    interactive: true,
                },
            },
            createContext(tmpRoot),
        );

        const sessionId = String(first.metadata?.planning_session_id);
        assert.equal(first.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const second = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'target the ravens repo sweep and prepare a bead for orchestration',
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
                    mode: 'tui',
                    interactive: true,
                    session_id: sessionId,
                },
            },
            createContext(tmpRoot, sessionId),
        );

        assert.equal(second.status, 'TRANSITIONAL');
        assert.equal(second.metadata?.planning_status, 'PROPOSAL_REVIEW');
        assert.equal(second.metadata?.planning_session_id, sessionId);

        const session = getHallPlanningSession(sessionId);
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
        assert.match(session?.normalized_intent ?? '', /FOLLOW_UP:/);
    });
});
