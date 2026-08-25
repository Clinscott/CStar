import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';

import { PENNYONE_LIVE_RETIRED } from '../../src/tools/pennyone/live/recorder.js';
import { SubspaceRelay } from '../../src/tools/pennyone/live/socket.js';
import { startWatcher } from '../../src/tools/pennyone/live/watcher.js';

test('legacy PennyOne relay retires before listener or client allocation', () => {
    const server = createServer();
    try {
        assert.throws(() => new SubspaceRelay(server), new RegExp(PENNYONE_LIVE_RETIRED));
        assert.strictEqual(server.listening, false);
        assert.strictEqual(server.listenerCount('upgrade'), 0);
    } finally {
        server.close();
    }
});

test('legacy PennyOne watcher retires before watcher, timer, scan, or broadcast', () => {
    let scanCalls = 0;
    assert.throws(
        () => startWatcher('synthetic-target', {} as SubspaceRelay, async () => {
            scanCalls += 1;
            return [];
        }),
        new RegExp(PENNYONE_LIVE_RETIRED),
    );
    assert.strictEqual(scanCalls, 0);
});
