import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    bindSharedHostSessionInvoker,
    clearAuguryPromptHistory,
    clearSharedHostSessionInvoker,
    requestHostText,
} from '../../src/core/host_intelligence.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../src/core/host_delegation.js';

describe('retired host intelligence compatibility', () => {
    it('fails before invoking a client factory or host callback', async () => {
        let factoryCalls = 0;
        let callbackCalls = 0;
        await assert.rejects(
            requestHostText({
                prompt: 'synthetic only',
                projectRoot: '/synthetic/repo',
                source: 'synthetic-test',
                executionSurface: 'host_session_invoker',
                env: { SYNTHETIC_SECRET: 'must-not-be-read' },
            }, {
                clientFactory: () => {
                    factoryCalls += 1;
                    throw new Error('must not run');
                },
                hostSessionInvoker: async () => {
                    callbackCalls += 1;
                    return 'must not run';
                },
            }),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
        assert.deepEqual({ factoryCalls, callbackCalls }, { factoryCalls: 0, callbackCalls: 0 });
    });

    it('rejects callback binding before storing or invoking the callback', () => {
        let callbackCalls = 0;
        assert.throws(
            () => bindSharedHostSessionInvoker(async () => {
                callbackCalls += 1;
                return 'must not run';
            }),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
        clearSharedHostSessionInvoker();
        clearAuguryPromptHistory();
        assert.equal(callbackCalls, 0);
    });
});
