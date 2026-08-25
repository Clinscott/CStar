const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export function isForgeRequesterLineageValid(
    threadId: unknown,
    turnId: unknown,
    recordSetSha256: unknown,
): threadId is string {
    return typeof threadId === 'string' && UUID.test(threadId)
        && typeof turnId === 'string' && UUID.test(turnId)
        && typeof recordSetSha256 === 'string' && SHA256.test(recordSetSha256);
}

export function forgeRequesterLineageMatchesRequest(
    request: {
        requester_thread_id?: string;
        requester_turn_id?: string;
        requester_record_set_sha256?: string;
    },
    lineage: unknown,
): boolean {
    if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) return false;
    const record = lineage as Record<string, unknown>;
    return record.status === 'recorded_v2_extension'
        && isForgeRequesterLineageValid(
            request.requester_thread_id,
            request.requester_turn_id,
            request.requester_record_set_sha256,
        )
        && isForgeRequesterLineageValid(record.thread_id, record.turn_id, record.record_set_sha256)
        && record.thread_id === request.requester_thread_id
        && record.turn_id === request.requester_turn_id
        && record.record_set_sha256 === request.requester_record_set_sha256;
}
