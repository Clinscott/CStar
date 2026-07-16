import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    renderOperationalContext,
    renderStandardCommandResult,
    resetCommandContextDedupe,
    shouldProjectOperationalContext,
} from '../../src/node/core/commands/command_context.js';
import {
    closeDb,
    getHallBead,
    getHallPlanningSession,
    saveHallPlanningSession,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

afterEach(() => {
    mock.reset();
    closeDb();
});

describe('output-only command context renderer', () => {
    it('projects only explicitly relevant metadata', () => {
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown', status: 'SUCCESS', output: 'ok',
        }), false);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown', status: 'SUCCESS', output: 'ok',
            metadata: { planning_session_id: 'session:1' },
        }), true);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown', status: 'SUCCESS', output: 'ok',
            metadata: { notes: 'bounded note' },
        }), true);
        assert.equal(shouldProjectOperationalContext({
            weave_id: 'weave:unknown', status: 'SUCCESS', output: 'ok',
            metadata: { context_policy: 'silent', planning_session_id: 'session:1' },
        }), false);
    });

    it('renders planning and note metadata without resolving the workspace', () => {
        resetCommandContextDedupe();
        const lines: string[] = [];
        mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map(String).join(' '));
        });

        renderOperationalContext({
            weave_id: 'weave:test',
            status: 'SUCCESS',
            output: 'ok',
            metadata: {
                planning_session_id: 'session:synthetic',
                planning_status: 'PROPOSAL_REVIEW',
                notes: '  Bounded output-only note.  ',
            },
        }, '/path/that/does/not/exist');

        assert.deepEqual(lines, [
            'handoff=PROPOSAL_REVIEW | session:synthetic',
            'note=Bounded output-only note.',
        ]);
    });

    it('renders runtime Augury metadata and deduplicates only in memory', () => {
        resetCommandContextDedupe();
        const lines: string[] = [];
        mock.method(console, 'log', (...args: unknown[]) => {
            lines.push(args.map(String).join(' '));
        });
        const result = {
            weave_id: 'weave:evolve',
            status: 'SUCCESS' as const,
            output: 'ok',
            metadata: {
                trace_contract: {
                    intent_category: 'EVOLVE',
                    selection_tier: 'WEAVE',
                    selection_name: 'evolve',
                    canonical_intent: 'Evolve one bounded bead.',
                    mimirs_well: [],
                    council_expert: { label: 'CARMACK' },
                },
                notes: 'Review the result.',
            },
        };

        renderOperationalContext(result, '/synthetic');
        renderOperationalContext(result, '/synthetic');

        assert.deepEqual(lines, [
            'augury=SUCCESS | WEAVE: evolve | EVOLVE | expert=CARMACK | Evolve one bounded bead.',
            'note=Review the result.',
        ]);
    });

    it('renders standard success/failure output without projecting failures', () => {
        const logs: string[] = [];
        const errors: string[] = [];
        mock.method(console, 'log', (...args: unknown[]) => logs.push(args.map(String).join(' ')));
        mock.method(console, 'error', (...args: unknown[]) => errors.push(args.map(String).join(' ')));

        assert.equal(renderStandardCommandResult({
            weave_id: 'weave:test', status: 'SUCCESS', output: 'complete',
        }, '/synthetic'), true);
        assert.equal(renderStandardCommandResult({
            weave_id: 'weave:test', status: 'FAILURE', error: 'synthetic failure',
        }, '/synthetic'), false);

        assert.match(logs[0] ?? '', /complete/);
        assert.match(errors[0] ?? '', /synthetic failure/);
    });

    it('cannot mutate synthetic Hall planning or bead records', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-command-context-no-write-'));
        registry.setRoot(root);
        closeDb();
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        const now = 1_700_000_000_000;
        saveHallPlanningSession({
            session_id: 'session:no-write',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'prove no write',
            normalized_intent: 'prove no write',
            summary: 'Synthetic session.',
            created_at: now,
            updated_at: now,
            metadata: { sentinel: 'unchanged' },
        });
        upsertHallBead({
            bead_id: 'bead:no-write',
            repo_id: repoId,
            rationale: 'Synthetic bead.',
            status: 'OPEN',
            created_at: now,
            updated_at: now,
            metadata: { sentinel: 'unchanged' },
        });
        const before = JSON.stringify({
            session: getHallPlanningSession('session:no-write'),
            bead: getHallBead('bead:no-write'),
        });
        mock.method(console, 'log', () => undefined);

        renderOperationalContext({
            weave_id: 'weave:synthetic',
            status: 'SUCCESS',
            output: 'synthetic',
            metadata: {
                planning_session_id: 'session:no-write',
                planning_status: 'PLAN_READY',
                execution_bead_id: 'bead:no-write',
                notes: 'This must remain output only.',
            },
        }, root);

        assert.equal(JSON.stringify({
            session: getHallPlanningSession('session:no-write'),
            bead: getHallBead('bead:no-write'),
        }), before);
    });
});
