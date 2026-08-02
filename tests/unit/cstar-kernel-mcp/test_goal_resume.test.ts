import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import SqliteDatabase from 'better-sqlite3';

import type { McpRequestContext } from '../../../src/tools/cstar-kernel-mcp/contracts/request_context.js';
import { handleGoalResume, type GoalResumeArgs } from '../../../src/tools/cstar-kernel-mcp/tools/goal_resume.js';
import { verifyCurrentGoalResumeIntent } from '../../../src/tools/cstar-kernel-mcp/tools/operator_intent_attestation.js';
import {
    listHallCoordinationEvents,
    saveHallCoordinationEvent,
} from '../../../src/tools/pennyone/intel/agent_coordination_controller.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';

const originalRoot = registry.getRoot();
const originalCodexHome = process.env.CODEX_HOME;
const temporaryRoots: string[] = [];
const STRUCTURED_GRANT = 'Authorize goal continuation for repair bead:repair:test-goal-resume with continued bead:test:continued-mission and decision decision:test:goal-resume now.';

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function contextFor(threadId: string, turnId: string): McpRequestContext {
    return { _meta: {
        threadId,
        'x-codex-turn-metadata': {
            session_id: threadId,
            thread_id: threadId,
            turn_id: turnId,
            thread_source: 'user',
            parent_thread_id: null,
            forked_from_thread_id: null,
            subagent_kind: null,
        },
    } };
}

