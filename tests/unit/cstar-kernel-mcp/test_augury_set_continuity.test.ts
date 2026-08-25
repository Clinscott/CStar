import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { selectCouncilExpert } from '../../../src/core/council_experts.js';
import type { AuguryMissionBoundaryInput } from
    '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import {
    finalizeAuguryMissionBoundary,
    prepareAuguryMissionBoundary,
} from '../../../src/tools/cstar-kernel-mcp/tools/augury_mission_binding.js';
import { verifyCurrentOrHistoricalForgeSetAuthority } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_set_manifest_signal.js';
import { isForgeSetIdentityConsumed } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_set_manifest_consumption.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function rootFixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-set-continuity-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'repair.ts'), 'export {};\n');
    registry.setRoot(root);
    return root;
}

function boundary(root: string): AuguryMissionBoundaryInput {
    return {
        schema: 'cstar.augury_mission_boundary.v1',
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: 'repo:cstar:set-continuity',
            root_path: root,
        },
        mission_decision_id: 'decision:cstar:set-continuity',
        proposed_parent_bead_id: 'bead:cstar:set-continuity:parent',
        design: { revision: 1, sha256: 'a'.repeat(64) },
        scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
        contained_target_paths: ['src/repair.ts'],
        bead_plan: [{
            bead_id: 'bead:cstar:set-continuity:repair',
            dependencies: [],
            lane: 'forge',
            target_paths: ['src/repair.ts'],
            acceptance_obligations: ['Repair remains within the SET mission.'],
            checker_obligations: ['node --test repair'],
        }],
    };
}

function route(targets: string[]) {
    const selected = selectCouncilExpert({
        intent_category: 'BUILD',
        intent: 'repair the bounded SET mission',
        selection_tier: 'SKILL',
        selection_name: 'cstar-kernel',
        mimirs_well: targets,
    });
    return {
        intent_category: 'BUILD',
        intent: 'repair the bounded SET mission',
        selection: 'SKILL: cstar-kernel',
        expert: selected.id,
        expert_label: selected.label,
        expert_lens: selected.lens,
        expert_signature_question: selected.signature_question,
        expert_guardrails: selected.anti_behavior.slice(0, 3),
        council_candidates: selected.selection_candidates,
        mimir_targets: targets,
    };
}

function appendTurn(
    session: ReturnType<typeof createSession>,
    text: string,
    offsetSeconds: number,
): string {
    const turnId = randomUUID();
    appendUserMessage(
        session.sessionFile,
        turnId,
        text,
        new Date(Date.parse(session.timestamp) + offsetSeconds * 1_000).toISOString(),
    );
    return turnId;
}

function appendNoncanonicalUserLike(
    sessionFile: string,
    text: string,
    timestamp: string,
): void {
    fs.appendFileSync(sessionFile, `${JSON.stringify({
        timestamp,
        type: 'response_item',
        payload: {
            type: 'user_message',
            role: 'user',
            content: [{ type: 'input_text', text }],
        },
    })}\n`);
}

async function receiptAfterTurns(texts: string[]) {
    const root = rootFixture();
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const currentTurnId = texts.reduce(
        (turnId, text, index) => appendTurn(session, text, index + 1),
        session.turnId,
    );
    const prepared = await prepareAuguryMissionBoundary({
        boundary: boundary(root),
        expected_root: root,
        request_context: validRequestContext(session.threadId, currentTurnId),
    });
    return finalizeAuguryMissionBoundary({
        prepared,
        route: route([...prepared.target_paths]),
    });
}

async function receiptAfterCurrentTurnRecords(texts: string[]) {
    const root = rootFixture();
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const currentTurnId = randomUUID();
    texts.forEach((text, index) => appendUserMessage(
        session.sessionFile,
        currentTurnId,
        text,
        new Date(Date.parse(session.timestamp) + (index + 1) * 1_000).toISOString(),
    ));
    const prepared = await prepareAuguryMissionBoundary({
        boundary: boundary(root),
        expected_root: root,
        request_context: validRequestContext(session.threadId, currentTurnId),
    });
    return finalizeAuguryMissionBoundary({
        prepared,
        route: route([...prepared.target_paths]),
    });
}

