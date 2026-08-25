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
    resolveActivePlanningSession,
    resolveActiveTraceStatusPayload,
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
                    selection_name: 'cstar_forge_request',
                    trajectory_status: 'STABLE',
                    mimirs_well: ['src/game/engine.ts'],
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
        assert.equal(doctor.score, null);
        assert.equal(doctor.score_source, 'not_measured');
        assert.equal(doctor.noise_score, null);
        assert.equal(doctor.noise_status, 'pass');
        assert.equal(doctor.active?.scope, 'brain:CStar');
        assert.equal(doctor.active?.expert, 'CARMACK');
        assert.deepEqual(doctor.guardrail, {
            verdict: 'allow',
            action: 'continue',
            reason: 'All Augury checks passed.',
            failed_checks: [],
            warning_checks: [],
        });
        assert.deepEqual(doctor.warnings, []);

        const explain = buildAuguryExplainPayload(session, cstarRoot);
        assert.equal(explain.status, 'available');
        assert.equal(explain.route?.designation, 'SKILL: cstar_forge_request');
        assert.equal(explain.scope?.value, 'brain:CStar');
        assert.equal(explain.scope?.target_domain, 'brain');
        assert.equal(explain.scope?.requested_root, cstarRoot);
        assert.equal(explain.expert?.label, 'CARMACK');
        assert.deepEqual(explain.mimir?.targets, ['src/game/engine.ts']);
        assert.match(explain.mode?.basis ?? '', /full Augury once/i);
        assert.equal(explain.confidence?.value, null);
        assert.equal(explain.confidence?.source, 'not_measured');
        assert.match(explain.confidence?.basis ?? '', /No calibrated route-confidence scorer ran/);
        assert.equal(explain.guardrail.verdict, 'allow');
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
        assert.equal(doctor.route_ok, false);
        assert.equal(doctor.expert_ok, false);
        assert.equal(doctor.active?.expert, undefined);
        assert.equal(doctor.mimir_ok, false);
        assert.equal(doctor.guardrail.verdict, 'block');
        assert.equal(doctor.guardrail.action, 'repair');
        assert.deepEqual(doctor.guardrail.failed_checks, ['route', 'mimir', 'noise']);
        assert.deepEqual(doctor.guardrail.warning_checks, ['expert']);
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
                    selection_tier: 'PRIME',
                    selection_name: 'cstar_handoff',
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
                    selection_tier: 'PRIME',
                    selection_name: 'cstar_handoff',
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
        assert.ok(lines.includes('designation=PRIME: cstar_handoff'));
        assert.ok(lines.includes('category=ORCHESTRATE'));
        assert.ok(lines.includes('trajectory=STABLE'));
        assert.ok(lines.includes('expert=DEAN'));
        assert.ok(lines.some((line) => line.startsWith('expert_reason=')));
        assert.ok(lines.some((line) => line.startsWith('anti=')));
        assert.ok(lines.includes('lead_bead=bead-trace-1'));
        assert.ok(lines.includes('targets=src/runtime.ts, tests/unit/runtime.test.ts'));
        assert.ok(lines.some((line) => /next=Inspect the Hall proposal and bead set/.test(line)));
        assert.ok(lines.includes('artifacts=src/runtime.ts, tests/unit/runtime.test.ts'));
        assert.ok(lines.some((line) => /branch research x2 labels=layout, tests/.test(line)));
        assert.ok(lines.some((line) => /branch critique x1 rev labels=validation/.test(line)));

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
                    selection_tier: 'PRIME',
                    selection_name: 'cstar_handoff',
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
        const auguryContract = payload?.augury_contract;
        assert.equal(auguryContract?.intent_category, 'ORCHESTRATE');
        assert.equal(auguryContract?.intent, 'Make chant the only intake gate');
        assert.equal(auguryContract?.selection_tier, 'PRIME');
        assert.equal(auguryContract?.selection_name, 'cstar_handoff');
        assert.equal(auguryContract?.trajectory_status, 'STABLE');
        assert.deepEqual(auguryContract?.mimirs_well, ['CStar/AGENTS.qmd', 'src/node/core/runtime/dispatcher.ts']);
        assert.equal(auguryContract?.gungnir_verdict, undefined);
        assert.equal(auguryContract?.confidence, undefined);
        assert.equal(auguryContract?.council_expert?.id, 'dean');
        assert.ok((auguryContract?.council_expert?.anti_behavior?.length ?? 0) > 0);
        assert.equal(auguryContract?.council_candidates, undefined);
        assert.equal(auguryContract?.council_expert?.selection_score, undefined);
        assert.equal(auguryContract?.council_expert?.selection_candidates, undefined);
        assert.equal(auguryContract?.council_expert?.root_persona_directive, undefined);
        assert.deepEqual(payload?.trace_contract, payload?.augury_contract);
        assert.equal(payload?.agent_handoff.execution_gate, 'operator_release_required');
        assert.equal(payload?.agent_handoff.phase, 'PLAN_READY');
        assert.equal(payload?.agent_handoff.next_action, 'Perform operator review and explicitly release execution; PLAN_READY is not an execution grant.');
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
        assert.equal(handoffLines[1], 'next=Perform operator review and explicitly release execution; PLAN_READY is not an execution grant.');
        assert.equal(handoffLines[2], 'resume=cstar hall "chant-session:TRACE-JSON"');
        assert.ok(handoffLines.includes('designation=PRIME: cstar_handoff'));
        assert.ok(handoffLines.includes('category=ORCHESTRATE'));
        assert.ok(handoffLines.includes('trajectory=STABLE'));
        assert.ok(handoffLines.includes('expert=DEAN'));
        assert.ok(handoffLines.some((line) => line.startsWith('expert_reason=')));
        assert.ok(handoffLines.some((line) => line.startsWith('anti=')));
        assert.ok(handoffLines.includes('lead_bead=bead-json-1'));
        assert.ok(handoffLines.includes('targets=src/runtime.ts, tests/unit/runtime.test.ts'));
        assert.ok(handoffLines.includes('validate=npm test -- --run tests/unit/runtime.test.ts'));
        assert.ok(handoffLines.includes('note=Use the bounded runtime path and validate the lead bead before release.'));

        const auguryStatusLines = renderAuguryStatusLines(session, tmpRoot).map(stripAnsi);
        assert.equal(auguryStatusLines[0], '[AUGURY] PLAN_READY TRACE-JSON');
        const auguryHandoffLines = renderAuguryHandoffLines(handoff).map(stripAnsi);
        assert.equal(auguryHandoffLines[0], '[AUGURY_HANDOFF] gate=operator_release_required phase=PLAN_READY');
        assert.equal(auguryHandoffLines[3], 'designation=PRIME: cstar_handoff');

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
        assert.ok(lines.includes('failure_phase=weave:research'));
        assert.ok(lines.includes('failure_error=research delegated execution timeout after 5ms'));
        assert.ok(lines.includes('next=Inspect the delegated planning bridge for hangs or stalled workers, then rerun chant.'));

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

    it('falls back to the latest nonterminal runtime execution trace when no planning session is active', () => {
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
            source_kind: 'SYSTEM',
            target_ref: 'weave:evolve',
            target_path: 'src/runtime.ts',
            rationale: 'Execution of weave:evolve under mission MISSION-10001',
            status: 'READY_FOR_REVIEW',
            created_at: now + 1,
            updated_at: now + 1,
            metadata: {
                trace_id: 'TRACE-RUNTIME-1',
                trace_scope: 'runtime',
                execution_bead_id: 'mission-runtime-1:exec:weave:evolve:1',
                mission_bead_id: 'mission-runtime-1',
                trace_contract: {
                    intent_category: 'EVOLVE',
                    intent: 'Evolve bead bead-runtime-1.',
                    selection_tier: 'SKILL',
                    selection_name: 'cstar_forge_request',
                    trajectory_status: 'STABLE',
                    trajectory_reason: 'Dispatcher synthesized the designation from the explicit weave invocation.',
                    mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
                    canonical_intent: 'Evolve bead bead-runtime-1.',
                },
                host_cli_context: {
                    trace_line: 'augury=SUCCESS | SKILL: cstar_forge_request | EVOLVE | Evolve bead bead-runtime-1.',
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
        assert.equal(payload?.status, 'READY_FOR_REVIEW');
        assert.equal(payload?.focus, 'Evolve bead bead-runtime-1.');
        assert.equal(payload?.augury_contract?.intent_category, 'EVOLVE');
        assert.equal(payload?.augury_contract?.selection_tier, 'SKILL');
        assert.equal(payload?.augury_contract?.selection_name, 'cstar_forge_request');
        assert.equal(payload?.augury_contract?.confidence, undefined);
        assert.equal(payload?.augury_contract?.gungnir_verdict, undefined);
        assert.equal(payload?.augury_contract?.council_expert?.id, 'karpathy');
        assert.deepEqual(payload?.trace_contract, payload?.augury_contract);
        assert.equal(payload?.agent_handoff.resume_command, 'cstar hall "mission-runtime-1"');
        assert.equal(payload?.agent_handoff.next_action, 'Review the finished execution bead, validate the touched target, and only then promote or supersede follow-up work.');
        assert.deepEqual(payload?.agent_handoff.target_paths, ['src/runtime.ts']);

        closeDb();
    });

    it('prefers the most recent nonterminal runtime trace over stale blocked execution beads', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-runtime-recency-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const traceContract = {
            intent_category: 'EVOLVE',
            intent: 'Evolve bead bead-runtime-1.',
            selection_tier: 'SKILL',
            selection_name: 'cstar_forge_request',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Dispatcher synthesized the designation from the explicit weave invocation.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
            canonical_intent: 'Evolve bead bead-runtime-1.',
        };

        upsertHallBead({
            bead_id: 'mission-runtime-old:exec:weave:unknown:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            source_kind: 'SYSTEM',
            target_ref: 'weave:unknown',
            rationale: 'Execution of weave:unknown under mission MISSION-OLD',
            status: 'BLOCKED',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-RUNTIME-OLD',
                trace_scope: 'runtime',
                execution_bead_id: 'mission-runtime-old:exec:weave:unknown:1',
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
            source_kind: 'SYSTEM',
            target_ref: 'weave:evolve',
            target_path: 'src/runtime.ts',
            rationale: 'Execution of weave:evolve under mission MISSION-NEW',
            status: 'READY_FOR_REVIEW',
            created_at: now + 1,
            updated_at: now + 1,
            metadata: {
                trace_id: 'TRACE-RUNTIME-NEW',
                trace_scope: 'runtime',
                execution_bead_id: 'mission-runtime-new:exec:weave:evolve:1',
                mission_bead_id: 'mission-runtime-new',
                trace_contract: traceContract,
            },
        });
        upsertHallBead({
            bead_id: 'mission-runtime-archived:exec:weave:unknown:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            source_kind: 'SYSTEM',
            target_ref: 'weave:unknown',
            rationale: 'Execution of archived weave:unknown under mission MISSION-ARCHIVED',
            status: 'BLOCKED',
            created_at: now + 2,
            updated_at: now + 2,
            metadata: {
                archived: true,
                trace_id: 'TRACE-RUNTIME-ARCHIVED',
                trace_scope: 'runtime',
                execution_bead_id: 'mission-runtime-archived:exec:weave:unknown:1',
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
        assert.equal(payload?.status, 'READY_FOR_REVIEW');
        assert.equal(payload?.agent_handoff.execution_gate, 'review_required');

        closeDb();
    });

    it('does not infer runtime authority from an exec-shaped bead id', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-fake-exec-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        upsertHallBead({
            bead_id: 'foo:exec:bar',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:evolve',
            rationale: 'Ordinary lifecycle work with an execution-shaped identifier.',
            status: 'IN_PROGRESS',
            source_kind: 'MCP',
            created_at: now,
            updated_at: now,
        });

        const payload = buildTraceStatusPayload(null, tmpRoot);
        assert.equal(payload?.origin, 'lifecycle_bead');
        assert.equal(payload?.lifecycle_bead_id, 'foo:exec:bar');
        assert.equal(payload?.runtime_bead_id, undefined);
        assert.equal(payload?.agent_handoff.execution_gate, 'work_active');
        closeDb();
    });

    it('does not treat terminal runtime execution history as current authority', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-terminal-history-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        upsertHallBead({
            bead_id: 'mission-runtime-terminal:exec:weave:evolve:1',
            repo_id: repoId,
            target_kind: 'WEAVE',
            target_ref: 'weave:evolve',
            rationale: 'Completed historical runtime execution.',
            status: 'RESOLVED',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_contract: {
                    intent_category: 'EVOLVE',
                    intent: 'Evolve a historical target.',
                    selection_tier: 'SKILL',
                    selection_name: 'cstar_forge_request',
                    mimirs_well: ['src/runtime.ts'],
                },
            },
        });

        assert.equal(buildTraceStatusPayload(null, tmpRoot), null);
        assert.equal(resolveActiveTraceStatusPayload(tmpRoot), null);

        closeDb();
    });

    it('expires stale nonterminal planning sessions and selects the current lifecycle bead', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-stale-planning-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();
        const staleAt = now - (8 * 24 * 60 * 60 * 1_000);

        saveHallPlanningSession({
            session_id: 'chant-session:STALE-PLANNING',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'FORGE_EXECUTION',
            user_intent: 'old planning route',
            normalized_intent: 'old planning route',
            summary: 'This session is no longer current.',
            created_at: staleAt,
            updated_at: staleAt,
            metadata: { trace_id: 'STALE-PLANNING' },
        });
        upsertHallBead({
            bead_id: 'bead:audit:current-lifecycle',
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: 'Current lifecycle audit',
            target_path: 'docs/current-audit.md',
            rationale: 'Run the current audit.',
            status: 'IN_PROGRESS',
            created_at: now,
            updated_at: now,
        });

        assert.equal(resolveActivePlanningSession(tmpRoot), null);
        const payload = resolveActiveTraceStatusPayload(tmpRoot);
        assert.equal(payload?.origin, 'lifecycle_bead');
        assert.equal(payload?.current_bead_id, 'bead:audit:current-lifecycle');
        assert.equal(payload?.status, 'IN_PROGRESS');

        closeDb();
    });

    it('keeps fresh planning sessions current until newer lifecycle activity supersedes them', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-trace-fresh-planning-'));
        registry.setRoot(tmpRoot);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        upsertHallBead({
            bead_id: 'bead:audit:older-lifecycle',
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: 'Older lifecycle audit',
            rationale: 'Older bounded work.',
            status: 'IN_PROGRESS',
            created_at: now - 2_000,
            updated_at: now - 2_000,
        });
        saveHallPlanningSession({
            session_id: 'chant-session:FRESH-PLANNING',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'fresh planning route',
            normalized_intent: 'fresh planning route',
            summary: 'This session is current.',
            created_at: now - 1_000,
            updated_at: now - 1_000,
            metadata: { trace_id: 'FRESH-PLANNING' },
        });

        assert.equal(resolveActivePlanningSession(tmpRoot)?.session_id, 'chant-session:FRESH-PLANNING');
        assert.equal(resolveActiveTraceStatusPayload(tmpRoot)?.origin, 'planning_session');

        upsertHallBead({
            bead_id: 'bead:audit:newer-lifecycle',
            repo_id: repoId,
            target_kind: 'WORKFLOW',
            target_ref: 'Newer lifecycle audit',
            rationale: 'Newer bounded work.',
            status: 'IN_PROGRESS',
            created_at: now,
            updated_at: now,
        });

        const payload = resolveActiveTraceStatusPayload(tmpRoot);
        assert.equal(payload?.origin, 'lifecycle_bead');
        assert.equal(payload?.current_bead_id, 'bead:audit:newer-lifecycle');

        closeDb();
    });

    it('repairs active runtime Augury contracts that are missing intent_category from registry grammar', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-augury-runtime-category-'));
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
                    confidence: 0.72,
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
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-augury-planning-fallback-'));
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
                    confidence: 0.72,
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
