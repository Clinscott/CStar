import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderOperatorShell, shouldLaunchOperatorTui, type OperatorSnapshot } from  '../../src/node/core/tui/operator_tui.js';

function stripAnsi(value: string): string {
    return value.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

describe('Operator TUI shell (CS-P7-02)', () => {
    it('launches only when the tui command is explicitly requested', () => {
        assert.equal(shouldLaunchOperatorTui([], true), false);
        assert.equal(shouldLaunchOperatorTui(['--root', 'C:\\Estate\\KeepOS'], true), false);
        assert.equal(shouldLaunchOperatorTui(['tui'], true), true);
        assert.equal(shouldLaunchOperatorTui(['--root', 'C:\\Estate\\KeepOS', 'tui'], true), true);
        assert.equal(shouldLaunchOperatorTui(['status'], true), false);
        assert.equal(shouldLaunchOperatorTui(['ravens', 'status'], true), false);
    });

    it('renders the operator shell with Hall, bead, proposal, and event sections', () => {
        const snapshot: OperatorSnapshot = {
            workspaceRoot: 'C:/Users/Craig/Corvus/CorvusStar',
            state: {
                framework: {
                    status: 'AWAKE',
                    last_awakening: 1700000000000,
                    active_persona: 'ALFRED',
                    active_task: 'TUI bootstrap',
                    mission_id: 'MISSION-7000',
                    gungnir_score: 8.8,
                    intent_integrity: 97,
                },
                identity: {
                    name: 'Corvus Star',
                    tagline: 'One mind.',
                    guiding_principles: ['Hall first'],
                    use_systems: {
                        interface: 'TUI',
                        orchestration: 'Runtime',
                        intelligence: 'Kernel',
                        memory: 'Hall',
                        visualization: 'PennyOne',
                    },
                },
                hall_of_records: {
                    description: 'Hall',
                    primary_assets: {
                        database: '.stats/pennyone.db',
                        contracts: '.agents/skills',
                        lore: '.agents/lore',
                        history: 'dev_journal.qmd',
                    },
                },
                managed_spokes: [],
                operator_console: {
                    default_entrypoint: 'tui',
                    preferred_prompt_position: 'top',
                    verbose_stream: true,
                    theme: 'matrix',
                },
            },
            hallSummary: {
                repo_id: 'repo:test',
                root_path: 'C:/Users/Craig/Corvus/CorvusStar',
                name: 'CorvusStar',
                status: 'AWAKE',
                active_persona: 'ALFRED',
                baseline_gungnir_score: 8.8,
                intent_integrity: 97,
                last_scan_id: 'hall-scan:1',
                last_scan_status: 'COMPLETED',
                last_scan_at: 1700000001000,
                open_beads: 2,
                validation_runs: 4,
                last_validation_at: 1700000002000,
            },
            beads: [
                {
                    id: 'bead-1',
                    repo_id: 'repo:test',
                    scan_id: 'hall-scan:1',
                    target_kind: 'FILE',
                    target_ref: 'src/node/core/runtime/dispatcher.ts',
                    rationale: 'Fortify runtime targeting.',
                    contract_refs: ['contract:runtime'],
                    baseline_scores: { overall: 7.4 },
                    status: 'READY_FOR_REVIEW',
                    created_at: 1700000000000,
                    updated_at: 1700000000001,
                },
            ],
            planningSessions: [
                {
                    session_id: 'chant-session:1',
                    repo_id: 'repo:test',
                    skill_id: 'chant',
                    status: 'PROPOSAL_REVIEW',
                    user_intent: 'help me rebuild chant',
                    normalized_intent: 'help me rebuild chant',
                    latest_question: 'Which repo, spoke, bead, or file should this plan target?',
                    created_at: 1700000000000,
                    updated_at: 1700000000001,
                    metadata: {
                        trace_id: 'TRACE-PLAN-1',
                        branch_ledger_digest: {
                            trace_id: 'TRACE-PLAN-1',
                            total_branches: 3,
                            group_count: 2,
                            branch_kinds: ['research', 'critique'],
                            artifacts: ['src/runtime.ts'],
                            groups: [
                                {
                                    branch_group_id: 'research:TRACE-PLAN-1',
                                    source_weave: 'weave:research',
                                    branch_kind: 'research',
                                    provider: 'codex',
                                    branch_count: 2,
                                    branch_labels: ['layout', 'tests'],
                                    summary: 'Research stayed bounded.',
                                    artifacts: ['src/runtime.ts'],
                                    needs_revision: false,
                                    evidence_sources: [],
                                    proposed_paths: [],
                                },
                                {
                                    branch_group_id: 'critique:TRACE-PLAN-1',
                                    source_weave: 'weave:critique',
                                    branch_kind: 'critique',
                                    provider: 'codex',
                                    branch_count: 1,
                                    branch_labels: ['validation'],
                                    summary: 'Validation path needs tightening.',
                                    artifacts: [],
                                    needs_revision: true,
                                    evidence_sources: ['repo:validation'],
                                    proposed_paths: ['src/runtime.ts'],
                                },
                            ],
                        },
                    },
                },
            ],
            proposals: [
                {
                    proposal_id: 'proposal-1',
                    repo_id: 'repo:test',
                    skill_id: 'evolve',
                    status: 'PROPOSED',
                    summary: 'Raise low Gungnir sectors.',
                    created_at: 1700000000000,
                    updated_at: 1700000000001,
                },
            ],
            events: [
                {
                    at: 1700000003000,
                    level: 'INFO',
                    message: 'Intent lane armed.',
                    detail: 'Awaiting operator input.',
                },
            ],
        };

        const rendered = stripAnsi(renderOperatorShell(snapshot));
        assert.match(rendered, /CORVUS STAR OPERATOR MATRIX/i);
        assert.match(rendered, /INTENT LANE/i);
        assert.match(rendered, /OPEN BEADS/i);
        assert.match(rendered, /PLAN 1/i);
        assert.match(rendered, /TRACE-PLAN-1/);
        assert.match(rendered, /R=2 C=1 REV=1 A=1/);
        assert.match(rendered, /PROPOSAL 1/i);
        assert.match(rendered, /EVENT 1/i);
    });
});
