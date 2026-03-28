import path from 'node:path';

import { persistArchitectProposal } from '../src/node/core/runtime/weaves/chant_planner.ts';
import { saveHallPlanningSession, getHallPlanningSession, listHallSkillProposals } from '../src/tools/pennyone/intel/session_manager.ts';
import { getHallBeads } from '../src/tools/pennyone/intel/bead_controller.ts';
import { upsertHallRepository } from '../src/tools/pennyone/intel/repository_manager.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../src/types/hall.js';

const cstarRoot = '/home/morderith/Corvus/CStar';
const xoRoot = '/home/morderith/Corvus/XO';
const now = Date.now();
const normalizedXoRoot = normalizeHallPath(xoRoot);
const repoId = buildHallRepositoryId(normalizedXoRoot);
const sessionId = 'chant-session:xo-phase1-runtime';
const traceId = 'xo-phase1-runtime-plan';

const intent = 'Convert the XO implementation plan into bounded CStar development beads for the new spoke XO, aligned to the Phase 1 guardian copilot substrate.';
const normalizedIntent = 'Plan XO phase one implementation beads for schema validation, scoped projections, lesson and feedback flow, adaptation approvals, Hermes memory, guardian workflow shell, and verification.';
const proposalSummary = 'XO Phase 1 is ready to enter bounded development as seven Hall beads: canonical schema, scoped projections, lesson evidence flow, adaptation approvals, Hermes engravings, guardian workflow shell, and verification/audit closure.';

const proposal = {
    proposal_summary: proposalSummary,
    beads: [
        {
            id: 'xo-phase1-schema-store',
            title: 'Canonical schema and storage substrate',
            rationale: 'Establish the authoritative SQLite schema, typed domain models, repositories, and validation boundaries so every later XO flow runs on explicit canonical records instead of prompt state.',
            targets: [
                'src/domain',
                'src/storage',
                'tests/domain',
            ],
            depends_on: [
                'docs/foundation/XO_MEMORY_MODEL.md',
                'docs/foundation/XO_LESSON_ENGINE.md',
                'docs/planning/XO_IMPLEMENTATION_PLAN.md',
            ],
            focus_hint: 'Start with children, lesson, evidence, adaptation, safety, and projection snapshot records plus schema versioning.',
            acceptance_criteria: [
                'Canonical XO records can be created and validated without any UI surface.',
                'SQLite migrations and typed boundary validation exist for the Phase 1 record set.',
                'The store shape matches XO foundation contracts rather than ad hoc runtime notes.',
            ],
            test_file_path: 'tests/domain',
        },
        {
            id: 'xo-phase1-projections-scope',
            title: 'Projection engine and child-scope enforcement',
            rationale: 'Prove that guardian and child projections are derived, regenerable, and bounded so XO does not leak cross-child context or treat projections as authority.',
            targets: [
                'src/projection',
                'src/safety',
                'tests/projection',
            ],
            depends_on: [
                'xo-phase1-schema-store',
                'docs/foundation/XO_SAFETY_LAW.md',
                'docs/foundation/XO_DIRECTIVE.md',
            ],
            focus_hint: 'Implement guardian planning, guardian review, child session, and weekly summary projections with hard-fail scope checks.',
            acceptance_criteria: [
                'Projection builders regenerate from canonical truth without hidden mutable state.',
                'Child projections hard-fail on mixed child scope or unauthorized retrieval.',
                'Guardian and child projection boundaries are explicit and auditable.',
            ],
            test_file_path: 'tests/projection',
        },
        {
            id: 'xo-phase1-lesson-feedback',
            title: 'Lesson execution and evidence ingestion flow',
            rationale: 'Turn lesson contracts into a real plan-run-evidence pipeline so one lesson can move through approval, execution, and evidence capture without freeform note drift.',
            targets: [
                'src/lesson_pipeline',
                'tests/lesson_pipeline',
            ],
            depends_on: [
                'xo-phase1-schema-store',
                'xo-phase1-projections-scope',
                'docs/foundation/XO_LESSON_ENGINE.md',
            ],
            focus_hint: 'Keep lesson drafts, approval state, run completion, assessment results, feedback events, and artifact outcomes explicit.',
            acceptance_criteria: [
                'A lesson can move end to end from plan to run to evidence capture.',
                'Assessment and guardian feedback ingestion write canonical evidence records.',
                'Lesson execution state remains explicit and reviewable.',
            ],
            test_file_path: 'tests/lesson_pipeline',
        },
        {
            id: 'xo-phase1-adaptation-approval',
            title: 'Adaptation engine and guardian approval flow',
            rationale: 'Bound XO adaptation to evidence-backed, reversible decisions so system usefulness grows without drifting into opaque automation.',
            targets: [
                'src/adaptation',
                'tests/adaptation',
            ],
            depends_on: [
                'xo-phase1-lesson-feedback',
                'docs/foundation/XO_MEMORY_MODEL.md',
            ],
            focus_hint: 'Classify progression bands, generate bounded decisions, and route risky changes through explicit approval gates.',
            acceptance_criteria: [
                'Every adaptation proposal cites stored evidence references.',
                'Risky changes remain guardian-gated and low-risk changes remain reversible.',
                'Adaptation state transitions are explainable and auditable.',
            ],
            test_file_path: 'tests/adaptation',
        },
        {
            id: 'xo-phase1-hermes-memory',
            title: 'Hermes engraving and weekly compression pipeline',
            rationale: 'Ground XO memory in the CStar append-and-project pattern so durable summaries stay linked to evidence instead of replacing it.',
            targets: [
                'src/memory',
                'tests/memory',
            ],
            depends_on: [
                'xo-phase1-lesson-feedback',
                'xo-phase1-adaptation-approval',
                'docs/foundation/XO_MEMORY_MODEL.md',
            ],
            focus_hint: 'Add lesson-level engravings, projection regeneration triggers, and weekly summary/compression placeholders.',
            acceptance_criteria: [
                'Lesson engravings summarize meaningful completions without becoming authority.',
                'Weekly summaries remain derivable from canonical truth and engraved summaries.',
                'Projection regeneration triggers are explicit and testable.',
            ],
            test_file_path: 'tests/memory',
        },
        {
            id: 'xo-phase1-guardian-shell',
            title: 'Minimal guardian workflow shell',
            rationale: 'Expose only the workflow surface needed to exercise planning, review, and approvals so XO proves usefulness through governed operations rather than UI sprawl.',
            targets: [
                'src/guardian_console',
                'tests/guardian_console',
            ],
            depends_on: [
                'xo-phase1-projections-scope',
                'xo-phase1-lesson-feedback',
                'xo-phase1-adaptation-approval',
                'docs/foundation/XO_GUARDIAN_CONSOLE.md',
            ],
            focus_hint: 'Keep the first shell narrow: overview, child detail, lesson review, and adaptation approval.',
            acceptance_criteria: [
                'Guardian workflows can exercise Phase 1 runtime records without hidden state.',
                'Pending approvals, lesson queue, review, and approval surfaces map to canonical records.',
                'No child-facing runtime or broad analytics are introduced in this slice.',
            ],
            test_file_path: 'tests/guardian_console',
        },
        {
            id: 'xo-phase1-verification-audit',
            title: 'Verification and audit closure for Phase 1',
            rationale: 'Lock the development loop to actual verification obligations so XO earns trust through constraints, scope enforcement, and auditability rather than appearances.',
            targets: [
                'tests',
                'docs/foundation/XO_VERIFICATION_ROADMAP.md',
            ],
            depends_on: [
                'xo-phase1-schema-store',
                'xo-phase1-projections-scope',
                'xo-phase1-lesson-feedback',
                'xo-phase1-adaptation-approval',
                'xo-phase1-hermes-memory',
                'xo-phase1-guardian-shell',
            ],
            focus_hint: 'Map each slice to lore, isolation, and audit checks, including cross-child leakage, evidence-backed adaptation, and projection regeneration.',
            acceptance_criteria: [
                'Phase 1 slices have focused verification for schema, scope, lifecycle, adaptation, approvals, and engravings.',
                'Audit coverage proves no cross-child leakage and no adaptation without stored evidence.',
                'Readiness is expressed through verification state, not prose alone.',
            ],
            test_file_path: 'tests',
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
        seeded_by: 'seed_xo_phase1_hall_plan',
        seeded_at: now,
        sovereign_root: cstarRoot,
    },
    created_at: now,
    updated_at: now,
});

