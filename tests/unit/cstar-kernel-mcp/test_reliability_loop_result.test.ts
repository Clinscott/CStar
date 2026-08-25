import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const originalForgeMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
const originalValidationThread = process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
const originalValidationTurn = process.env.CSTAR_VALIDATION_TEST_TURN_ID;
const roots: string[] = [];

function parsed(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0].text) as Record<string, any>;
}

function fixture(metadata: Record<string, unknown>, targetPath = 'src/target.ts') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-reliability-result-'));
    roots.push(root);
    registry.setRoot(root);
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.NODE_TEST_CONTEXT = 'cstar-reliability-synthetic';
    process.env.CSTAR_VALIDATION_TEST_THREAD_ID = '019f0000-0000-7000-8000-000000000501';
    process.env.CSTAR_VALIDATION_TEST_TURN_ID = '019f0000-0000-7000-8000-000000000502';
    const session = createSession({ textParts: ['Synthetic root result recording.'] });
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const now = Date.now();
    db.prepare(`
        INSERT OR IGNORE INTO hall_repositories (
            repo_id, root_path, name, status, active_persona,
            baseline_gungnir_score, intent_integrity, created_at, updated_at
        ) VALUES (?, ?, 'Synthetic reliability repository', 'DORMANT', '', 0, 0, ?, ?)
    `).run(repoId, normalizeHallPath(root), now, now);
    const beadId = `bead:test:reliability-result-${now}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            metadata_json, status, created_at, updated_at
        ) VALUES (?, ?, 'FILE', ?, 'Synthetic reliability integration', ?, 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, targetPath, JSON.stringify(metadata), now, now);
    return {
        root,
        db,
        repoId,
        beadId,
        requestContext: validRequestContext(session.threadId, session.turnId),
    };
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    if (originalForgeMode === undefined) delete process.env.CSTAR_FORGE_TEST_MODE;
    else process.env.CSTAR_FORGE_TEST_MODE = originalForgeMode;
    if (originalNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = originalNodeTestContext;
    if (originalValidationThread === undefined) delete process.env.CSTAR_VALIDATION_TEST_THREAD_ID;
    else process.env.CSTAR_VALIDATION_TEST_THREAD_ID = originalValidationThread;
    if (originalValidationTurn === undefined) delete process.env.CSTAR_VALIDATION_TEST_TURN_ID;
    else process.env.CSTAR_VALIDATION_TEST_TURN_ID = originalValidationTurn;
    cleanupOperatorAuthorizationFixtures();
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('cstar_record_result Reliability Loop integration', () => {
    it('verifies reliability receipts against the resolved bead repository root', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/tools/result.ts'),
            'utf-8',
        );
        assert.match(source, /verifyReliabilityReceipt\(beadRepositoryRoot,/);
        assert.doesNotMatch(source, /verifyReliabilityReceipt\(recordedRoot,/);
    });

    it('keeps critical positive results inconclusive and returns a repair draft without hidden bead creation', async () => {
        const value = fixture({
            reliability_loop_version: 'v1',
            reliability_risk_tier: 'critical',
            reliability_auto_repair: true,
        });
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'validation:test:critical-unverified',
            notes: 'Synthetic positive without a runner receipt.',
        }, value.requestContext));
        assert.equal(result.validation_persisted, true, JSON.stringify(result));
        assert.equal(result.stored_verdict, 'INCONCLUSIVE');
        assert.equal(result.authoritative, false);
        assert.equal(result.reliability_continuation.state, 'repairing');
        assert.deepEqual(
            result.reliability_continuation.repair_bead_create_draft.repository_binding,
            { repo_id: value.repoId },
        );
        assert.equal(
            (value.db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get() as { count: number }).count,
            1,
        );
    });

    it('keeps a rejected result observable while an operator gate blocks automatic repair', async () => {
        const value = fixture({
            reliability_loop_version: 'v1',
            reliability_risk_tier: 'critical',
            reliability_auto_repair: true,
            reliability_operator_gate: true,
        });
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'REJECTED',
            validation_id: 'validation:test:gated-rejection',
        }, value.requestContext));
        assert.equal(result.validation_persisted, true, JSON.stringify(result));
        assert.equal(result.stored_verdict, 'REJECTED');
        assert.equal(result.reliability_continuation.state, 'operator_decision_required');
        assert.equal(result.reliability_continuation.repair_bead_create_draft, undefined);
        assert.equal(
            (value.db.prepare('SELECT COUNT(*) AS count FROM hall_validation_runs').get() as { count: number }).count,
            1,
        );
        assert.equal(
            (value.db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get() as { count: number }).count,
            1,
        );
    });

    it('preserves legacy no-metadata behavior and exposes no reliability continuation', async () => {
        const value = fixture({}, 'docs/legacy-result.md');
        const result = parsed(await handleRecordResult({
            bead_id: value.beadId,
            verdict: 'ACCEPTED',
            validation_id: 'validation:test:legacy-result',
        }, value.requestContext));
        assert.equal(result.validation_persisted, true, JSON.stringify(result));
        assert.equal(result.stored_verdict, 'INCONCLUSIVE');
        assert.equal(result.reliability_continuation, undefined);
        assert.equal(
            (value.db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get() as { count: number }).count,
            1,
        );
    });
});
