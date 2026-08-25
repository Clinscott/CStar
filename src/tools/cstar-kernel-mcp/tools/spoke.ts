import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import {
    projectSpoke,
    SPOKE_PROJECTION_VERSION,
    type ProjectSpokeResult,
} from '../../../node/core/spokes/spoke_projector.js';
import {
    establishAuthority,
    SPOKE_CONTRACT_VERSION,
    type EstablishAuthorityResult,
} from '../../../node/core/spokes/spoke_authority.js';
import {
    surveySpokes,
    pruneSpokes,
    verifySpoke,
    healthCheckSpoke,
    evaluateSpokeFreshness,
    type PruneTarget,
} from '../../../node/core/spokes/spoke_doctor.js';
import { HUB_KERNEL_VERSION } from '../contracts/runtime.js';
import {
    errorResponse,
    mcpMutation,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';

function normalizeSpokeMcpSlug(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function readGitOutput(rootPath: string, args: string[]): string | undefined {
    try {
        return execFileSync('git', ['-C', rootPath, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || undefined;
    } catch {
        return undefined;
    }
}

function detectSpokeDefaultBranch(rootPath: string): string | undefined {
    const remoteHead = readGitOutput(rootPath, ['remote', 'show', 'origin']);
    const match = remoteHead?.match(/HEAD branch:\s*(\S+)/);
    if (match?.[1]) {
        return match[1];
    }
    const symbolicRef = readGitOutput(rootPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    if (symbolicRef?.startsWith('origin/')) {
        return symbolicRef.slice('origin/'.length);
    }
    return readGitOutput(rootPath, ['branch', '--show-current']);
}

function enrichSpokeForMcp(spoke: HallMountedSpokeRecord): HallMountedSpokeRecord & {
    hub_repo_id: string;
    spoke_repo_id: string;
    repo_id_semantics: string;
} {
    return {
        ...spoke,
        ...evaluateSpokeFreshness(spoke),
        hub_repo_id: spoke.repo_id,
        spoke_repo_id: buildHallRepositoryId(normalizeHallPath(spoke.root_path)),
        repo_id_semantics: 'hub-scoped mounted-spoke owner; use spoke_repo_id for the spoke root repository identity',
    };
}

export async function handleSpoke({
    action,
    slug,
    root_path,
    kind,
    remote_url,
    branch,
    trust_level,
    write_policy,
    accept_beads,
    skip_init,
    targets,
    dry_run,
    cleanup_artifacts,
}: {
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
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        if (action === 'list') {
            const mounted = database.listHallMountedSpokes(root);
            return textResponse({
                status: 'ok',
                count: mounted.length,
                spokes: mounted.map((s) => ({
                    slug: s.slug,
                    spoke_id: s.spoke_id,
                    kind: s.kind,
                    root_path: s.root_path,
                    mount_status: s.mount_status,
                    trust_level: s.trust_level,
                    write_policy: s.write_policy,
                    projection_status: s.projection_status,
                    ...evaluateSpokeFreshness(s),
                    default_branch: s.default_branch ?? null,
                    remote_url: s.remote_url ?? null,
                    hub_repo_id: s.repo_id,
                    spoke_repo_id: buildHallRepositoryId(normalizeHallPath(s.root_path)),
                    repo_id_semantics: 'hub-scoped mounted-spoke owner; use spoke_repo_id for the spoke root repository identity',
                    last_scan_at: s.last_scan_at ?? null,
                    last_health_at: s.last_health_at ?? null,
                    last_health_attempt_at: s.last_health_attempt_at ?? null,
                    accept_beads:
                        typeof s.metadata?.accept_beads === 'boolean'
                            ? s.metadata.accept_beads
                            : s.write_policy === 'read_write',
                })),
            });
        }
        if (action === 'inspect') {
            if (!slug) return textResponse({ error: 'inspect requires slug' }, true);
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            const found = database.getHallMountedSpoke(normalized, root);
            if (!found) return textResponse({ error: `spoke not registered: ${normalized}` }, true);
            return textResponse({ status: 'ok', spoke: enrichSpokeForMcp(found) });
        }
        if (action === 'unlink') {
            if (!slug) return textResponse({ error: 'unlink requires slug' }, true);
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            const removed = database.removeHallMountedSpoke(normalized, root);
            if (!removed) return textResponse({ error: `spoke not registered: ${normalized}` }, true);
            return textResponse({
                status: 'unlinked',
                slug: normalized,
                mutation: mcpMutation('spoke_unlink', normalized, 'Mounted spoke row was removed through the MCP write surface.'),
            });
        }
        if (action === 'link') {
            if (!slug) return textResponse({ error: 'link requires slug' }, true);
            if (!root_path) return textResponse({ error: 'link requires root_path' }, true);
            const absolutePath = path.resolve(root_path);
            if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
                return textResponse({ error: `root_path does not exist or is not a directory: ${absolutePath}` }, true);
            }
            const repo = database.getHallRepository(root);
            if (!repo) return textResponse({ error: 'failed to resolve Hall repository before linking' }, true);
            const normalizedSlug = normalizeSpokeMcpSlug(slug);
            if (normalizedSlug.length === 0 || normalizedSlug.length > 64) {
                return textResponse({ error: `slug must normalize to 1..64 chars (got "${normalizedSlug}")` }, true);
            }
            const acceptBeads = accept_beads === true;
            const resolvedTrust = (acceptBeads ? 'trusted' : trust_level ?? 'trusted') as 'trusted' | 'observe' | 'quarantined';
            const resolvedWritePolicy = (acceptBeads ? 'read_write' : write_policy ?? 'read_only') as 'read_write' | 'read_only';
            const now = Date.now();
            const existing = database.getHallMountedSpoke(normalizedSlug, root);

            let projectionResult: ProjectSpokeResult | null = null;
            let projectionError: string | undefined;
            if (skip_init !== true) {
                try {
                    projectionResult = projectSpoke({ slug: normalizedSlug, rootPath: absolutePath });
                } catch (err) {
                    projectionError = err instanceof Error ? err.message : String(err);
                }
            }

            const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
            const existingAuthority = (existingMetadata.authority ?? {}) as Record<string, unknown>;
            const existingHallToken = typeof existingAuthority.mount_token === 'string' ? existingAuthority.mount_token : undefined;

            let authorityResult: EstablishAuthorityResult | null = null;
            let authorityError: string | undefined;
            if (skip_init !== true) {
                try {
                    authorityResult = establishAuthority({
                        slug: normalizedSlug,
                        rootPath: absolutePath,
                        hubRepoId: repo.repo_id,
                        hubRoot: root,
                        hubKernelVersion: HUB_KERNEL_VERSION,
                        trustLevel: resolvedTrust,
                        writePolicy: resolvedWritePolicy,
                        projection: projectionResult?.projection,
                        existingHallToken,
                    });
                } catch (err) {
                    authorityError = err instanceof Error ? err.message : String(err);
                }
            }

            database.saveHallMountedSpoke({
                spoke_id: `spoke:${normalizedSlug}`,
                repo_id: repo.repo_id,
                slug: normalizedSlug,
                kind: kind ?? existing?.kind ?? 'local',
                root_path: absolutePath.replace(/\\/g, '/'),
                remote_url: remote_url ?? existing?.remote_url,
                default_branch: branch ?? detectSpokeDefaultBranch(absolutePath) ?? existing?.default_branch,
                mount_status: 'active',
                trust_level: resolvedTrust,
                write_policy: resolvedWritePolicy,
                projection_status: projectionResult !== null ? 'current' : (existing?.projection_status ?? 'missing'),
                last_scan_at: projectionResult !== null ? projectionResult.projection.projected_at : existing?.last_scan_at,
                last_health_at: existing?.last_health_at,
                last_health_attempt_at: existing?.last_health_attempt_at,
                created_at: existing?.created_at ?? now,
                updated_at: now,
                metadata: {
                    ...existingMetadata,
                    source: 'cstar_spoke_mcp',
                    accept_beads: acceptBeads,
                    ...(projectionResult !== null
                        ? { projection: projectionResult.metadataPatch, projection_error: undefined }
                        : projectionError !== undefined ? { projection_error: projectionError } : {}),
                    ...(authorityResult !== null
                        ? { authority: authorityResult.metadataPatch, authority_error: undefined }
                        : authorityError !== undefined ? { authority_error: authorityError } : {}),
                },
            });
            return textResponse({
                status: existing ? 'relinked' : 'linked',
                slug: normalizedSlug,
                mutation: mcpMutation(existing ? 'spoke_relink' : 'spoke_link', normalizedSlug, 'Mounted spoke row was persisted through the MCP write surface.'),
                root_path: absolutePath.replace(/\\/g, '/'),
                trust_level: resolvedTrust,
                write_policy: resolvedWritePolicy,
                created_at: existing?.created_at ?? now,
                projection: projectionResult !== null ? {
                    status: 'current',
                    primary_stack: projectionResult.projection.primary_stack,
                    counts: projectionResult.projection.counts,
                    profile_md_path: projectionResult.projection.profile_md_path,
                    profile_json_path: projectionResult.projection.profile_json_path,
                    version: SPOKE_PROJECTION_VERSION,
                } : { status: skip_init === true ? 'skipped' : 'failed', error: projectionError ?? null },
                authority: authorityResult !== null ? {
                    status: authorityResult.rotated ? 'minted' : 'preserved',
                    contract_version: SPOKE_CONTRACT_VERSION,
                    mount_token: authorityResult.identity.mount_token,
                    files: authorityResult.files,
                } : { status: skip_init === true ? 'skipped' : 'failed', error: authorityError ?? null },
            });
        }
        if (action === 'project') {
            if (!slug) return textResponse({ error: 'project requires slug' }, true);
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            const found = database.getHallMountedSpoke(normalized, root);
            if (!found) return textResponse({ error: `spoke not registered: ${normalized}` }, true);
            if (!fs.existsSync(found.root_path) || !fs.statSync(found.root_path).isDirectory()) {
                return textResponse({ error: `spoke root_path missing on disk: ${found.root_path}` }, true);
            }
            let projection: ProjectSpokeResult;
            try {
                projection = projectSpoke({ slug: normalized, rootPath: found.root_path });
            } catch (err) {
                return textResponse({ error: err instanceof Error ? err.message : String(err) }, true);
            }

            const existingMetadata = (found.metadata ?? {}) as Record<string, unknown>;
            const existingAuthority = (existingMetadata.authority ?? {}) as Record<string, unknown>;
            const existingHallToken = typeof existingAuthority.mount_token === 'string' ? existingAuthority.mount_token : undefined;
            let authorityResult: EstablishAuthorityResult | null = null;
            let authorityError: string | undefined;
            try {
                authorityResult = establishAuthority({
                    slug: normalized,
                    rootPath: found.root_path,
                    hubRepoId: found.repo_id,
                    hubRoot: root,
                    hubKernelVersion: HUB_KERNEL_VERSION,
                    trustLevel: found.trust_level,
                    writePolicy: found.write_policy,
                    projection: projection.projection,
                    existingHallToken,
                });
            } catch (err) {
                authorityError = err instanceof Error ? err.message : String(err);
            }

            const now = Date.now();
            const refreshedDefaultBranch = detectSpokeDefaultBranch(found.root_path) ?? found.default_branch;
            database.saveHallMountedSpoke({
                ...found,
                default_branch: refreshedDefaultBranch,
                projection_status: 'current',
                last_scan_at: projection.projection.projected_at,
                last_health_at: found.last_health_at,
                last_health_attempt_at: found.last_health_attempt_at,
                updated_at: now,
                metadata: {
                    ...existingMetadata,
                    projection: projection.metadataPatch,
                    projection_error: undefined,
                    ...(authorityResult !== null
                        ? { authority: authorityResult.metadataPatch, authority_error: undefined }
                        : authorityError !== undefined ? { authority_error: authorityError } : {}),
                },
            });
            return textResponse({
                status: 'projected',
                slug: normalized,
                mutation: mcpMutation('spoke_project', normalized, 'Mounted spoke projection metadata was persisted through the MCP write surface.'),
                root_path: found.root_path,
                projection: {
                    primary_stack: projection.projection.primary_stack,
                    counts: projection.projection.counts,
                    profile_md_path: projection.projection.profile_md_path,
                    profile_json_path: projection.projection.profile_json_path,
                    version: SPOKE_PROJECTION_VERSION,
                },
                authority: authorityResult !== null ? {
                    status: authorityResult.rotated ? 'minted' : 'preserved',
                    contract_version: SPOKE_CONTRACT_VERSION,
                    mount_token: authorityResult.identity.mount_token,
                    files: authorityResult.files,
                } : { status: 'failed', error: authorityError ?? null },
            });
        }
        if (action === 'doctor') {
            const repo = database.getHallRepository(root);
            const hubRepoId = repo?.repo_id ?? buildHallRepositoryId(normalizeHallPath(root));
            const report = surveySpokes(hubRepoId);
            return textResponse({ status: 'ok', report });
        }
        if (action === 'health') {
            if (!slug) return textResponse({ error: 'health requires slug' }, true);
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            try {
                const report = healthCheckSpoke(normalized);
                return textResponse({ status: 'ok', report });
            } catch (err) {
                return textResponse({ error: err instanceof Error ? err.message : String(err) }, true);
            }
        }
        if (action === 'verify') {
            if (!slug) return textResponse({ error: 'verify requires slug' }, true);
            const normalized = normalizeSpokeMcpSlug(slug);
            if (normalized.length === 0 || normalized.length > 64) return textResponse({ error: `slug must normalize to 1..64 chars` }, true);
            try {
                const report = verifySpoke(normalized);
                return textResponse({ status: 'ok', report });
            } catch (err) {
                return textResponse({ error: err instanceof Error ? err.message : String(err) }, true);
            }
        }
        if (action === 'prune') {
            if (!Array.isArray(targets) || targets.length === 0) {
                return textResponse({ error: 'prune requires targets: [{slug, root_path}, ...]' }, true);
            }
            for (const t of targets) {
                if (typeof t?.slug !== 'string' || typeof t?.root_path !== 'string') {
                    return textResponse({ error: 'each target must have string slug and root_path' }, true);
                }
            }
            const result = pruneSpokes(targets, {
                dry_run: dry_run ?? true,
                cleanup_artifacts: cleanup_artifacts === true,
            });
            return textResponse({ status: 'ok', result });
        }
        return textResponse({ error: `invalid spoke action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
