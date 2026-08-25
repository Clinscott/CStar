import { createHash } from 'node:crypto';
import path from 'node:path';

import { database } from '../../../tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import {
    verifyMountedSpokeAuthority,
    type SpokeAuthorityVerification,
} from './spoke_attachment_authority.js';
import type { MountTokenVerdict } from './spoke_authority.js';

export type SpokeBucket = 'live' | 'phantom' | 'duplicate' | 'stale';

export interface SpokeSurveyAttachmentAuthorityProjection {
    observation: 'unobserved';
    verification: 'not_checked';
}

export interface SpokeSurveyEntry {
    slug: string;
    spoke_id: string;
    repository_binding_sha256: string;
    root_sha256: string;
    mount_status: string;
    trust_level: string;
    write_policy: string;
    projection_status: string;
    attachment_authority: SpokeSurveyAttachmentAuthorityProjection;
    bucket: SpokeBucket;
    reason: string;
    filesystem_observation: 'not_performed';
    is_hub: boolean;
}

export interface SpokeSurveyReport {
    surveyed_at: number;
    hub_repo_id_sha256: string;
    counts: Record<SpokeBucket, number>;
    by_repo_id: Record<string, number>;
    spokes: SpokeSurveyEntry[];
}

export interface PruneTarget { slug: string; root_path: string }
export interface PruneOptions { dry_run?: boolean; cleanup_artifacts?: boolean }
export interface PruneOutcome { slug: string; root_sha256: string; exact_row_match: boolean; error?: string }
export interface PruneResult {
    dry_run: true;
    cleanup_artifacts: false;
    outcomes: PruneOutcome[];
    counts: { targets: number; exact_matches: number; errors: number };
}

function fingerprint(rootPath: string): string {
    return createHash('sha256').update(path.resolve(rootPath), 'utf-8').digest('hex');
}

export function surveySpokesForRecords(
    rows: readonly HallMountedSpokeRecord[],
    hubRepoId: string,
    now = new Date(),
): SpokeSurveyReport {
    const slugCounts = new Map<string, number>();
    for (const row of rows) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
    const byRepoId: Record<string, number> = {};
    const spokes = rows.map((row): SpokeSurveyEntry => {
        const isHub = row.repo_id === hubRepoId;
        let bucket: SpokeBucket = 'stale';
        let reason = 'projection_not_current';
        if (row.mount_status !== 'active') { bucket = 'stale'; reason = 'mount_not_active'; }
        else if ((slugCounts.get(row.slug) ?? 0) > 1 && !isHub) { bucket = 'duplicate'; reason = 'duplicate_slug_foreign_repo'; }
        else if (!isHub) { bucket = 'stale'; reason = 'foreign_repo_id'; }
        else if (row.projection_status === 'current') { bucket = 'live'; reason = 'current_projection'; }
        const repositoryBinding = createHash('sha256').update(row.repo_id, 'utf-8').digest('hex');
        byRepoId[repositoryBinding] = (byRepoId[repositoryBinding] ?? 0) + 1;
        return {
            slug: row.slug,
            spoke_id: row.spoke_id,
            repository_binding_sha256: repositoryBinding,
            root_sha256: fingerprint(row.root_path),
            mount_status: row.mount_status,
            trust_level: row.trust_level,
            write_policy: row.write_policy,
            projection_status: row.projection_status,
            attachment_authority: {
                observation: 'unobserved',
                verification: 'not_checked',
            },
            bucket,
            reason,
            filesystem_observation: 'not_performed',
            is_hub: isHub,
        };
    }).sort((left, right) => left.bucket.localeCompare(right.bucket) || left.slug.localeCompare(right.slug));
    const counts: Record<SpokeBucket, number> = { live: 0, phantom: 0, duplicate: 0, stale: 0 };
    for (const entry of spokes) counts[entry.bucket] += 1;
    return {
        surveyed_at: now.getTime(),
        hub_repo_id_sha256: createHash('sha256').update(hubRepoId, 'utf-8').digest('hex'),
        counts,
        by_repo_id: byRepoId,
        spokes,
    };
}

export function surveySpokes(hubRepoId: string): SpokeSurveyReport {
    return surveySpokesForRecords(database.listAllHallMountedSpokes(), hubRepoId);
}

export interface SpokeHealthReport {
    slug: string;
    root_sha256: string;
    verdict: 'healthy' | 'degraded' | 'unhealthy';
    authority_verification: SpokeAuthorityVerification;
    authority_failure_code?: string;
    mount_token: MountTokenVerdict;
    heartbeat_written: false;
}

export function healthCheckSpoke(slug: string): SpokeHealthReport {
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) throw new Error('spoke_not_registered');
    const token = verifyMountedSpokeAuthority(spoke);
    const verified = token.authority_verification === 'token_verified'
        || token.authority_verification === 'hall_attachment_verified';
    return {
        slug,
        root_sha256: token.root_sha256,
        verdict: verified
            ? 'healthy'
            : token.failure_code === 'spoke_attachment_root_moved_or_drift' ? 'unhealthy' : 'degraded',
        authority_verification: token.authority_verification,
        ...(token.failure_code ? { authority_failure_code: token.failure_code } : {}),
        mount_token: token.mount_token,
        heartbeat_written: false,
    };
}

export interface SpokeVerifyReport {
    slug: string;
    root_sha256: string;
    drift_detected: boolean;
    authority_verification: SpokeAuthorityVerification;
    authority_failure_code?: string;
    mount_token: MountTokenVerdict;
    identity_present: boolean;
}

export function verifySpoke(slug: string): SpokeVerifyReport {
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) throw new Error('spoke_not_registered');
    const token = verifyMountedSpokeAuthority(spoke);
    return {
        slug,
        root_sha256: token.root_sha256,
        drift_detected: token.authority_verification !== 'token_verified'
            && token.authority_verification !== 'hall_attachment_verified',
        authority_verification: token.authority_verification,
        ...(token.failure_code ? { authority_failure_code: token.failure_code } : {}),
        mount_token: token.mount_token,
        identity_present: token.identity_present,
    };
}

/** Dry-run exact-row comparison only. Mutation and artifact cleanup are retired. */
export function pruneSpokes(targets: readonly PruneTarget[], options: PruneOptions = {}): PruneResult {
    if (options.dry_run !== true || options.cleanup_artifacts === true) {
        throw new Error('spoke_prune_mutation_requires_verified_operator_attestation');
    }
    const rows = database.listAllHallMountedSpokes();
    const outcomes = targets.map((target): PruneOutcome => {
        const valid = Boolean(target.slug.trim()) && path.isAbsolute(target.root_path);
        const exact = valid && rows.some((row) => row.slug === target.slug && row.root_path === target.root_path);
        return {
            slug: target.slug.trim(),
            root_sha256: fingerprint(target.root_path),
            exact_row_match: exact,
            ...(!valid ? { error: 'prune_target_invalid' } : {}),
        };
    });
    return {
        dry_run: true,
        cleanup_artifacts: false,
        outcomes,
        counts: {
            targets: outcomes.length,
            exact_matches: outcomes.filter((outcome) => outcome.exact_row_match).length,
            errors: outcomes.filter((outcome) => outcome.error).length,
        },
    };
}
