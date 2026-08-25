import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import {
    SPOKE_ATTACHMENT_GRANT_SCHEMA,
    SPOKE_ATTACHMENT_RECEIPT_SCHEMA,
    SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA,
    type SpokeAttachmentAction,
    type SpokeAttachmentAuthorityKind,
    type SpokeAttachmentReceiptEventKind,
} from './spoke_attachment_schema_runtime.js';
import type { SpokeAttachmentRootProof } from './spoke_attachment_root_proof.js';

const SHA256 = /^[a-f0-9]{64}$/;

export interface SpokeAttachmentAuthorityForStore {
    kind: SpokeAttachmentAuthorityKind;
    source_authority_id: string;
    source_mission_id?: string;
    source_authority_receipt_id?: string;
    source_authority_receipt_sha256?: string;
    thread_id: string;
    turn_id: string;
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
    selected_record_index: number;
    child_expires_at: number;
}

export interface SpokeAttachmentReceiptRow {
    receipt_id: string;
    schema: typeof SPOKE_ATTACHMENT_RECEIPT_SCHEMA;
    root_binding_schema: typeof SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA;
    event_kind: SpokeAttachmentReceiptEventKind;
    grant_id: string;
    source_authority_id: string;
    hub_repo_id: string;
    slug: string;
    root_path_sha256: string;
    root_sha256: string;
    policy_sha256: string;
    policy_path_sha256: string;
    root_identity_sha256: string;
    root_device: string;
    root_inode: string;
    root_size: string;
    root_mode: string;
    source_mission_id?: string;
    source_authority_receipt_id?: string;
    source_authority_receipt_sha256?: string;
    authority_thread_id: string;
    authority_turn_id: string;
    authority_record_sha256: string;
    authority_record_set_sha256: string;
    authority_record_count: number;
    selected_record_index: number;
    parent_link_receipt_id?: string;
    revokes_receipt_id?: string;
    receipt_sha256: string;
    created_at: number;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function stableReceiptMaterial(input: Omit<SpokeAttachmentReceiptRow, 'receipt_sha256'>): string {
    return JSON.stringify({
        schema: input.schema,
        receipt_id: input.receipt_id,
        root_binding_schema: input.root_binding_schema,
        event_kind: input.event_kind,
        grant_id: input.grant_id,
        source_authority_id: input.source_authority_id,
        hub_repo_id: input.hub_repo_id,
        slug: input.slug,
        root_path_sha256: input.root_path_sha256,
        root_sha256: input.root_sha256,
        policy_sha256: input.policy_sha256,
        policy_path_sha256: input.policy_path_sha256,
        root_identity_sha256: input.root_identity_sha256,
        root_device: input.root_device,
        root_inode: input.root_inode,
        root_size: input.root_size,
        root_mode: input.root_mode,
        source_mission_id: input.source_mission_id ?? null,
        source_authority_receipt_id: input.source_authority_receipt_id ?? null,
        source_authority_receipt_sha256: input.source_authority_receipt_sha256 ?? null,
        authority_thread_id: input.authority_thread_id,
        authority_turn_id: input.authority_turn_id,
        authority_record_sha256: input.authority_record_sha256,
        authority_record_set_sha256: input.authority_record_set_sha256,
        authority_record_count: input.authority_record_count,
        selected_record_index: input.selected_record_index,
        parent_link_receipt_id: input.parent_link_receipt_id ?? null,
        revokes_receipt_id: input.revokes_receipt_id ?? null,
        created_at: input.created_at,
    });
}

export function newAttachmentReceipt(input: {
    event_kind: SpokeAttachmentReceiptEventKind;
    grant_id: string;
    hub_repo_id: string;
    slug: string;
    proof: SpokeAttachmentRootProof;
    authority: SpokeAttachmentAuthorityForStore;
    parent_link_receipt_id?: string;
    revokes_receipt_id?: string;
    created_at: number;
}): SpokeAttachmentReceiptRow {
    const receipt = {
        receipt_id: `spoke-attachment-receipt-${randomUUID()}`,
        schema: SPOKE_ATTACHMENT_RECEIPT_SCHEMA,
        root_binding_schema: SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA,
        event_kind: input.event_kind,
        grant_id: input.grant_id,
        source_authority_id: input.authority.source_authority_id,
        hub_repo_id: input.hub_repo_id,
        slug: input.slug,
        root_path_sha256: input.proof.root_path_sha256,
        root_sha256: input.proof.root_sha256,
        policy_sha256: input.proof.policy_sha256,
        policy_path_sha256: input.proof.policy_path_sha256,
        root_identity_sha256: input.proof.root_identity_sha256,
        root_device: input.proof.root_device,
        root_inode: input.proof.root_inode,
        root_size: input.proof.root_size,
        root_mode: input.proof.root_mode,
        source_mission_id: input.authority.source_mission_id,
        source_authority_receipt_id: input.authority.source_authority_receipt_id,
        source_authority_receipt_sha256: input.authority.source_authority_receipt_sha256,
        authority_thread_id: input.authority.thread_id,
        authority_turn_id: input.authority.turn_id,
        authority_record_sha256: input.authority.record_sha256,
        authority_record_set_sha256: input.authority.record_set_sha256,
        authority_record_count: input.authority.record_count,
        selected_record_index: input.authority.selected_record_index,
        parent_link_receipt_id: input.parent_link_receipt_id,
        revokes_receipt_id: input.revokes_receipt_id,
        created_at: input.created_at,
    } satisfies Omit<SpokeAttachmentReceiptRow, 'receipt_sha256'>;
    return { ...receipt, receipt_sha256: sha256(stableReceiptMaterial(receipt)) };
}

export function isAttachmentReceiptHashValid(receipt: SpokeAttachmentReceiptRow): boolean {
    const { receipt_sha256: digest, ...material } = receipt;
    return sha256(stableReceiptMaterial(material)) === digest;
}

export function attachmentMetadataJson(receipt: SpokeAttachmentReceiptRow): string {
    return JSON.stringify({
        attachment_authority: {
            schema: SPOKE_ATTACHMENT_RECEIPT_SCHEMA,
            receipt_id: receipt.receipt_id,
            receipt_sha256: receipt.receipt_sha256,
        },
    });
}

export function mapMountedSpoke(row: Record<string, unknown>): HallMountedSpokeRecord {
    return {
        spoke_id: String(row.spoke_id),
        repo_id: String(row.repo_id),
        slug: String(row.slug),
        kind: row.kind as HallMountedSpokeRecord['kind'],
        root_path: String(row.root_path),
        remote_url: row.remote_url ? String(row.remote_url) : undefined,
        default_branch: row.default_branch ? String(row.default_branch) : undefined,
        mount_status: row.mount_status as HallMountedSpokeRecord['mount_status'],
        trust_level: row.trust_level as HallMountedSpokeRecord['trust_level'],
        write_policy: row.write_policy as HallMountedSpokeRecord['write_policy'],
        projection_status: row.projection_status as HallMountedSpokeRecord['projection_status'],
        last_scan_at: row.last_scan_at ? Number(row.last_scan_at) : undefined,
        last_health_at: row.last_health_at ? Number(row.last_health_at) : undefined,
        metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : {},
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

export function selectMountedSpoke(
    db: Database.Database,
    hubRepoId: string,
    slug: string,
    rootPath?: string,
): HallMountedSpokeRecord | null {
    const row = db.prepare(`
        SELECT spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
               mount_status, trust_level, write_policy, projection_status,
               last_scan_at, last_health_at, metadata_json, created_at, updated_at
        FROM hall_mounted_spokes
        WHERE repo_id = ? AND slug = ? ${rootPath ? 'AND root_path = ?' : ''}
        LIMIT 1
    `).get(...(rootPath ? [hubRepoId, slug, rootPath] : [hubRepoId, slug])) as
        Record<string, unknown> | undefined;
    return row ? mapMountedSpoke(row) : null;
}

export function selectAllMountedSpokes(db: Database.Database): HallMountedSpokeRecord[] {
    const rows = db.prepare(`
        SELECT spoke_id, repo_id, slug, kind, root_path, remote_url, default_branch,
               mount_status, trust_level, write_policy, projection_status,
               last_scan_at, last_health_at, metadata_json, created_at, updated_at
        FROM hall_mounted_spokes
    `).all() as Array<Record<string, unknown>>;
    return rows.map(mapMountedSpoke);
}

export function selectAttachmentReceipt(
    db: Database.Database,
    receiptId: string,
): SpokeAttachmentReceiptRow | null {
    const row = db.prepare(`
        SELECT receipt_id, schema, root_binding_schema, event_kind, grant_id,
               source_authority_id, hub_repo_id, slug, root_path_sha256, root_sha256,
               policy_sha256, policy_path_sha256, root_identity_sha256,
               root_device, root_inode, root_size, root_mode, source_mission_id,
               source_authority_receipt_id, source_authority_receipt_sha256,
               authority_thread_id, authority_turn_id, authority_record_sha256,
               authority_record_set_sha256, authority_record_count, selected_record_index,
               parent_link_receipt_id, revokes_receipt_id, receipt_sha256, created_at
        FROM hall_spoke_attachment_receipts WHERE receipt_id = ? LIMIT 1
    `).get(receiptId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const optional = (key: string): string | undefined => row[key] ? String(row[key]) : undefined;
    return {
        receipt_id: String(row.receipt_id),
        schema: row.schema as typeof SPOKE_ATTACHMENT_RECEIPT_SCHEMA,
        root_binding_schema: row.root_binding_schema as typeof SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA,
        event_kind: row.event_kind as SpokeAttachmentReceiptEventKind,
        grant_id: String(row.grant_id),
        source_authority_id: String(row.source_authority_id),
        hub_repo_id: String(row.hub_repo_id),
        slug: String(row.slug),
        root_path_sha256: String(row.root_path_sha256),
        root_sha256: String(row.root_sha256),
        policy_sha256: String(row.policy_sha256),
        policy_path_sha256: String(row.policy_path_sha256),
        root_identity_sha256: String(row.root_identity_sha256),
        root_device: String(row.root_device),
        root_inode: String(row.root_inode),
        root_size: String(row.root_size),
        root_mode: String(row.root_mode),
        source_mission_id: optional('source_mission_id'),
        source_authority_receipt_id: optional('source_authority_receipt_id'),
        source_authority_receipt_sha256: optional('source_authority_receipt_sha256'),
        authority_thread_id: String(row.authority_thread_id),
        authority_turn_id: String(row.authority_turn_id),
        authority_record_sha256: String(row.authority_record_sha256),
        authority_record_set_sha256: String(row.authority_record_set_sha256),
        authority_record_count: Number(row.authority_record_count),
        selected_record_index: Number(row.selected_record_index),
        parent_link_receipt_id: optional('parent_link_receipt_id'),
        revokes_receipt_id: optional('revokes_receipt_id'),
        receipt_sha256: String(row.receipt_sha256),
        created_at: Number(row.created_at),
    };
}

export function selectActiveLinkReceipt(
    db: Database.Database,
    hubRepoId: string,
    slug: string,
    proof: SpokeAttachmentRootProof,
    receiptId: string,
): SpokeAttachmentReceiptRow | null {
    const receipt = selectAttachmentReceipt(db, receiptId);
    if (!receipt || receipt.event_kind !== 'link_authority'
        || receipt.hub_repo_id !== hubRepoId || receipt.slug !== slug
        || receipt.root_path_sha256 !== proof.root_path_sha256
        || receipt.root_sha256 !== proof.root_sha256
        || receipt.policy_sha256 !== proof.policy_sha256
        || receipt.policy_path_sha256 !== proof.policy_path_sha256
        || receipt.root_identity_sha256 !== proof.root_identity_sha256
        || receipt.root_device !== proof.root_device
        || receipt.root_inode !== proof.root_inode
        || receipt.root_size !== proof.root_size
        || receipt.root_mode !== proof.root_mode) return null;
    const revoked = db.prepare(`
        SELECT receipt_id FROM hall_spoke_attachment_receipts
        WHERE event_kind = 'unlink_revocation' AND revokes_receipt_id = ? LIMIT 1
    `).get(receipt.receipt_id);
    return revoked ? null : receipt;
}

export function hasAuthoritySource(db: Database.Database, sourceAuthorityId: string): boolean {
    return Boolean(db.prepare(
        'SELECT grant_id FROM hall_spoke_attachment_grants WHERE source_authority_id = ? LIMIT 1',
    ).get(sourceAuthorityId));
}

function validateAuthority(authority: SpokeAttachmentAuthorityForStore | undefined, now: number): void {
    if (!authority || typeof authority !== 'object') {
        throw new Error('spoke_attachment_authority_binding_invalid');
    }
    if (!Number.isFinite(authority.child_expires_at) || authority.child_expires_at <= now) {
        throw new Error('spoke_attachment_authority_expired');
    }
    if (!SHA256.test(authority.record_sha256) || !SHA256.test(authority.record_set_sha256)
        || !Number.isInteger(authority.record_count) || authority.record_count < 1
        || !Number.isInteger(authority.selected_record_index)
        || authority.selected_record_index < 0
        || authority.selected_record_index >= authority.record_count) {
        throw new Error('spoke_attachment_authority_binding_invalid');
    }
}

export function insertAttachmentGrant(input: {
    db: Database.Database;
    proof: SpokeAttachmentRootProof;
    slug: string;
    hub_repo_id: string;
    authority: SpokeAttachmentAuthorityForStore;
    action: SpokeAttachmentAction;
    parent_link_receipt_id?: string;
    now: number;
}): string {
    validateAuthority(input.authority, input.now);
    if (hasAuthoritySource(input.db, input.authority.source_authority_id)) {
        throw new Error('spoke_attachment_authority_replay');
    }
    const grantId = `spoke-attachment-grant-${randomUUID()}`;
    input.db.prepare(`
        INSERT INTO hall_spoke_attachment_grants (
            grant_id, schema, root_binding_schema, source_authority_id, authority_kind,
            action, hub_repo_id, slug, root_path_sha256, root_sha256, policy_sha256,
            policy_path_sha256, root_identity_sha256, root_device, root_inode, root_size,
            root_mode, source_mission_id, source_authority_receipt_id,
            source_authority_receipt_sha256, authority_thread_id, authority_turn_id,
            authority_record_sha256, authority_record_set_sha256, authority_record_count,
            selected_record_index, parent_link_receipt_id, child_expires_at,
            status, created_at, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consumed', ?, ?)
    `).run(
        grantId, SPOKE_ATTACHMENT_GRANT_SCHEMA, SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA,
        input.authority.source_authority_id, input.authority.kind, input.action,
        input.hub_repo_id, input.slug, input.proof.root_path_sha256, input.proof.root_sha256,
        input.proof.policy_sha256, input.proof.policy_path_sha256,
        input.proof.root_identity_sha256, input.proof.root_device, input.proof.root_inode,
        input.proof.root_size, input.proof.root_mode, input.authority.source_mission_id ?? null,
        input.authority.source_authority_receipt_id ?? null,
        input.authority.source_authority_receipt_sha256 ?? null, input.authority.thread_id,
        input.authority.turn_id, input.authority.record_sha256, input.authority.record_set_sha256,
        input.authority.record_count, input.authority.selected_record_index,
        input.parent_link_receipt_id ?? null, input.authority.child_expires_at, input.now, input.now,
    );
    return grantId;
}

export function insertAttachmentReceipt(db: Database.Database, receipt: SpokeAttachmentReceiptRow): void {
    db.prepare(`
        INSERT INTO hall_spoke_attachment_receipts (
            receipt_id, schema, root_binding_schema, event_kind, grant_id,
            source_authority_id, hub_repo_id, slug, root_path_sha256, root_sha256,
            policy_sha256, policy_path_sha256, root_identity_sha256, root_device,
            root_inode, root_size, root_mode, source_mission_id,
            source_authority_receipt_id, source_authority_receipt_sha256,
            authority_thread_id, authority_turn_id, authority_record_sha256,
            authority_record_set_sha256, authority_record_count, selected_record_index,
            parent_link_receipt_id, revokes_receipt_id, receipt_sha256, created_at
        ) VALUES (${Array.from({ length: 30 }, () => '?').join(', ')})
    `).run(
        receipt.receipt_id, receipt.schema, receipt.root_binding_schema, receipt.event_kind,
        receipt.grant_id, receipt.source_authority_id, receipt.hub_repo_id, receipt.slug,
        receipt.root_path_sha256, receipt.root_sha256, receipt.policy_sha256,
        receipt.policy_path_sha256, receipt.root_identity_sha256, receipt.root_device,
        receipt.root_inode, receipt.root_size, receipt.root_mode, receipt.source_mission_id ?? null,
        receipt.source_authority_receipt_id ?? null,
        receipt.source_authority_receipt_sha256 ?? null, receipt.authority_thread_id,
        receipt.authority_turn_id, receipt.authority_record_sha256,
        receipt.authority_record_set_sha256, receipt.authority_record_count,
        receipt.selected_record_index, receipt.parent_link_receipt_id ?? null,
        receipt.revokes_receipt_id ?? null, receipt.receipt_sha256, receipt.created_at,
    );
}

export function assertAttachmentPostconditions(
    db: Database.Database,
    grantId: string,
    receipt: SpokeAttachmentReceiptRow,
): void {
    const grant = db.prepare(`
        SELECT status, schema, grant_id, source_authority_id, action, root_sha256,
               parent_link_receipt_id FROM hall_spoke_attachment_grants
        WHERE grant_id = ? LIMIT 1
    `).get(grantId) as Record<string, unknown> | undefined;
    const stored = selectAttachmentReceipt(db, receipt.receipt_id);
    if (!grant || grant.schema !== SPOKE_ATTACHMENT_GRANT_SCHEMA || grant.status !== 'consumed'
        || grant.source_authority_id !== receipt.source_authority_id
        || grant.root_sha256 !== receipt.root_sha256
        || (grant.parent_link_receipt_id ?? undefined) !== receipt.parent_link_receipt_id
        || !stored || stored.receipt_sha256 !== receipt.receipt_sha256
        || stored.grant_id !== grantId || !isAttachmentReceiptHashValid(stored)) {
        throw new Error('spoke_attachment_atomic_postcondition_failed');
    }
}
