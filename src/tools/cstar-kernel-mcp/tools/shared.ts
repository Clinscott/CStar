import { createHash } from 'node:crypto';
import path from 'node:path';
import type {
    HallBeadRecord,
    HallBeadStatus,
    HallBeadTargetKind,
    HallMountedSpokeRecord,
} from '../../../types/hall.js';
import type { SovereignBead } from '../../../types/bead.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { verifyMountToken } from '../../../node/core/spokes/spoke_authority.js';
import { resolveExistingPathInside } from '../contracts/runtime.js';

export const HALL_BEAD_STATUSES: HallBeadStatus[] = [
    'OPEN',
    'SET-PENDING',
    'SET',
    'IN_PROGRESS',
    'READY_FOR_REVIEW',
    'NEEDS_TRIAGE',
    'BLOCKED',
    'RESOLVED',
    'ARCHIVED',
    'SUPERSEDED',
];

export const HALL_BEAD_TARGET_KINDS: HallBeadTargetKind[] = [
    'FILE',
    'SECTOR',
    'REPOSITORY',
    'CONTRACT',
    'SPOKE',
    'WORKFLOW',
    'VALIDATION',
    'OTHER',
];

export interface SpokeAnchor {
    repoId: string;
    spoke: HallMountedSpokeRecord | null;
    metadata: Record<string, unknown> | null;
}

