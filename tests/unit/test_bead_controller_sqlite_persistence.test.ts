import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    getHallBead,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';
import { handleBead as handleMonolithBead } from '../../src/tools/cstar-kernel-mcp.js';
import { handleBead as handleModularBead } from '../../src/tools/cstar-kernel-mcp/tools/bead.js';

function parseToolResult(result: { content: Array<{ text: string }> }): any {
    return JSON.parse(result.content[0].text);
}

describe('Bead controller SQLite persistence', () => {
    let tmpRoot: string;
    let previousRoot: string;

    beforeEach(() => {
        previousRoot = registry.getRoot();
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-bead-persist-'));
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRoot);
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('persists resolved validation ids through real Hall conflict updates', () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Create bead before validation exists.',
            status: 'OPEN',
            created_at: 1000,
            updated_at: 1000,
        });

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Resolve bead with validation evidence.',
            status: 'RESOLVED',
            resolution_note: 'Validated through focused regression test.',
            resolved_validation_id: 'val-test-123',
            created_at: 1000,
            updated_at: 2000,
        });

        const resolved = getHallBead('bead:test-validation-persistence');
        assert.ok(resolved, 'resolved bead should be readable from Hall');
        assert.equal(resolved.status, 'RESOLVED');
        assert.equal(resolved.resolved_validation_id, 'val-test-123');

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Follow-up metadata update must not erase the validation link.',
            status: 'RESOLVED',
            created_at: 1000,
            updated_at: 3000,
        });

        const afterFollowUp = getHallBead('bead:test-validation-persistence');
        assert.equal(afterFollowUp?.resolved_validation_id, 'val-test-123');
    });

    for (const [label, handleBead] of [
        ['monolith', handleMonolithBead],
        ['modular', handleModularBead],
    ] as const) {
        it(`reads back resolved validation ids through real Hall handler path (${label})`, async () => {
            const beadId = `bead:test-handler-validation-persistence:${label}`;

            const createResult = parseToolResult(await handleBead({
                action: 'create',
                bead_id: beadId,
                rationale: `Create ${label} handler bead before validation exists.`,
                target_kind: 'VALIDATION',
                target_path: 'src/tools/cstar-kernel-mcp.ts',
            }));
            assert.equal(createResult.status, 'created');

            const resolveResult = parseToolResult(await handleBead({
                action: 'resolve',
                bead_id: beadId,
                resolution_note: 'Resolved after focused handler verification.',
                resolved_validation_id: `val-handler-${label}`,
                mandate_evidence: {
                    mandate_exempt: true,
                    exemption_reason: 'handler persistence regression test',
                },
            }));
            assert.equal(resolveResult.status, 'resolved');
            assert.equal(resolveResult.bead.status, 'RESOLVED');
            assert.equal(resolveResult.bead.resolved_validation_id, `val-handler-${label}`);

            const getResult = parseToolResult(await handleBead({
                action: 'get',
                bead_id: beadId,
            }));
            assert.equal(getResult.status, 'ok');
            assert.equal(getResult.bead.status, 'RESOLVED');
            assert.equal(getResult.bead.resolved_validation_id, `val-handler-${label}`);

            const listResult = parseToolResult(await handleBead({
                action: 'list',
                statuses: ['RESOLVED'],
            }));
            const listed = listResult.beads.find((bead: any) => bead.bead_id === beadId);
            assert.ok(listed, 'resolved bead should appear in list output');
            assert.equal(listed.resolved_validation_id, `val-handler-${label}`);

            const stored = getHallBead(beadId);
            assert.equal(stored?.metadata?.resolved_validation_id, `val-handler-${label}`);
            assert.equal((stored?.metadata?.resolution as any)?.validation_id, `val-handler-${label}`);
        });

        it(`reads back validation_id alias through real Hall handler path (${label})`, async () => {
            const beadId = `bead:test-handler-validation-alias:${label}`;

            await handleBead({
                action: 'create',
                bead_id: beadId,
                rationale: `Create ${label} handler bead for bridge-safe validation alias.`,
                target_kind: 'VALIDATION',
                target_path: 'src/tools/cstar-kernel-mcp.ts',
            });

            const resolveResult = parseToolResult(await handleBead({
                action: 'resolve',
                bead_id: beadId,
                resolution_note: 'Resolved through bridge-safe validation_id alias.',
                validation_id: `val-handler-alias-${label}`,
                mandate_evidence: {
                    mandate_exempt: true,
                    exemption_reason: 'handler validation_id alias regression test',
                },
            }));
            assert.equal(resolveResult.status, 'resolved');
            assert.equal(resolveResult.bead.status, 'RESOLVED');
            assert.equal(resolveResult.bead.resolved_validation_id, `val-handler-alias-${label}`);

            const getResult = parseToolResult(await handleBead({
                action: 'get',
                bead_id: beadId,
            }));
            assert.equal(getResult.bead.resolved_validation_id, `val-handler-alias-${label}`);

            const stored = getHallBead(beadId);
            assert.equal(stored?.resolved_validation_id, `val-handler-alias-${label}`);
            assert.equal(stored?.metadata?.resolved_validation_id, `val-handler-alias-${label}`);
            assert.equal((stored?.metadata?.resolution as any)?.validation_id, `val-handler-alias-${label}`);
        });
    }
});
