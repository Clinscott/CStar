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
import { ChantWeave } from  '../../src/node/core/runtime/weaves/chant.js';
import {
    closeDb,
    getDb,
    getHallPlanningSession,
    getHallSkillProposal,
    saveHallEpisodicMemory,
    saveHallPlanningSession,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../src/types/hall.js';

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

class PlanningDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        if (invocation.weave_id === 'weave:research') {
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Research complete.',
                metadata: {
                    research_artifacts: ['README.md', 'tests/test_title_slug.py'],
                },
            };
        }

        if (invocation.weave_id === 'weave:architect') {
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Architect proposal synthesis complete.',
                metadata: {
                    architect_proposal: {
                        proposal_summary: 'Build a tiny slug utility with a standard-library-only CLI.',
                        beads: [
                            {
                                id: 'title-slug',
                                title: 'Implement title slug utility',
                                rationale: 'Create the missing utility required by the README smoke task.',
                                targets: ['title_slug.py', 'tests/test_title_slug.py', 'README.md'],
                                depends_on: [],
                                acceptance_criteria: [
                                    'Expose slugify(text: str) -> str.',
                                    'CLI prints a stable slug for the provided title.',
                                    'Bundled unittest suite passes.',
                                ],
                                checker_shell: 'python3 -m unittest discover -s tests -p \'test_*.py\' -q',
                            },
                        ],
                    },
                },
            };
        }

        throw new Error(`Unexpected weave dispatch in planning test: ${invocation.weave_id}`);
    }
}

class TypeScriptPlanningDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        if (invocation.weave_id === 'weave:research') {
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Research complete.',
                metadata: {
                    research_artifacts: ['src/node/core/runtime/weaves/host_governor.ts'],
                },
            };
        }

        if (invocation.weave_id === 'weave:architect') {
            return {
                weave_id: invocation.weave_id,
                status: 'SUCCESS',
                output: 'Architect proposal synthesis complete.',
                metadata: {
                    architect_proposal: {
                        proposal_summary: 'Capture host-governor validation follow-up as a test-only micro-bead.',
                        beads: [
                            {
                                id: 'host-governor-verification',
                                title: 'Add host-governor verification coverage',
                                rationale: 'Preserve the validation contract for host-governor promotion.',
                                targets: ['tests/unit/test_host_governor_runtime.test.ts'],
                                depends_on: [],
                                focus_hint: 'Limit edits to the promotion-validation assertions for host-governor.',
                                acceptance_criteria: [
                                    'Host-governor validation coverage is updated.',
                                    'The TypeScript unit suite remains green.',
                                ],
                                checker_shell: 'node --test tests/unit/test_host_governor_runtime.test.ts',
                            },
                        ],
                    },
                },
            };
        }

        throw new Error(`Unexpected weave dispatch in TypeScript planning test: ${invocation.weave_id}`);
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

    it('routes concrete bead execution through AutoBot with a concise local-worker brief', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const sessionId = 'chant-session-autobot';
        const now = Date.now();
        const scanId = 'scan-autobot-runtime';
        const db = getDb();

        const repos = db.prepare('SELECT repo_id FROM hall_repositories').all();
        console.log(`[DEBUG] Test repoId: ${repoId}, DB repos: ${JSON.stringify(repos)}`);

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
            critique_payload: {
                focus_hint: 'Touch only the handoff branch that dispatches AutoBot and leave the planning loop intact.',
            },
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
        assert.match(autobotPayload.worker_note ?? '', /Local Hermes micro-bead/i);
        assert.match(autobotPayload.worker_note ?? '', /Do not invent imports, dependencies, commands, or files/i);
        assert.match(autobotPayload.worker_note ?? '', /Target path: src\/runtime\/chant\.ts/i);
        assert.match(autobotPayload.worker_note ?? '', /Focus hint: Touch only the handoff branch/i);
        assert.match(autobotPayload.worker_note ?? '', /Checker shell: echo PASS/i);
        assert.match(autobotPayload.worker_note ?? '', /Target file role: Runtime chant entrypoint/i);
        assert.doesNotMatch(autobotPayload.worker_note ?? '', /Recent episodic memory/i);
        assert.doesNotMatch(autobotPayload.worker_note ?? '', /Latest planning focus/i);
        assert.doesNotMatch(autobotPayload.worker_note ?? '', /PennyOne imports/i);
    });

    it('persists architect proposals as OPEN chant beads before the SET gate', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const dispatchPort = new PlanningDispatchPort();
        const chant = new ChantWeave(dispatchPort);
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'Implement the README utility.',
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
            {
                mission_id: 'MISSION-CHANT-PROPOSAL',
                trace_id: 'TRACE-CHANT-PROPOSAL',
                persona: 'ALFRED',
                workspace_root: tmpRoot,
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const session = getHallPlanningSession('chant-session:TRACE-CHANT-PROPOSAL');
        assert.ok(session);
        assert.equal(session?.status, 'PROPOSAL_REVIEW');
        assert.ok(session?.current_bead_id);
        assert.match(result.output, /mark it SET/i);

        const proposal = getHallSkillProposal('proposal:chant-session:TRACE-CHANT-PROPOSAL:title-slug');
        assert.ok(proposal);
        assert.equal(proposal?.status, 'PROPOSED');
        assert.equal(proposal?.bead_id, session?.current_bead_id);
        assert.equal(proposal?.target_path, 'title_slug.py');

        const bead = getDb().prepare(`
            SELECT bead_id, status, target_path, acceptance_criteria, checker_shell, source_kind, contract_refs_json
            FROM hall_beads
            WHERE bead_id = ?
        `).get(session?.current_bead_id) as {
            bead_id: string;
            status: string;
            target_path: string | null;
            acceptance_criteria: string | null;
            checker_shell: string | null;
            source_kind: string | null;
            contract_refs_json: string | null;
        } | undefined;

        assert.ok(bead);
        assert.equal(bead?.status, 'OPEN');
        assert.equal(bead?.target_path, 'title_slug.py');
        assert.equal(bead?.source_kind, 'CHANT');
        assert.match(bead?.acceptance_criteria ?? '', /slugify/);
        assert.equal(bead?.checker_shell, 'python3 -m unittest discover -s tests -p \'test_*.py\' -q');
        assert.match(bead?.contract_refs_json ?? '', /tests\/test_title_slug\.py/);
        assert.equal(session?.repo_id, repoId);
    });

    it('normalizes CStar TypeScript checker commands and retains test-only contract refs', async () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        fs.mkdirSync(path.join(tmpRoot, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'scripts', 'run-tsx.mjs'), '// stub\n', 'utf-8');

        const chant = new ChantWeave(new TypeScriptPlanningDispatchPort());
        const result = await chant.execute(
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'Plan a host-governor validation follow-up.',
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
            {
                mission_id: 'MISSION-CHANT-TS-NORMALIZE',
                trace_id: 'TRACE-CHANT-TS-NORMALIZE',
                persona: 'ALFRED',
                workspace_root: tmpRoot,
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.planning_status, 'PROPOSAL_REVIEW');

        const session = getHallPlanningSession('chant-session:TRACE-CHANT-TS-NORMALIZE');
        assert.ok(session);
        assert.equal(session?.repo_id, repoId);
        assert.ok(session?.current_bead_id);

        const bead = getDb().prepare(`
            SELECT checker_shell, contract_refs_json, target_path, critique_payload_json
            FROM hall_beads
            WHERE bead_id = ?
        `).get(session?.current_bead_id) as {
            checker_shell: string | null;
            contract_refs_json: string | null;
            target_path: string | null;
            critique_payload_json: string | null;
        } | undefined;

        assert.ok(bead);
        assert.equal(bead?.target_path, 'tests/unit/test_host_governor_runtime.test.ts');
        assert.equal(bead?.checker_shell, 'node scripts/run-tsx.mjs --test tests/unit/test_host_governor_runtime.test.ts');
        assert.match(bead?.contract_refs_json ?? '', /tests\/unit\/test_host_governor_runtime\.test\.ts/);
        assert.match(bead?.critique_payload_json ?? '', /promotion-validation assertions/i);
    });
});
