import fs from 'node:fs';
import path from 'node:path';

import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../pathRegistry.js';
import { database } from './database.js';
import { ensureSpokeAttachmentSchema, SPOKE_ATTACHMENT_RECEIPT_SCHEMA } from './spoke_attachment_schema_runtime.js';
import {
    assertExactSpokeAttachmentSlug,
    assertSpokeAttachmentRootProofStable,
    pathsOverlap,
    type SpokeAttachmentRootProof,
} from './spoke_attachment_root_proof.js';
import {
    assertAttachmentPostconditions,
    attachmentMetadataJson,
    hasAuthoritySource,
    insertAttachmentGrant,
    insertAttachmentReceipt,
    isAttachmentReceiptHashValid,
    newAttachmentReceipt,
    selectActiveLinkReceipt,
    selectAllMountedSpokes,
    selectAttachmentReceipt,
    selectMountedSpoke,
    type SpokeAttachmentAuthorityForStore,
    type SpokeAttachmentReceiptRow,
} from './spoke_attachment_store_records.js';

export type { SpokeAttachmentAuthorityForStore, SpokeAttachmentReceiptRow };
export { isAttachmentReceiptHashValid };

export interface SpokeAttachmentMutationResult {
    row?: HallMountedSpokeRecord;
    receipt: SpokeAttachmentReceiptRow;
    grant_id: string;
    authority_kind: SpokeAttachmentAuthorityForStore['kind'];
}

function resolveHubRepoId(): string {
    const root = registry.getRoot();
    return database.getHallRepository(root)?.repo_id || buildHallRepositoryId(normalizeHallPath(root));
}

function assertNoRootCollision(
    db: ReturnType<typeof database.getWritableDb>,
    proof: SpokeAttachmentRootProof,
    slug: string,
): void {
    for (const row of selectAllMountedSpokes(db)) {
        if (row.slug === slug && row.root_path !== proof.canonical_root_path) {
            if (!fs.existsSync(row.root_path)) {
                throw new Error('spoke_attachment_existing_root_moved_or_drift');
            }
            throw new Error('spoke_attachment_slug_collision');
        }
        if (row.root_path === proof.canonical_root_path) {
            throw new Error('spoke_attachment_root_collision');
        }
        if (pathsOverlap(row.root_path, proof.canonical_root_path)) {
            throw new Error('spoke_attachment_root_overlap');
        }
        try {
            const canonical = fs.realpathSync(row.root_path);
            const stat = fs.statSync(row.root_path, { bigint: true });
            if (canonical === proof.canonical_root_path
                || (stat.dev.toString() === proof.root_device
                    && stat.ino.toString() === proof.root_inode)) {
                throw new Error('spoke_attachment_root_alias_collision');
            }
        } catch (error) {
            if (error instanceof Error && error.message === 'spoke_attachment_root_alias_collision') {
                throw error;
            }
        }
    }
}

function activeLinkForRow(
    db: ReturnType<typeof database.getWritableDb>,
    row: HallMountedSpokeRecord,
    proof: SpokeAttachmentRootProof,
    hubRepoId: string,
    slug: string,
    missingCode: string,
    revokedCode: string,
): SpokeAttachmentReceiptRow {
    const metadataKeys = Object.keys(row.metadata ?? {});
    const authority = row.metadata?.attachment_authority;
    if (metadataKeys.length !== 1 || metadataKeys[0] !== 'attachment_authority'
        || !authority || typeof authority !== 'object' || Array.isArray(authority)) {
        throw new Error(missingCode);
    }
    const binding = authority as Record<string, unknown>;
    if (Object.keys(binding).sort().join(',') !== 'receipt_id,receipt_sha256,schema'
        || binding.schema !== SPOKE_ATTACHMENT_RECEIPT_SCHEMA
        || typeof binding.receipt_id !== 'string'
        || typeof binding.receipt_sha256 !== 'string') {
        throw new Error(missingCode);
    }
    const link = selectActiveLinkReceipt(
        db,
        hubRepoId,
        slug,
        proof,
        binding.receipt_id,
    );
    if (!link || link.receipt_sha256 !== binding.receipt_sha256
        || !isAttachmentReceiptHashValid(link)) {
        throw new Error(revokedCode);
    }
    return link;
}

