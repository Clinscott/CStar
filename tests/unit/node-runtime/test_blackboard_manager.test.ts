import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { BlackboardManager, blackboardManagerDeps } from '../../../src/node/core/blackboard_manager.js';

function makeState(entryCount: number) {
    return {
        blackboard: Array.from({ length: entryCount }, (_, index) => ({
            at: index,
            from: `Agent ${index}`,
            message: `entry-${index}`,
            type: 'INFO' as const,
        })),
        terminal_logs: [] as string[],
    };
}

afterEach(() => mock.reset());

describe('BlackboardManager deterministic compaction', () => {
    it('does nothing below the threshold', async () => {
        const state = makeState(19);
        const getMock = mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);

        await BlackboardManager.compactIfNecessary();

        assert.equal(getMock.mock.callCount(), 1);
        assert.equal(saveMock.mock.callCount(), 0);
        assert.equal(logMock.mock.callCount(), 0);
    });

    it('rolls up the oldest entries into a deterministic digest and preserves five recent entries', async () => {
        const state = makeState(20);
        mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);
        mock.method(Date, 'now', () => 1234567890);

        await BlackboardManager.compactIfNecessary();

        assert.equal(saveMock.mock.callCount(), 1);
        const saved = saveMock.mock.calls[0].arguments[0] as typeof state;
        assert.equal(saved.blackboard.length, 6);
        assert.equal(saved.blackboard[0].from, 'CStar');
        assert.match(saved.blackboard[0].message, /^\[COMPACTION\] Rolled up 15 entries; range=0-14; sha256=[a-f0-9]{64}\.$/);
        assert.deepEqual(
            saved.blackboard.slice(1).map((entry) => entry.message),
            ['entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19'],
        );
        assert.deepEqual(state.blackboard, saved.blackboard);
        assert.match(String(logMock.mock.calls[0].arguments[0]), /no model or external lane/i);
    });

    it('leaves the source state unchanged when persistence fails', async () => {
        const state = makeState(20);
        const original = state.blackboard.map((entry) => entry.message);
        mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        mock.method(blackboardManagerDeps.stateRegistry, 'save', () => {
            throw new Error('write failed');
        });
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);

        await BlackboardManager.compactIfNecessary();

        assert.deepEqual(state.blackboard.map((entry) => entry.message), original);
        assert.match(String(logMock.mock.calls[0].arguments[0]), /write failed/);
    });

    it('contains no host/model compaction dependency', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', '..', 'src', 'node', 'core', 'blackboard_manager.ts'),
            'utf-8',
        );
        assert.doesNotMatch(source, /requestHostText|host_intelligence|war-room:compactor/);
    });
});
