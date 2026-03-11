import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CorvusProcess, type IntentPayload } from '../../src/node/core/CorvusProcess.js';

function buildIntentPayload(): IntentPayload {
    return {
        system_meta: { app_id: 'test-app', requires_core: true },
        intent_raw: 'Fix the kernel bridge',
        intent_normalized: 'kernel-fix',
        target_workflow: 'repair',
        extracted_entities: {},
    };
}

describe('CorvusProcess: kernel supervisor logic', () => {
    let cp: CorvusProcess;

    beforeEach(() => {
        cp = new CorvusProcess(
            'tests/fixtures/dummy_daemon.py',
            async (payload) => ({
                status: 'success',
                data: { echoed_intent: payload.intent_normalized },
            }),
        );
    });

    it('boots into a ready state without spawning a persistent child', async () => {
        const events: Array<{ status?: string; message?: string }> = [];
        cp.on('telemetry', (data) => events.push(data));

        await cp.boot();

        assert.equal(cp.getStatus(), true);
        assert.equal(events[0]?.status, 'READY');
        assert.match(events[0]?.message ?? '', /kernel bridge ready/i);
    });

    it('dispatchIntent emits success telemetry from the one-shot kernel bridge', async () => {
        const statuses: string[] = [];
        cp.on('telemetry', (data) => {
            if (data.status) {
                statuses.push(data.status);
            }
        });

        await cp.boot();
        await cp.dispatchIntent(buildIntentPayload());

        assert.deepEqual(statuses, ['READY', 'DISPATCH', 'SUCCESS']);
    });

    it('dispatchIntent fails when the kernel bridge returns an error', async () => {
        const failing = new CorvusProcess(
            'tests/fixtures/dummy_daemon.py',
            async () => ({ status: 'error', error: 'bridge failure' }),
        );
        await failing.boot();

        await assert.rejects(() => failing.dispatchIntent(buildIntentPayload()), /bridge failure/);
    });
});
