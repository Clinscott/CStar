import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
    AutobotWeavePayload,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.ts';
import { ChantWeave } from '../../src/node/core/runtime/weaves/chant.ts';
import {
    closeDb,
    getDb,
    saveHallEpisodicMemory,
    saveHallPlanningSession,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.ts';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'AutoBot completed bead bead-autobot; no checker was configured.',
            metadata: {
                outcome: 'READY_FOR_REVIEW',
            },
        };
    }
}

function createContext(workspaceRoot: string, sessionId: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CHANT-AUTOBOT',
        trace_id: 'TRACE-CHANT-AUTOBOT',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        session_id: sessionId,
        env: {},
        timestamp: Date.now(),
    };
}

describe('Chant AutoBot handoff', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-autobot-'));
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
                    autobot: { entrypoint_path: '.agents/skills/autobot/scripts/autobot.py' },
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

    it('routes concrete bead execution through AutoBot with a bounded Hall/PennyOne brief', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const sessionId = 'chant-session-autobot';
        const now = Date.now();
        const scanId = 'scan-autobot-runtime';
        const db = getDb();

        db.prepare(`
            INSERT INTO hall_scans (
                scan_id, repo_id, scan_kind, status, baseline_gungnir_score, started_at, completed_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(scanId, repoId, 'test', 'COMPLETED', 0, now, now, '{}');

        db.prepare(`
            INSERT INTO hall_files (
                repo_id, scan_id, path, content_hash, language, gungnir_score, matrix_json,
                imports_json, exports_json, intent_summary, interaction_summary, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            repoId,
            scanId,
            'src/runtime/chant.ts',
            null,
            'typescript',
            0,
            null,
            JSON.stringify([{ source: './helpers', local: 'helper', imported: 'buildPrompt' }]),
            JSON.stringify(['runChant']),
            'Runtime chant entrypoint with a forge handoff boundary.',
            'Reads planning sessions and dispatches the worker weave.',
            now,
        );

        upsertHallBead({
            bead_id: 'bead-autobot',
            repo_id: repoId,
            scan_id: scanId,
            target_kind: 'FILE',
            target_ref: 'src/runtime/chant.ts',
            target_path: 'src/runtime/chant.ts',
            rationale: 'Replace generic worker handoff with an AutoBot execution path.',
            contract_refs: ['contracts:chant-autobot'],
            baseline_scores: { overall: 6.7 },
            acceptance_criteria: 'Chant must delegate implementation to AutoBot with a bounded worker note.',
            status: 'OPEN',
            architect_opinion: 'Keep the worker brief narrow and operational.',
            created_at: now,
            updated_at: now,
        });

        saveHallEpisodicMemory({
            memory_id: 'memory-autobot-1',
            bead_id: 'bead-autobot',
            repo_id: repoId,
            tactical_summary: 'Previous attempt isolated the handoff boundary before touching worker orchestration.',
            files_touched: ['src/runtime/chant.ts'],
            successes: ['Separated planner state from worker dispatch'],
            metadata: {},
            created_at: now,
            updated_at: now,
        });

        saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_CONCRETE',
            user_intent: 'Route implementation beads through AutoBot.',
            normalized_intent: 'Route implementation beads through AutoBot.',
            summary: 'Execute the active chant bead through AutoBot instead of the generic forge path.',
            latest_question: 'Use only the immediate Hall and PennyOne context needed for the next edit.',
            architect_opinion: 'Preserve the planner and keep the worker disposable.',
            current_bead_id: 'bead-autobot',
            created_at: now,
            updated_at: now,
            metadata: {
                checker_shell: 'echo PASS',
                autobot_max_attempts: 2,
            },
        });

        const dispatchPort = new CaptureDispatchPort();
        const chant = new ChantWeave(dispatchPort);
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'proceed',
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
                    session_id: sessionId,
                },
            },
            createContext(tmpRoot, sessionId),
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'BEAD_USER_REVIEW');
        assert.equal(dispatchPort.invocation?.weave_id, 'weave:autobot');

        const autobotPayload = dispatchPort.invocation?.payload as AutobotWeavePayload;
        assert.equal(autobotPayload.bead_id, 'bead-autobot');
        assert.equal(autobotPayload.checker_shell, 'echo PASS');
        assert.equal(autobotPayload.max_attempts, 2);
        assert.match(autobotPayload.worker_note ?? '', /32k AutoBot worker window/i);
        assert.match(autobotPayload.worker_note ?? '', /PennyOne intent summary: Runtime chant entrypoint/i);
        assert.match(autobotPayload.worker_note ?? '', /Recent episodic memory 1: Previous attempt isolated the handoff boundary/i);
        assert.match(autobotPayload.worker_note ?? '', /Latest planning focus: Use only the immediate Hall and PennyOne context/i);
    });
});
