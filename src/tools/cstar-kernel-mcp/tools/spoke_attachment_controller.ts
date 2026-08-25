import type { McpRequestContext } from '../contracts/request_context.js';
import {
    assertExactSpokeAttachmentSlug,
    proveSpokeAttachmentRoot,
} from '../../pennyone/intel/spoke_attachment_root_proof.js';
import {
    linkSpokeAttachment,
    projectSpokeAttachment,
    unlinkSpokeAttachment,
} from '../../pennyone/intel/spoke_attachment_store.js';
import { resolveDurableMissionAttachmentAuthority } from '../../pennyone/intel/spoke_attachment_mission_grant_controller.js';
import { resolveCurrentRootTurnAttachmentAuthority } from './spoke_attachment_authority.js';
import type {
    SpokeAttachmentAuthoritySource,
    SpokeAttachmentRequest,
    SpokeAttachmentSafeResult,
} from './spoke_schemas.js';

function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function parseAuthoritySource(value: unknown): SpokeAttachmentAuthoritySource {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('spoke_attachment_authority_source_invalid');
    }
    const source = value as Record<string, unknown>;
    if (source.kind === 'current_root_turn'
        && Object.keys(source).length === 1) {
        return { kind: 'current_root_turn' };
    }
    if (source.kind === 'cstar_mission_set_grant'
        && Object.keys(source).length === 3
        && typeof source.mission_id === 'string' && source.mission_id.trim()
        && typeof source.grant_id === 'string' && source.grant_id.trim()) {
        return {
            kind: 'cstar_mission_set_grant',
            mission_id: source.mission_id.trim(),
            grant_id: source.grant_id.trim(),
        };
    }
    throw new Error('spoke_attachment_authority_source_invalid');
}

function assertToolArgs(args: SpokeAttachmentRequest['args']): void {
    if (!args || typeof args !== 'object') throw new Error('spoke_attachment_args_invalid');
    const allowed = new Set(['action', 'slug', 'root_path', 'authority_source']);
    if (Object.keys(args).some((key) => !allowed.has(key))) throw new Error('spoke_attachment_args_invalid');
    if (!['link', 'project', 'unlink'].includes(args.action)) throw new Error('spoke_attachment_action_invalid');
    if (typeof args.slug !== 'string' || args.slug.length === 0) throw new Error('spoke_attachment_slug_required');
    if (typeof args.root_path !== 'string' || args.root_path.length === 0) throw new Error('spoke_attachment_root_path_required');
}

function result(
    action: SpokeAttachmentSafeResult['action'],
    slug: string,
    status: SpokeAttachmentSafeResult['status'],
    authorityVerification?: SpokeAttachmentSafeResult['authority_verification'],
): SpokeAttachmentSafeResult {
    return {
        status,
        action,
        slug,
        ...(authorityVerification ? { authority_verification: authorityVerification } : {}),
    };
}

export async function executeSpokeAttachment(
    request: SpokeAttachmentRequest,
): Promise<SpokeAttachmentSafeResult> {
    assertToolArgs(request.args);
    const { args } = request;
    const sourcePresent = hasOwn(args, 'authority_source');
    if ((args.action === 'project' || args.action === 'unlink') && sourcePresent) {
        throw new Error('spoke_attachment_authority_source_forbidden');
    }
    const proof = proveSpokeAttachmentRoot(args.root_path);
    assertExactSpokeAttachmentSlug(args.slug, proof);
    const now = request.now ?? Date.now();

    if (args.action === 'project') {
        const current = await resolveCurrentRootTurnAttachmentAuthority({
            target: { action: 'project', slug: args.slug, root_path: proof.canonical_root_path },
            request_context: request.request_context,
            now,
        });
        projectSpokeAttachment({
            proof,
            slug: args.slug,
            authority: current.authority,
            now,
        });
        return result('project', args.slug, 'projected', 'current_root_turn_verified');
    }

    if (args.action === 'unlink') {
        const current = await resolveCurrentRootTurnAttachmentAuthority({
            target: { action: 'unlink', slug: args.slug, root_path: proof.canonical_root_path },
            request_context: request.request_context,
            now,
        });
        unlinkSpokeAttachment({ proof, slug: args.slug, authority: current.authority, now });
        return result('unlink', args.slug, 'unlinked', 'current_root_turn_verified');
    }

    const source = sourcePresent
        ? parseAuthoritySource(args.authority_source)
        : { kind: 'current_root_turn' as const };
    const authority = source.kind === 'current_root_turn'
        ? (await resolveCurrentRootTurnAttachmentAuthority({
            target: { action: 'link', slug: args.slug, root_path: proof.canonical_root_path },
            request_context: request.request_context,
            now,
        })).authority
        : resolveDurableMissionAttachmentAuthority({
            mission_id: source.mission_id,
            grant_id: source.grant_id,
            slug: args.slug,
            proof,
            request_context: request.request_context,
            now,
        });
    linkSpokeAttachment({ proof, slug: args.slug, authority, now });
    return result(
        'link',
        args.slug,
        'linked',
        source.kind === 'current_root_turn'
            ? 'current_root_turn_verified'
            : 'mission_set_grant_verified',
    );
}
