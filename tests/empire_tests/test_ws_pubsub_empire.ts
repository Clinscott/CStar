import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventManager } from '../../src/node/core/EventManager.js';
import { WebSocket } from 'ws';
import EventEmitter from 'node:events';

describe('EventManager: Multi-Tenant Pub/Sub isolation', () => {
    let em: EventManager;

    beforeEach(() => {
        em = EventManager.getInstance();
        // Clear internal state for testing if necessary
        (em as any).subscriptions = new Map();
    });

    it('should correctly isolate broadcasts by app_id', (t, done) => {
        const mockWs1 = new EventEmitter() as any;
        mockWs1.readyState = WebSocket.OPEN;
        mockWs1.send = (msg: string) => {
            const data = JSON.parse(msg);
            assert.strictEqual(data.val, 'target');
            done();
        };

        const mockWs2 = new EventEmitter() as any;
        mockWs2.readyState = WebSocket.OPEN;
        mockWs2.send = (msg: string) => {
            assert.fail('Should not receive broadcast for different app_id');
        };

        em.subscribe('keep_os', mockWs1);
        em.subscribe('dnd_engine', mockWs2);

        em.broadcast('keep_os', { val: 'target' });
    });

    it('should garbage collect app_id keys when Sets are empty', () => {
        const mockWs = new EventEmitter() as any;
        em.subscribe('temp_app', mockWs);
        assert.ok((em as any).subscriptions.has('temp_app'));

        em.unsubscribe('temp_app', mockWs);
        assert.ok(!(em as any).subscriptions.has('temp_app'), 'Map should delete empty app_id key');
    });
});
