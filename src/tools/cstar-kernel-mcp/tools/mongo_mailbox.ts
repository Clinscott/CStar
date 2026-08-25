import { textResponse } from '../contracts/responses.js';

type MongoMailboxAction = 'status' | 'mirror_counts' | 'enqueue_operator_intent';
type MongoIntentAction = 'accept' | 'decline' | 'refine' | 'dispatch' | 'edit';

export interface MongoMailboxArgs {
    action?: MongoMailboxAction;
    intent_action?: MongoIntentAction;
    proposal_id?: string;
    payload?: Record<string, unknown> | null;
    actor?: string;
    operator_authorization_ref?: string;
}

export const RETIRED_MONGO_MAILBOX_ERROR =
    'legacy_mongo_mailbox_retired_use_cstar_kernel_hall_surfaces';

/**
 * Fail-closed compatibility surface.
 *
 * Mongo was an unverified external mirror that read a secret URI from ambient
 * process state. CStar lifecycle state and operator intent now stay on the
 * kernel/Hall path; no compatibility action imports a driver or reaches a
 * network.
 */
export async function handleMongoMailbox(args: MongoMailboxArgs = {}) {
    return textResponse({
        error: RETIRED_MONGO_MAILBOX_ERROR,
        status: 'retired',
        requested_action: args.action ?? 'status',
        decommissioned: true,
        actuated: false,
        network_accessed: false,
        secret_source_read: false,
        replacement: 'cstar_pennyone_context and bounded cstar-kernel lifecycle tools',
    }, true);
}
