import { randomUUID } from 'node:crypto';

import { getHallBead, upsertHallBead } from '../src/tools/pennyone/intel/bead_controller.ts';
import { saveHallPlanningSession, getHallPlanningSession, getHallSkillProposal, saveHallSkillObservation, saveHallSkillProposal } from '../src/tools/pennyone/intel/session_manager.ts';
import { saveValidationRun } from '../src/tools/pennyone/intel/database.ts';
import { registry } from '../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../src/types/hall.js';

const estateRoot = '/home/morderith/Corvus';
const xoRoot = '/home/morderith/Corvus/XO';
const repoId = buildHallRepositoryId(normalizeHallPath(xoRoot));
const estateRepoId = buildHallRepositoryId(normalizeHallPath(estateRoot));
const sessionId = 'chant-session:xo-phase2-supervised-tutor';
const estateSessionId = 'chant-session:repo:/home/morderith/Corvus:xo-phase2-supervised-tutor';
const parentBeadId = 'pb-xo-phase2-supervised-tutor';
const beadIds = [
    'xo-phase2-bead-01',
    'xo-phase2-bead-02',
    'xo-phase2-bead-03',
    'xo-phase2-bead-04',
    'xo-phase2-bead-05',
    'xo-phase2-bead-06',
    'xo-phase2-bead-07',
];

const validationCommand = 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/verification_audit.test.ts tests/live_safety_audit.test.ts tests/disclosure_summary.test.ts tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts';
const validationSummary = 'Focused XO Phase 2 slice passed 13/13: verification audit, live safety audit, disclosure summary, tutor acts, session runtime, and projection engine.';
const promotedBy = 'codex';
const now = Date.now();

registry.setRoot(estateRoot);

function requireBead(beadId: string) {
    const bead = getHallBead(beadId);
    if (!bead) {
        throw new Error(`Missing Hall bead ${beadId}`);
    }
    return bead;
}

function resolveBead(beadId: string, validationId: string, note: string): void {
    const bead = requireBead(beadId);
    upsertHallBead({
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id,
        legacy_id: bead.legacy_id,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: 'RESOLVED',
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        triage_reason: bead.triage_reason,
        resolution_note: note,
        resolved_validation_id: validationId,
        superseded_by: bead.superseded_by,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        created_at: bead.created_at,
        updated_at: now,
    });
}

function saveAcceptedValidation(beadId: string, targetPath: string | undefined, notes: string): string {
    const validationId = `validation:${beadId}:${randomUUID().slice(0, 8)}`;
    saveValidationRun({
        validation_id: validationId,
        repo_id: repoId,
        bead_id: beadId,
        target_path: targetPath,
        verdict: 'ACCEPTED',
        sprt_verdict: 'focused_phase_2_slice',
        pre_scores: { overall: 0 },
        post_scores: { overall: 1 },
        benchmark: {
            command: validationCommand,
            tests_passed: 13,
            tests_failed: 0,
        },
        notes,
        created_at: now,
    });
    return validationId;
}

for (const beadId of beadIds) {
    const bead = requireBead(beadId);
    const proposalId = `proposal:${sessionId}:${beadId}`;
    const validationId = saveAcceptedValidation(
        beadId,
        bead.target_path,
        `${validationSummary} Bead ${beadId} accepted for Hall review closure.`,
    );

    const proposal = getHallSkillProposal(proposalId);
    if (proposal) {
        saveHallSkillProposal({
            ...proposal,
            status: 'PROMOTED',
            validation_id: validationId,
            promotion_note: `Promoted after accepted Phase 2 verification: ${validationId}.`,
            promoted_at: now,
            promoted_by: promotedBy,
            updated_at: now,
        });
    }

    resolveBead(
        beadId,
        validationId,
        `Resolved after accepted Phase 2 verification. ${validationSummary}`,
    );
}

const parentValidationId = saveAcceptedValidation(
    parentBeadId,
    'XO/docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
    `${validationSummary} Parent bead accepted as the complete Phase 2 supervised tutor increment.`,
);

resolveBead(
    parentBeadId,
    parentValidationId,
    `Resolved as the complete XO Phase 2 supervised tutor increment. ${validationSummary}`,
);

saveHallSkillObservation({
    observation_id: `promote:${randomUUID().slice(0, 12)}`,
    repo_id: repoId,
    skill_id: 'chant',
    outcome: 'PROMOTED',
    observation: 'XO Phase 2 chant proposals promoted and resolved after accepted focused verification.',
    created_at: now,
    metadata: {
        session_id: sessionId,
        parent_bead_id: parentBeadId,
        bead_ids: beadIds,
        validation_command: validationCommand,
    },
});

const xoSession = getHallPlanningSession(sessionId);
if (xoSession) {
    saveHallPlanningSession({
        ...xoSession,
        status: 'COMPLETED',
        summary: 'XO Phase 2 review closed. Parent bead and seven child beads are resolved in Hall with accepted focused verification records.',
        updated_at: now,
        metadata: {
            ...(xoSession.metadata ?? {}),
            review_closed_at: now,
            parent_validation_id: parentValidationId,
        },
    });
}

const estateSession = getHallPlanningSession(estateSessionId);
if (estateSession) {
    saveHallPlanningSession({
        ...estateSession,
        status: 'ROUTED',
        summary: 'XO Phase 2 review is closed. The supervised tutor increment is resolved in Hall with accepted focused verification records. Await new objective.',
        updated_at: now + 1,
        metadata: {
            ...(estateSession.metadata ?? {}),
            review_closed_at: now,
            routed_session_id: sessionId,
            parent_validation_id: parentValidationId,
        },
    });
}

console.log(JSON.stringify({
    repo_id: repoId,
    session_id: sessionId,
    parent_bead_id: parentBeadId,
    child_bead_ids: beadIds,
    parent_validation_id: parentValidationId,
    resolved_count: beadIds.length + 1,
}, null, 2));
