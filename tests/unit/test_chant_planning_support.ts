import assert from 'node:assert/strict';

import type {
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';
import {
    getHallPlanningSession,
    saveHallOneMindBranch,
} from '../../src/tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

export class NoopDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
            metadata: {},
        };
    }
}

export class InspectPlanningDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        const sessionId = 'chant-session:TRACE-PLAN';
        if (invocation.weave_id === 'weave:research') {
            const session = getHallPlanningSession(sessionId);
            assert.ok(session);
            assert.equal(session?.status, 'INTENT_RECEIVED');
            assert.match(session?.summary ?? '', /Initiating Research Phase/i);
            assert.equal(session?.metadata?.phase_in_flight, 'weave:research');
            const workspaceRoot = String((invocation.payload as { project_root?: string }).project_root);

            const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));
            const now = Date.now();
            saveHallOneMindBranch({
                branch_id: 'research:TRACE-PLAN:bounded-runtime-improvement:0',
                repo_id: repoId,
                source_weave: 'weave:research',
                branch_group_id: 'research:TRACE-PLAN:bounded-runtime-improvement',
                branch_kind: 'research',
                branch_label: 'layout',
                branch_index: 0,
                status: 'COMPLETED',
                provider: 'codex',
                trace_id: 'TRACE-PLAN',
                summary: 'Layout findings stay bounded.',
                artifacts: ['README.md'],
                metadata: {
                    intent: 'plan a bounded runtime improvement',
                    branch_count: 2,
                },
                created_at: now,
                updated_at: now,
            }, workspaceRoot);
            saveHallOneMindBranch({
                branch_id: 'research:TRACE-PLAN:bounded-runtime-improvement:1',
                repo_id: repoId,
                source_weave: 'weave:research',
                branch_group_id: 'research:TRACE-PLAN:bounded-runtime-improvement',
                branch_kind: 'research',
                branch_label: 'tests',
                branch_index: 1,
                status: 'COMPLETED',
                provider: 'codex',
                trace_id: 'TRACE-PLAN',
                summary: 'Test surface is narrow.',
                artifacts: ['src/runtime.ts'],
                metadata: {
                    intent: 'plan a bounded runtime improvement',
                    branch_count: 2,
                },
                created_at: now + 1,
                updated_at: now + 1,
            }, workspaceRoot);

            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Repository research complete.',
                metadata: {
                    research_artifacts: ['README.md', 'src/runtime.ts'],
                    research_payload: {
                        summary: 'Repository research complete.',
                        research_artifacts: ['README.md', 'src/runtime.ts'],
                    },
                },
            };
        }

        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'noop',
            metadata: {},
        };
    }
}

export class ArchitectOnlyDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        throw new Error(`Unexpected weave dispatch in ArchitectOnlyDispatchPort: ${invocation.weave_id}`);
    }
}

export function createContext(
    workspaceRoot: string,
    sessionId?: string,
    auguryContract?: RuntimeContext['augury_contract'],
): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT-PLAN',
        trace_id: `TRACE-${sessionId ?? 'PLAN'}`,
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'tui',
        target_domain: 'brain',
        interactive: true,
        session_id: sessionId,
        augury_contract: auguryContract,
        augury_designation_source: auguryContract ? 'dispatcher_synthesized' : undefined,
        trace_contract: auguryContract,
        trace_designation_source: auguryContract ? 'dispatcher_synthesized' : undefined,
        env: {},
        timestamp: Date.now(),
    };
}
