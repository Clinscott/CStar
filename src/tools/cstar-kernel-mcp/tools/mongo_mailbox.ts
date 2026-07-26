import { errorResponse, mcpGuardrail, mcpMutation, textResponse } from '../contracts/responses.js';

type MongoMailboxAction = 'status' | 'mirror_counts' | 'enqueue_operator_intent';
type MongoIntentAction = 'accept' | 'decline' | 'refine' | 'dispatch' | 'edit';

export interface MongoMailboxArgs {
    action?: MongoMailboxAction;
    intent_action?: MongoIntentAction;
    proposal_id?: string;
    payload?: Record<string, unknown> | null;
    actor?: string;
}

const INTENT_ACTIONS = ['accept', 'decline', 'refine', 'dispatch', 'edit'] as const;
const DEFAULT_COLLECTIONS = {
    proposal_mirror: 'proposal_mirror',
    intent_queue: 'intent_queue',
    researcher_run_state_mirror: 'researcher_run_state_mirror',
    researcher_operator_intents: 'researcher_operator_intents',
};

function envValue(name: string, fallback = ''): string {
    return process.env[name] || fallback;
}

function collectionNames() {
    return {
        proposal_mirror: envValue('CSTAR_MONGO_MIRROR_COLLECTION', DEFAULT_COLLECTIONS.proposal_mirror),
        intent_queue: envValue('CSTAR_MONGO_INTENT_COLLECTION', DEFAULT_COLLECTIONS.intent_queue),
        researcher_run_state_mirror: envValue('CSTAR_MONGO_RESEARCHER_RUN_STATE_COLLECTION', DEFAULT_COLLECTIONS.researcher_run_state_mirror),
        researcher_operator_intents: envValue('CSTAR_MONGO_RESEARCHER_OPERATOR_INTENT_COLLECTION', DEFAULT_COLLECTIONS.researcher_operator_intents),
    };
}

async function getMongoDb() {
    const uri = envValue('CSTAR_MONGO_URI');
    if (!uri) {
        throw new Error('CSTAR_MONGO_URI is not set; Mongo mailbox is disabled.');
    }
    let module: any;
    try {
        module = await import('mongodb');
    } catch {
        throw new Error('mongodb package is not installed in CStar; install it before enabling live Mongo mailbox calls.');
    }
    const client = new module.MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    return { client, db: client.db(envValue('CSTAR_MONGO_DB', 'cstar_console')) };
}

export function isMongoMailboxWriteEnabled(): boolean {
    return process.env.CSTAR_KERNEL_ENABLE_MONGO_MAILBOX_WRITES === '1';
}

export function buildIntent(action: MongoIntentAction, proposalId: string, args: MongoMailboxArgs) {
    if (!INTENT_ACTIONS.includes(action)) {
        throw new Error(`Unsupported Mongo intent action: ${action}`);
    }
    if (!proposalId.trim()) {
        throw new Error('proposal_id is required for enqueue_operator_intent.');
    }
    const now = new Date();
    return {
        schema: 'cstar.mongo_mailbox.intent.v1',
        action,
        proposal_id: proposalId,
        payload: args.payload ?? null,
        actor: args.actor ?? 'cstar-kernel-mcp',
        status: 'pending',
        created_at: now,
        updated_at: now,
    };
}

export async function handleMongoMailbox(args: MongoMailboxArgs = {}) {
    const action = args.action ?? 'status';
    const names = collectionNames();
    const enabled = Boolean(envValue('CSTAR_MONGO_URI'));
    const writesEnabled = isMongoMailboxWriteEnabled();
    const guardrail = mcpGuardrail(
        enabled ? 'allow' : 'caution',
        enabled ? 'continue' : 'verify',
        enabled
            ? 'Mongo mailbox is configured; calls remain limited to named mirror and intent collections.'
            : 'Mongo mailbox is disabled because CSTAR_MONGO_URI is not set.',
        [],
        enabled ? [] : ['mongo_disabled'],
    );

    try {
        if (action === 'status') {
            return textResponse({
                status: 'ok',
                action,
                enabled,
                writes_enabled: writesEnabled,
                arbitrary_query_allowed: false,
                direct_secret_output_allowed: false,
                db_name: envValue('CSTAR_MONGO_DB', 'cstar_console'),
                collections: names,
                guardrail,
            });
        }

        if (action === 'mirror_counts') {
            const { client, db } = await getMongoDb();
            try {
                const counts = Object.fromEntries(await Promise.all(
                    Object.entries(names).map(async ([key, collection]) => [key, await db.collection(collection).countDocuments({})]),
                ));
                return textResponse({ status: 'ok', action, counts, collections: names, guardrail });
            } finally {
                await client.close();
            }
        }

        if (action === 'enqueue_operator_intent') {
            if (!writesEnabled) {
                return textResponse({
                    error: 'Mongo mailbox writes are disabled by server policy.',
                    guardrail: mcpGuardrail(
                        'block',
                        'refuse',
                        'Mongo mailbox writes require the server-controlled CSTAR_KERNEL_ENABLE_MONGO_MAILBOX_WRITES=1 gate.',
                        ['mongo_mailbox_writes_disabled'],
                    ),
                }, true);
            }
            const intentAction = args.intent_action ?? (() => { throw new Error('intent_action is required.'); })();
            const proposalId = args.proposal_id ?? (() => { throw new Error('proposal_id is required.'); })();
            const doc = buildIntent(intentAction, proposalId, args);
            const { client, db } = await getMongoDb();
            try {
                const result = await db.collection(names.intent_queue).insertOne(doc);
                return textResponse({
                    status: 'queued',
                    action,
                    intent_action: intentAction,
                    proposal_id: proposalId,
                    mutation: mcpMutation('mongo_mailbox_intent_enqueue', String(result.insertedId), 'Bounded Mongo mailbox intent was enqueued.'),
                    guardrail: mcpGuardrail('allow', 'continue', 'Intent queued for host worker application; PennyOne remains the source of truth.'),
                });
            } finally {
                await client.close();
            }
        }

        return textResponse({ error: `Unsupported Mongo mailbox action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
