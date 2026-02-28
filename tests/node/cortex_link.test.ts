import { test, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';

// Mock the 'ws' library
let mockWsOptions = {
    triggerError: false,
    authFailure: false,
    mockResponse: null as any,
    invalidJson: false
};

class MockWebSocket extends EventEmitter {
    public url: string;
    constructor(url: string) {
        super();
        this.url = url;
        // Simulate connection
        setTimeout(() => {
            if (mockWsOptions.triggerError) {
                this.emit('error', new Error('Mock ECONNREFUSED'));
            } else {
                this.emit('open');
            }
        }, 10);
    }

    send(data: string) {
        let payload: any;
        try {
            payload = JSON.parse(data);
        } catch (e) {
            return;
        }

        // If it's the second message (the command), reply
        if (payload.command) {
            setTimeout(() => {
                if (mockWsOptions.authFailure) {
                    this.emit('close', 1008, 'Auth Denied');
                } else if (mockWsOptions.invalidJson) {
                    this.emit('message', Buffer.from('{"bad": '));
                } else if (mockWsOptions.mockResponse) {
                    this.emit('message', Buffer.from(JSON.stringify({
                        type: 'result',
                        data: mockWsOptions.mockResponse
                    })));
                }
            }, 10);
        }
    }

    close() {
        this.emit('close', 1000, 'Normal');
    }

    terminate() {
        this.emit('close', 1006, 'Abnormal');
    }
}

// Import CortexLink (using .js extension for tsx resolution)
import { CortexLink } from '../../src/node/cortex_link.js';

describe('CortexLink WebSocket Bridge', () => {

    it('sendCommand serializes and receives responses via WebSockets', async () => {
        mockWsOptions = {
            triggerError: false,
            authFailure: false,
            mockResponse: { status: 'ok', data: 123 },
            invalidJson: false
        };

        const link = new CortexLink(50051, '127.0.0.1', MockWebSocket as any);
        const res = await link.sendCommand('test_cmd', ['arg1'], '/my/cwd');

        assert.deepEqual(res, { status: 'ok', data: 123 });
    });

    it('sendCommand handles connection errors', async () => {
        mockWsOptions = {
            triggerError: true,
            authFailure: false,
            mockResponse: null,
            invalidJson: false
        };

        const link = new CortexLink(50051, '127.0.0.1', MockWebSocket as any);

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected on error');
        } catch (err: any) {
            assert.equal(err.message, 'Mock ECONNREFUSED');
        }
    });

    it('sendCommand handles authentication failure', async () => {
        mockWsOptions = {
            triggerError: false,
            authFailure: true,
            mockResponse: null,
            invalidJson: false
        };

        const link = new CortexLink(50051, '127.0.0.1', MockWebSocket as any);

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected on auth failure');
        } catch (err: any) {
            assert.match(err.message, /Authentication Failed/);
        }
    });

    it('sendCommand catches invalid JSON response', async () => {
        mockWsOptions = {
            triggerError: false,
            authFailure: false,
            mockResponse: null,
            invalidJson: true
        };

        const link = new CortexLink(50051, '127.0.0.1', MockWebSocket as any);

        try {
            await link.sendCommand('ping');
            assert.fail('Should have rejected invalid JSON');
        } catch (err: any) {
            assert.equal(err.message, 'Failed to parse daemon response');
        }
    });
});