export function getAttachmentReceiptById(receiptId: string): SpokeAttachmentReceiptRow | null {
    try {
        const db = database.tryGetReadDb(registry.getRoot());
        return db ? selectAttachmentReceipt(db, receiptId) : null;
    } catch (error) {
        if (error instanceof Error && /no such table|hall_store_missing/i.test(error.message)) return null;
        throw error;
    }
}

export function getActiveAttachmentReceipt(
    hubRepoId: string,
    slug: string,
    proof: SpokeAttachmentRootProof,
    receiptId: string,
): SpokeAttachmentReceiptRow | null {
    try {
        const db = database.tryGetReadDb(registry.getRoot());
        return db ? selectActiveLinkReceipt(db, hubRepoId, slug, proof, receiptId) : null;
    } catch (error) {
        if (error instanceof Error && /no such table|hall_store_missing/i.test(error.message)) return null;
        throw error;
    }
}

export function hasAttachmentAuthoritySource(sourceAuthorityId: string): boolean {
    try {
        const db = database.tryGetReadDb(registry.getRoot());
        return db ? hasAuthoritySource(db, sourceAuthorityId) : false;
    } catch (error) {
        if (error instanceof Error && /no such table|hall_store_missing/i.test(error.message)) return false;
        throw error;
    }
}

export function linkSpokeAttachment(input: {
    proof: SpokeAttachmentRootProof;
    slug: string;
    authority: SpokeAttachmentAuthorityForStore;
    now?: number;
}): SpokeAttachmentMutationResult {
    assertExactSpokeAttachmentSlug(input.slug, input.proof);
    const now = input.now ?? Date.now();
    const db = database.getWritableDb();
    ensureSpokeAttachmentSchema(db);
    return db.transaction(() => {
        assertSpokeAttachmentRootProofStable(input.proof);
        const hubRepoId = resolveHubRepoId();
        if (hasAuthoritySource(db, input.authority.source_authority_id)) {
            throw new Error('spoke_attachment_authority_replay');
        }
        assertNoRootCollision(db, input.proof, input.slug);
        const grantId = insertAttachmentGrant({
            db, proof: input.proof, slug: input.slug, hub_repo_id: hubRepoId,
            authority: input.authority, action: 'link', now,
        });
        const receipt = newAttachmentReceipt({
            event_kind: 'link_authority', grant_id: grantId, hub_repo_id: hubRepoId,
            slug: input.slug, proof: input.proof, authority: input.authority, created_at: now,
        });
        insertAttachmentReceipt(db, receipt);
        const spokeId = `spoke:${input.slug}`;
        db.prepare(`
            INSERT INTO hall_mounted_spokes (
                spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
                mount_status, trust_level, write_policy, projection_status,
                last_scan_at, last_health_at, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, 'local', ?, NULL, NULL, 'active', 'trusted', 'read_write',
                      'missing', NULL, NULL, ?, ?, ?)
        `).run(
            spokeId, hubRepoId, input.slug, input.proof.canonical_root_path,
            attachmentMetadataJson(receipt), now, now,
        );
        const row = selectMountedSpoke(db, hubRepoId, input.slug, input.proof.canonical_root_path);
        assertAttachmentPostconditions(db, grantId, receipt);
        if (!row || row.kind !== 'local' || row.mount_status !== 'active'
            || row.trust_level !== 'trusted' || row.write_policy !== 'read_write'
            || row.projection_status !== 'missing'
            || JSON.stringify(row.metadata) !== attachmentMetadataJson(receipt)) {
            throw new Error('spoke_attachment_atomic_postcondition_failed');
        }
        assertSpokeAttachmentRootProofStable(input.proof);
        return { row, receipt, grant_id: grantId, authority_kind: input.authority.kind };
    }).immediate();
}