describe('Augury SET continuity during repair steps', () => {
    it('recognizes persisted mission, Forge authorization, and request consumption', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE hall_augury_mission_receipts (
                root_thread_id TEXT, set_turn_id TEXT,
                set_record_sha256 TEXT, set_record_set_sha256 TEXT
            );
            CREATE TABLE hall_forge_authorizations (
                operator_thread_id TEXT, operator_turn_id TEXT,
                operator_record_sha256 TEXT, operator_record_set_sha256 TEXT
            );
            CREATE TABLE hall_forge_requests (
                requester_thread_id TEXT, requester_turn_id TEXT,
                requester_record_set_sha256 TEXT
            );
        `);
        const identity = {
            thread_id: 'thread', turn_id: 'turn',
            record_sha256: 'a'.repeat(64), record_set_sha256: 'b'.repeat(64),
        };
        assert.equal(isForgeSetIdentityConsumed(db, identity), false);
        db.prepare('INSERT INTO hall_augury_mission_receipts VALUES (?, ?, ?, ?)')
            .run(identity.thread_id, identity.turn_id, identity.record_sha256, identity.record_set_sha256);
        assert.equal(isForgeSetIdentityConsumed(db, identity), true);
        db.close();
    });

    it('preserves the singleton current SET identity and signal shape', async () => {
        const session = createSession({
            textParts: ['SET'],
            timestamp: new Date(Date.now() - 30_000).toISOString(),
        });
        const authority = await verifyCurrentOrHistoricalForgeSetAuthority(
            validRequestContext(session.threadId, session.turnId),
        );
        assert.ok(authority);
        assert.equal(authority.identity.turn_record_count, 1);
        assert.equal(authority.signal.record_sha256, authority.identity.turn_record_sha256);
        assert.deepEqual(Object.keys(authority.signal).sort(), [
            'content',
            'record_sha256',
            'root_session_file_bytes',
            'root_session_record_count',
            'root_session_record_set_sha256',
        ]);
    });

    it('rejects a historical SET when the current turn is another exact SET', async () => {
        await assert.rejects(
            receiptAfterTurns(['SET']),
            { message: 'augury_mission_set_signal_ambiguous' },
        );
    });

    it('keeps one exact SET bound through later non-operative repair discussion', async () => {
        const receipt = await receiptAfterTurns([
            'The repair bead is in step; once the design is set, keep its scope unchanged.',
            'Please continue the focused verification.',
        ]);
        assert.equal(receipt.set_identity.set_record_count, 1);
        assert.equal(receipt.set_identity.set_timestamp, receipt.set_identity.set_first_timestamp);
    });

    it('rejects a second exact SET before the current repair step', async () => {
        await assert.rejects(
            receiptAfterTurns(['SET', 'Continue the focused verification.']),
            { message: 'augury_mission_set_signal_ambiguous' },
        );
    });

    it('rejects a later revocation before selecting the historical SET', async () => {
        await assert.rejects(
            receiptAfterTurns(['Stop.']),
            { message: 'augury_mission_set_signal_revoked' },
        );
    });

    it('rejects a standalone revocation in any record of the current turn', async () => {
        await assert.rejects(
            receiptAfterCurrentTurnRecords(['Status is informational.', 'Stop.']),
            { message: 'augury_mission_set_signal_revoked' },
        );
    });

    it('rejects a noncanonical user-like record after the current SET', async () => {
        const session = createSession({
            textParts: ['SET'],
            timestamp: new Date(Date.now() - 30_000).toISOString(),
        });
        appendNoncanonicalUserLike(
            session.sessionFile,
            'untrusted user-shaped attachment',
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        await assert.rejects(
            verifyCurrentOrHistoricalForgeSetAuthority(
                validRequestContext(session.threadId, session.turnId),
            ),
            { message: 'forge_set_manifest_operator_signal_uninspectable' },
        );
    });

    it('rejects a physically later noncanonical record even when it is backdated', async () => {
        const session = createSession({
            textParts: ['SET'],
            timestamp: new Date(Date.now() - 30_000).toISOString(),
        });
        appendNoncanonicalUserLike(
            session.sessionFile,
            'backdated untrusted user-shaped attachment',
            new Date(Date.parse(session.timestamp) - 1_000).toISOString(),
        );
        await assert.rejects(
            verifyCurrentOrHistoricalForgeSetAuthority(
                validRequestContext(session.threadId, session.turnId),
            ),
            { message: 'forge_set_manifest_operator_signal_uninspectable' },
        );
    });

    it('rejects a stale current SET identity', async () => {
        const session = createSession({
            textParts: ['SET'],
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString(),
        });
        await assert.rejects(
            verifyCurrentOrHistoricalForgeSetAuthority(
                validRequestContext(session.threadId, session.turnId),
            ),
            { message: 'codex_request_identity_turn_expired_or_future_dated' },
        );
    });

    it('rejects an invalid current turn identity', async () => {
        const session = createSession({ textParts: ['SET'] });
        await assert.rejects(
            verifyCurrentOrHistoricalForgeSetAuthority(
                validRequestContext(session.threadId, randomUUID()),
            ),
            { message: 'codex_request_identity_turn_match_count:0' },
        );
    });
});