const persisted = persistArchitectProposal(xoRoot, repoId, sessionId, proposal);

saveHallPlanningSession({
    session_id: sessionId,
    repo_id: repoId,
    skill_id: 'chant',
    status: 'PLAN_READY',
    user_intent: intent,
    normalized_intent: normalizedIntent,
    summary: proposalSummary,
    architect_opinion: 'The safe path is a narrow guardian copilot substrate. Defer broad UX, child-facing runtime, and flashy surfaces until canonical state, projections, approvals, and verification are proven.',
    current_bead_id: persisted.beadIds[0],
    created_at: now,
    updated_at: now,
    metadata: {
        trace_id: traceId,
        seeded_by: 'seed_xo_phase1_hall_plan',
        sovereign_root: cstarRoot,
        authority_docs: [
            'docs/planning/XO_IMPLEMENTATION_PLAN.md',
            'docs/planning/XO_CHANT_IMPLEMENTATION_ROUTING.md',
            'docs/foundation/XO_VERIFICATION_ROADMAP.md',
        ],
        bead_ids: persisted.beadIds,
        proposal_ids: persisted.proposalIds,
        fallback_reason: 'chant_research_bridge_unavailable',
    },
});

const session = getHallPlanningSession(sessionId);
const beadCount = getHallBeads(repoId).filter((bead) => persisted.beadIds.includes(bead.id)).length;
const proposalCount = listHallSkillProposals(xoRoot, { skill_id: 'chant', statuses: ['PROPOSED'] })
    .filter((candidate) => persisted.proposalIds.includes(candidate.proposal_id)).length;

console.log(JSON.stringify({
    session_id: session?.session_id ?? sessionId,
    repo_id: repoId,
    current_bead_id: session?.current_bead_id ?? persisted.beadIds[0],
    seeded_bead_ids: persisted.beadIds,
    seeded_proposal_ids: persisted.proposalIds,
    bead_count: beadCount,
    proposal_count: proposalCount,
    status: session?.status ?? 'PLAN_READY',
}, null, 2));
