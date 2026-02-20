import { test, describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import net from 'node:net';

// Mock net.Socket before importing cortex_link
// We will intercept the net.Socket constructor and its methods

let mockSocketOptions = {
    triggerError: false,
    triggerTimeout: false,
    mockDataChunks: [], // simulating fragmented packets
    delayConnect: 0,
};

const originalSocket = net.Socket;

class MockSocket extends originalSocket {
    constructor(options) {
        super(options);
        this.listenersMap = new Map();
        this._isDestroyed = false;
    }

    on(event, listener) {
        if (!this.listenersMap) {
            this.listenersMap = new Map();
        }
        if (!this.listenersMap.has(event)) {
            this.listenersMap.set(event, []);
        }
        this.listenersMap.get(event).push(listener);
        return this;
    }

    once(event, listener) {
        return this.on(event, listener);
    }

    emitCustom(event, ...args) {
        const listeners = this.listenersMap.get(event) || [];
        listeners.forEach(fn => fn(...args));
    }

    connect(port, host, callback) {
        // Default to localhost:50051
        if (typeof port === 'object') {
            callback = host;
        }

        setTimeout(() => {
            if (mockSocketOptions.triggerError) {
                this.emitCustom('error', new Error('Mock ECONNREFUSED'));
                return;
            }
            if (callback) callback();
            this.emitCustom('connect');

            if (mockSocketOptions.triggerTimeout) {
                // simulate hang
                setTimeout(() => {
                    this.emitCustom('timeout');
                }, 10);
                return;
            }

            // Once connected, simulate data returning based on input config
            if (mockSocketOptions.mockDataChunks.length > 0) {
                for (const chunk of mockSocketOptions.mockDataChunks) {
                    this.emitCustom('data', Buffer.from(chunk));
                }
                this.emitCustom('end');
            }
        }, mockSocketOptions.delayConnect);
        return this;
    }

    write(data, callback) {
        this.lastWrittenData = data.toString();
        if (callback) callback();
        return true;
    }

    setTimeout(ms, callback) {
        if (callback) this.on('timeout', callback);
        return this;
    }

    destroy() {
        this._isDestroyed = true;
    }
}

// Override net.Socket
net.Socket = MockSocket;

// Now we can import cortex_link (it uses the mocked net.Socket)
import { CortexLink } from '../../src/node/cortex_link.js';

describe('CortexLink TCP Bridge', () => {

    after(() => {
        // Restore
        net.Socket = originalSocket;
    });

    it('sendCommand serializes exactly to the JSON expected by daemon.py and buffers fragmented packets', async () => {
        // Setup mock to return fragmented JSON string: '{"status"' + ': "ok"}'
        mockSocketOptions = {
            triggerError: false,
            triggerTimeout: false,
            mockDataChunks: ['{"status', '": "ok", ', '"data"', ': 123}'],
            delayConnect: 0,
        };

        const link = new CortexLink();

        // We bypass ensureDaemon for this test as we only want to test sendCommand
        const res = await link.sendCommand('test_cmd', ['arg1'], '/my/cwd');

        // Check if the mock returned the re-assembled JSON
        assert.deepEqual(res, { status: 'ok', data: 123 });
    });

    it('sendCommand handles timeout and rejects gracefully', async () => {
        mockSocketOptions = {
            triggerError: false,
            triggerTimeout: true, // Will emit 'timeout'
            mockDataChunks: [],
            delayConnect: 0,
        };

        const link = new CortexLink();

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected on timeout');
        } catch (err) {
            assert.equal(err.message, 'Daemon unresponsive. Port locked.');
        }
    });

    it('sendCommand handles connection resets/errors', async () => {
        mockSocketOptions = {
            triggerError: true, // Will emit 'error'
            triggerTimeout: false,
            mockDataChunks: [],
            delayConnect: 0,
        };

        const link = new CortexLink();

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected on error');
        } catch (err) {
            assert.equal(err.message, 'Mock ECONNREFUSED');
        }
    });

    it('sendCommand catches invalid JSON response', async () => {
        mockSocketOptions = {
            triggerError: false,
            triggerTimeout: false,
            mockDataChunks: ['{"bad": '], // invalid json
            delayConnect: 0,
        };

        const link = new CortexLink();

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected invalid JSON');
        } catch (err) {
            assert.equal(err.message, 'Invalid JSON from Cortex');
        }
    });
});
