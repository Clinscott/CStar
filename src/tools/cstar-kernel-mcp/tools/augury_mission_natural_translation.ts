import type { McpRequestContext } from '../contracts/request_context.js';
import type { AuguryVerifiedSetIdentity } from '../contracts/augury_mission.js';
import {
    readExactForgeNaturalSetTranslation,
    type AuguryMissionV2SetBinding,
} from './forge_set_manifest_signal.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';

export function projectAuguryMissionSetIdentity(
    identity: VerifiedCodexRequestIdentity,
    recordSha256: string,
): AuguryVerifiedSetIdentity {
    return {
        schema: 'cstar.verified_current_exact_root_set.v1',
        source: 'verified_codex_request_identity',
        root_thread_id: identity.thread_id,
        set_turn_id: identity.turn_id,
        set_record_sha256: recordSha256,
        set_record_set_sha256: identity.turn_record_set_sha256,
        set_record_count: identity.turn_record_count,
        set_first_timestamp: identity.turn_first_timestamp,
        set_timestamp: identity.turn_timestamp,
        session_record_set_sha256: identity.turn_record_set_sha256,
        session_record_count: identity.turn_record_count,
    };
}

/**
 * Project the typed, one-use CoS translation into the v1 receipt identity
 * shape used by the existing Augury materializer. No authority is inferred.
 */
export async function verifyAuguryMissionNaturalSetIdentity(
    requestContext: McpRequestContext | undefined,
    binding: AuguryMissionV2SetBinding,
    now: number,
): Promise<AuguryVerifiedSetIdentity | null> {
    const identity = await verifyCodexRequestIdentity(requestContext, now);
    const translation = readExactForgeNaturalSetTranslation(identity, binding, now);
    if (!translation) return null;
    return projectAuguryMissionSetIdentity(identity, translation.selected_record_sha256);
}
