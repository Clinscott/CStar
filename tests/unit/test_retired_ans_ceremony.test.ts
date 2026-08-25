import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runStartupCeremony, RETIRED_STARTUP_CEREMONY_ERROR } from '../../src/node/ceremony.js';
import { ANS, RETIRED_ANS_ERROR } from '../../src/node/core/ans.js';


describe('retired ANS and startup ceremony', () => {
    for (const [name, invoke] of [
        ['wake', () => ANS.wake()],
        ['sleep', () => ANS.sleep()],
        ['ensurePennyOne', () => ANS.ensurePennyOne()],
        ['stopPennyOne', () => ANS.stopPennyOne()],
    ] as const) {
        it(`${name} fails before runtime effects`, async () => {
            await assert.rejects(invoke, { message: RETIRED_ANS_ERROR });
        });
    }

    it('startup ceremony fails before status inspection or wake', async () => {
        await assert.rejects(
            () => runStartupCeremony(),
            { message: RETIRED_STARTUP_CEREMONY_ERROR },
        );
    });
});
