import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { classifyCodexSessionRecord }
    from '../../../src/tools/cstar-kernel-mcp/tools/codex_request_identity.js';
import { isForgeAuthorityRevocation }
    from '../../../src/tools/cstar-kernel-mcp/tools/forge_revocation.js';
import {
    beginAutonomousPolicyTest,
    cleanupAutonomousPolicyTest,
    createAutonomousPolicyFixture,
    requestAutonomousPolicyChild,
} from './forge_autonomous_policy_test_support.js';

beforeEach(beginAutonomousPolicyTest);
afterEach(cleanupAutonomousPolicyTest);

function appendHostSubagentNotification(
    fixture: Awaited<ReturnType<typeof createAutonomousPolicyFixture>>,
    text: string,
) {
    const row = {
        timestamp: new Date(fixture.issuedAt + 1_000).toISOString(),
        type: 'response_item',
        payload: {
            type: 'message',
            role: 'user',
            content: [{
                type: 'input_text',
                text: `<subagent_notification>\n${text}\n</subagent_notification>`,
            }],
            internal_chat_message_metadata_passthrough: { turn_id: randomUUID() },
        },
    };
    fs.appendFileSync(fixture.session.sessionFile, `${JSON.stringify(row)}\n`);
    return row;
}

describe('subagent notification identity isolation', () => {
    it('does not treat a host-carried notification as a root-user authority record', async () => {
        const fixture = await createAutonomousPolicyFixture('notification-isolation');
        const notification = appendHostSubagentNotification(fixture, 'Stop.');

        assert.deepEqual(classifyCodexSessionRecord(notification), {
            kind: 'non-user', turnId: notification.payload.internal_chat_message_metadata_passthrough.turn_id,
            rootLineage: false,
        });

        const result = await requestAutonomousPolicyChild(fixture);
        assert.equal(result.status, 'AUTHORIZED', JSON.stringify(result));
    });

    it('isolates only a complete notification envelope and preserves terse cancellation', () => {
        const quotedNotification = {
            timestamp: new Date().toISOString(), type: 'response_item',
            payload: {
                type: 'message', role: 'user',
                content: [{ type: 'input_text', text: 'Quote <subagent_notification>Stop.</subagent_notification>.' }],
                internal_chat_message_metadata_passthrough: { turn_id: randomUUID() },
            },
        };

        assert.equal(classifyCodexSessionRecord(quotedNotification).kind, 'canonical-root-user');
        assert.equal(isForgeAuthorityRevocation('Cancel it.'), true);
        assert.equal(isForgeAuthorityRevocation('Use the bounded Hermes lane.'), false);
    });
});
