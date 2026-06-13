import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SyncWorker } from '../../src/node/sync/worker.js';
import type {
    CliResult,
    CliRunner,
    IntentDoc,
    IntentQueueCollection,
    Logger,
    MirrorCollection,
} from '../../src/node/sync/types.js';

const silentLogger: Logger = { info() {}, error() {} };

/** In-memory `intent_queue` honoring atomic claim-oldest-pending semantics. */
class FakeIntentQueue implements IntentQueueCollection {
    docs: IntentDoc[];

    constructor(docs: IntentDoc[]) {
        this.docs = docs;
    }

    async findOneAndUpdate(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
    ): Promise<IntentDoc | null> {
        const candidates = this.docs
            .filter((d) => d.status === filter.status)
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        const target = candidates[0];
        if (!target) {
            return null;
        }
        Object.assign(target, (update.$set as Partial<IntentDoc>) ?? {});
        return { ...target };
    }

    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown> {
        const target = this.docs.find((d) => d._id === filter._id);
        if (target) {
            Object.assign(target, (update.$set as Partial<IntentDoc>) ?? {});
        }
        return { acknowledged: true };
    }
}

/** Records bulkWrite / deleteMany calls. */
class FakeMirror implements MirrorCollection {
    bulkOps: unknown[][] = [];
    deletes: Record<string, unknown>[] = [];

    async bulkWrite(ops: unknown[]): Promise<unknown> {
        this.bulkOps.push(ops);
        return { acknowledged: true };
    }

    async deleteMany(filter: Record<string, unknown>): Promise<unknown> {
        this.deletes.push(filter);
        return { acknowledged: true };
    }
}

/** Programmable CLI runner keyed by the first argv element (the subcommand). */
class FakeCli implements CliRunner {
    calls: string[][] = [];
    private readonly handler: (argv: string[]) => CliResult;

    constructor(handler: (argv: string[]) => CliResult) {
        this.handler = handler;
    }

    async run(argv: string[]): Promise<CliResult> {
        this.calls.push(argv);
        return this.handler(argv);
    }
}

function ok(json: unknown = { status: 'ok' }): CliResult {
    return { ok: true, code: 0, stdout: JSON.stringify(json), stderr: '', json };
}

function fail(stderr: string, code = 1): CliResult {
    return { ok: false, code, stdout: '', stderr, json: null };
}

function intent(over: Partial<IntentDoc>): IntentDoc {
    return {
        _id: over._id ?? Math.random().toString(36).slice(2),
        action: over.action ?? 'accept',
        proposal_id: over.proposal_id ?? 'P-1',
        payload: 'payload' in over ? over.payload : null,
        status: over.status ?? 'pending',
        created_at: over.created_at ?? new Date(),
    };
}

const exportEmpty = (argv: string[]): CliResult =>
    argv[0] === 'list' ? ok({ proposals: [] }) : ok();

describe('host sync worker — drain (up)', () => {
    it('claims a pending intent and marks it applied on CLI success', async () => {
        const queue = new FakeIntentQueue([intent({ _id: 'a', action: 'accept', proposal_id: 'P-1', created_at: new Date(1) })]);
        const cli = new FakeCli(exportEmpty);
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.drainIntents();
        assert.deepEqual(summary, { claimed: 1, applied: 1, failed: 0 });
        const doc = queue.docs[0];
        assert.equal(doc.status, 'applied');
        assert.ok(doc.applied_at instanceof Date);
        assert.ok(doc.claimed_at instanceof Date);
        assert.deepEqual(cli.calls[0], ['accept', '--id', 'P-1', '--notes', '']);
    });

    it('marks an intent failed (capturing stderr) when the CLI exits non-zero, and continues the loop', async () => {
        const queue = new FakeIntentQueue([
            intent({ _id: 'a', action: 'accept', proposal_id: 'BAD', created_at: new Date(1) }),
            intent({ _id: 'b', action: 'decline', proposal_id: 'GOOD', created_at: new Date(2) }),
        ]);
        const cli = new FakeCli((argv) => {
            if (argv[0] === 'accept') {
                return fail('gate_status is not gate_passed', 3);
            }
            return ok();
        });
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.drainIntents();
        assert.deepEqual(summary, { claimed: 2, applied: 1, failed: 1 });

        const bad = queue.docs.find((d) => d._id === 'a');
        assert.ok(bad);
        assert.equal(bad.status, 'failed');
        assert.match(bad.error ?? '', /gate_status is not gate_passed/);
        assert.ok(bad.failed_at instanceof Date);

        const good = queue.docs.find((d) => d._id === 'b');
        assert.ok(good);
        assert.equal(good.status, 'applied');
    });

    it('marks an intent failed without shelling when the action is unsupported', async () => {
        const queue = new FakeIntentQueue([intent({ _id: 'a', action: 'promote', proposal_id: 'P-1', created_at: new Date(1) })]);
        const cli = new FakeCli(exportEmpty);
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.drainIntents();
        assert.deepEqual(summary, { claimed: 1, applied: 0, failed: 1 });
        assert.equal(queue.docs[0].status, 'failed');
        assert.match(queue.docs[0].error ?? '', /Unsupported intent action/);
        // CLI was never invoked for the bad action.
        assert.equal(cli.calls.length, 0);
    });

    it('processes pending intents oldest-first', async () => {
        const queue = new FakeIntentQueue([
            intent({ _id: 'new', proposal_id: 'NEW', created_at: new Date(2000) }),
            intent({ _id: 'old', proposal_id: 'OLD', created_at: new Date(1000) }),
        ]);
        const cli = new FakeCli(exportEmpty);
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        await worker.drainIntents();
        assert.equal(cli.calls[0][2], 'OLD');
        assert.equal(cli.calls[1][2], 'NEW');
    });

    it('does not re-run already-claimed intents (exactly once)', async () => {
        const queue = new FakeIntentQueue([
            intent({ _id: 'a', proposal_id: 'P-1', status: 'processing', created_at: new Date(1) }),
            intent({ _id: 'b', proposal_id: 'P-2', status: 'applied', created_at: new Date(2) }),
        ]);
        const cli = new FakeCli(exportEmpty);
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.drainIntents();
        assert.deepEqual(summary, { claimed: 0, applied: 0, failed: 0 });
        assert.equal(cli.calls.length, 0);
    });
});

