import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildAuguryDoctorPayload,
    buildAuguryExplainPayload,
    buildTraceFailuresPayload,
    buildTraceStatusPayload,
    renderTraceFailureLines,
    renderTraceStatusLines,
} from '../../src/node/core/commands/trace.js';
import { closeDb, listHallPlanningSessions, saveHallPlanningSession, upsertHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

function stripAnsi(value: string): string {
    return value.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

function makeSecureTemporaryRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), prefix));
    fs.chmodSync(root, 0o700);
    return root;
}

describe('Trace command runtime and recovery', () => {
    it('surfaces failure diagnostics when the active session is stalled', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-trace-failure-');
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        const session: any = {
            session_id: 'chant-session:TRACE-FAILURE',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FAILED',
            user_intent: 'repair planner',
            normalized_intent: 'repair planner',
            summary: 'Research Phase failed.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-FAILURE',
                failure_phase: 'weave:research',
                failure_error: 'research delegated execution timeout after 5ms',
                recovery_hint: 'Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.',
                failure_timestamp: now,
            },
        };

        const payload = buildTraceStatusPayload(session, tmpRoot);
        assert.equal(payload?.trace_id, 'TRACE-FAILURE');
        assert.equal(payload?.session_id, 'chant-session:TRACE-FAILURE');
        assert.equal(payload?.handle, 'TRACE-FAILURE');
        assert.equal(payload?.status, 'FAILED');
        assert.equal(payload?.updated_at, now);
        assert.equal(payload?.updated_at_iso, new Date(now).toISOString());
        assert.equal(payload?.focus, 'Research Phase failed.');
        assert.deepEqual(payload?.bead_summary, {
            total: 0,
            set: 0,
            open: 0,
            review: 0,
        });
        assert.deepEqual(payload?.artifacts, []);
        assert.deepEqual(payload?.failure, {
            phase: 'weave:research',
            error: 'research delegated execution timeout after 5ms',
            recovery_hint: 'Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.',
            failed_at: now,
        });
        assert.equal(payload?.agent_handoff.execution_gate, 'failure_recovery');
        assert.equal(payload?.agent_handoff.phase, 'weave:research');
        assert.equal(payload?.agent_handoff.next_action, 'Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.');
        assert.equal(payload?.agent_handoff.resume_command, 'cstar hall "chant-session:TRACE-FAILURE"');
        assert.deepEqual(payload?.agent_handoff.target_paths, []);
        assert.deepEqual(payload?.agent_handoff.work_items, []);
        assert.deepEqual(payload?.branches, []);

        const lines = renderTraceStatusLines(session, tmpRoot).map(stripAnsi);
        assert.equal(lines[0], '[TRACE] FAILED TRACE-FAILURE');
        assert.match(lines[1] ?? '', /focus=Research Phase failed\./);
        assert.equal(lines[2], `updated=${new Date(now).toISOString()}`);
        assert.equal(lines[3], 'beads total=0 set=0 open=0 review=0');
        assert.equal(lines[4], 'gate=failure_recovery');
        assert.equal(lines[5], 'resume=cstar hall "chant-session:TRACE-FAILURE"');
        assert.ok(lines.includes('failure_phase=weave:research'));
        assert.ok(lines.includes('failure_error=research delegated execution timeout after 5ms'));
        assert.ok(lines.includes('next=Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.'));

        closeDb();
    });

    it('lists recent failed planning sessions in newest-first order', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-trace-failures-list-');
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const base = Date.now();

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-FAIL-OLD',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FAILED',
            user_intent: 'old failure',
            normalized_intent: 'old failure',
            summary: 'Research Phase failed.',
            created_at: base,
            updated_at: base,
            metadata: {
                trace_id: 'TRACE-FAIL-OLD',
                failure_phase: 'weave:research',
                failure_error: 'old timeout',
                recovery_hint: 'Inspect research.',
                failure_timestamp: base,
            },
        });

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-FAIL-NEW',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FAILED',
            user_intent: 'new failure',
            normalized_intent: 'new failure',
            summary: 'Architect synthesis failed.',
            created_at: base + 10,
            updated_at: base + 20,
            metadata: {
                trace_id: 'TRACE-FAIL-NEW',
                failure_phase: 'chant:architect-service',
                failure_error: 'host session inactive',
                recovery_hint: 'Restore host planning provider.',
                failure_timestamp: base + 20,
            },
        });

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-ACTIVE',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'active session',
            normalized_intent: 'active session',
            summary: 'Proposal ready.',
            created_at: base + 30,
            updated_at: base + 30,
            metadata: {
                trace_id: 'TRACE-ACTIVE',
            },
        });

        const failedSessions = listHallPlanningSessions(tmpRoot, { statuses: ['FAILED'] });

        const payload = buildTraceFailuresPayload(failedSessions, tmpRoot);
        assert.equal(payload.count, 2);
        assert.equal(payload.sessions[0]?.handle, 'TRACE-FAIL-NEW');
        assert.equal(payload.sessions[1]?.handle, 'TRACE-FAIL-OLD');
        assert.equal(payload.sessions[0]?.failure?.phase, 'chant:architect-service');
        assert.equal(payload.sessions[1]?.failure?.phase, 'weave:research');
        assert.equal(payload.sessions[0]?.agent_handoff.execution_gate, 'failure_recovery');
        assert.equal(payload.sessions[0]?.agent_handoff.resume_command, 'cstar hall "chant-session:TRACE-FAIL-NEW"');

        const lines = renderTraceFailureLines(failedSessions, tmpRoot).map(stripAnsi);
        assert.equal(lines[0], `[TRACE] FAILED TRACE-FAIL-NEW updated=${new Date(base + 20).toISOString()}`);
        assert.equal(lines[1], 'focus=Architect synthesis failed.');
        assert.equal(lines[2], 'beads total=0 set=0 open=0 review=0');
        assert.equal(lines[3], 'gate=failure_recovery');
        assert.equal(lines[4], 'resume=cstar hall "chant-session:TRACE-FAIL-NEW"');
        assert.equal(lines[5], 'failure_phase=chant:architect-service');
        assert.equal(lines[6], 'failure_error=host session inactive');
        assert.equal(lines[7], 'next=Restore host planning provider.');
        assert.equal(lines[8], '---');
        assert.equal(lines[9], `[TRACE] FAILED TRACE-FAIL-OLD updated=${new Date(base).toISOString()}`);

        closeDb();
    });

    it('renders an empty failure list when no failed planning sessions exist', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-trace-failures-empty-');
        registry.setRoot(tmpRoot);
        closeDb();

        const lines = renderTraceFailureLines([], tmpRoot).map(stripAnsi);
        assert.deepEqual(lines, ['trace_failures=none']);

        const payload = buildTraceFailuresPayload([], tmpRoot);
        assert.deepEqual(payload, {
            count: 0,
            sessions: [],
        });

        closeDb();
    });

    it('falls back to the latest runtime execution trace when no planning session is active', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-trace-runtime-');
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        upsertHallBead({
            bead_id: 'mission-runtime-1',
            repo_id: repoId,
            target_kind: 'OTHER',
            target_ref: 'weave:evolve',
            rationale: 'Mission execution: weave:evolve',
            status: 'OPEN',
            created_at: now,
            updated_at: now,
        });
        upsertHallBead({
            bead_id: 'mission-runtime-1:exec:weave:evolve:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:evolve',
            target_path: 'src/runtime.ts',
            rationale: 'Execution of weave:evolve under mission MISSION-10001',
            status: 'RESOLVED',
            created_at: now + 1,
            updated_at: now + 1,
            metadata: {
                trace_id: 'TRACE-RUNTIME-1',
                mission_bead_id: 'mission-runtime-1',
                trace_contract: {
                    intent_category: 'EVOLVE',
                    intent: 'Evolve bead bead-runtime-1.',
                    selection_tier: 'WEAVE',
                    selection_name: 'evolve',
                    trajectory_status: 'STABLE',
                    trajectory_reason: 'Dispatcher synthesized the designation from the explicit weave invocation.',
                    mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
                    confidence: 0.72, // Historical unscored input; active trace output must omit it.
                    canonical_intent: 'Evolve bead bead-runtime-1.',
                },
                host_cli_context: {
                    trace_line: 'augury=SUCCESS | WEAVE: evolve | EVOLVE | Evolve bead bead-runtime-1.',
                    note_line: 'note=Review the completed execution bead and seed follow-up work explicitly.',
                    updated_at: now + 2,
                },
            },
        });

        const activeSession = listHallPlanningSessions(tmpRoot, { statuses: ['FORGE_EXECUTION'] as any })[0];
        const payload = buildTraceStatusPayload(activeSession, tmpRoot);
        assert.equal(payload?.origin, 'runtime_execution');
        assert.equal(payload?.trace_id, 'TRACE-RUNTIME-1');
        assert.equal(payload?.runtime_bead_id, 'mission-runtime-1:exec:weave:evolve:1');
        assert.equal(payload?.mission_bead_id, 'mission-runtime-1');
        assert.equal(payload?.status, 'RESOLVED');
        assert.equal(payload?.focus, 'Evolve bead bead-runtime-1.');
        assert.deepEqual(payload?.augury_contract, {
            intent_category: 'EVOLVE',
            intent: 'Evolve bead bead-runtime-1.',
            selection_tier: 'WEAVE',
            selection_name: 'evolve',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Dispatcher synthesized the designation from the explicit weave invocation.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
            canonical_intent: 'Evolve bead bead-runtime-1.',
        });
        assert.deepEqual(payload?.trace_contract, payload?.augury_contract);
        assert.equal(payload?.agent_handoff.resume_command, 'cstar hall "mission-runtime-1"');
        assert.equal(payload?.agent_handoff.next_action, 'Review the completed execution bead and seed follow-up work explicitly.');
        assert.deepEqual(payload?.agent_handoff.target_paths, ['src/runtime.ts']);

        closeDb();
    });

    it('prefers the most recent runtime trace over stale blocked execution beads', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-trace-runtime-recency-');
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const traceContract = {
            intent_category: 'EVOLVE',
            intent: 'Evolve bead bead-runtime-1.',
            selection_tier: 'WEAVE',
            selection_name: 'evolve',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Dispatcher synthesized the designation from the explicit weave invocation.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
            confidence: 0.72, // Historical unscored input; active trace output must omit it.
            canonical_intent: 'Evolve bead bead-runtime-1.',
        };

        upsertHallBead({
            bead_id: 'mission-runtime-old:exec:weave:unknown:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:unknown',
            rationale: 'Execution of weave:unknown under mission MISSION-OLD',
            status: 'BLOCKED',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-RUNTIME-OLD',
                mission_bead_id: 'mission-runtime-old',
                trace_contract: {
                    ...traceContract,
                    intent: 'Execute unknown.',
                    selection_name: 'unknown',
                    canonical_intent: 'Execute unknown.',
                },
            },
        });
        upsertHallBead({
            bead_id: 'mission-runtime-new:exec:weave:evolve:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:evolve',
            target_path: 'src/runtime.ts',
            rationale: 'Execution of weave:evolve under mission MISSION-NEW',
            status: 'RESOLVED',
            created_at: now + 1,
            updated_at: now + 1,
            metadata: {
                trace_id: 'TRACE-RUNTIME-NEW',
                mission_bead_id: 'mission-runtime-new',
                trace_contract: traceContract,
            },
        });
        upsertHallBead({
            bead_id: 'mission-runtime-archived:exec:weave:unknown:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:unknown',
            rationale: 'Execution of archived weave:unknown under mission MISSION-ARCHIVED',
            status: 'BLOCKED',
            created_at: now + 2,
            updated_at: now + 2,
            metadata: {
                archived: true,
                trace_id: 'TRACE-RUNTIME-ARCHIVED',
                mission_bead_id: 'mission-runtime-archived',
                trace_contract: {
                    ...traceContract,
                    intent: 'Execute archived unknown.',
                    selection_name: 'unknown',
                    canonical_intent: 'Execute archived unknown.',
                },
            },
        });

        const payload = buildTraceStatusPayload(null, tmpRoot);
        assert.equal(payload?.trace_id, 'TRACE-RUNTIME-NEW');
        assert.equal(payload?.runtime_bead_id, 'mission-runtime-new:exec:weave:evolve:1');
        assert.equal(payload?.status, 'RESOLVED');
        assert.equal(payload?.agent_handoff.execution_gate, 'completed');

        closeDb();
    });

    it('repairs active runtime Augury contracts that are missing intent_category from registry grammar', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-augury-runtime-category-');
        registry.setRoot(tmpRoot);
        closeDb();
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, '.agents', 'skill_registry.json'), JSON.stringify({
            intent_grammar: {
                EVOLVE: {
                    triggers: ['evolve', 'improve'],
                    default_path: 'evolve',
                    tier: 'WEAVE',
                },
            },
        }));

        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        upsertHallBead({
            bead_id: 'mission-runtime-category:exec:weave:evolve:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:evolve',
            rationale: 'Execution of weave:evolve under mission MISSION-CATEGORY',
            status: 'BLOCKED',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-RUNTIME-CATEGORY',
                mission_bead_id: 'mission-runtime-category',
                trace_contract: {
                    intent: 'Evolve the active runtime contract.',
                    selection_tier: 'WEAVE',
                    selection_name: 'evolve',
                    trajectory_status: 'STABLE',
                    mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
                    confidence: 0.72, // Historical unscored input; active trace output must omit it.
                    canonical_intent: 'Evolve the active runtime contract.',
                },
            },
        });

        const payload = buildTraceStatusPayload(null, tmpRoot);
        assert.equal(payload?.augury_contract?.intent_category, 'EVOLVE');
        assert.equal(payload?.agent_handoff.designation?.intent_category, 'EVOLVE');

        const doctor = buildAuguryDoctorPayload(null, tmpRoot);
        assert.equal(doctor.route_ok, true);
        assert.doesNotMatch(doctor.warnings.join('\n'), /missing intent_category/);

        const explain = buildAuguryExplainPayload(null, tmpRoot);
        assert.equal(explain.route?.intent_category, 'EVOLVE');

        closeDb();
    });

    it('uses typed planning Augury when the newest runtime bead is unroutable unknown', () => {
        const tmpRoot = makeSecureTemporaryRoot('corvus-augury-planning-fallback-');
        registry.setRoot(tmpRoot);
        closeDb();
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, '.agents', 'skill_registry.json'), JSON.stringify({
            intent_grammar: {
                ORCHESTRATE: {
                    triggers: ['plan', 'orchestrate'],
                    default_path: 'orchestrate',
                    tier: 'WEAVE',
                },
            },
        }));

        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        saveHallPlanningSession({
            session_id: 'chant-session:typed-planning-fallback',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FORGE_EXECUTION',
            user_intent: 'plan the typed Augury recovery path',
            normalized_intent: 'plan the typed Augury recovery path',
            summary: 'Planning state should remain usable.',
            created_at: now,
            updated_at: now,
            metadata: {
                bead_ids: ['typed-planning-bead'],
            },
        } as any);
        upsertHallBead({
            bead_id: 'typed-planning-bead',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/node/core/commands/trace.ts',
            rationale: 'Planning target for typed Augury recovery.',
            status: 'OPEN',
            created_at: now,
            updated_at: now,
        });
        upsertHallBead({
            bead_id: 'mission-runtime-unknown:exec:weave:unknown:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:unknown',
            rationale: 'Execution of weave:unknown under mission MISSION-UNKNOWN',
            status: 'BLOCKED',
            created_at: now + 1,
            updated_at: now + 1,
            metadata: {
                trace_id: 'TRACE-RUNTIME-UNKNOWN',
                mission_bead_id: 'mission-runtime-unknown',
                trace_contract: {
                    intent: 'Execute unknown.',
                    selection_tier: 'WEAVE',
                    selection_name: 'unknown',
                    trajectory_status: 'STABLE',
                    mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
                    confidence: 0.72, // Historical unscored input; active trace output must omit it.
                    canonical_intent: 'Execute unknown.',
                },
            },
        });

        const activeSession = listHallPlanningSessions(tmpRoot, { statuses: ['FORGE_EXECUTION'] as any })[0];
        const payload = buildTraceStatusPayload(activeSession, tmpRoot);
        assert.equal(payload?.origin, 'planning_session');
        assert.equal(payload?.augury_contract?.intent_category, 'ORCHESTRATE');
        assert.equal(payload?.augury_contract?.selection_name, 'orchestrate');
        assert.deepEqual(payload?.augury_contract?.mimirs_well, ['src/node/core/commands/trace.ts']);

        const doctor = buildAuguryDoctorPayload(activeSession, tmpRoot);
        assert.equal(doctor.route_ok, true);
        assert.equal(doctor.active?.route, 'WEAVE: orchestrate');

        closeDb();
    });
});
