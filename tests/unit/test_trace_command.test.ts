import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildAuguryDoctorPayload,
    buildAuguryExplainPayload,
    buildTraceFailuresPayload,
    buildTraceHandoffPayload,
    buildTraceStatusPayload,
    renderAuguryHandoffLines,
    renderAuguryStatusLines,
    renderTraceHandoffLines,
    renderTraceFailureLines,
    renderTraceStatusLines,
} from '../../src/node/core/commands/trace.js';
import { closeDb, listHallPlanningSessions, saveHallPlanningSession, upsertHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

function stripAnsi(value: string): string {
    return value.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

describe('Trace command', () => {
    it('diagnoses and explains a clean active Augury for agents', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-augury-doctor-'));
        const cstarRoot = path.join(tmpRoot, 'CStar');
        fs.mkdirSync(cstarRoot, { recursive: true });
        const repoId = buildHallRepositoryId(normalizeHallPath(cstarRoot));
        const now = Date.now();
        const session: any = {
            session_id: 'chant-session:AUGURY-DOCTOR',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'improve game engine performance',
            normalized_intent: 'improve game engine performance',
            summary: 'Ready for bounded Augury diagnostics.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'AUGURY-DOCTOR',
                target_domain: 'brain',
                requested_root: cstarRoot,
                augury_designation_source: 'payload_augury_contract',
                augury_contract: {
                    intent_category: 'BUILD',
                    intent: 'Improve game engine performance.',
                    selection_tier: 'SKILL',
                    selection_name: 'hall',
                    trajectory_status: 'STABLE',
                    mimirs_well: ['src/game/engine.ts'],
                    gungnir_verdict: '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]',
                    canonical_intent: 'improve game engine performance',
                    council_expert: {
                        id: 'carmack',
                        label: 'CARMACK',
                        lens: 'Attack unnecessary layers and hot-path waste.',
                        selection_reason: 'game engine performance signal',
                    },
                },
            },
        };

        const doctor = buildAuguryDoctorPayload(session, cstarRoot);
        assert.equal(doctor.status, 'pass');
        assert.equal(doctor.scope_ok, true);
        assert.equal(doctor.route_ok, true);
        assert.equal(doctor.expert_ok, true);
        assert.equal(doctor.mimir_ok, true);
        assert.equal(doctor.noise_score, 0);
        assert.equal(doctor.active?.scope, 'brain:CStar');
        assert.equal(doctor.active?.expert, 'CARMACK');
        assert.deepEqual(doctor.warnings, []);

        const explain = buildAuguryExplainPayload(session, cstarRoot);
        assert.equal(explain.status, 'available');
        assert.equal(explain.route?.designation, 'SKILL: hall');
        assert.equal(explain.scope?.value, 'brain:CStar');
        assert.equal(explain.scope?.target_domain, 'brain');
        assert.equal(explain.scope?.requested_root, cstarRoot);
        assert.equal(explain.expert?.label, 'CARMACK');
        assert.deepEqual(explain.mimir?.targets, ['src/game/engine.ts']);
        assert.match(explain.mode?.basis ?? '', /full Augury once/i);
        assert.equal(explain.confidence?.source, 'missing');
    });

    it('warns agents when Augury has weak routing evidence', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-augury-doctor-weak-'));
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const session: any = {
            session_id: 'chant-session:AUGURY-WEAK',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'weak augury',
            normalized_intent: 'weak augury',
            summary: 'Weak routing evidence.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'AUGURY-WEAK',
                augury_contract: {
                    intent_category: 'BUILD',
                    intent: 'Build something.',
                    selection_tier: 'UNKNOWN',
                    selection_name: 'unknown',
                    mimirs_well: [],
                },
            },
        };

        const doctor = buildAuguryDoctorPayload(session, tmpRoot);
        assert.equal(doctor.status, 'fail');
        assert.equal(doctor.expert_ok, false);
        assert.equal(doctor.mimir_ok, false);
        assert.match(doctor.warnings.join('\n'), /No Council expert/);
        assert.match(doctor.warnings.join('\n'), /no Mimir targets/i);
        assert.match(doctor.agent_next_action, /Repair the Augury contract/);
    });

    it('renders a compact active planning trace summary for the host CLI', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-command-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-HOST-CLI',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'resume host cli trace',
            normalized_intent: 'resume host cli trace',
            summary: 'Proposal ready for host execution.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-HOST-CLI',
                bead_ids: ['bead-trace-1', 'bead-trace-2'],
                trace_contract: {
                    intent_category: 'ORCHESTRATE',
                    intent: 'Make chant the only intake gate',
                    selection_tier: 'WEAVE',
                    selection_name: 'orchestrate',
                    trajectory_status: 'STABLE',
                    trajectory_reason: 'Persist the designation instead of discarding it.',
                    mimirs_well: ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts'],
                    gungnir_verdict: '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]',
                    confidence: 0.94,
                    canonical_intent: 'resume host cli trace',
                },
                branch_ledger_digest: {
                    total_branches: 3,
                    groups: [
                        {
                            branch_kind: 'research',
                            branch_count: 2,
                            branch_labels: ['layout', 'tests'],
                            needs_revision: false,
                        },
                        {
                            branch_kind: 'critique',
                            branch_count: 1,
                            branch_labels: ['validation'],
                            needs_revision: true,
                        },
                    ],
                    artifacts: ['src/runtime.ts', 'tests/unit/runtime.test.ts'],
                },
            },
        });

        upsertHallBead({
            bead_id: 'bead-trace-1',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/runtime.ts',
            rationale: 'Implement runtime change.',
            status: 'SET',
            created_at: now,
            updated_at: now,
        });
        upsertHallBead({
            bead_id: 'bead-trace-2',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'tests/unit/runtime.test.ts',
            rationale: 'Verify runtime change.',
            status: 'OPEN',
            created_at: now + 1,
            updated_at: now + 1,
        });

        const lines = renderTraceStatusLines({
            session_id: 'chant-session:TRACE-HOST-CLI',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'resume host cli trace',
            normalized_intent: 'resume host cli trace',
            summary: 'Proposal ready for host execution.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-HOST-CLI',
                bead_ids: ['bead-trace-1', 'bead-trace-2'],
                trace_contract: {
                    intent_category: 'ORCHESTRATE',
                    intent: 'Make chant the only intake gate',
                    selection_tier: 'WEAVE',
                    selection_name: 'orchestrate',
                    trajectory_status: 'STABLE',
                    trajectory_reason: 'Persist the designation instead of discarding it.',
                    mimirs_well: ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts'],
                    gungnir_verdict: '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]',
                    confidence: 0.94,
                    canonical_intent: 'resume host cli trace',
                },
                branch_ledger_digest: {
                    total_branches: 3,
                    groups: [
                        {
                            branch_kind: 'research',
                            branch_count: 2,
                            branch_labels: ['layout', 'tests'],
                            needs_revision: false,
                        },
                        {
                            branch_kind: 'critique',
                            branch_count: 1,
                            branch_labels: ['validation'],
                            needs_revision: true,
                        },
                    ],
                    artifacts: ['src/runtime.ts', 'tests/unit/runtime.test.ts'],
                },
            },
        } as any, tmpRoot).map(stripAnsi);

        assert.equal(lines[0], '[TRACE] PROPOSAL_REVIEW TRACE-HOST-CLI');
        assert.match(lines[1] ?? '', /focus=Proposal ready for host execution\./);
        assert.equal(lines[2], `updated=${new Date(now).toISOString()}`);
        assert.equal(lines[3], 'digest=R=2 C=1 REV=1 A=2');
        assert.equal(lines[4], 'beads total=2 set=1 open=1 review=0');
        assert.equal(lines[5], 'gate=review_required');
        assert.equal(lines[6], 'resume=cstar hall "chant-session:TRACE-HOST-CLI"');
        assert.equal(lines[7], 'designation=WEAVE: orchestrate');
        assert.equal(lines[8], 'category=ORCHESTRATE');
        assert.equal(lines[9], 'trajectory=STABLE');
        assert.equal(lines[10], 'lead_bead=bead-trace-1');
        assert.equal(lines[11], 'targets=src/runtime.ts, tests/unit/runtime.test.ts');
        assert.match(lines[12] ?? '', /next=Inspect the Hall proposal and bead set/);
        assert.equal(lines[13], 'artifacts=src/runtime.ts, tests/unit/runtime.test.ts');
        assert.match(lines[14] ?? '', /branch research x2 labels=layout, tests/);
        assert.match(lines[15] ?? '', /branch critique x1 rev labels=validation/);

        closeDb();
    });

    it('builds a machine-readable payload for host cli wrappers', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-json-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        const session: any = {
            session_id: 'chant-session:TRACE-JSON',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'json trace',
            normalized_intent: 'json trace',
            summary: 'Ready for execution.',
            created_at: now,
            updated_at: now,
            current_bead_id: 'bead-json-1',
            metadata: {
                trace_id: 'TRACE-JSON',
                bead_ids: ['bead-json-1'],
                proposal_ids: ['proposal:TRACE-JSON:bead-json-1'],
                trace_contract: {
                    intent_category: 'ORCHESTRATE',
                    intent: 'Make chant the only intake gate',
                    selection_tier: 'WEAVE',
                    selection_name: 'orchestrate',
                    trajectory_status: 'STABLE',
                    trajectory_reason: 'Persist the designation instead of discarding it.',
                    mimirs_well: ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts'],
                    gungnir_verdict: '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]',
                    confidence: 0.94,
                    canonical_intent: 'json trace',
                },
                host_cli_context: {
                    trace_line: 'handoff=PLAN_READY | TRACE-JSON | Ready for execution.',
                    note_line: 'note=Use the bounded runtime path and validate the lead bead before release.',
                    updated_at: now + 5,
                },
                branch_ledger_digest: {
                    total_branches: 2,
                    groups: [
                        {
                            branch_kind: 'research',
                            branch_count: 1,
                            branch_labels: ['layout'],
                            needs_revision: false,
                            summary: 'Layout scoped.',
                            artifacts: ['src/runtime.ts'],
                            evidence_sources: [],
                            proposed_paths: [],
                        },
                        {
                            branch_kind: 'critique',
                            branch_count: 1,
                            branch_labels: ['validation'],
                            needs_revision: true,
                            summary: 'Validation is still weak.',
                            artifacts: [],
                            evidence_sources: ['repo:validation'],
                            proposed_paths: ['tests/unit/runtime.test.ts'],
                        },
                    ],
                    artifacts: ['src/runtime.ts'],
                },
            },
        };

        upsertHallBead({
            bead_id: 'bead-json-1',
            repo_id: repoId,
            target_kind: 'FILE',
            target_path: 'src/runtime.ts',
            rationale: 'Implement runtime change.',
            acceptance_criteria: 'Runtime change is verified.',
            checker_shell: 'npm test -- --run tests/unit/runtime.test.ts',
            status: 'SET',
            created_at: now,
            updated_at: now,
        });

        const payload = buildTraceStatusPayload(session, tmpRoot);
        assert.equal(payload?.trace_id, 'TRACE-JSON');
        assert.equal(payload?.session_id, 'chant-session:TRACE-JSON');
        assert.equal(payload?.handle, 'TRACE-JSON');
        assert.equal(payload?.status, 'PLAN_READY');
        assert.equal(payload?.updated_at, now);
        assert.equal(payload?.updated_at_iso, new Date(now).toISOString());
        assert.equal(payload?.user_intent, 'json trace');
        assert.equal(payload?.normalized_intent, 'json trace');
        assert.equal(payload?.focus, 'Ready for execution.');
        assert.equal(payload?.digest_badge, 'R=1 C=1 REV=1 A=1');
        assert.equal(payload?.current_bead_id, 'bead-json-1');
        assert.deepEqual(payload?.bead_ids, ['bead-json-1']);
        assert.deepEqual(payload?.proposal_ids, ['proposal:TRACE-JSON:bead-json-1']);
        assert.deepEqual(payload?.bead_summary, {
            total: 1,
            set: 1,
            open: 0,
            review: 0,
        });
        assert.deepEqual(payload?.artifacts, ['src/runtime.ts']);
        assert.deepEqual(payload?.host_context, {
            trace_line: 'handoff=PLAN_READY | TRACE-JSON | Ready for execution.',
            trace_summary: 'PLAN_READY | TRACE-JSON | Ready for execution.',
            note_line: 'note=Use the bounded runtime path and validate the lead bead before release.',
            note: 'Use the bounded runtime path and validate the lead bead before release.',
            updated_at: now + 5,
            updated_at_iso: new Date(now + 5).toISOString(),
        });
        assert.deepEqual(payload?.augury_contract, {
            intent_category: 'ORCHESTRATE',
            intent: 'Make chant the only intake gate',
            selection_tier: 'WEAVE',
            selection_name: 'orchestrate',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Persist the designation instead of discarding it.',
            mimirs_well: ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts'],
            gungnir_verdict: '[L: 4.7 | S: 4.5 | I: 4.8 | Ω: 93%]',
            confidence: 0.94,
            canonical_intent: 'json trace',
        });
        assert.deepEqual(payload?.trace_contract, payload?.augury_contract);
        assert.equal(payload?.agent_handoff.execution_gate, 'operator_release_required');
        assert.equal(payload?.agent_handoff.phase, 'PLAN_READY');
        assert.equal(payload?.agent_handoff.next_action, 'Use the bounded runtime path and validate the lead bead before release.');
        assert.equal(payload?.agent_handoff.resume_command, 'cstar hall "chant-session:TRACE-JSON"');
        assert.equal(payload?.agent_handoff.validation_command, 'npm test -- --run tests/unit/runtime.test.ts');
        assert.equal(payload?.agent_handoff.lead_bead_id, 'bead-json-1');
        assert.deepEqual(payload?.agent_handoff.designation, payload?.augury_contract);
        assert.deepEqual(payload?.agent_handoff.target_paths, ['src/runtime.ts', 'tests/unit/runtime.test.ts']);
        assert.deepEqual(payload?.agent_handoff.checker_shells, ['npm test -- --run tests/unit/runtime.test.ts']);
        assert.deepEqual(payload?.agent_handoff.proposal_ids, ['proposal:TRACE-JSON:bead-json-1']);
        assert.deepEqual(payload?.agent_handoff.bead_ids, ['bead-json-1']);
        assert.deepEqual(payload?.agent_handoff.work_items, [
            {
                bead_id: 'bead-json-1',
                status: 'SET',
                target_path: 'src/runtime.ts',
                rationale: 'Implement runtime change.',
                acceptance_criteria: 'Runtime change is verified.',
                checker_shell: 'npm test -- --run tests/unit/runtime.test.ts',
            },
        ]);
        assert.equal(payload?.branches[0]?.kind, 'research');
        assert.equal(payload?.branches[1]?.kind, 'critique');

        const handoff = buildTraceHandoffPayload(session, tmpRoot);
        assert.equal(handoff?.execution_gate, 'operator_release_required');
        const handoffLines = renderTraceHandoffLines(handoff).map(stripAnsi);
        assert.equal(handoffLines[0], '[HANDOFF] gate=operator_release_required phase=PLAN_READY');
        assert.equal(handoffLines[1], 'next=Use the bounded runtime path and validate the lead bead before release.');
        assert.equal(handoffLines[2], 'resume=cstar hall "chant-session:TRACE-JSON"');
        assert.equal(handoffLines[3], 'designation=WEAVE: orchestrate');
        assert.equal(handoffLines[4], 'category=ORCHESTRATE');
        assert.equal(handoffLines[5], 'trajectory=STABLE');
        assert.equal(handoffLines[6], 'lead_bead=bead-json-1');
        assert.equal(handoffLines[7], 'targets=src/runtime.ts, tests/unit/runtime.test.ts');
        assert.equal(handoffLines[8], 'validate=npm test -- --run tests/unit/runtime.test.ts');
        assert.equal(handoffLines[9], 'note=Use the bounded runtime path and validate the lead bead before release.');

        const auguryStatusLines = renderAuguryStatusLines(session, tmpRoot).map(stripAnsi);
        assert.equal(auguryStatusLines[0], '[AUGURY] PLAN_READY TRACE-JSON');
        const auguryHandoffLines = renderAuguryHandoffLines(handoff).map(stripAnsi);
        assert.equal(auguryHandoffLines[0], '[AUGURY_HANDOFF] gate=operator_release_required phase=PLAN_READY');
        assert.equal(auguryHandoffLines[3], 'designation=WEAVE: orchestrate');

        closeDb();
    });

    it('surfaces failure diagnostics when the active session is stalled', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-failure-'));
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
        assert.equal(lines[6], 'failure_phase=weave:research');
        assert.equal(lines[7], 'failure_error=research delegated execution timeout after 5ms');
        assert.equal(lines[8], 'next=Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.');

        closeDb();
    });

    it('lists recent failed planning sessions in newest-first order', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-failures-list-'));
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
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-failures-empty-'));
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
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-runtime-'));
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
                    confidence: 0.72,
                    canonical_intent: 'Evolve bead bead-runtime-1.',
                },
                host_cli_context: {
                    trace_line: 'augury=SUCCESS | WEAVE: evolve | EVOLVE | Evolve bead bead-runtime-1.',
                    note_line: 'note=Review the completed execution bead and seed follow-up work explicitly.',
                    updated_at: now + 2,
                },
            },
        });

        const payload = buildTraceStatusPayload(null, tmpRoot);
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
            confidence: 0.72,
            canonical_intent: 'Evolve bead bead-runtime-1.',
        });
        assert.deepEqual(payload?.trace_contract, payload?.augury_contract);
        assert.equal(payload?.agent_handoff.resume_command, 'cstar hall "mission-runtime-1"');
        assert.equal(payload?.agent_handoff.next_action, 'Review the completed execution bead and seed follow-up work explicitly.');
        assert.deepEqual(payload?.agent_handoff.target_paths, ['src/runtime.ts']);

        closeDb();
    });

    it('prefers the most recent runtime trace over stale blocked execution beads', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-runtime-recency-'));
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
            confidence: 0.72,
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
});
