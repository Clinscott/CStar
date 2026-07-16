import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { HUD } from '../../src/node/core/hud.ts';

const priorHostMarker = process.env.CORVUS_HOST_SESSION_ACTIVE;

afterEach(() => {
    if (priorHostMarker === undefined) {
        delete process.env.CORVUS_HOST_SESSION_ACTIVE;
    } else {
        process.env.CORVUS_HOST_SESSION_ACTIVE = priorHostMarker;
    }
});

describe('Node HUD unscored confidence boundary', () => {
    for (const hostActive of ['0', '1']) {
        it(`ignores legacy confidence in host-active=${hostActive} output`, () => {
            process.env.CORVUS_HOST_SESSION_ACTIVE = hostActive;
            const output = HUD.traceHUD({
                intent: 'Route the repair.',
                confidence: 0.99,
            });

            assert.match(output, /CORVUS STAR AUGURY/);
            assert.doesNotMatch(output, /CONFIDENCE/i);
            assert.doesNotMatch(output, /99%/);
            assert.doesNotMatch(output, /CORVUS STAR TRACE/);
        });
    }
});
