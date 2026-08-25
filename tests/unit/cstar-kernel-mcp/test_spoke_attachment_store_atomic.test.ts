import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { database } from '../../../src/tools/pennyone/intel/database.js';
import { proveSpokeAttachmentRoot } from '../../../src/tools/pennyone/intel/spoke_attachment_root_proof.js';
import {
    linkSpokeAttachment,
    projectSpokeAttachment,
    unlinkSpokeAttachment,
    type SpokeAttachmentAuthorityForStore,
} from '../../../src/tools/pennyone/intel/spoke_attachment_store.js';

type FakeRow = Record<string, unknown>;

class FakeAttachmentDb {
    mounted: FakeRow[] = [];
    grants: FakeRow[] = [];
    receipts: FakeRow[] = [];
    failMountInsert = false;
    failReceiptInsert = false;

    exec(): void {}

    prepare(sql: string): {
        get: (...args: unknown[]) => FakeRow | undefined;
        all: (...args: unknown[]) => FakeRow[];
        run: (...args: unknown[]) => { changes: number };
    } {
        return {
            get: (...args) => this.get(sql, args),
            all: (...args) => this.all(sql, args),
            run: (...args) => this.run(sql, args),
        };
    }

    transaction<T>(operation: () => T): (() => T) & { immediate: () => T } {
        const execute = () => {
            const snapshot = {
                mounted: this.mounted.map((row) => ({ ...row })),
                grants: this.grants.map((row) => ({ ...row })),
                receipts: this.receipts.map((row) => ({ ...row })),
            };
            try {
                return operation();
            } catch (error) {
                this.mounted = snapshot.mounted;
                this.grants = snapshot.grants;
                this.receipts = snapshot.receipts;
                throw error;
            }
        };
        return Object.assign(execute, { immediate: execute });
    }

    private get(sql: string, args: unknown[]): FakeRow | undefined {
        if (sql.includes('FROM hall_spoke_attachment_grants')) {
            if (sql.includes('WHERE grant_id = ?')) {
                return this.grants.find((row) => row.grant_id === args[0]);
            }
            return this.grants.find((row) => row.source_authority_id === args[0]);
        }
        if (sql.includes('FROM hall_spoke_attachment_receipts')) {
            if (sql.includes('WHERE receipt_id = ?')) {
                return this.receipts.find((row) => row.receipt_id === args[0]);
            }
            if (sql.includes('revokes_receipt_id = ?')) {
                return this.receipts.find((row) => row.event_kind === 'unlink_revocation'
                    && row.revokes_receipt_id === args[0]);
            }
        }
        if (sql.includes('FROM hall_mounted_spokes')) {
            const [repoId, slug, rootPath] = args;
            return this.mounted.find((row) => row.repo_id === repoId
                && row.slug === slug
                && (rootPath === undefined || row.root_path === rootPath));
        }
        return undefined;
    }

    private all(sql: string, _args: unknown[]): FakeRow[] {
        return sql.includes('FROM hall_mounted_spokes')
            ? this.mounted.map((row) => ({ ...row })) : [];
    }

