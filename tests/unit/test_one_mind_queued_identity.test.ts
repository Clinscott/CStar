import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveDelegatedQueueIdentity,
} from '../../src/node/core/one_mind_broker/fulfillment_identity.js';
import { fulfillOneMindRequestById } from '../../src/node/core/one_mind_broker/fulfillment.js';
import { RETIRED_ONE_MIND_COMPATIBILITY_FAILURE } from '../../src/node/core/one_mind_broker/manager.js';
import type { HallOneMindRequestRecord } from '../../src/types/hall.js';

function syntheticRequest(metadata: Record<string, unknown>): HallOneMindRequestRecord {
    return {
        request_id: 'synthetic-request',
        repo_id: 'synthetic-repo',
        caller_source: 'synthetic-test',
        boundary: 'subagent',
        request_status: 'PENDING',
        prompt: 'synthetic only',
        metadata,
        created_at: 1,
        updated_at: 1,
    };
}

describe('One Mind pure identity helpers and retired fulfillment', () => {
    it('retains deterministic historical identity parsing without dispatch', () => {
        assert.deepEqual(resolveDelegatedQueueIdentity(syntheticRequest({
            requested_provider: 'codex',
            requested_surface: 'configured_delegate_bridge',
        })), {
            ok: true,
            identity: {
                provider: 'codex',
                surface: 'configured_delegate_bridge',
            },
        });
    });

    it('never invokes a delegated callback even for a valid historical identity', async () => {
        let callbackCalls = 0;
        const result = await fulfillOneMindRequestById(
            '/path/that/does/not/exist',
            'synthetic-request',
            {},
            {
                delegatedExecutionInvoker: async () => {
                    callbackCalls += 1;
                    throw new Error('must not run');
                },
            },
        );
        assert.equal(result.error, RETIRED_ONE_MIND_COMPATIBILITY_FAILURE);
        assert.equal(callbackCalls, 0);
    });
});