export function projectSpokeAttachment(input: {
    proof: SpokeAttachmentRootProof;
    slug: string;
    authority: SpokeAttachmentAuthorityForStore;
    now?: number;
}): SpokeAttachmentMutationResult {
    assertExactSpokeAttachmentSlug(input.slug, input.proof);
    const now = input.now ?? Date.now();
    const db = database.getWritableDb();
    ensureSpokeAttachmentSchema(db);
    return db.transaction(() => {
        assertSpokeAttachmentRootProofStable(input.proof);
        const hubRepoId = resolveHubRepoId();
        const row = selectMountedSpoke(db, hubRepoId, input.slug, input.proof.canonical_root_path);
        if (!row) throw new Error('spoke_attachment_project_row_missing');
        if (row.mount_status !== 'active') throw new Error('spoke_attachment_project_row_inactive');
        const link = activeLinkForRow(
            db, row, input.proof, hubRepoId, input.slug,
            'spoke_attachment_project_authority_missing',
            'spoke_attachment_project_authority_revoked',
        );
        const grantId = insertAttachmentGrant({
            db, proof: input.proof, slug: input.slug, hub_repo_id: hubRepoId,
            authority: input.authority, action: 'project',
            parent_link_receipt_id: link.receipt_id, now,
        });
        const receipt = newAttachmentReceipt({
            event_kind: 'attachment_projection', grant_id: grantId, hub_repo_id: hubRepoId,
            slug: input.slug, proof: input.proof, authority: input.authority,
            parent_link_receipt_id: link.receipt_id, created_at: now,
        });
        insertAttachmentReceipt(db, receipt);
        const changed = db.prepare(`
            UPDATE hall_mounted_spokes SET projection_status = 'current', updated_at = ?
            WHERE repo_id = ? AND spoke_id = ? AND slug = ? AND root_path = ?
              AND mount_status = 'active'
        `).run(now, hubRepoId, row.spoke_id, input.slug, input.proof.canonical_root_path);
        const updated = selectMountedSpoke(db, hubRepoId, input.slug, input.proof.canonical_root_path);
        assertAttachmentPostconditions(db, grantId, receipt);
        if (Number(changed.changes) !== 1 || !updated || updated.projection_status !== 'current') {
            throw new Error('spoke_attachment_atomic_postcondition_failed');
        }
        assertSpokeAttachmentRootProofStable(input.proof);
        return { row: updated, receipt, grant_id: grantId, authority_kind: input.authority.kind };
    }).immediate();
}

export function unlinkSpokeAttachment(input: {
    proof: SpokeAttachmentRootProof;
    slug: string;
    authority: SpokeAttachmentAuthorityForStore;
    now?: number;
}): SpokeAttachmentMutationResult {
    assertExactSpokeAttachmentSlug(input.slug, input.proof);
    const now = input.now ?? Date.now();
    const db = database.getWritableDb();
    ensureSpokeAttachmentSchema(db);
    return db.transaction(() => {
        assertSpokeAttachmentRootProofStable(input.proof);
        const hubRepoId = resolveHubRepoId();
        const row = selectMountedSpoke(db, hubRepoId, input.slug, input.proof.canonical_root_path);
        if (!row) throw new Error('spoke_attachment_unlink_row_missing');
        if (row.mount_status !== 'active') throw new Error('spoke_attachment_unlink_row_inactive');
        const link = activeLinkForRow(
            db, row, input.proof, hubRepoId, input.slug,
            'spoke_attachment_unlink_authority_missing',
            'spoke_attachment_unlink_authority_revoked',
        );
        const grantId = insertAttachmentGrant({
            db, proof: input.proof, slug: input.slug, hub_repo_id: hubRepoId,
            authority: input.authority, action: 'unlink',
            parent_link_receipt_id: link.receipt_id, now,
        });
        const receipt = newAttachmentReceipt({
            event_kind: 'unlink_revocation', grant_id: grantId, hub_repo_id: hubRepoId,
            slug: input.slug, proof: input.proof, authority: input.authority,
            parent_link_receipt_id: link.receipt_id,
            revokes_receipt_id: link.receipt_id, created_at: now,
        });
        insertAttachmentReceipt(db, receipt);
        const deleted = db.prepare(`
            DELETE FROM hall_mounted_spokes
            WHERE repo_id = ? AND spoke_id = ? AND slug = ? AND root_path = ?
              AND mount_status = 'active'
        `).run(hubRepoId, row.spoke_id, input.slug, input.proof.canonical_root_path);
        if (Number(deleted.changes) !== 1
            || selectMountedSpoke(db, hubRepoId, input.slug, input.proof.canonical_root_path)) {
            throw new Error('spoke_attachment_atomic_postcondition_failed');
        }
        assertAttachmentPostconditions(db, grantId, receipt);
        assertSpokeAttachmentRootProofStable(input.proof);
        return { receipt, grant_id: grantId, authority_kind: input.authority.kind };
    }).immediate();
}