describe('host sync worker — export (down)', () => {
    it('upserts every proposal returned by list --history', async () => {
        const proposals = [{ proposal_id: 'A', status: 'proposed' }, { proposal_id: 'B', status: 'accepted' }];
        const mirror = new FakeMirror();
        const cli = new FakeCli((argv) => (argv[0] === 'list' ? ok({ proposals }) : ok()));
        const worker = new SyncWorker({
            intentQueue: new FakeIntentQueue([]),
            mirror,
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.exportMirror();
        assert.equal(summary.exported, 2);
        assert.equal(mirror.bulkOps.length, 1);
        assert.equal(mirror.bulkOps[0].length, 2);
        assert.equal(mirror.deletes.length, 0);
    });

    it('reconciles stale mirror docs when enabled', async () => {
        const proposals = [{ proposal_id: 'A' }];
        const mirror = new FakeMirror();
        const cli = new FakeCli((argv) => (argv[0] === 'list' ? ok({ proposals }) : ok()));
        const worker = new SyncWorker({
            intentQueue: new FakeIntentQueue([]),
            mirror,
            cli,
            config: { runSync: false, reconcile: true, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.exportMirror();
        assert.equal(summary.reconciled, true);
        assert.deepEqual(mirror.deletes[0], { proposal_id: { $nin: ['A'] } });
    });

    it('skips reconcile deletion when the export is empty', async () => {
        const mirror = new FakeMirror();
        const errors: Array<{ event: string; fields: Record<string, unknown> }> = [];
        const cli = new FakeCli((argv) => (argv[0] === 'list' ? ok({ proposals: [] }) : ok()));
        const worker = new SyncWorker({
            intentQueue: new FakeIntentQueue([]),
            mirror,
            cli,
            config: { runSync: false, reconcile: true, maxIntentsPerTick: 500 },
            logger: {
                info() {},
                error(event, fields = {}) {
                    errors.push({ event, fields });
                },
            },
        });

        const summary = await worker.exportMirror();
        assert.deepEqual(summary, { exported: 0, reconciled: false });
        assert.equal(mirror.deletes.length, 0);
        assert.equal(errors[0]?.event, 'mirror.reconcile_skipped_empty_export');
    });

    it('throws when list --history fails (so the tick records the error)', async () => {
        const cli = new FakeCli(() => fail('export boom'));
        const worker = new SyncWorker({
            intentQueue: new FakeIntentQueue([]),
            mirror: new FakeMirror(),
            cli,
            config: { runSync: false, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });
        await assert.rejects(() => worker.exportMirror(), /list --history failed/);
    });
});

describe('host sync worker — tick orchestration', () => {
    it('drains, runs sync, then exports', async () => {
        const queue = new FakeIntentQueue([intent({ _id: 'a', proposal_id: 'P-1', created_at: new Date(1) })]);
        const calls: string[] = [];
        const cli = new FakeCli((argv) => {
            calls.push(argv[0]);
            return argv[0] === 'list' ? ok({ proposals: [{ proposal_id: 'P-1' }] }) : ok();
        });
        const worker = new SyncWorker({
            intentQueue: queue,
            mirror: new FakeMirror(),
            cli,
            config: { runSync: true, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.tick();
        assert.equal(summary.drain.applied, 1);
        assert.equal(summary.export.exported, 1);
        assert.deepEqual(calls, ['accept', 'sync', 'list']);
    });

    it('treats a failed sync as non-fatal and still exports', async () => {
        const cli = new FakeCli((argv) => {
            if (argv[0] === 'sync') {
                return fail('sync boom');
            }
            return argv[0] === 'list' ? ok({ proposals: [] }) : ok();
        });
        const worker = new SyncWorker({
            intentQueue: new FakeIntentQueue([]),
            mirror: new FakeMirror(),
            cli,
            config: { runSync: true, reconcile: false, maxIntentsPerTick: 500 },
            logger: silentLogger,
        });

        const summary = await worker.tick();
        assert.equal(summary.export.exported, 0);
    });
});