export function compactBead(bead: SovereignBead | null): Record<string, unknown> | null {
    if (!bead) {
        return null;
    }
    const resolvedValidationId = resolvedValidationIdForBead(bead);
    return {
        bead_id: bead.id,
        status: bead.status,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale.substring(0, 240),
        acceptance_criteria: bead.acceptance_criteria?.substring(0, 300),
        checker_shell: bead.checker_shell,
        assigned_agent: bead.assigned_agent,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: resolvedValidationId,
        contract_refs: bead.contract_refs.slice(0, 5),
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    };
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function metadataResolvedValidationId(metadata: SovereignBead['metadata'] | undefined): string | undefined {
    const direct = nonEmptyString(metadata?.resolved_validation_id);
    if (direct) return direct;
    const resolution = metadata?.resolution;
    if (resolution && typeof resolution === 'object' && !Array.isArray(resolution)) {
        return nonEmptyString((resolution as Record<string, unknown>).validation_id);
    }
    return undefined;
}

export function resolvedValidationIdForBead(bead: SovereignBead | null | undefined): string | undefined {
    if (!bead) return undefined;
    return nonEmptyString(bead.resolved_validation_id) ?? metadataResolvedValidationId(bead.metadata);
}

export function requestedResolvedValidationId(
    args: { resolved_validation_id?: string; validation_id?: string; mandate_evidence?: { audit?: { validation_id?: string } } },
    bead: SovereignBead,
): string | undefined {
    return nonEmptyString(args.resolved_validation_id)
        ?? nonEmptyString(args.validation_id)
        ?? nonEmptyString(args.mandate_evidence?.audit?.validation_id)
        ?? resolvedValidationIdForBead(bead);
}

export function withResolvedValidationMetadata(
    metadata: Record<string, unknown>,
    resolvedValidationId: string | undefined,
): Record<string, unknown> {
    if (!resolvedValidationId) {
        return metadata;
    }
    const existingResolution = metadata.resolution;
    const resolution = existingResolution && typeof existingResolution === 'object' && !Array.isArray(existingResolution)
        ? { ...(existingResolution as Record<string, unknown>), validation_id: resolvedValidationId }
        : { validation_id: resolvedValidationId };
    return {
        ...metadata,
        resolved_validation_id: resolvedValidationId,
        resolution,
    };
}

export function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} is required.`);
    }
    return value.trim();
}

export function generateBeadId(rationale: string): string {
    const slug = rationale
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'mcp-bead';
    return `bead:mcp:${slug}-${Date.now().toString(36)}`;
}

export function resolveActiveRepo(): { root: string; repoId: string } {
    const root = registry.getRoot();
    const repo = database.getHallRepository(root);
    return {
        root,
        repoId: repo?.repo_id || buildHallRepositoryId(normalizeHallPath(root)),
    };
}

export function resolveSpokeAnchor(spokeSlug: string | undefined | null): SpokeAnchor {
    if (!spokeSlug || spokeSlug.trim().length === 0) {
        const { repoId } = resolveActiveRepo();
        return { repoId, spoke: null, metadata: null };
    }
    const slug = spokeSlug.trim();
    const spoke = database.getHallMountedSpoke(slug);
    if (!spoke) {
        throw new Error(
            `Spoke '${slug}' is not registered in the Hall estate. ` +
            `Mount it with './cstar spoke link <slug> <root>' before submitting beads.`,
        );
    }
    if (spoke.mount_status !== 'active') {
        throw new Error(
            `Spoke '${slug}' is not active (mount_status='${spoke.mount_status}'). ` +
            `Re-link or repair the spoke before submitting beads.`,
        );
    }
    if (spoke.trust_level === 'quarantined') {
        throw new Error(
            `Spoke '${slug}' is quarantined (trust_level='quarantined'). ` +
            `Bead writes are refused until trust is restored.`,
        );
    }
    if (spoke.write_policy !== 'read_write') {
        throw new Error(
            `Spoke '${slug}' has write_policy='${spoke.write_policy}'. ` +
            `Bead writes require 'read_write'.`,
        );
    }
    const hallToken = (spoke.metadata?.authority as Record<string, unknown> | undefined)?.mount_token;
    const tokenVerdict = verifyMountToken(spoke.root_path, typeof hallToken === 'string' ? hallToken : null);
    if (tokenVerdict.verdict !== 'ok') {
        throw new Error(
            `spoke_mount_token_verification_failed:${tokenVerdict.verdict}`,
        );
    }
    return {
        repoId: spoke.repo_id,
        spoke,
        metadata: {
            spoke_slug: spoke.slug,
            spoke_id: spoke.spoke_id,
            spoke_trust_level: spoke.trust_level,
            spoke_write_policy: spoke.write_policy,
            spoke_root_sha256: createHash('sha256').update(path.resolve(spoke.root_path), 'utf-8').digest('hex'),
            spoke_kind: spoke.kind,
        },
    };
}

export function resolveSpokeRelativePath(
    spoke: HallMountedSpokeRecord,
    relativeOrAbsolute: string,
    fieldName: string,
): string {
    try {
        const candidate = path.isAbsolute(relativeOrAbsolute)
            ? relativeOrAbsolute
            : path.join(spoke.root_path, relativeOrAbsolute);
        return resolveExistingPathInside(spoke.root_path, candidate, 'file');
    } catch {
        throw new Error(`spoke_relative_path_invalid:${fieldName}`);
    }
}

export function beadToRecord(bead: SovereignBead): HallBeadRecord {
    return {
        bead_id: bead.id,
        repo_id: bead.repo_id,
        scan_id: bead.scan_id || undefined,
        target_kind: bead.target_kind,
        target_ref: bead.target_ref,
        target_path: bead.target_path,
        rationale: bead.rationale,
        contract_refs: bead.contract_refs,
        baseline_scores: bead.baseline_scores,
        acceptance_criteria: bead.acceptance_criteria,
        checker_shell: bead.checker_shell,
        status: bead.status,
        assigned_agent: bead.assigned_agent,
        source_kind: bead.source_kind,
        triage_reason: bead.triage_reason,
        resolution_note: bead.resolution_note,
        resolved_validation_id: bead.resolved_validation_id,
        superseded_by: bead.superseded_by,
        architect_opinion: bead.architect_opinion,
        critique_payload: bead.critique_payload,
        metadata: bead.metadata,
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    };
}

export function upsertBeadFromExisting(bead: SovereignBead, updates: Partial<HallBeadRecord>): SovereignBead | null {
    const now = Date.now();
    database.upsertHallBead({
        ...beadToRecord(bead),
        ...updates,
        bead_id: bead.id,
        repo_id: bead.repo_id,
        created_at: bead.created_at,
        updated_at: now,
    });
    return database.getHallBead(bead.id);
}