    private run(sql: string, args: unknown[]): { changes: number } {
        if (sql.includes('INSERT INTO hall_spoke_attachment_grants')) {
            const [grantId, schema, rootBindingSchema, sourceId, authorityKind, action,
                hubRepoId, slug, rootPathSha256, rootSha256, policySha256,
                policyPathSha256, rootIdentitySha256, rootDevice, rootInode, rootSize,
                rootMode, sourceMissionId, sourceReceiptId, sourceReceiptSha256,
                threadId, turnId, recordSha256, recordSetSha256, recordCount,
                selectedRecordIndex, parentLinkReceiptId, expiresAt, createdAt, consumedAt] = args;
            if (this.grants.some((row) => row.source_authority_id === sourceId)) {
                throw new Error('spoke_attachment_authority_replay');
            }
            if ((action === 'link') !== (parentLinkReceiptId === null)) {
                throw new Error('synthetic_grant_event_shape_failure');
            }
            this.grants.push({
                grant_id: grantId, schema, root_binding_schema: rootBindingSchema,
                source_authority_id: sourceId, authority_kind: authorityKind, action,
                hub_repo_id: hubRepoId, slug, root_path_sha256: rootPathSha256,
                root_sha256: rootSha256, policy_sha256: policySha256,
                policy_path_sha256: policyPathSha256,
                root_identity_sha256: rootIdentitySha256, root_device: rootDevice,
                root_inode: rootInode, root_size: rootSize, root_mode: rootMode,
                source_mission_id: sourceMissionId,
                source_authority_receipt_id: sourceReceiptId,
                source_authority_receipt_sha256: sourceReceiptSha256,
                authority_thread_id: threadId, authority_turn_id: turnId,
                authority_record_sha256: recordSha256,
                authority_record_set_sha256: recordSetSha256,
                authority_record_count: recordCount,
                selected_record_index: selectedRecordIndex,
                parent_link_receipt_id: parentLinkReceiptId,
                child_expires_at: expiresAt, status: 'consumed',
                created_at: createdAt, consumed_at: consumedAt,
            });
            return { changes: 1 };
        }
        if (sql.includes('INSERT INTO hall_spoke_attachment_receipts')) {
            if (this.failReceiptInsert) throw new Error('synthetic_receipt_insert_failure');
            const [receiptId, schema, rootBindingSchema, eventKind, grantId, sourceId,
                hubRepoId, slug, rootPathSha256, rootSha256, policySha256,
                policyPathSha256, rootIdentitySha256, rootDevice, rootInode, rootSize,
                rootMode, sourceMissionId, sourceReceiptId, sourceReceiptSha256,
                threadId, turnId, recordSha256, recordSetSha256, recordCount,
                selectedRecordIndex, parentLinkReceiptId, revokesReceiptId,
                receiptSha256, createdAt] = args;
            if (this.receipts.some((row) => row.grant_id === grantId
                || row.source_authority_id === sourceId)) {
                throw new Error('synthetic_receipt_one_use_failure');
            }
            const parent = parentLinkReceiptId === null ? undefined
                : this.receipts.find((row) => row.receipt_id === parentLinkReceiptId
                    && row.event_kind === 'link_authority'
                    && row.hub_repo_id === hubRepoId && row.slug === slug
                    && row.root_path_sha256 === rootPathSha256
                    && row.root_sha256 === rootSha256
                    && row.policy_sha256 === policySha256
                    && row.policy_path_sha256 === policyPathSha256
                    && row.root_identity_sha256 === rootIdentitySha256
                    && row.root_device === rootDevice
                    && row.root_inode === rootInode
                    && row.root_size === rootSize
                    && row.root_mode === rootMode);
            const shapeValid = eventKind === 'link_authority'
                ? parentLinkReceiptId === null && revokesReceiptId === null
                : eventKind === 'attachment_projection'
                    ? Boolean(parent) && revokesReceiptId === null
                    : eventKind === 'unlink_revocation'
                        ? Boolean(parent) && revokesReceiptId === parentLinkReceiptId
                        : false;
            if (!shapeValid) throw new Error('synthetic_receipt_event_shape_failure');
            if (eventKind === 'unlink_revocation'
                && this.receipts.some((row) => row.revokes_receipt_id === revokesReceiptId)) {
                throw new Error('synthetic_revocation_one_use_failure');
            }
            this.receipts.push({
                receipt_id: receiptId, schema, root_binding_schema: rootBindingSchema,
                event_kind: eventKind, grant_id: grantId, source_authority_id: sourceId,
                hub_repo_id: hubRepoId, slug, root_path_sha256: rootPathSha256,
                root_sha256: rootSha256, policy_sha256: policySha256,
                policy_path_sha256: policyPathSha256,
                root_identity_sha256: rootIdentitySha256, root_device: rootDevice,
                root_inode: rootInode, root_size: rootSize, root_mode: rootMode,
                source_mission_id: sourceMissionId,
                source_authority_receipt_id: sourceReceiptId,
                source_authority_receipt_sha256: sourceReceiptSha256,
                authority_thread_id: threadId, authority_turn_id: turnId,
                authority_record_sha256: recordSha256,
                authority_record_set_sha256: recordSetSha256,
                authority_record_count: recordCount,
                selected_record_index: selectedRecordIndex,
                parent_link_receipt_id: parentLinkReceiptId,
                revokes_receipt_id: revokesReceiptId,
                receipt_sha256: receiptSha256, created_at: createdAt,
            });
            return { changes: 1 };
        }
        if (sql.includes('INSERT INTO hall_mounted_spokes')) {
            if (this.failMountInsert) throw new Error('synthetic_mount_insert_failure');
            const [spokeId, repoId, slug, rootPath, metadataJson, createdAt, updatedAt] = args;
            this.mounted.push({
                spoke_id: spokeId, repo_id: repoId, slug, kind: 'local', root_path: rootPath,
                remote_url: null, default_branch: null, mount_status: 'active',
                trust_level: 'trusted', write_policy: 'read_write', projection_status: 'missing',
                last_scan_at: null, last_health_at: null, metadata_json: metadataJson,
                created_at: createdAt, updated_at: updatedAt,
            });
            return { changes: 1 };
        }
        if (sql.includes('UPDATE hall_mounted_spokes')) {
            const [updatedAt, repoId, spokeId, slug, rootPath] = args;
            const row = this.mounted.find((candidate) => candidate.repo_id === repoId
                && candidate.spoke_id === spokeId && candidate.slug === slug
                && candidate.root_path === rootPath && candidate.mount_status === 'active');
            if (!row) return { changes: 0 };
            row.projection_status = 'current';
            row.updated_at = updatedAt;
            return { changes: 1 };
        }
        if (sql.includes('DELETE FROM hall_mounted_spokes')) {
            const [repoId, spokeId, slug, rootPath] = args;
            const before = this.mounted.length;
            this.mounted = this.mounted.filter((row) => !(row.repo_id === repoId
                && row.spoke_id === spokeId && row.slug === slug && row.root_path === rootPath
                && row.mount_status === 'active'));
            return { changes: before - this.mounted.length };
        }
        return { changes: 0 };
    }
}