function createFixture(text: string | string[] = STRUCTURED_GRANT) {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-goal-resume-'));
    temporaryRoots.push(root);
    registry.setRoot(root);
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const now = Date.now();
    const repairBeadId = 'bead:repair:test-goal-resume';
    const continuedBeadId = 'bead:test:continued-mission';
    for (const [beadId, rationale] of [
        [repairBeadId, 'Repair the missing host goal resume lifecycle.'],
        [continuedBeadId, 'Continue the synthetic mission.'],
    ]) {
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, target_kind, target_path, rationale,
                status, created_at, updated_at
            ) VALUES (?, ?, 'WORKFLOW', ?, ?, 'IN_PROGRESS', ?, ?)
        `).run(beadId, repoId, root, rationale, now, now);
    }
    const codexHome = path.join(root, 'codex-home');
    const sessions = path.join(codexHome, 'sessions', '2026', '07', '13');
    fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
    const threadId = randomUUID();
    const turnId = randomUUID();
    const timestamp = new Date(now).toISOString();
    const sessionPath = path.join(sessions, `rollout-goal-${threadId}.jsonl`);
    const texts = Array.isArray(text) ? text : [text];
    const rows = [
        { timestamp, type: 'session_meta', payload: {
            id: threadId, thread_source: 'user', parent_thread_id: null,
            agent_path: null, forked_from_id: null,
        } },
        ...texts.map((recordText) => ({ timestamp, type: 'response_item', payload: {
            type: 'message', role: 'user', content: [{ type: 'input_text', text: recordText }],
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
        } })),
    ];
    fs.writeFileSync(sessionPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
    process.env.CODEX_HOME = codexHome;
    const args: GoalResumeArgs = {
        repair_bead_id: repairBeadId,
        continued_bead_id: continuedBeadId,
        decision_id: 'decision:test:goal-resume',
        host_goal_objective_sha256: 'a'.repeat(64),
        host_goal_snapshot_sha256: 'b'.repeat(64),
        observed_host_status: 'blocked',
        host_resume_capability: 'unavailable',
    };
    return {
        root,
        db,
        repoId,
        repairBeadId,
        continuedBeadId,
        threadId,
        turnId,
        sessionPath,
        now,
        context: contextFor(threadId, turnId),
        args,
    };
}

function appendResumeTurn(fixture: ReturnType<typeof createFixture>, offsetMs = 1_000): McpRequestContext {
    const turnId = randomUUID();
    const row = {
        timestamp: new Date(fixture.now + offsetMs).toISOString(),
        type: 'response_item',
        payload: {
            type: 'message',
            role: 'user',
            content: [{
                type: 'input_text',
                text: STRUCTURED_GRANT,
            }],
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
    };
    fs.appendFileSync(fixture.sessionPath, `${JSON.stringify(row)}\n`);
    return contextFor(fixture.threadId, turnId);
}

function responseBody(response: Awaited<ReturnType<typeof handleGoalResume>>) {
    return JSON.parse(response.content[0]!.text) as Record<string, any>;
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    restoreEnv('CODEX_HOME', originalCodexHome);
    while (temporaryRoots.length > 0) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('dedicated continuity-only host goal resume tool', () => {
    it('rejects missing request identity before creating Hall state', async () => {
        const root = fs.mkdtempSync(path.join('/tmp', 'cstar-goal-resume-preauth-'));
        temporaryRoots.push(root);
        registry.setRoot(root);

        const response = await handleGoalResume({
            repair_bead_id: 'bead:repair:preauth',
            decision_id: 'decision:preauth',
            host_goal_objective_sha256: 'a'.repeat(64),
            host_goal_snapshot_sha256: 'b'.repeat(64),
            observed_host_status: 'blocked',
            host_resume_capability: 'unavailable',
        }, undefined);

        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        assert.match(responseBody(response).error, /codex_request_identity_metadata_required/);
        assert.deepEqual(fs.readdirSync(root), []);
    });

    it('records and exactly replays one immutable event without changing bead or host status', async () => {
        const fixture = createFixture();
        const firstResponse = await handleGoalResume(fixture.args, fixture.context);
        const replayResponse = await handleGoalResume(fixture.args, fixture.context);
        const first = responseBody(firstResponse);
        const replay = responseBody(replayResponse);

        assert.equal(first.status, 'recorded');
        assert.equal(replay.status, 'replayed');
        assert.equal(first.resume_id, replay.resume_id);
        assert.equal(first.host_status_mutated, false);
        assert.equal(first.authority_effect, 'continuity_only');
        const rows = fixture.db.prepare('SELECT payload_json, metadata_json FROM hall_coordination_events').all() as Array<{ payload_json: string; metadata_json: string }>;
        assert.equal(rows.length, 1);
        const payload = JSON.parse(rows[0]!.payload_json);
        const metadata = JSON.parse(rows[0]!.metadata_json);
        assert.equal(payload.schema, 'cstar.host_goal_resume.v1');
        assert.equal(payload.resume_generation, 1);
        assert.equal(payload.host_status_mutated, false);
        assert.match(payload.operator_attestation_sha256, /^[a-f0-9]{64}$/);
        assert.equal(JSON.stringify(payload).includes('work the problems'), false);
        assert.deepEqual(metadata, { source: 'cstar-kernel-mcp', immutable: true });
        const beads = fixture.db.prepare('SELECT bead_id, status FROM hall_beads ORDER BY bead_id').all() as Array<{ bead_id: string; status: string }>;
        assert.deepEqual(beads.map(({ status }) => status), ['IN_PROGRESS', 'IN_PROGRESS']);
    });

    it('rejects reuse of one operator record set with changed lifecycle inputs', async () => {
        const fixture = createFixture();
        assert.equal(responseBody(await handleGoalResume(fixture.args, fixture.context)).status, 'recorded');

        const conflict = await handleGoalResume({
            ...fixture.args,
            host_goal_snapshot_sha256: 'c'.repeat(64),
        }, fixture.context);

        assert.equal(conflict.isError, true);
        assert.match(responseBody(conflict).error, /goal_resume_replay_conflict/);
        const count = fixture.db.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get() as { count: number };
        assert.equal(count.count, 1);
    });

    it('chains a fresh root-user turn as generation two', async () => {
        const fixture = createFixture();
        const first = responseBody(await handleGoalResume(fixture.args, fixture.context));
        const secondContext = appendResumeTurn(fixture);
        const second = responseBody(await handleGoalResume({
            ...fixture.args,
            host_goal_snapshot_sha256: 'c'.repeat(64),
        }, secondContext));

        assert.equal(second.status, 'recorded');
        assert.equal(second.resume_generation, 2);
        assert.equal(second.previous_resume_id, first.resume_id);
    });

    it('fails closed on tampered immutable history and prevents generic overwrite', async () => {
        const fixture = createFixture();
        const first = responseBody(await handleGoalResume(fixture.args, fixture.context));
        const [event] = listHallCoordinationEvents(fixture.root, { limit: 1 });
        assert.ok(event);
        assert.throws(
            () => saveHallCoordinationEvent({ ...event!, summary: 'overwrite' }, fixture.root),
            /goal_resume_requires_immutable_coordination_insert/,
        );
        fixture.db.prepare(`
            UPDATE hall_coordination_events
            SET metadata_json = '{"source":"cstar-kernel-mcp","immutable":false}'
            WHERE event_id = ?
        `).run(first.resume_id);

        const replay = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(replay.isError, true);
        assert.match(responseBody(replay).error, /goal_resume_history_immutable_marker_invalid/);
    });

    it('atomically rejects a generic overwrite while a second connection observes the immutable row', async () => {
        const fixture = createFixture();
        const dbPath = path.join(fixture.root, '.stats', 'pennyone.db');
        const observer = new SqliteDatabase(dbPath, { readonly: true, fileMustExist: true });
        try {
            const before = observer.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get() as { count: number };
            assert.equal(before.count, 0);
            await handleGoalResume(fixture.args, fixture.context);
            const [event] = listHallCoordinationEvents(fixture.root, { limit: 1 });
            assert.ok(event);
            assert.throws(
                () => saveHallCoordinationEvent({
                    ...event!,
                    summary: 'generic overwrite after stale absence observation',
                    payload: { schema: 'cstar.generic_coordination.v1' },
                    metadata: { source: 'synthetic-race-test' },
                    updated_at: event!.updated_at + 1,
                }, fixture.root),
                /immutable_coordination_event_cannot_be_overwritten/,
            );
            const observed = observer.prepare(`
                SELECT summary, metadata_json
                FROM hall_coordination_events
                WHERE event_id = ?
            `).get(event!.event_id) as { summary: string; metadata_json: string };
            assert.equal(observed.summary, 'Continuity-only host goal resume overlay recorded; host goal status remains blocked.');
            assert.equal(JSON.parse(observed.metadata_json).immutable, true);
        } finally {
            observer.close();
        }
    });

    it('binds stored operator lineage fields to the resume identifier', async () => {
        const fixture = createFixture();
        const first = responseBody(await handleGoalResume(fixture.args, fixture.context));
        const row = fixture.db.prepare(`
            SELECT payload_json
            FROM hall_coordination_events
            WHERE event_id = ?
        `).get(first.resume_id) as { payload_json: string };
        const originalPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
        const secondContext = appendResumeTurn(fixture);
        const secondArgs = { ...fixture.args, host_goal_snapshot_sha256: 'c'.repeat(64) };

        fixture.db.prepare('UPDATE hall_coordination_events SET payload_json = ? WHERE event_id = ?')
            .run(JSON.stringify({ ...originalPayload, operator_resume_ref: 'tampered-ref' }), first.resume_id);
        const tamperedRef = await handleGoalResume(secondArgs, secondContext);
        assert.equal(tamperedRef.isError, true);
        assert.match(responseBody(tamperedRef).error, /goal_resume_history_operator_resume_ref_invalid/);

        fixture.db.prepare('UPDATE hall_coordination_events SET payload_json = ? WHERE event_id = ?')
            .run(JSON.stringify({
                ...originalPayload,
                operator_message_sha256: 'd'.repeat(64),
            }), first.resume_id);
        const tamperedMessage = await handleGoalResume(secondArgs, secondContext);
        assert.equal(tamperedMessage.isError, true);
        assert.match(responseBody(tamperedMessage).error, /goal_resume_history_operator_attestation_invalid/);
        const count = fixture.db.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get() as { count: number };
        assert.equal(count.count, 1);
    });

    it('rejects missing and terminal repair beads', async () => {
        const missingBeadId = 'bead:repair:missing';
        const fixture = createFixture(
            `Authorize goal continuation for repair ${missingBeadId} with continued bead:test:continued-mission and decision decision:test:goal-resume now.`,
        );
        const missing = await handleGoalResume({
            ...fixture.args,
            repair_bead_id: missingBeadId,
        }, fixture.context);
        assert.equal(missing.isError, true);
        assert.match(responseBody(missing).error, /goal_resume_repair_bead_not_found/);

        database.close();
        const terminalFixture = createFixture();
        terminalFixture.db.prepare("UPDATE hall_beads SET status = 'RESOLVED' WHERE bead_id = ?")
            .run(terminalFixture.repairBeadId);
        const terminal = await handleGoalResume(terminalFixture.args, terminalFixture.context);
        assert.equal(terminal.isError, true);
        assert.match(responseBody(terminal).error, /goal_resume_repair_bead_terminal/);
    });

    it('rejects a negated or hypothetical resume signal without writing', async () => {
        const fixture = createFixture('Hypothetical example: do not resume the goal.');

        await assert.rejects(
            verifyCurrentGoalResumeIntent(fixture.context),
            /goal_resume_operator_signal_negated/,
        );
        const response = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        const count = fixture.db.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get() as { count: number };
        assert.equal(count.count, 0);
    });

    it('rejects incidental documentation prose as a resume signal', async () => {
        const fixture = createFixture('Update the documentation explaining how to resume the goal.');

        await assert.rejects(
            verifyCurrentGoalResumeIntent(fixture.context),
            /goal_resume_operator_signal_missing/,
        );
        const response = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        const count = fixture.db.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get() as { count: number };
        assert.equal(count.count, 0);
    });

    it('rejects a quoted diagnostic continuation grant', async () => {
        const fixture = createFixture(
            'The diagnostic says "Authorize goal continuation for repair bead:repair:test-goal-resume with continued bead:test:continued-mission and decision decision:test:goal-resume now."',
        );

        const response = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        assert.match(responseBody(response).error, /goal_resume_operator_signal_missing/);
    });

    it('accepts only the exact structured continuation template', async () => {
        const fixture = createFixture(['Status is informational.', STRUCTURED_GRANT]);

        const attestation = await verifyCurrentGoalResumeIntent(fixture.context, Date.now(), {
            repair_bead_id: fixture.repairBeadId,
            continued_bead_id: fixture.continuedBeadId,
            decision_id: fixture.args.decision_id,
        });
        assert.equal(attestation.session_record_count, 2);
        assert.equal(attestation.selected_record_index, 1);
        const response = responseBody(await handleGoalResume(fixture.args, fixture.context));
        assert.equal(response.status, 'recorded');
        assert.match(response.resume_id, /^goal-resume:[a-f0-9]{64}$/);
    });

    it('rejects a structured continuation when an exact mission reference is absent', async () => {
        const fixture = createFixture([
            'I authorize continuation of decision:test:goal-resume.',
            'Resume bead:repair:test-goal-resume.',
        ].join(' '));

        const response = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        assert.match(responseBody(response).error, /goal_resume_operator_signal_missing/);
    });

    it('rejects incidental documentation even when it names every mission reference', async () => {
        const fixture = createFixture([
            'Document repair bead:repair:test-goal-resume now;',
            'mention bead:test:continued-mission now and decision:test:goal-resume now in the guide.',
        ].join(' '));

        const response = await handleGoalResume(fixture.args, fixture.context);
        assert.equal(response.isError, undefined);
        assert.equal(responseBody(response).outcome, 'guardrail_block');
        assert.match(responseBody(response).error, /goal_resume_operator_signal_missing/);
    });

    it('rejects suffix collisions, duplicate grants, and turn-level revocation', async () => {
        for (const text of [
            [
                'I authorize continuation of decision:test:goal-resume-extra.',
                'Resume bead:repair:test-goal-resume-extra with bead:test:continued-mission-extra.',
            ].join(' '),
            'Authorize goal continuation for repair bead:repair:test-goal-resume.extra with continued bead:test:continued-mission and decision decision:test:goal-resume now.',
            'Authorize goal continuation for repair bead:repair:test-goal-resume/extra with continued bead:test:continued-mission and decision decision:test:goal-resume now.',
            [STRUCTURED_GRANT, STRUCTURED_GRANT.toUpperCase()],
            [STRUCTURED_GRANT, 'Do not resume the goal.'],
            ['Do not resume the goal.', STRUCTURED_GRANT],
            [
                'I do not authorize continuation of decision:test:goal-resume.',
                'Do not resume bead:repair:test-goal-resume with bead:test:continued-mission.',
            ].join(' '),
        ]) {
            const fixture = createFixture(text);
            const response = await handleGoalResume(fixture.args, fixture.context);
            assert.equal(response.isError, undefined);
            assert.equal(responseBody(response).outcome, 'guardrail_block');
            assert.match(
                responseBody(response).error,
                /goal_resume_operator_signal_(?:missing|negated|ambiguous)/,
            );
            database.close();
        }
    });

    it('rejects questions, conditionals, and reported structured authority', async () => {
        const bound = 'repair bead:repair:test-goal-resume with continued bead:test:continued-mission and decision decision:test:goal-resume';
        for (const text of [
            `Could you authorize goal continuation for ${bound} now?`,
            `If later, authorize goal continuation for ${bound} now.`,
            `The docs say "Authorize goal continuation for ${bound} now."`,
        ]) {
            const fixture = createFixture(text);
            const response = await handleGoalResume(fixture.args, fixture.context);
            assert.equal(response.isError, undefined);
            assert.equal(responseBody(response).outcome, 'guardrail_block');
            assert.match(responseBody(response).error, /goal_resume_operator_signal_missing/);
            database.close();
        }
    });

    it('rejects every terse standalone revocation before and after the grant', async () => {
        for (const revocation of [
            'Stop.', 'Pause!', 'Cancel it.', 'Revoke this.', 'Withdraw that.',
            'Never mind.', 'Do not proceed.', 'Do not continue!', 'Do not resume.',
        ]) {
            for (const records of [
                [revocation, STRUCTURED_GRANT],
                [STRUCTURED_GRANT, revocation],
            ]) {
                const fixture = createFixture(records);
                const response = await handleGoalResume(fixture.args, fixture.context);
                assert.equal(response.isError, undefined);
                assert.equal(responseBody(response).outcome, 'guardrail_block');
                assert.match(responseBody(response).error, /goal_resume_operator_signal_negated/);
                database.close();
            }
        }
    });

    it('accepts only fully anchored resume commands or authorization statements', async () => {
        for (const accepted of [
            'Resume!',
            'Resume the goal and work the problems that arise to completion.',
            'I authorize you to continue the audit to completion.',
            'Fix the error and continue the build.',
            'The error should be fixed and the build proceed.',
            'I should not have to re issue a forge build request if a single error is discovered and fixed. The error should be fixed and the build proceed.',
            'This is not a red gate. The goal should have continued after the router fix.',
        ]) {
            const fixture = createFixture(accepted);
            assert.equal((await verifyCurrentGoalResumeIntent(fixture.context)).intent, 'goal_resume');
            database.close();
        }

        for (const rejected of [
            'Resume the goal is the button label we should document.',
            'Resume the goal? I am asking what that does.',
            'You are authorized to resume the goal is not something I said.',
            'Quoted text: You are authorized to resume the goal.',
            "Resume the goal and continue, but don't act on this.",
            'Resume the goal and work, but this is not an instruction.',
            'Resume the goal and proceed only as quoted prose.',
            'You are authorized to resume the goal and proceed is not something I said.',
            'The error should not be fixed and the build proceed.',
            'Should the error be fixed and the build proceed?',
            'Example: "The error should be fixed and the build proceed."',
            'The error should be fixed but do not continue the build.',
            'The goal should not have continued after the router fix.',
        ]) {
            const fixture = createFixture(rejected);
            await assert.rejects(
                verifyCurrentGoalResumeIntent(fixture.context),
                /goal_resume_operator_signal_(?:missing|negated)/,
            );
            database.close();
        }
    });
});
