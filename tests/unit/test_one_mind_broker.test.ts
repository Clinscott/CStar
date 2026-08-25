import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    ensureOneMindBroker,
    getOneMindBrokerStatus,
    RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
    stopOneMindBroker,
} from '../../src/node/core/one_mind_broker/manager.js';
import {
    fulfillNextOneMindRequest,
    fulfillOneMindRequestById,
    getOneMindFulfillmentCapability,
    getOneMindQueueSummary,
} from '../../src/node/core/one_mind_broker/fulfillment.js';
import {
    markDelegatedRequestSettled,
    updateSynapseRecord,
} from '../../src/node/core/one_mind_broker/fulfillment_telemetry.js';

describe('retired One Mind compatibility', () => {
    it('returns synthetic offline status without creating Hall or state files', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-one-mind-'));
        const before = fs.readdirSync(root);
        const status = await ensureOneMindBroker(root, { SYNTHETIC_SECRET: 'must-not-be-read' });
        assert.equal(status.running, false);
        assert.equal(status.fulfillmentReason, RETIRED_ONE_MIND_COMPATIBILITY_FAILURE);
        assert.equal(status.bindingState, 'OFFLINE');
        assert.equal(await stopOneMindBroker(root), false);
        assert.deepEqual(await getOneMindBrokerStatus(root), status);
        assert.deepEqual(fs.readdirSync(root), before);
    });

    it('returns a retired capability and an empty queue without Hall access', () => {
        assert.deepEqual(getOneMindFulfillmentCapability({ CORVUS_HOST_PROVIDER: 'codex' }), {
            ready: false,
            provider: null,
            reason: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
        });
        assert.deepEqual(getOneMindQueueSummary('/path/that/does/not/exist'), {});
    });

    it('fails fulfillment before invoking any host or delegated callback', async () => {
        let callbacks = 0;
        const forbidden = async () => {
            callbacks += 1;
            throw new Error('must not run');
        };
        const dependencies = {
            hostTextInvoker: forbidden as any,
            delegatedExecutionInvoker: forbidden as any,
            delegatedExecutionResolver: forbidden as any,
        };
        const byId = await fulfillOneMindRequestById(
            '/path/that/does/not/exist',
            'synthetic-request',
            {},
            dependencies,
        );
        const next = await fulfillNextOneMindRequest(
            '/path/that/does/not/exist',
            {},
            dependencies,
        );
        assert.deepEqual(byId, {
            outcome: 'failed',
            requestId: 'synthetic-request',
            error: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
        });
        assert.deepEqual(next, {
            outcome: 'failed',
            error: RETIRED_ONE_MIND_COMPATIBILITY_FAILURE,
        });
        assert.equal(callbacks, 0);
    });

    it('fails telemetry writers before Synapse or StateRegistry access', () => {
        assert.throws(
            () => updateSynapseRecord('/path/that/does/not/exist', 1, 'COMPLETED', 'synthetic'),
            new RegExp(RETIRED_ONE_MIND_COMPATIBILITY_FAILURE),
        );
        assert.throws(
            () => markDelegatedRequestSettled('/path/that/does/not/exist', 'codex'),
            new RegExp(RETIRED_ONE_MIND_COMPATIBILITY_FAILURE),
        );
    });
});
