import path from 'node:path';

import { persistArchitectProposal } from '../src/node/core/runtime/weaves/chant_planner.ts';
import { getHallBead, getHallBeads, upsertHallBead } from '../src/tools/pennyone/intel/bead_controller.ts';
import { getHallPlanningSession, saveHallPlanningSession } from '../src/tools/pennyone/intel/session_manager.ts';
import { registry } from '../src/tools/pennyone/pathRegistry.ts';
import { upsertHallRepository } from '../src/tools/pennyone/intel/repository_manager.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../src/types/hall.js';

const cstarRoot = '/home/morderith/Corvus/CStar';
const estateRoot = '/home/morderith/Corvus';
const xoRoot = '/home/morderith/Corvus/XO';
const now = Date.now();
const estateRepoId = buildHallRepositoryId(normalizeHallPath(estateRoot));
const normalizedXoRoot = normalizeHallPath(xoRoot);
const repoId = buildHallRepositoryId(normalizedXoRoot);
const sessionId = 'chant-session:xo-phase2-supervised-tutor';
const estateSessionId = 'chant-session:repo:/home/morderith/Corvus:xo-phase2-supervised-tutor';
const traceId = 'xo-phase2-supervised-tutor-plan';
const parentBeadId = 'pb-xo-phase2-supervised-tutor';

const intent = 'Convert XO Phase 2 into bounded Hall beads for the supervised tutor runtime, then repair Hall continuity so the estate reflects the implemented and verified Phase 2 state.';
const normalizedIntent = 'Plan and record XO phase two as supervised session envelopes, lesson playback, bounded tutoring acts, guardian oversight, disclosure shaping, live safety escalation, and session audit with verified review readiness.';
const proposalSummary = 'XO Phase 2 is implemented as a supervised tutor runtime. Hall continuity is repaired here as one parent bead plus seven child beads, all ready for review with focused verification evidence.';
const architectOpinion = 'The safe Phase 2 path stays session-envelope first, lesson-playback first, tutoring bounded by approved lessons, guardian oversight live during execution, disclosure shaped by policy, and safety escalation preserved as durable session audit.';
const reviewNote = 'Implemented in XO and verified through focused session, tutor, guardian, disclosure, safety, and verification audit tests. Awaiting Hall review, not more speculative feature work.';

registry.setRoot(estateRoot);

