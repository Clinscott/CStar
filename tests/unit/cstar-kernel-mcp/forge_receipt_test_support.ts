import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
    authorizeForgeRequest,
    saveForgeRequest,
    type AuthorizeForgeRequestInput,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { ensureHallSchema } from '../../../src/tools/pennyone/intel/schema.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';

const temporaryRoots: string[] = [];

export function cleanupForgeReceiptFixtures(): void {
    while (temporaryRoots.length > 0) {
        fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
}

export function createForgeReceiptFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-receipts-'));
    temporaryRoots.push(root);
    const dbPath = path.join(root, 'hall.db');
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 1000');
    ensureHallSchema(db, root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    return { root, dbPath, db, repoId };
}

export function trackForgeReceiptRoot(root: string): void {
    temporaryRoots.push(root);
}

export function insertForgeReceiptBead(
    db: Database.Database,
    repoId: string,
    beadId: string,
): void {
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, 'Forge receipt test', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, '/tmp/fixture', now, now);
}

export function forgeRequestInput(
    repoId: string,
    beadId: string,
    overrides: Partial<SaveForgeRequestInput> = {},
): SaveForgeRequestInput {
    const suffix = randomUUID().replaceAll('-', '');
    const now = Date.now();
    return {
        request_id: `dispatch-forge-${suffix}`,
        repo_id: repoId,
        bead_id: beadId,
        decision_id: `decision-${suffix}`,
        request_sha256: 'c'.repeat(64),
        request_summary_json: JSON.stringify({
            schema: 'cstar.forge_request.v3',
            suffix,
        }),
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        write_capability: 'project_files',
        target_paths_sha256: 'd'.repeat(64),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: randomUUID(),
        requester_turn_id: randomUUID(),
        requester_record_set_sha256: 'e'.repeat(64),
        authorization_profile: 'exact_request_challenge_v1',
        authorization_challenge_sha256: 'f'.repeat(64),
        now,
        ...overrides,
    };
}

export function forgeAuthorizationInput(
    request: SaveForgeRequestInput,
    overrides: Partial<AuthorizeForgeRequestInput> = {},
): AuthorizeForgeRequestInput {
    const now = request.now ?? Date.now();
    const threadId = randomUUID();
    const turnId = randomUUID();
    return {
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        authorization_profile: 'exact_request_challenge_v1',
        challenge_sha256: request.authorization_challenge_sha256!,
        operator_authorization_ref: `cstar-forge-challenge:${request.request_id}:thread:${threadId}:turn:${turnId}`,
        operator_thread_id: threadId,
        operator_turn_id: turnId,
        operator_message_sha256: 'a'.repeat(64),
        operator_record_sha256: 'b'.repeat(64),
        operator_record_set_sha256: 'e'.repeat(64),
        operator_record_count: 1,
        authorized_at: now,
        expires_at: now + 60_000,
        now,
        ...overrides,
    };
}

export function saveAndAuthorizeForgeRequest(
    db: Database.Database,
    request: SaveForgeRequestInput,
    overrides: Partial<AuthorizeForgeRequestInput> = {},
) {
    saveForgeRequest(db, request);
    return authorizeForgeRequest(db, forgeAuthorizationInput(request, overrides));
}

export function saveLegacyAuthorizedForgeRequest(
    db: Database.Database,
    request: SaveForgeRequestInput,
): void {
    saveForgeRequest(db, request);
    const now = request.now ?? Date.now();
    db.prepare(`
        UPDATE hall_forge_requests
        SET status = 'AUTHORIZED', operator_authorization_ref = ?,
            operator_thread_id = ?, operator_turn_id = ?,
            operator_message_sha256 = ?, operator_record_sha256 = ?,
            operator_record_set_sha256 = ?, operator_record_count = 3,
            authorized_at = ?, expires_at = ?, updated_at = ?
        WHERE request_id = ?
    `).run(
        `legacy:${request.request_id}`,
        randomUUID(),
        randomUUID(),
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        now,
        now + 60_000,
        now,
        request.request_id,
    );
}
