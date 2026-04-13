import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    renderOperationalContext,
    resetCommandContextDedupe,
    shouldProjectOperationalContext,
} from '../../src/node/core/commands/command_context.js';
import { closeDb, getHallBead, saveHallPlanningSession, upsertHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

describe('Command context renderer', () => {
    it('projects ambient context only for planning-relevant or explicitly annotated results', () => {
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:chant',
            status: 'SUCCESS',
            output: 'ok',
        }), false);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown',
            status: 'SUCCESS',
            output: 'ok',
        }), false);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown',
            status: 'SUCCESS',
            output: 'ok',
            metadata: {
                planning_session_id: 'chant-session:123',
            },
        }), true);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown',
            status: 'SUCCESS',
            output: 'ok',
            metadata: {
                context_policy: 'project',
            },
        }), true);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:chant',
            status: 'SUCCESS',
            output: 'ok',
            metadata: {
                context_policy: 'silent',
                planning_session_id: 'chant-session:123',
            },
        }), false);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:orchestrate',
            status: 'SUCCESS',
            output: 'ok',
            metadata: {
                context_policy: 'project',
            },
        }), true);
    });

    it('automatically emits planning trace and concise note lines after command results', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-context-'));
        registry.setRoot(tmpRoot);
        closeDb();
        resetCommandContextDedupe();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-AUTO',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'ambient trace',
            normalized_intent: 'ambient trace',
            summary: 'Proposal ready.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-AUTO',
                branch_ledger_digest: {
                    total_branches: 2,
                    groups: [
                        { branch_kind: 'research', branch_count: 2, needs_revision: false },
                    ],
                    artifacts: ['README.md'],
                },
            },
        });

        const lines: string[] = [];
        const restore = mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map((value) => String(value)).join(' '));
        });

        try {
            renderOperationalContext({
                weave_id: 'weave:test',
                status: 'SUCCESS',
                output: 'ok',
                metadata: {
                    planning_session_id: 'chant-session:TRACE-AUTO',
                    notes: '  Governor approved a bounded path after reviewing the Hall trace.  ',
                },
            }, tmpRoot);
        } finally {
            restore.mock.restore();
            closeDb();
        }

        assert.equal(lines.length, 2);
        assert.match(lines[0] ?? '', /trace=PROPOSAL_REVIEW \| TRACE-AUTO \| \{R=2 A=1\} \| Proposal ready\./);
        assert.match(lines[1] ?? '', /note=Governor approved a bounded path after reviewing the Hall trace\./);
    });

    it('stays silent for non-operational results without planning metadata', () => {
        const lines: string[] = [];
        const restore = mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map((value) => String(value)).join(' '));
        });

        try {
            renderOperationalContext({
                weave_id: 'weave:unknown',
                status: 'SUCCESS',
                output: 'ok',
            }, '/tmp/irrelevant');
        } finally {
            restore.mock.restore();
        }

        assert.equal(lines.length, 0);
    });

    it('suppresses identical ambient context until the Hall-backed state changes', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-context-dedupe-'));
        registry.setRoot(tmpRoot);
        closeDb();
        resetCommandContextDedupe();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-DEDUP',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'dedupe trace',
            normalized_intent: 'dedupe trace',
            summary: 'Proposal ready.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-DEDUP',
                branch_ledger_digest: {
                    total_branches: 1,
                    groups: [
                        { branch_kind: 'research', branch_count: 1, needs_revision: false },
                    ],
                    artifacts: [],
                },
            },
        });

        const lines: string[] = [];
        const logRestore = mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map((value) => String(value)).join(' '));
        });

        try {
            const result = {
                weave_id: 'weave:test',
                status: 'SUCCESS' as const,
                output: 'ok',
                metadata: {
                    planning_session_id: 'chant-session:TRACE-DEDUP',
                    notes: 'Stable bounded path.',
                },
            };

            renderOperationalContext(result, tmpRoot);
            renderOperationalContext(result, tmpRoot);
            renderOperationalContext({
                ...result,
                metadata: {
                    ...result.metadata,
                    notes: 'State changed after review.',
                },
            }, tmpRoot);
        } finally {
            logRestore.mock.restore();
            closeDb();
        }

        assert.equal(lines.length, 3);
        assert.match(lines[0] ?? '', /trace=PROPOSAL_REVIEW \| TRACE-DEDUP \| \{R=1\} \| Proposal ready\./);
        assert.match(lines[1] ?? '', /note=Stable bounded path\./);
        assert.match(lines[2] ?? '', /note=State changed after review\./);
    });

    it('persists last emitted host context in Hall so a fresh process stays quiet', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-context-hall-'));
        registry.setRoot(tmpRoot);
        closeDb();
        resetCommandContextDedupe();
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const now = Date.now();

        saveHallPlanningSession({
            session_id: 'chant-session:TRACE-HALL',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'persist host context',
            normalized_intent: 'persist host context',
            summary: 'Proposal ready.',
            created_at: now,
            updated_at: now,
            metadata: {
                trace_id: 'TRACE-HALL',
                branch_ledger_digest: {
                    total_branches: 1,
                    groups: [
                        { branch_kind: 'research', branch_count: 1, needs_revision: false },
                    ],
                    artifacts: ['README.md'],
                },
            },
        });

        const lines: string[] = [];
        const restore = mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map((value) => String(value)).join(' '));
        });

        try {
            const result = {
                weave_id: 'weave:test',
                status: 'SUCCESS' as const,
                output: 'ok',
                metadata: {
                    planning_session_id: 'chant-session:TRACE-HALL',
                    notes: 'Persist this host context.',
                },
            };

            renderOperationalContext(result, tmpRoot);
            resetCommandContextDedupe();
            renderOperationalContext(result, tmpRoot);
        } finally {
            restore.mock.restore();
            closeDb();
        }

        assert.equal(lines.length, 2);
        assert.match(lines[0] ?? '', /trace=PROPOSAL_REVIEW \| TRACE-HALL \| \{R=1 A=1\} \| Proposal ready\./);
        assert.match(lines[1] ?? '', /note=Persist this host context\./);
    });

    it('emits and persists runtime trace context for non-planning executions', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-context-runtime-'));
        registry.setRoot(tmpRoot);
        closeDb();
        resetCommandContextDedupe();
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
            created_at: now,
            updated_at: now,
        });

        const lines: string[] = [];
        const restore = mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map((value) => String(value)).join(' '));
        });

        try {
            renderOperationalContext({
                weave_id: 'weave:evolve',
                status: 'SUCCESS',
                output: 'ok',
                metadata: {
                    mission_bead_id: 'mission-runtime-1',
                    execution_bead_id: 'mission-runtime-1:exec:weave:evolve:1',
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
                        council_expert: {
                            id: 'carmack',
                            label: 'CARMACK',
                            root_persona_directive: 'Adapt the root persona into a performance pragmatist.',
                        },
                    },
                    notes: 'Review the execution bead before promoting follow-up work.',
                },
            }, tmpRoot);
        } finally {
            restore.mock.restore();
            closeDb();
        }

        assert.equal(lines.length, 2);
        assert.match(lines[0] ?? '', /trace=SUCCESS \| WEAVE: evolve \| EVOLVE \| expert=CARMACK \| Evolve bead bead-runtime-1\./);
        assert.match(lines[1] ?? '', /note=Review the execution bead before promoting follow-up work\./);

        const executionBead = getHallBead('mission-runtime-1:exec:weave:evolve:1');
        assert.equal((executionBead?.metadata?.host_cli_context as Record<string, unknown>)?.trace_line, 'trace=SUCCESS | WEAVE: evolve | EVOLVE | expert=CARMACK | Evolve bead bead-runtime-1.');
        assert.equal((executionBead?.metadata?.host_cli_context as Record<string, unknown>)?.note_line, 'note=Review the execution bead before promoting follow-up work.');
    });
});
