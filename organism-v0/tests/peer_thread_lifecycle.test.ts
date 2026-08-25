import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    admitPeerLaunch,
    evaluateThreadReap,
    type ThreadReapCandidate,
} from '../src/peer_thread_lifecycle.ts';

const terminalHash = 'a'.repeat(64);

function candidate(overrides: Partial<ThreadReapCandidate> = {}): ThreadReapCandidate {
    return {
        actor: 'organism_reaper',
        threadId: 'thread-01',
        hostId: 'host-01',
        role: 'worker',
        beadId: 'bead-01',
        effectId: 'effect-01',
        controllerGeneration: 'generation-01',
        requestedSelector: 'gpt-5.6-luna',
        requestedReasoning: 'max',
        actualIdentity: 'unreported',
        terminalState: 'completed',
        terminalVerdict: 'PASS',
        terminalReceiptPath: '/evidence/terminal.json',
        terminalSha256: terminalHash,
        validationStatus: 'ACCEPTED',
        decisions: ['bounded peer completed'],
        gaps: [],
        artifactReferences: ['/evidence/manifest.json'],
        openEffects: 0,
        engram: {
            durable: true,
            memoryId: 'engram-01',
            threadId: 'thread-01',
            terminalSha256: terminalHash,
        },
        ...overrides,
    };
}

describe('independent peer construction', () => {
    it('admits only codex_app.create_thread with lifecycle bindings', () => {
        const result = admitPeerLaunch({
            surface: 'codex_app.create_thread',
            role: 'worker',
            beadId: 'bead-01',
            effectId: 'effect-01',
            controllerThreadId: 'controller-01',
            requestedSelector: 'gpt-5.6-luna',
            requestedReasoning: 'max',
        });
        assert.equal(result.verdict, 'ADMITTED');
        assert.deepEqual(result.failures, []);
    });

    for (const surface of ['collaboration.spawn_agent', 'codex_app.fork_thread', 'fork_turns']) {
        it(`rejects ${surface}`, () => {
            const result = admitPeerLaunch({
                surface,
                role: 'validator',
                beadId: 'bead-01',
                effectId: 'effect-01',
                controllerThreadId: 'controller-01',
                requestedSelector: 'gpt-5.6-luna',
                requestedReasoning: 'max',
            });
            assert.equal(result.verdict, 'REJECTED');
            assert.ok(result.failures.includes('NON_PEER_CREATION_SURFACE'));
        });
    }
});

describe('Engram-gated Organism reaping', () => {
    it('rejects archive attempts by ordinary roles', () => {
        const result = evaluateThreadReap(candidate({ actor: 'worker' }));
        assert.equal(result.verdict, 'REJECTED');
        assert.equal(result.engramAction, null);
        assert.equal(result.archiveAction, null);
    });

    it('holds a running thread', () => {
        const result = evaluateThreadReap(candidate({ terminalState: 'running' }));
        assert.equal(result.verdict, 'HOLD_FOR_TERMINAL');
    });

    it('makes the reaper record the compact Engram when none exists', () => {
        const result = evaluateThreadReap(candidate({ engram: null }));
        assert.equal(result.verdict, 'RECORD_ENGRAM');
        assert.deepEqual(result.engramAction, {
            tool: 'cstar_engram_record',
            args: {
                intent: 'cstar/thread-terminal/thread-01',
                bead_id: 'bead-01',
                memory_id: `thread_thread-01_${terminalHash.slice(0, 16)}`,
                metadata: {
                    thread_id: 'thread-01',
                    host_id: 'host-01',
                    role: 'worker',
                    effect_id: 'effect-01',
                    controller_generation: 'generation-01',
                    requested_selector: 'gpt-5.6-luna',
                    requested_reasoning: 'max',
                    actual_identity: 'unreported',
                    terminal_state: 'completed',
                    terminal_verdict: 'PASS',
                    terminal_receipt_path: '/evidence/terminal.json',
                    terminal_sha256: terminalHash,
                    validation_status: 'ACCEPTED',
                    decisions: ['bounded peer completed'],
                    gaps: [],
                    artifact_references: ['/evidence/manifest.json'],
                    open_effects: 0,
                },
            },
        });
        assert.equal(result.archiveAction, null);
    });

    it('waits for the reaper-owned Engram acknowledgement without rewriting it', () => {
        const result = evaluateThreadReap(candidate({
            engram: {
                durable: false,
                memoryId: 'engram-01',
                threadId: 'thread-01',
                terminalSha256: terminalHash,
            },
        }));
        assert.equal(result.verdict, 'HOLD_FOR_ENGRAM');
        assert.equal(result.engramAction, null);
        assert.equal(result.archiveAction, null);
    });

    it('holds a terminal thread when the Engram binding mismatches', () => {
        const result = evaluateThreadReap(candidate({
            engram: {
                durable: true,
                memoryId: 'engram-01',
                threadId: 'different-thread',
                terminalSha256: terminalHash,
            },
        }));
        assert.equal(result.verdict, 'HOLD_FOR_ENGRAM');
    });

    it('holds a terminal thread while effects remain open', () => {
        const result = evaluateThreadReap(candidate({ openEffects: 1 }));
        assert.equal(result.verdict, 'HOLD_FOR_EFFECTS');
    });

    it('admits archival only for the reaper after terminal and Engram proof', () => {
        const result = evaluateThreadReap(candidate());
        assert.equal(result.verdict, 'REAP_ELIGIBLE');
        assert.equal(result.engramAction, null);
        assert.deepEqual(result.archiveAction, {
            tool: 'codex_app.set_thread_archived',
            args: { threadId: 'thread-01', hostId: 'host-01', archived: true },
        });
        assert.equal(result.deleteAllowed, false);
    });
});
