import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildTraceStatusPayload, renderTraceStatusLines } from '../../src/node/core/commands/trace.js';
import { closeDb, saveHallPlanningSession, upsertHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

function stripAnsi(value: string): string {
    return value.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

describe('Trace command', () => {
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
        assert.equal(lines[2], 'digest=R=2 C=1 REV=1 A=2');
        assert.equal(lines[3], 'beads total=2 set=1 open=1 review=0');
        assert.equal(lines[4], 'artifacts=src/runtime.ts, tests/unit/runtime.test.ts');
        assert.match(lines[5] ?? '', /branch research x2 labels=layout, tests/);
        assert.match(lines[6] ?? '', /branch critique x1 rev labels=validation/);

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
            metadata: {
                trace_id: 'TRACE-JSON',
                bead_ids: ['bead-json-1'],
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
            status: 'SET',
            created_at: now,
            updated_at: now,
        });

        const payload = buildTraceStatusPayload(session, tmpRoot);
        assert.deepEqual(payload, {
            trace_id: 'TRACE-JSON',
            session_id: 'chant-session:TRACE-JSON',
            handle: 'TRACE-JSON',
            status: 'PLAN_READY',
            focus: 'Ready for execution.',
            digest_badge: 'R=1 C=1 REV=1 A=1',
            bead_summary: {
                total: 1,
                set: 1,
                open: 0,
                review: 0,
            },
            artifacts: ['src/runtime.ts'],
            branches: [
                {
                    kind: 'research',
                    count: 1,
                    needs_revision: false,
                    labels: ['layout'],
                    summary: 'Layout scoped.',
                    artifacts: ['src/runtime.ts'],
                    evidence_sources: [],
                    proposed_paths: [],
                },
                {
                    kind: 'critique',
                    count: 1,
                    needs_revision: true,
                    labels: ['validation'],
                    summary: 'Validation is still weak.',
                    artifacts: [],
                    evidence_sources: ['repo:validation'],
                    proposed_paths: ['tests/unit/runtime.test.ts'],
                },
            ],
        });

        closeDb();
    });
});