function makeRepository(): string {
    const root = fs.mkdtempSync(path.join('/home/morderith/Corvus', 'cstar-attachment-store-'));
    initializeRepository(root);
    return root;
}

function initializeRepository(root: string): void {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic store fixture.\n', { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
}

function authority(id: string, hashCharacter: string): SpokeAttachmentAuthorityForStore {
    return {
        kind: 'current_root_turn',
        source_authority_id: id,
        thread_id: `thread:${id}`,
        turn_id: `turn:${id}`,
        record_sha256: hashCharacter.repeat(64),
        record_set_sha256: hashCharacter.repeat(64),
        record_count: 1,
        selected_record_index: 0,
        child_expires_at: 1_900_000_000_000,
    };
}

describe('CStar spoke attachment atomic Hall store', () => {
    it('binds redacted evidence and rolls back link, replay, and project failures atomically', (t) => {
        const root = makeRepository();
        const rollbackRoot = makeRepository();
        const proof = proveSpokeAttachmentRoot(root);
        const rollbackProof = proveSpokeAttachmentRoot(rollbackRoot);
        const db = new FakeAttachmentDb();
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'getWritableDb', () => db as any);
        t.mock.method(database, 'tryGetReadDb', () => db as any);
        try {
            const linked = linkSpokeAttachment({
                proof, slug: proof.canonical_slug,
                authority: authority('authority:link', 'a'), now: 1_800_000_000_000,
            });
            assert.equal(db.grants.length, 1);
            assert.equal(db.receipts.length, 1);
            assert.equal(db.mounted.length, 1);
            assert.deepEqual(Object.keys(linked.row?.metadata ?? {}), ['attachment_authority']);
            assert.equal('root_path' in db.grants[0]!, false);
            assert.equal('root_path' in db.receipts[0]!, false);
            assert.equal(db.grants[0]!.root_path_sha256, proof.root_path_sha256);
            assert.equal(db.grants[0]!.policy_sha256, proof.policy_sha256);
            assert.equal(fs.existsSync(path.join(root, '.cstar')), false);

            const beforeReplay = JSON.stringify(db);
            assert.throws(() => linkSpokeAttachment({
                proof, slug: proof.canonical_slug,
                authority: authority('authority:link', 'a'), now: 1_800_000_000_001,
            }), /spoke_attachment_authority_replay/);
            assert.equal(JSON.stringify(db), beforeReplay);

            db.failMountInsert = true;
            assert.throws(() => linkSpokeAttachment({
                proof: rollbackProof, slug: rollbackProof.canonical_slug,
                authority: authority('authority:rollback', 'b'), now: 1_800_000_000_002,
            }), /synthetic_mount_insert_failure/);
            db.failMountInsert = false;
            assert.equal(db.grants.length, 1);
            assert.equal(db.receipts.length, 1);
            assert.equal(db.mounted.length, 1);

            const linkReceiptId = linked.receipt.receipt_id;
            const projected = projectSpokeAttachment({
                proof, slug: proof.canonical_slug,
                authority: authority('authority:project', 'c'), now: 1_800_000_000_003,
            });
            assert.equal(projected.row?.projection_status, 'current');
            assert.equal(projected.receipt.parent_link_receipt_id, linkReceiptId);
            assert.equal(db.grants.length, 2);

            db.failReceiptInsert = true;
            const beforeProjectFailure = JSON.stringify(db);
            assert.throws(() => projectSpokeAttachment({
                proof, slug: proof.canonical_slug,
                authority: authority('authority:project-failure', 'd'), now: 1_800_000_000_004,
            }), /synthetic_receipt_insert_failure/);
            assert.equal(JSON.stringify(db), beforeProjectFailure);
            db.failReceiptInsert = false;

            const unlinked = unlinkSpokeAttachment({
                proof, slug: proof.canonical_slug,
                authority: authority('authority:unlink', 'e'), now: 1_800_000_000_005,
            });
            assert.equal(unlinked.receipt.event_kind, 'unlink_revocation');
            assert.equal(unlinked.receipt.parent_link_receipt_id, linkReceiptId);
            assert.equal(unlinked.receipt.revokes_receipt_id, linkReceiptId);
            assert.equal(db.mounted.length, 0);
            assert.equal(db.grants.length, 3);
            assert.equal(db.receipts.length, 3);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(rollbackRoot, { recursive: true, force: true });
        }
    });

    it('rejects project and unlink after policy drift before any child mutation', (t) => {
        const root = makeRepository();
        const originalProof = proveSpokeAttachmentRoot(root);
        const db = new FakeAttachmentDb();
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'getWritableDb', () => db as any);
        t.mock.method(database, 'tryGetReadDb', () => db as any);
        try {
            linkSpokeAttachment({
                proof: originalProof, slug: originalProof.canonical_slug,
                authority: authority('authority:policy-link', 'f'), now: 1_800_000_000_010,
            });
            fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Changed store policy bytes.\n', { mode: 0o600 });
            const currentProof = proveSpokeAttachmentRoot(root);

            const beforeProject = JSON.stringify(db);
            assert.throws(() => projectSpokeAttachment({
                proof: currentProof, slug: currentProof.canonical_slug,
                authority: authority('authority:policy-project', '1'), now: 1_800_000_000_011,
            }), /spoke_attachment_project_authority_revoked/);
            assert.equal(JSON.stringify(db), beforeProject);

            const beforeUnlink = JSON.stringify(db);
            assert.throws(() => unlinkSpokeAttachment({
                proof: currentProof, slug: currentProof.canonical_slug,
                authority: authority('authority:policy-unlink', '2'), now: 1_800_000_000_012,
            }), /spoke_attachment_unlink_authority_revoked/);
            assert.equal(JSON.stringify(db), beforeUnlink);
            assert.equal(db.mounted[0]?.projection_status, 'missing');
            assert.equal(db.grants.length, 1);
            assert.equal(db.receipts.length, 1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects project and unlink after same-path root replacement before any child mutation', (t) => {
        const root = makeRepository();
        const displaced = `${root}-displaced`;
        const originalProof = proveSpokeAttachmentRoot(root);
        const db = new FakeAttachmentDb();
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'getWritableDb', () => db as any);
        t.mock.method(database, 'tryGetReadDb', () => db as any);
        try {
            linkSpokeAttachment({
                proof: originalProof, slug: originalProof.canonical_slug,
                authority: authority('authority:root-link', '3'), now: 1_800_000_000_013,
            });
            fs.renameSync(root, displaced);
            fs.mkdirSync(root, { mode: 0o700 });
            initializeRepository(root);
            const currentProof = proveSpokeAttachmentRoot(root);
            assert.notEqual(currentProof.root_identity_sha256, originalProof.root_identity_sha256);

            const beforeProject = JSON.stringify(db);
            assert.throws(() => projectSpokeAttachment({
                proof: currentProof, slug: currentProof.canonical_slug,
                authority: authority('authority:root-project', '4'), now: 1_800_000_000_014,
            }), /spoke_attachment_project_authority_revoked/);
            assert.equal(JSON.stringify(db), beforeProject);

            const beforeUnlink = JSON.stringify(db);
            assert.throws(() => unlinkSpokeAttachment({
                proof: currentProof, slug: currentProof.canonical_slug,
                authority: authority('authority:root-unlink', '5'), now: 1_800_000_000_015,
            }), /spoke_attachment_unlink_authority_revoked/);
            assert.equal(JSON.stringify(db), beforeUnlink);
            assert.equal(db.mounted[0]?.projection_status, 'missing');
            assert.equal(db.grants.length, 1);
            assert.equal(db.receipts.length, 1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(displaced, { recursive: true, force: true });
        }
    });
});
