import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { handleDoctor } from '../../../src/tools/cstar-kernel-mcp/tools/hall.js';
import { handleStatus } from '../../../src/tools/cstar-kernel-mcp/tools/status.js';
import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function seedRepository(root: string): void {
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    db.prepare(`
        INSERT OR IGNORE INTO hall_repositories (
            repo_id, root_path, name, status, active_persona,
            baseline_gungnir_score, intent_integrity, created_at, updated_at
        ) VALUES (?, ?, 'synthetic-bead-isolation', 'AWAKE', '', 0, 0, 1, 1)
    `).run(repoId, root);
    closeDb();
}

function seedLegacyAuthorizationCollision(root: string): void {
    seedRepository(root);
    const dbPath = path.join(root, '.stats', 'pennyone.db');
    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');
    db.exec('DROP TABLE hall_forge_authorizations');
    db.exec(`
        CREATE TABLE hall_forge_authorizations (
            authorization_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            request_sha256 TEXT NOT NULL,
            authorization_profile TEXT NOT NULL CHECK(authorization_profile = 'exact_request_challenge_v1'),
            challenge_sha256 TEXT NOT NULL,
            operator_authorization_ref TEXT NOT NULL UNIQUE,
            operator_thread_id TEXT NOT NULL,
            operator_turn_id TEXT NOT NULL,
            operator_message_sha256 TEXT NOT NULL,
            operator_record_sha256 TEXT NOT NULL,
            operator_record_set_sha256 TEXT NOT NULL,
            operator_record_count INTEGER NOT NULL,
            authorized_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(request_id) REFERENCES hall_forge_requests(request_id)
        );
    `);
    const insert = db.prepare(`
        INSERT INTO hall_forge_authorizations (
            authorization_id, request_id, request_sha256, authorization_profile,
            challenge_sha256, operator_authorization_ref, operator_thread_id,
            operator_turn_id, operator_message_sha256, operator_record_sha256,
            operator_record_set_sha256, operator_record_count,
            authorized_at, expires_at, created_at
        ) VALUES (?, ?, ?, 'exact_request_challenge_v1', ?, ?, ?, ?, ?, ?, ?, 1, 10, 20, 10)
    `);
    for (const [index, requestId] of ['legacy-request-a', 'legacy-request-b'].entries()) {
        insert.run(
            `legacy-auth-${index}`,
            requestId,
            `${index + 3}`.repeat(64),
            `${index + 4}`.repeat(64),
            `legacy-ref-${index}`,
            'same-root-thread',
            'same-root-turn',
            `${index + 5}`.repeat(64),
            `${index + 6}`.repeat(64),
            `${index + 7}`.repeat(64),
        );
    }
    db.close();
}

function counts(root: string): { beads: number; authorizations: number; attempts: number } {
    const db = database.getReadDb(root);
    return {
        beads: Number((db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get() as { count: number }).count),
        authorizations: Number((db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations').get() as { count: number }).count),
        attempts: Number((db.prepare('SELECT COUNT(*) AS count FROM hall_forge_attempts').get() as { count: number }).count),
    };
}

describe('ordinary bead writes are isolated from Forge authorization migration', () => {
    let root = '';
    let previousRoot = '';

    beforeEach(() => {
        previousRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-bead-forge-isolation-'));
        registry.setRoot(root);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRoot);
        cleanupOperatorAuthorizationFixtures();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lets cstar_bead create reach its handler and persist exactly one SET bead', async () => {
        seedLegacyAuthorizationCollision(root);
        const session = createSession();
        const context = validRequestContext(session.threadId, session.turnId);
        const before = counts(root);
        const result = parse(await handleBead({
            action: 'create',
            bead_id: 'bead:test:ordinary-set-isolation',
            rationale: 'Synthetic ordinary SET bead must not enter Forge authorization.',
            status: 'SET',
        }, context));
        const after = counts(root);

        assert.equal(result.status, 'created');
        assert.equal(result.action, 'create');
        assert.equal(result.bead.bead_id, 'bead:test:ordinary-set-isolation');
        assert.equal(after.beads - before.beads, 1);
        assert.equal(after.authorizations, before.authorizations);
        assert.equal(after.attempts, 0);
    });

    it('allows doctor, status, SET, and OPEN on the same root turn without Forge replay or provider activity', async (t) => {
        seedLegacyAuthorizationCollision(root);
        let networkCalls = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            networkCalls += 1;
            throw new Error('provider/network activity is forbidden in ordinary bead dispatch');
        });
        const session = createSession();
        const context = validRequestContext(session.threadId, session.turnId);
        const before = counts(root);

        const doctor = parse(await handleDoctor());
        assert.ok(['healthy', 'degraded'].includes(doctor.status));
        assert.equal(doctor.checks.database, true);
        assert.ok(parse(await handleStatus()).framework);
        assert.equal(parse(await handleBead({
            action: 'create',
            bead_id: 'bead:test:repeated-set-isolation',
            rationale: 'Synthetic repeated root-turn SET bead.',
            status: 'SET',
        }, context)).status, 'created');
        assert.equal(parse(await handleBead({
            action: 'create',
            bead_id: 'bead:test:repeated-open-isolation',
            rationale: 'Synthetic repeated root-turn OPEN bead.',
            status: 'OPEN',
        }, context)).status, 'created');

        const after = counts(root);
        assert.equal(after.beads - before.beads, 2);
        assert.equal(after.authorizations, before.authorizations);
        assert.equal(after.attempts, 0);
        assert.equal(networkCalls, 0);
    });
});