const proposal = {
    proposal_summary: proposalSummary,
    beads: [
        {
            id: 'xo-phase2-bead-01',
            title: 'Session envelope schema, lifecycle, and fail-closed validation',
            rationale: 'Establish supervised session records as canonical runtime authority so no child-facing tutoring path can execute without an explicit, one-child session envelope.',
            targets: [
                'src/storage/schema.ts',
                'src/storage/store.ts',
                'src/storage/repositories.ts',
                'src/domain/entities.ts',
                'src/domain/validation.ts',
            ],
            depends_on: [
                'docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
                'docs/foundation/XO_SAFETY_LAW.md',
            ],
            focus_hint: 'Keep session law explicit: status, playback, child scope, capability flags, and terminal handling must fail closed.',
            acceptance_criteria: [
                'Supervised sessions are persisted as canonical records with explicit lifecycle state.',
                'Cross-child or invalid playback/session combinations hard-fail.',
                'No tutoring path can proceed without a valid session envelope.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/schema_store.test.ts tests/session_runtime.test.ts',
            test_file_path: 'tests/session_runtime.test.ts',
        },
        {
            id: 'xo-phase2-bead-02',
            title: 'Lesson playback state machine and resume interrupt flow',
            rationale: 'Turn approved lessons into deterministic playback so Phase 2 tutoring remains lesson-bound, resumable, and auditable.',
            targets: [
                'src/session/runtime.ts',
                'src/projection/engine.ts',
                'src/projection/types.ts',
            ],
            depends_on: [
                'xo-phase2-bead-01',
                'docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
            ],
            focus_hint: 'Expose one active playback step at a time and keep pause, resume, advance, and interrupt state explicit.',
            acceptance_criteria: [
                'Approved lessons execute as deterministic supervised playback.',
                'Projection state reflects live session and playback metadata instead of inferred tutor state.',
                'Guardian interruption and resume stay explicit and reviewable.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/session_runtime.test.ts tests/projection_engine.test.ts',
            test_file_path: 'tests/projection_engine.test.ts',
        },
        {
            id: 'xo-phase2-bead-03',
            title: 'Bounded tutoring acts and scoped prompt assembly',
            rationale: 'Allow live child support without drifting into open-ended companionship by constraining outputs to lesson-scoped tutoring acts.',
            targets: [
                'src/tutor/acts.ts',
            ],
            depends_on: [
                'xo-phase2-bead-01',
                'xo-phase2-bead-02',
                'docs/foundation/XO_SAFETY_LAW.md',
            ],
            focus_hint: 'Only emit lesson-bound questions, hints, encouragement, and guardian-support acts from a valid child session projection.',
            acceptance_criteria: [
                'Tutor turns are generated only from validated child-session projections.',
                'Paused, cross-child, or lesson-misaligned sessions fail closed.',
                'No sibling comparison, guardian-planning leakage, or freeform child chat is introduced.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts',
            test_file_path: 'tests/tutor_acts.test.ts',
        },
        {
            id: 'xo-phase2-bead-04',
            title: 'Guardian live oversight, pause, resume, and review workflows',
            rationale: 'Keep the guardian as active runtime authority by exposing live status and structural intervention controls during tutoring.',
            targets: [
                'src/guardian/shell.ts',
            ],
            depends_on: [
                'xo-phase2-bead-02',
                'xo-phase2-bead-03',
                'docs/foundation/XO_GUARDIAN_CONSOLE.md',
            ],
            focus_hint: 'Expose live session view, current step, tutor turn, support acts, and canonical control affordances without adding a freeform side channel.',
            acceptance_criteria: [
                'The guardian can inspect, pause, resume, advance, and abort live sessions structurally.',
                'Oversight reflects session and playback authority rather than transcript inference.',
                'Guardian review remains available without broad UI expansion.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/guardian_shell.test.ts tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts',
            test_file_path: 'tests/guardian_shell.test.ts',
        },
        {
            id: 'xo-phase2-bead-05',
            title: 'Disclosure shaping and trust-preserving guardian summaries',
            rationale: 'Provide useful guardian reporting without defaulting to surveillance by shaping live summaries through policy-aware disclosure rules.',
            targets: [
                'src/tutor/disclosure_summary.ts',
                'src/guardian/shell.ts',
            ],
            depends_on: [
                'xo-phase2-bead-03',
                'xo-phase2-bead-04',
                'docs/foundation/XO_SAFETY_LAW.md',
            ],
            focus_hint: 'Generalize by default, mark withheld detail explicitly, and escalate only when high-risk language is present.',
            acceptance_criteria: [
                'Guardian summaries describe themes without dumping raw child transcript detail by default.',
                'Withheld detail and escalation mode are explicit in the output.',
                'Disclosure shaping stays separate from child-facing tutor output.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/disclosure_summary.test.ts tests/guardian_shell.test.ts tests/tutor_acts.test.ts',
            test_file_path: 'tests/disclosure_summary.test.ts',
        },
        {
            id: 'xo-phase2-bead-06',
            title: 'Live safety classification, escalation, and session audit ledger',
            rationale: 'Make safety review a live runtime behavior with durable audit records rather than a transient post-hoc impression.',
            targets: [
                'src/verification/audit.ts',
                'src/storage/schema.ts',
                'src/storage/store.ts',
                'src/storage/repositories.ts',
            ],
            depends_on: [
                'xo-phase2-bead-05',
                'docs/foundation/XO_VERIFICATION_ROADMAP.md',
            ],
            focus_hint: 'Classify tutor cycles as routine, review, or escalate, and persist immutable session audit events plus canonical safety events.',
            acceptance_criteria: [
                'Live tutor/disclosure cycles produce durable session audit records.',
                'Review and escalation thresholds emit canonical safety events.',
                'Audit state preserves actor, action, policy category, and timestamp.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/live_safety_audit.test.ts tests/verification_audit.test.ts tests/disclosure_summary.test.ts tests/guardian_shell.test.ts',
            test_file_path: 'tests/live_safety_audit.test.ts',
        },
        {
            id: 'xo-phase2-bead-07',
            title: 'Verification matrix, regression harness, and Phase 2 exit scoring',
            rationale: 'Express Phase 2 readiness through explicit verification coverage and scoring instead of prose claims.',
            targets: [
                'src/verification/audit.ts',
                'tests/verification_audit.test.ts',
            ],
            depends_on: [
                'xo-phase2-bead-01',
                'xo-phase2-bead-02',
                'xo-phase2-bead-03',
                'xo-phase2-bead-04',
                'xo-phase2-bead-05',
                'xo-phase2-bead-06',
                'docs/foundation/XO_VERIFICATION_ROADMAP.md',
            ],
            focus_hint: 'Score the exact Phase 2 exit themes: session law, lesson-bound tutoring, guardian oversight, disclosure boundaries, escalation traceability, and preserved Phase 1 guarantees.',
            acceptance_criteria: [
                'Verification audit reports a concrete Phase 2 readiness score.',
                'The green path proves Phase 2 ready and degraded paths prove score regression when guarantees fail.',
                'Regression harness coverage is visible in the audit output.',
            ],
            checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/verification_audit.test.ts tests/live_safety_audit.test.ts tests/disclosure_summary.test.ts tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts',
            test_file_path: 'tests/verification_audit.test.ts',
        },
    ],
};

upsertHallRepository({
    repo_id: repoId,
    root_path: xoRoot,
    name: path.basename(xoRoot),
    status: 'AWAKE',
    active_persona: 'O.D.I.N.',
    baseline_gungnir_score: 0,
    intent_integrity: 1,
    metadata: {
        seeded_by: 'seed_xo_phase2_hall_plan',
        seeded_at: now,
        sovereign_root: cstarRoot,
    },
    created_at: now,
    updated_at: now,
});

upsertHallBead({
    bead_id: parentBeadId,
    repo_id: repoId,
    target_kind: 'WORKFLOW',
    target_ref: sessionId,
    target_path: 'docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
    rationale: 'Phase 2 parent mission for XO supervised tutor runtime, covering session law, playback, bounded tutoring, guardian oversight, disclosure shaping, live safety classification, and verification readiness.',
    contract_refs: [
        'docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
        'docs/planning/XO_PHASE_2_CHANT_IMPLEMENTATION_ROUTING.md',
        'docs/planning/XO_PHASE_2_CHANT_HANDOFF.md',
        'docs/foundation/XO_VERIFICATION_ROADMAP.md',
        'docs/foundation/XO_SAFETY_LAW.md',
    ],
    baseline_scores: {},
    acceptance_criteria: 'Phase 2 child beads are implemented in XO, verified on focused slices, and ready for Hall review as a complete supervised tutor increment.',
    checker_shell: 'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/verification_audit.test.ts tests/live_safety_audit.test.ts tests/disclosure_summary.test.ts tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts',
    status: 'READY_FOR_REVIEW',
    source_kind: 'CHANT',
    resolution_note: reviewNote,
    architect_opinion: architectOpinion,
    created_at: now,
    updated_at: now,
});

const persisted = persistArchitectProposal(xoRoot, repoId, sessionId, proposal);

for (const beadId of persisted.beadIds) {
    const bead = getHallBead(beadId);
    if (!bead) {
        continue;
    }

    upsertHallBead({
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id,
        legacy_id: bead.legacy_id,
        target_kind: bead.target_kind,
        target_ref: parentBeadId,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: 'READY_FOR_REVIEW',
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        resolution_note: reviewNote,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        created_at: bead.created_at,
        updated_at: now,
    });
}

const seededBeadIds = [parentBeadId, ...persisted.beadIds];

saveHallPlanningSession({
    session_id: sessionId,
    repo_id: repoId,
    skill_id: 'chant',
    status: 'ROUTED',
    user_intent: intent,
    normalized_intent: normalizedIntent,
    summary: 'XO Phase 2 Hall continuity repaired. Parent bead and seven child beads are present in Hall and marked READY_FOR_REVIEW with focused XO verification evidence. Next action: review and resolve the parent bead.',
    architect_opinion: architectOpinion,
    current_bead_id: parentBeadId,
    created_at: now,
    updated_at: now,
    metadata: {
        trace_id: traceId,
        seeded_by: 'seed_xo_phase2_hall_plan',
        sovereign_root: cstarRoot,
        authority_docs: [
            'docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
            'docs/planning/XO_PHASE_2_CHANT_IMPLEMENTATION_ROUTING.md',
            'docs/planning/XO_PHASE_2_CHANT_HANDOFF.md',
            'docs/foundation/XO_VERIFICATION_ROADMAP.md',
        ],
        bead_ids: seededBeadIds,
        proposal_ids: persisted.proposalIds,
        fallback_reason: 'chant_research_bridge_unavailable',
        implementation_state: 'phase_2_beads_implemented',
        verification_commands: [
            'node ../CStar/node_modules/tsx/dist/cli.mjs --test tests/verification_audit.test.ts tests/live_safety_audit.test.ts tests/disclosure_summary.test.ts tests/tutor_acts.test.ts tests/session_runtime.test.ts tests/projection_engine.test.ts',
        ],
    },
});

saveHallPlanningSession({
    session_id: estateSessionId,
    repo_id: estateRepoId,
    skill_id: 'chant',
    status: 'ROUTED',
    user_intent: 'Route estate attention to XO Phase 2 supervised tutor review readiness.',
    normalized_intent: 'Estate active trace for XO Phase 2 supervised tutor Hall continuity and review routing.',
    summary: 'XO Phase 2 is the active routed estate trace. Hall now records the parent bead and seven child beads at READY_FOR_REVIEW with focused XO verification evidence.',
    architect_opinion: architectOpinion,
    current_bead_id: parentBeadId,
    created_at: now,
    updated_at: now + 1,
    metadata: {
        trace_id: 'repo:/home/morderith/Corvus:xo-phase2-supervised-tutor',
        routed_spoke: 'XO',
        routed_session_id: sessionId,
        bead_ids: seededBeadIds,
        authority_docs: [
            'XO/docs/planning/XO_PHASE_2_IMPLEMENTATION_PLAN.md',
            'XO/docs/planning/XO_PHASE_2_CHANT_HANDOFF.md',
        ],
    },
});

const session = getHallPlanningSession(sessionId);
const beadCount = getHallBeads(repoId).filter((bead) => seededBeadIds.includes(bead.id)).length;

console.log(JSON.stringify({
    session_id: session?.session_id ?? sessionId,
    repo_id: repoId,
    current_bead_id: session?.current_bead_id ?? parentBeadId,
    seeded_bead_ids: seededBeadIds,
    seeded_proposal_ids: persisted.proposalIds,
    bead_count: beadCount,
    status: session?.status ?? 'ROUTED',
}, null, 2));
