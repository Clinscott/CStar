import type {
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
import {
    forgeRequestImmutableContentMatches,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from './forge_authorization_policy.js';

/** Permit a later exact operator turn to authorize one still-unspent request. */
export function isPendingRootForgeAuthorizationReplay(
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
): boolean {
    return existing.status === 'PENDING_AUTH'
        && existing.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        && existing.authorization_binding_sha256 === undefined
        && existing.authorization_challenge_sha256 === undefined
        && forgeRequestImmutableContentMatches(existing, input);
}
