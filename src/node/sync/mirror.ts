/**
 * Mirror export transform (the "down" push).
 *
 * Each `proposal_mirror` document is exactly one decoded row from the CLI's
 * `list --history` output, upserted by `proposal_id` so the cloud console
 * reads a faithful, idempotent replica of `hall_research_proposals`.
 */

/** A decoded proposal row (one element of `list --history`'s `proposals` array). */
export type ProposalRow = Record<string, unknown>;

/** A single idempotent upsert keyed by `proposal_id`. */
export interface MirrorUpsertOp {
    /** Match filter keyed by the stable proposal id. */
    filter: { proposal_id: string };
    /** `$set` of the full decoded row. */
    update: { $set: ProposalRow };
}

/**
 * Read the stable proposal id off a decoded row.
 * @param proposal - A decoded proposal row.
 * @returns The `proposal_id` string.
 */
function requireProposalId(proposal: ProposalRow): string {
    const proposalId = proposal?.proposal_id;
    if (typeof proposalId !== 'string' || proposalId.length === 0) {
        throw new Error('Proposal row is missing a string proposal_id');
    }
    return proposalId;
}

/**
 * Build the idempotent upsert operation for one exported proposal row.
 * @param proposal - A decoded proposal row from `list --history`.
 * @returns The filter + `$set` document keyed by `proposal_id`.
 */
export function mirrorUpsertOp(proposal: ProposalRow): MirrorUpsertOp {
    const proposalId = requireProposalId(proposal);
    return {
        filter: { proposal_id: proposalId },
        // Re-stamp proposal_id so the key is always present even if the source omitted it post-decode.
        update: { $set: { ...proposal, proposal_id: proposalId } },
    };
}

/**
 * Build the `bulkWrite` operations for a full mirror export.
 * @param proposals - The decoded `proposals` array from `list --history`.
 * @returns An array of `{ updateOne: { filter, update, upsert: true } }` ops.
 */
export function mirrorBulkOps(proposals: ProposalRow[]): unknown[] {
    return proposals.map((proposal) => {
        const { filter, update } = mirrorUpsertOp(proposal);
        return { updateOne: { filter, update, upsert: true } };
    });
}

/**
 * Extract the `proposals` array from the CLI's `list --history` JSON output.
 * @param json - Parsed stdout from `list --history`.
 * @returns The proposals array (empty when absent / malformed).
 */
export function extractProposals(json: unknown): ProposalRow[] {
    if (json !== null && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).proposals)) {
        return (json as { proposals: ProposalRow[] }).proposals;
    }
    return [];
}

/**
 * Build the reconcile filter that removes mirror docs absent from the latest export.
 * @param proposals - The decoded proposals from the latest export.
 * @returns A `deleteMany` filter targeting stale `proposal_id`s.
 */
export function reconcileFilter(proposals: ProposalRow[]): { proposal_id: { $nin: string[] } } {
    const ids = proposals
        .map((proposal) => proposal?.proposal_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { proposal_id: { $nin: ids } };
}
