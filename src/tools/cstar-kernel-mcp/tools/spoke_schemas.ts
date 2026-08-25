import type { McpRequestContext } from '../contracts/request_context.js';

export type SpokeAttachmentAction = 'link' | 'project' | 'unlink';

export interface CurrentRootTurnAuthoritySource {
    kind: 'current_root_turn';
}

export interface MissionSetGrantAuthoritySource {
    kind: 'cstar_mission_set_grant';
    mission_id: string;
    grant_id: string;
}

export type SpokeAttachmentAuthoritySource =
    | CurrentRootTurnAuthoritySource
    | MissionSetGrantAuthoritySource;

export interface SpokeAttachmentToolArgs {
    action: SpokeAttachmentAction;
    slug: string;
    root_path: string;
    authority_source?: SpokeAttachmentAuthoritySource;
}

export interface SpokeAttachmentRequest {
    args: SpokeAttachmentToolArgs;
    request_context?: McpRequestContext;
    now?: number;
}

export interface SpokeAttachmentSafeResult {
    status: 'linked' | 'projected' | 'unlinked';
    action: SpokeAttachmentAction;
    slug: string;
    authority_verification?: 'current_root_turn_verified' | 'mission_set_grant_verified';
}
