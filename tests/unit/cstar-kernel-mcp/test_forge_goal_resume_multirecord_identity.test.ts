import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildForgeAuthorizationChallenge,
    verifyHistoricalForgeAuthorizationChallenge,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorization_challenge.js';
import {
    verifyCodexRequestIdentity,
} from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    forgeGoalResumeDecisionMatches,
    forgeGoalResumeEventTimeMatches,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_goal_resume_authority.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const REQUEST_ID = `dispatch-forge-${'1'.repeat(32)}`;
const REQUEST_SHA256 = '2'.repeat(64);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function fixture() {
    const timestamp = new Date(Date.now() - 4_000).toISOString();
    const challenge = buildForgeAuthorizationChallenge(REQUEST_ID, REQUEST_SHA256);
    const session = createSession({ timestamp, textParts: [challenge] });
    const context = validRequestContext(session.threadId, session.turnId);
    return { ...session, context, challenge, timestamp };
}

afterEach(() => cleanupOperatorAuthorizationFixtures());

describe('Forge goal-resume multi-record request identity', () => {
    it('binds a canonical mission decision to only its strict iteration decision', () => {
        const mission = 'decision:cstar-mcp-simplification-persona-set-20260717';
        assert.equal(forgeGoalResumeDecisionMatches(mission, mission), true);
        assert.equal(forgeGoalResumeDecisionMatches(
            mission,
            `${mission}-i1-root-instruction-abs`,
        ), true);
        assert.equal(forgeGoalResumeDecisionMatches(mission, `${mission}-recovery1`), false);
        assert.equal(forgeGoalResumeDecisionMatches(mission, `${mission}-i0-invalid`), false);
        assert.equal(forgeGoalResumeDecisionMatches(mission, `${mission}-i1-INVALID`), false);
        assert.equal(forgeGoalResumeDecisionMatches(undefined, mission), false);
        assert.equal(forgeGoalResumeDecisionMatches(
            'decision:cstar-mcp-simplification',
            `${mission}-i1-root-instruction-abs`,
        ), false);
    });

    it('accepts a recent persisted resume event without requiring impossible timestamp order', () => {
        const now = Date.now();
        assert.equal(forgeGoalResumeEventTimeMatches(now, now - 10_000, now), true);
        assert.equal(forgeGoalResumeEventTimeMatches(now - 10_000, now, now), true);
        assert.equal(forgeGoalResumeEventTimeMatches(now + 5_001, now, now), false);
        assert.equal(forgeGoalResumeEventTimeMatches(
            now - (24 * 60 * 60 * 1_000) - 1,
            now,
            now,
        ), false);
    });

    it('binds the exact historical challenge record while verifying the complete reused turn', async () => {
        const value = fixture();
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Continue the existing bounded goal.',
            new Date(Date.parse(value.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Proceed with the build.',
            new Date(Date.parse(value.timestamp) + 2_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(value.context);
        const selectedRawLine = fs.readFileSync(value.sessionFile, 'utf-8').split('\n')[1]!;
        const selectedRecordSha256 = sha256(selectedRawLine);
        const selectedRecordSetSha256 = sha256(JSON.stringify({
            schema: 'cstar.codex_root_user_turn_record_set.v1',
            thread_id: value.threadId,
            turn_id: value.turnId,
            records: [{
                index: 0,
                timestamp: value.timestamp,
                record_sha256: selectedRecordSha256,
            }],
        }));

        assert.equal(identity.turn_record_count, 3);
        const historical = await verifyHistoricalForgeAuthorizationChallenge({
            threadId: value.threadId,
            currentIdentity: identity,
            requestId: REQUEST_ID,
            requestSha256: REQUEST_SHA256,
        });

        assert.equal(historical.session_record_count, 1);
        assert.equal(historical.session_record_sha256, selectedRecordSha256);
        assert.equal(historical.session_record_set_sha256, selectedRecordSetSha256);
        assert.notEqual(historical.session_record_set_sha256, identity.turn_record_set_sha256);
    });

    it('checks a later revocation even when Codex reuses the selected turn id', async () => {
        const value = fixture();
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Continue the existing bounded goal.',
            new Date(Date.parse(value.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Stop the Forge build.',
            new Date(Date.parse(value.timestamp) + 2_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(value.context);

        await assert.rejects(
            verifyHistoricalForgeAuthorizationChallenge({
                threadId: value.threadId,
                currentIdentity: identity,
                requestId: REQUEST_ID,
                requestSha256: REQUEST_SHA256,
            }),
            /forge_goal_continuation_revoked/,
        );
    });

    it('does not treat an injected estate policy attachment as a Forge revocation', async () => {
        const value = fixture();
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            [
                '# AGENTS.md instructions for /home/morderith/Corvus',
                '- Preserve operator gates. Do not automatically accept, dispatch, spend, merge, or restart.',
                '- If a request would bypass CStar, stop and repair the routing boundary first.',
                '- If waiting on a worker or external state, pause instead of polling.',
                '- Goals and work remain bounded by the current operator grant.',
            ].join('\n'),
            new Date(Date.parse(value.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Continue the unchanged TokenPath build goal.',
            new Date(Date.parse(value.timestamp) + 2_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(value.context);

        const historical = await verifyHistoricalForgeAuthorizationChallenge({
            threadId: value.threadId,
            currentIdentity: identity,
            requestId: REQUEST_ID,
            requestSha256: REQUEST_SHA256,
        });
        assert.equal(historical.scope_authority, 'historical_exact_challenge');
        assert.equal(identity.turn_record_count, 3);
    });

    it('rejects a stale identity when another same-turn record arrives before verification', async () => {
        const value = fixture();
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Continue the existing bounded goal.',
            new Date(Date.parse(value.timestamp) + 1_000).toISOString(),
        );
        const staleIdentity = await verifyCodexRequestIdentity(value.context);
        appendUserMessage(
            value.sessionFile,
            value.turnId,
            'Proceed with the next bounded step.',
            new Date(Date.parse(value.timestamp) + 2_000).toISOString(),
        );

        await assert.rejects(
            verifyHistoricalForgeAuthorizationChallenge({
                threadId: value.threadId,
                currentIdentity: staleIdentity,
                requestId: REQUEST_ID,
                requestSha256: REQUEST_SHA256,
            }),
            /forge_goal_continuation_historical_lineage_incomplete/,
        );
    });
});
