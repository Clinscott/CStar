import { createHash } from 'node:crypto';

import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    healthCheckSpoke,
    pruneSpokes,
    surveySpokes,
    verifySpoke,
    type PruneTarget,
} from '../../../node/core/spokes/spoke_doctor.js';
import {
    errorResponse,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';

export const SPOKE_MUTATION_AUTHORITY_REQUIRED =
    'spoke_mutation_requires_verified_request_scoped_operator_attestation';

function normalizeSpokeMcpSlug(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function requireSlug(slug: string | undefined, action: string): string {
    if (!slug) throw new Error(`${action}_requires_slug`);
    const normalized = normalizeSpokeMcpSlug(slug);
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
        throw new Error('spoke_slug_invalid');
    }
    return normalized;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

/**
 * The Hall row is authority-adjacent data. Return only the operational
 * allowlist: never raw roots, remotes, metadata, tokens, or repo identifiers.
 */
function redactedSpoke(spoke: HallMountedSpokeRecord): Record<string, unknown> {
    return {
        slug: spoke.slug,
        spoke_id: spoke.spoke_id,
        kind: spoke.kind,
        root_sha256: sha256(normalizeHallPath(spoke.root_path)),
        repository_binding_sha256: sha256(spoke.repo_id),
        mount_status: spoke.mount_status,
        trust_level: spoke.trust_level,
        write_policy: spoke.write_policy,
        projection_status: spoke.projection_status,
        default_branch_configured: Boolean(spoke.default_branch),
        remote_configured: Boolean(spoke.remote_url),
        last_scan_at: spoke.last_scan_at ?? null,
        last_health_at: spoke.last_health_at ?? null,
        accept_beads: spoke.mount_status === 'active'
            && spoke.trust_level === 'trusted'
            && spoke.write_policy === 'read_write',
    };
}

export interface SpokeToolArgs {
    action: 'list' | 'link' | 'unlink' | 'inspect' | 'project' | 'doctor' | 'prune' | 'verify' | 'health';
    slug?: string;
    root_path?: string;
    kind?: 'local' | 'git' | 'mirror' | 'archive';
    remote_url?: string;
    branch?: string;
    trust_level?: 'trusted' | 'observe' | 'quarantined';
    write_policy?: 'read_write' | 'read_only';
    accept_beads?: boolean;
    skip_init?: boolean;
    targets?: PruneTarget[];
    dry_run?: boolean;
    cleanup_artifacts?: boolean;
}

/**
 * Read-only spoke inspection plus exact-match prune preview.
 *
 * Link, unlink, projection, and destructive prune previously combined caller
 * strings with filesystem, Git, and Hall effects. No general request-scoped
 * attestation contract exists for those effects, so they fail before reading
 * paths, remotes, metadata, Git, private homes, or writable Hall state.
 */
export async function handleSpoke(args: SpokeToolArgs): Promise<McpTextResponse> {
    try {
        const { action } = args;
        if (action === 'link' || action === 'unlink' || action === 'project') {
            return textResponse({ error: SPOKE_MUTATION_AUTHORITY_REQUIRED }, true);
        }
        if (action === 'prune' && (args.dry_run !== true || args.cleanup_artifacts === true)) {
            return textResponse({ error: SPOKE_MUTATION_AUTHORITY_REQUIRED }, true);
        }

        const root = registry.getRoot();
        if (action === 'list') {
            const spokes = database.listHallMountedSpokes(root).map(redactedSpoke);
            return textResponse({ status: 'ok', count: spokes.length, spokes });
        }
        if (action === 'inspect') {
            const slug = requireSlug(args.slug, 'inspect');
            const spoke = database.getHallMountedSpoke(slug, root);
            if (!spoke) return textResponse({ error: 'spoke_not_registered' }, true);
            return textResponse({ status: 'ok', spoke: redactedSpoke(spoke) });
        }
        if (action === 'doctor') {
            const repo = database.getHallRepository(root);
            const hubRepoId = repo?.repo_id ?? buildHallRepositoryId(normalizeHallPath(root));
            return textResponse({ status: 'ok', report: surveySpokes(hubRepoId) });
        }
        if (action === 'health' || action === 'verify') {
            const slug = requireSlug(args.slug, action);
            const report = action === 'health'
                ? healthCheckSpoke(slug)
                : verifySpoke(slug);
            return textResponse({ status: 'ok', report });
        }
        if (action === 'prune') {
            if (!Array.isArray(args.targets) || args.targets.length === 0) {
                return textResponse({ error: 'prune_requires_nonempty_targets' }, true);
            }
            if (args.targets.some((target) => (
                typeof target?.slug !== 'string' || typeof target?.root_path !== 'string'
            ))) {
                return textResponse({ error: 'prune_target_invalid' }, true);
            }
            const result = pruneSpokes(args.targets, { dry_run: true, cleanup_artifacts: false });
            return textResponse({ status: 'ok', result });
        }
        return textResponse({ error: 'spoke_action_invalid' }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
