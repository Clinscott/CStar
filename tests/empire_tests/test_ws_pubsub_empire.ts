import test from 'node:test';
import assert from 'node:assert';

import {
    EventManager,
    LEGACY_EVENT_MANAGER_RETIRED,
} from '../../src/node/core/EventManager.js';

test('legacy EventManager is inert and stores no subscriptions', () => {
    const manager = EventManager.getInstance();
    const socket = {} as never;
    for (const invoke of [
        () => manager.subscribe('app', socket),
        () => manager.unsubscribe('app', socket),
        () => manager.broadcast('app', { secret: 'synthetic' }),
    ]) {
        assert.throws(invoke, new RegExp(LEGACY_EVENT_MANAGER_RETIRED));
    }
    assert.strictEqual((manager as any).subscriptions, undefined);
});
