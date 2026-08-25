import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { getForgeRequest } from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { blockForgeOwningBeadForAmbiguity } from '../../../src/tools/pennyone/intel/forge_terminal_lifecycle.js';
import {
    beginAutonomousPolicyTest,
    cleanupAutonomousPolicyTest,
    createAutonomousPolicyFixture,
    requestAutonomousPolicyChild,
} from './forge_autonomous_policy_test_support.js';

beforeEach(beginAutonomousPolicyTest);
afterEach(cleanupAutonomousPolicyTest);

describe('Forge terminal lifecycle', () => {
    it('moves an autonomous child to BLOCKED through the terminal Forge receipt path', async () => {
        const fixture = await createAutonomousPolicyFixture('terminal-ambiguity');
        const result = await requestAutonomousPolicyChild(fixture);
        const request = getForgeRequest(fixture.value.db, result.receipt_id)!;
        const terminal = blockForgeOwningBeadForAmbiguity(fixture.value.db, {
            request_id: request.request_id,
            attempt_id: 'terminal-ambiguity-attempt',
            error_code: 'forge_adapter_live_spend_unknown',
        });

        assert.equal(terminal.status, 'blocked');
        assert.equal(fixture.value.db.prepare(
            'SELECT status, triage_reason FROM hall_beads WHERE bead_id = ?',
        ).get(request.bead_id).status, 'BLOCKED');
        assert.equal(fixture.value.db.prepare(
            'SELECT status, metadata_json FROM hall_beads WHERE bead_id = ?',
        ).get(request.bead_id).status, 'BLOCKED');
    });
});
