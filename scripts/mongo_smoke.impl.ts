/**
 * Live integration smoke check (implementation; launched by mongo_smoke.mjs).
 *
 * Connects to the live Atlas cluster, round-trips one synthetic intent through
 * a STUBBED pipeline CLI (never opening pennyone.db), and exercises the real
 * SyncWorker drain + export paths against ephemeral collections.
 *
 * Output is booleans / ids only. The Mongo URI is never printed.
 */

import { MongoClient } from 'mongodb';

import { SyncWorker } from '../src/node/sync/worker.ts';
import type { CliResult, CliRunner, IntentQueueCollection, Logger, MirrorCollection } from '../src/node/sync/types.ts';

const silentLogger: Logger = { info() {}, error() {} };

/** Stub CLI: succeeds for actions, returns a synthetic proposal for `list --history`. Never touches pennyone.db. */
class StubCli implements CliRunner {
    constructor(private readonly proposalId: string) {}

    async run(argv: string[]): Promise<CliResult> {
        if (argv[0] === 'list') {
            const proposals = [{ proposal_id: this.proposalId, status: 'proposed', title: 'smoke', spoke: 'smoke-spoke' }];
            return { ok: true, code: 0, stdout: JSON.stringify({ proposals }), stderr: '', json: { proposals } };
        }
        // accept/decline/refine/dispatch/edit/sync -> succeed without side effects.
        const json = { status: 'ok', echoed: argv };
        return { ok: true, code: 0, stdout: JSON.stringify(json), stderr: '', json };
    }
}

async function main(): Promise<void> {
    const uri = process.env.CSTAR_MONGO_URI;
    if (!uri || uri.trim() === '') {
        console.log('skip: CSTAR_MONGO_URI unset (smoke check is env-guarded)');
        return;
    }
    console.log('mongo_uri_present: true');

    const dbName = process.env.CSTAR_MONGO_DB?.trim() || 'cstar_console';
    // Use ephemeral, clearly-namespaced collections so we never disturb live mailbox data.
    const stamp = Date.now().toString(36);
    const intentColl = `smoke_intent_queue_${stamp}`;
    const mirrorColl = `smoke_proposal_mirror_${stamp}`;
    const proposalId = `SMOKE-${stamp}`;

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    // Assigned on every try/catch path below; left undeclared-init so the redundant
    // initializer is not flagged as a useless assignment.
    let ok: boolean;
    try {
        await client.connect();
        await client.db(dbName).command({ ping: 1 });
        console.log('connected: true');

        const db = client.db(dbName);
        const intentQueue = db.collection(intentColl) as unknown as IntentQueueCollection;
        const mirror = db.collection(mirrorColl) as unknown as MirrorCollection;

        // Seed one synthetic pending intent (decline avoids any gate guard semantics).
        const now = new Date();
        const seeded = await db.collection(intentColl).insertOne({
            action: 'decline',
            proposal_id: proposalId,
            payload: { notes: 'smoke check' },
            actor: null,
            status: 'pending',
            created_at: now,
            updated_at: now,
        });
        console.log('intent_seeded: ' + (seeded.acknowledged === true));
        console.log('intent_id: ' + seeded.insertedId.toString());

        const worker = new SyncWorker({
            intentQueue,
            mirror,
            cli: new StubCli(proposalId),
            config: { runSync: true, reconcile: true, maxIntentsPerTick: 10 },
            logger: silentLogger,
        });

        const summary = await worker.tick();

        // Drain assertions.
        const applied = await db.collection(intentColl).findOne({ _id: seeded.insertedId });
        const intentApplied = applied?.status === 'applied';
        console.log('intent_drained_applied: ' + intentApplied);
        console.log('intent_status: ' + (applied?.status ?? 'missing'));

        // Mirror assertions (read-back by proposal_id).
        const mirrorDoc = await db.collection(mirrorColl).findOne({ proposal_id: proposalId });
        const mirrorUpserted = !!mirrorDoc && mirrorDoc.proposal_id === proposalId;
        console.log('mirror_upserted: ' + mirrorUpserted);
        console.log('mirror_exported_count: ' + summary.export.exported);
        console.log('mirror_proposal_id_match: ' + (mirrorDoc?.proposal_id === proposalId));

        ok = intentApplied && mirrorUpserted && summary.drain.applied === 1;
    } catch (err) {
        // Print error class only — message may embed cluster hostnames.
        console.log('error_name: ' + (err instanceof Error ? err.name : 'unknown'));
        ok = false;
    } finally {
        // Best-effort cleanup of the ephemeral collections.
        try {
            await client.db(dbName).collection(intentColl).drop();
            await client.db(dbName).collection(mirrorColl).drop();
            console.log('cleanup: true');
        } catch {
            console.log('cleanup: false');
        }
        await client.close().catch(() => undefined);
    }

    console.log('smoke_ok: ' + ok);
    if (!ok) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.log('fatal_name: ' + (err instanceof Error ? err.name : 'unknown'));
    process.exit(1);
});
