import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { BlackboardManager, blackboardManagerDeps } from  '../../../src/node/core/blackboard_manager.js';

type BlackboardEntryLike = {
    at: number;
    from: string;
    message: string;
    type: 'HANDOFF' | 'BROADCAST' | 'INFO' | 'ALERT';
};

function makeEntry(index: number): BlackboardEntryLike {
    return {
        at: index,
        from: `Agent ${index}`,
        message: `entry-${index}`,
        type: 'INFO',
    };
}

function makeState(entryCount: number) {
    return {
        blackboard: Array.from({ length: entryCount }, (_, index) => makeEntry(index)),
        terminal_logs: [] as string[],
    };
}

afterEach(() => {
    mock.reset();
});

describe('BlackboardManager.compactIfNecessary', () => {
    it('returns without host summarization when the threshold is not met', async () => {
        const state = makeState(19);
        const getMock = mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);
        const requestMock = mock.method(blackboardManagerDeps, 'requestHostText', async () => {
            throw new Error('should not be called');
        });

        await BlackboardManager.compactIfNecessary();

        assert.strictEqual(getMock.mock.callCount(), 1);
        assert.strictEqual(saveMock.mock.callCount(), 0);
        assert.strictEqual(logMock.mock.callCount(), 0);
        assert.strictEqual(requestMock.mock.callCount(), 0);
        assert.deepStrictEqual(state.blackboard?.map((entry) => entry.message), Array.from({ length: 19 }, (_, index) => `entry-${index}`));
    });

    it('summarizes the oldest 15 entries and preserves the remaining blackboard state', async () => {
        const state = makeState(20);
        const getMock = mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);
        mock.method(blackboardManagerDeps.registry, 'getRoot', () => '/project/root');
        const requestMock = mock.method(blackboardManagerDeps, 'requestHostText', async (request: { prompt: string }) => ({
            provider: 'codex' as const,
            response: {} as any,
            text: 'condensed tactical summary',
        }));
        const nowMock = mock.method(Date, 'now', () => 1234567890);

        await BlackboardManager.compactIfNecessary();

        assert.strictEqual(getMock.mock.callCount(), 1);
        assert.strictEqual(requestMock.mock.callCount(), 1);
        assert.strictEqual(saveMock.mock.callCount(), 1);
        assert.strictEqual(logMock.mock.callCount(), 1);
        assert.strictEqual(nowMock.mock.callCount(), 1);

        const requestArgs = requestMock.mock.calls[0].arguments[0] as { prompt: string; projectRoot: string; source: string; systemPrompt?: string };
        assert.strictEqual(requestArgs.projectRoot, '/project/root');
        assert.strictEqual(requestArgs.source, 'war-room:compactor');
        assert.strictEqual(requestArgs.systemPrompt, 'Keep summaries concise and tactical.');

        const promptSections = requestArgs.prompt.split('EVENTS TO COMPACT:\n');
        assert.strictEqual(promptSections.length, 2);
        const compactedEntries = JSON.parse(promptSections[1]) as BlackboardEntryLike[];
        assert.deepStrictEqual(compactedEntries.map((entry) => entry.message), Array.from({ length: 15 }, (_, index) => `entry-${index}`));

        const savedState = saveMock.mock.calls[0].arguments[0] as { blackboard: BlackboardEntryLike[] };
        assert.strictEqual(savedState.blackboard.length, 6);
        assert.strictEqual(savedState.blackboard[0].at, 1234567890);
        assert.strictEqual(savedState.blackboard[0].from, 'Witness');
        assert.strictEqual(savedState.blackboard[0].type, 'INFO');
        assert.strictEqual(savedState.blackboard[0].message, '[COMPACTION] Tactical Summary: condensed tactical summary');
        assert.deepStrictEqual(savedState.blackboard.slice(1).map((entry) => entry.message), ['entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19']);
        assert.deepStrictEqual(state.blackboard.map((entry) => entry.message), ['[COMPACTION] Tactical Summary: condensed tactical summary', 'entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19']);
        assert.deepStrictEqual(logMock.mock.calls[0].arguments, ['[Witness] Blackboard compaction complete. Old engrams archived.']);
    });

    it('surfaces host summarization failures through terminal logs without saving partial state', async () => {
        const state = makeState(20);
        const getMock = mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        const logMock = mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);
        mock.method(blackboardManagerDeps.registry, 'getRoot', () => '/project/root');
        mock.method(blackboardManagerDeps, 'requestHostText', async () => {
            throw new Error('bridge timeout');
        });

        await BlackboardManager.compactIfNecessary();

        assert.strictEqual(getMock.mock.callCount(), 1);
        assert.strictEqual(saveMock.mock.callCount(), 0);
        assert.strictEqual(logMock.mock.callCount(), 1);
        assert.deepStrictEqual(state.blackboard.map((entry) => entry.message), Array.from({ length: 20 }, (_, index) => `entry-${index}`));
        assert.deepStrictEqual(logMock.mock.calls[0].arguments, ['[Witness:ERR] Compaction failed: bridge timeout']);
    });

    it('preserves the recent five entries in order after compaction', async () => {
        const state = makeState(20);
        mock.method(blackboardManagerDeps.stateRegistry, 'get', () => state as any);
        const saveMock = mock.method(blackboardManagerDeps.stateRegistry, 'save', () => undefined);
        mock.method(blackboardManagerDeps.stateRegistry, 'pushTerminalLog', () => undefined);
        mock.method(blackboardManagerDeps.registry, 'getRoot', () => '/project/root');
        mock.method(blackboardManagerDeps, 'requestHostText', async () => ({
            provider: 'codex' as const,
            response: {} as any,
            text: 'summary',
        }));

        await BlackboardManager.compactIfNecessary();

        const savedState = saveMock.mock.calls[0].arguments[0] as { blackboard: BlackboardEntryLike[] };
        assert.deepStrictEqual(savedState.blackboard.slice(1).map((entry) => entry.message), ['entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19']);
        assert.deepStrictEqual(savedState.blackboard.slice(1).map((entry) => entry.at), [15, 16, 17, 18, 19]);
    });
});
