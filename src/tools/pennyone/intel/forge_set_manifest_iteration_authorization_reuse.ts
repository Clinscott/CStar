import type Database from 'better-sqlite3';

import type {
    AuthorizeForgeRequestInput,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import { verifyForgeSetManifestIterationAuthority } from
    '../../cstar-kernel-mcp/tools/forge_set_manifest_iteration_authority.js';
import { ROOT_USER_FORGE_INTENT_PROFILE } from './forge_authorization_policy.js';

function storedSetProjectionMatches(
    raw: string | undefined,
    request: HallForgeRequestRecord,
): boolean {
    try {
        const value = JSON.parse(raw ?? '') as Record<string, unknown>;
        const subject = value.subject as Record<string, unknown> | undefined;
        return value.schema === 'cstar.forge_operator_intent_projection.v1'
            && value.action === 'implement'
            && value.requester_lineage_mode === 'stored_set_manifest'
            && subject?.kind === 'bead'
            && subject.value === request.bead_id
            && subject.repo_id === request.repo_id;
    } catch {
        return false;
    }
}

export function isExactSetManifestIterationAuthorizationReuse(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    input: AuthorizeForgeRequestInput;
    consumedRequestIds: string[];
}): boolean {
    if (args.input.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || !args.input.operator_authorization_ref.startsWith('cstar-forge-set-manifest:')
        || !storedSetProjectionMatches(args.input.operator_intent_json, args.request)) return false;
    try {
        const verified = verifyForgeSetManifestIterationAuthority({
            db: args.db,
            request: args.request,
            identity: {
                thread_id: args.input.operator_thread_id,
                turn_id: args.input.operator_turn_id,
                turn_record_sha256: args.input.operator_record_sha256,
                turn_record_set_sha256: args.input.operator_record_set_sha256,
            },
            allowReplay: false,
        });
        const predecessorStatus = args.db.prepare(
            'SELECT status FROM hall_forge_requests WHERE request_id = ?',
        ).pluck().get(verified.predecessor_request_id);
        return predecessorStatus !== 'AMBIGUOUS'
            && args.consumedRequestIds.includes(verified.predecessor_request_id);
    } catch {
        return false;
    }
}
