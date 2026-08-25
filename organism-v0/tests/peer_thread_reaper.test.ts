import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ThreadReapCandidate } from '../src/peer_thread_lifecycle.ts';
import {
    runThreadReaper,
    type ThreadArchiveReceipt,
    type ThreadReaperPorts,
} from '../src/peer_thread_reaper.ts';

const terminalHash = 'b'.repeat(64);

function candidate(overrides: Partial<ThreadReapCandidate> = {}): ThreadReapCandidate {
    return {
        actor: 'organism_reaper',
        threadId: 'thread-02',
        hostId: 'host-02',
        role: 'validator',
        beadId: 'bead-02',
        effectId: 'effect-02',
        controllerGeneration: 'generation-02',
        requestedSelector: 'gpt-5.6-luna',
        requestedReasoning: 'max',
        actualIdentity: 'unreported',
        terminalState: 'completed',
        terminalVerdict: 'ACCEPTED',
        terminalReceiptPath: '/evidence/validator-terminal.json',
        terminalSha256: terminalHash,
        validationStatus: 'ACCEPTED',
        decisions: ['independent validation accepted'],
        gaps: [],
        artifactReferences: ['/evidence/validator-manifest.json'],
        openEffects: 0,
        engram: null,
        ...overrides,
    };
}

function ports(events: string[], receiptSink: ThreadArchiveReceipt[]): ThreadReaperPorts {
    return {
        async recordEngram(args) {
            events.push('engram');
            return { status: 'recorded', memoryId: args.memory_id };
        },
        async archiveThread() {
            events.push('archive');
            return { archived: true };
        },
        async persistArchiveReceipt(receipt) {
            events.push('receipt');
            receiptSink.push(receipt);
        },
    };
}

describe('Organism reaper side-effect sequence', () => {
    it('records the Engram, archives the thread, and persists the receipt in order', async () => {
        const events: string[] = [];
        const receipts: ThreadArchiveReceipt[] = [];
        const result = await runThreadReaper(candidate(), ports(events, receipts));
        assert.equal(result.status, 'ARCHIVED');
        assert.deepEqual(events, ['engram', 'archive', 'receipt']);
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0]?.threadId, 'thread-02');
        assert.equal(receipts[0]?.terminalSha256, terminalHash);
        assert.equal(receipts[0]?.deleted, false);
    });

    it('does not call any port for an ordinary actor', async () => {
        const events: string[] = [];
        const result = await runThreadReaper(candidate({ actor: 'watcher' }), ports(events, []));
        assert.equal(result.status, 'REJECTED');
        assert.deepEqual(events, []);
    });

    it('does not archive when the Engram acknowledgement mismatches', async () => {
        const events: string[] = [];
        const testPorts = ports(events, []);
        testPorts.recordEngram = async () => {
            events.push('engram');
            return { status: 'recorded', memoryId: 'wrong-memory-id' };
        };
        const result = await runThreadReaper(candidate(), testPorts);
        assert.equal(result.status, 'ENGRAM_RECORD_FAILED');
        assert.deepEqual(events, ['engram']);
    });

    it('does not call any port while external effects remain open', async () => {
        const events: string[] = [];
        const result = await runThreadReaper(candidate({ openEffects: 1 }), ports(events, []));
        assert.equal(result.status, 'HELD');
        assert.deepEqual(events, []);
    });
});
