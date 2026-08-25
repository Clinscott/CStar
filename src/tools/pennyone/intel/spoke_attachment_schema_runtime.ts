import type Database from 'better-sqlite3';

export const SPOKE_ATTACHMENT_GRANT_SCHEMA = 'cstar.spoke_attachment_authority_grant.v1' as const;
export const SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA = 'cstar.spoke_attachment_root_binding.v1' as const;
export const SPOKE_ATTACHMENT_RECEIPT_SCHEMA = 'cstar.spoke_attachment_receipt.v1' as const;

export type SpokeAttachmentAction = 'link' | 'project' | 'unlink';
export type SpokeAttachmentAuthorityKind = 'current_root_turn' | 'cstar_mission_set_grant';
export type SpokeAttachmentReceiptEventKind =
    | 'link_authority'
    | 'attachment_projection'
    | 'unlink_revocation';

/** Append-only Hall evidence for bounded spoke attachment authority. */
export const SPOKE_ATTACHMENT_SCHEMA_SQL = String.raw`
        CREATE TABLE IF NOT EXISTS hall_spoke_attachment_grants (
            grant_id TEXT PRIMARY KEY,
            schema TEXT NOT NULL CHECK(schema = '${SPOKE_ATTACHMENT_GRANT_SCHEMA}'),
            root_binding_schema TEXT NOT NULL CHECK(
                root_binding_schema = '${SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA}'
            ),
            source_authority_id TEXT NOT NULL UNIQUE,
            authority_kind TEXT NOT NULL CHECK(
                authority_kind IN ('current_root_turn', 'cstar_mission_set_grant')
            ),
            action TEXT NOT NULL CHECK(action IN ('link', 'project', 'unlink')),
            hub_repo_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            root_path_sha256 TEXT NOT NULL CHECK(
                length(root_path_sha256) = 64 AND root_path_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_sha256 TEXT NOT NULL CHECK(
                length(root_sha256) = 64 AND root_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            policy_sha256 TEXT NOT NULL CHECK(
                length(policy_sha256) = 64 AND policy_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            policy_path_sha256 TEXT NOT NULL CHECK(
                length(policy_path_sha256) = 64 AND policy_path_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_identity_sha256 TEXT NOT NULL CHECK(
                length(root_identity_sha256) = 64 AND root_identity_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_device TEXT NOT NULL,
            root_inode TEXT NOT NULL,
            root_size TEXT NOT NULL,
            root_mode TEXT NOT NULL,
            source_mission_id TEXT,
            source_authority_receipt_id TEXT,
            source_authority_receipt_sha256 TEXT,
            authority_thread_id TEXT NOT NULL,
            authority_turn_id TEXT NOT NULL,
            authority_record_sha256 TEXT NOT NULL CHECK(
                length(authority_record_sha256) = 64
                AND authority_record_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            authority_record_set_sha256 TEXT NOT NULL CHECK(
                length(authority_record_set_sha256) = 64
                AND authority_record_set_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            authority_record_count INTEGER NOT NULL CHECK(authority_record_count >= 1),
            selected_record_index INTEGER NOT NULL CHECK(
                selected_record_index >= 0 AND selected_record_index < authority_record_count
            ),
            parent_link_receipt_id TEXT,
            child_expires_at INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status = 'consumed'),
            created_at INTEGER NOT NULL,
            consumed_at INTEGER NOT NULL,
            CHECK(
                (authority_kind = 'current_root_turn'
                    AND source_mission_id IS NULL
                    AND source_authority_receipt_id IS NULL
                    AND source_authority_receipt_sha256 IS NULL)
                OR
                (authority_kind = 'cstar_mission_set_grant'
                    AND source_mission_id IS NOT NULL
                    AND source_authority_receipt_id IS NOT NULL
                    AND length(source_authority_receipt_sha256) = 64
                    AND source_authority_receipt_sha256 NOT GLOB '*[^0-9a-f]*')
            ),
            CHECK(
                (action = 'link' AND parent_link_receipt_id IS NULL)
                OR (action IN ('project', 'unlink') AND parent_link_receipt_id IS NOT NULL)
            ),
            FOREIGN KEY(hub_repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(parent_link_receipt_id) REFERENCES hall_spoke_attachment_receipts(receipt_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_spoke_attachment_grants_target
        ON hall_spoke_attachment_grants(hub_repo_id, slug, root_path_sha256);

        CREATE TABLE IF NOT EXISTS hall_spoke_attachment_receipts (
            receipt_id TEXT PRIMARY KEY,
            schema TEXT NOT NULL CHECK(schema = '${SPOKE_ATTACHMENT_RECEIPT_SCHEMA}'),
            root_binding_schema TEXT NOT NULL CHECK(
                root_binding_schema = '${SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA}'
            ),
            event_kind TEXT NOT NULL CHECK(
                event_kind IN ('link_authority', 'attachment_projection', 'unlink_revocation')
            ),
            grant_id TEXT NOT NULL UNIQUE,
            source_authority_id TEXT NOT NULL UNIQUE,
            hub_repo_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            root_path_sha256 TEXT NOT NULL CHECK(
                length(root_path_sha256) = 64 AND root_path_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_sha256 TEXT NOT NULL CHECK(
                length(root_sha256) = 64 AND root_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            policy_sha256 TEXT NOT NULL CHECK(
                length(policy_sha256) = 64 AND policy_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            policy_path_sha256 TEXT NOT NULL CHECK(
                length(policy_path_sha256) = 64 AND policy_path_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_identity_sha256 TEXT NOT NULL CHECK(
                length(root_identity_sha256) = 64 AND root_identity_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            root_device TEXT NOT NULL,
            root_inode TEXT NOT NULL,
            root_size TEXT NOT NULL,
            root_mode TEXT NOT NULL,
            source_mission_id TEXT,
            source_authority_receipt_id TEXT,
            source_authority_receipt_sha256 TEXT,
            authority_thread_id TEXT NOT NULL,
            authority_turn_id TEXT NOT NULL,
            authority_record_sha256 TEXT NOT NULL CHECK(
                length(authority_record_sha256) = 64
                AND authority_record_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            authority_record_set_sha256 TEXT NOT NULL CHECK(
                length(authority_record_set_sha256) = 64
                AND authority_record_set_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            authority_record_count INTEGER NOT NULL CHECK(authority_record_count >= 1),
            selected_record_index INTEGER NOT NULL CHECK(
                selected_record_index >= 0 AND selected_record_index < authority_record_count
            ),
            parent_link_receipt_id TEXT,
            revokes_receipt_id TEXT,
            receipt_sha256 TEXT NOT NULL UNIQUE CHECK(
                length(receipt_sha256) = 64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'
            ),
            created_at INTEGER NOT NULL,
            CHECK(
                (event_kind = 'link_authority'
                    AND parent_link_receipt_id IS NULL AND revokes_receipt_id IS NULL)
                OR
                (event_kind = 'attachment_projection'
                    AND parent_link_receipt_id IS NOT NULL AND revokes_receipt_id IS NULL)
                OR
                (event_kind = 'unlink_revocation'
                    AND parent_link_receipt_id IS NOT NULL
                    AND revokes_receipt_id = parent_link_receipt_id)
            ),
            CHECK(
                (source_mission_id IS NULL
                    AND source_authority_receipt_id IS NULL
                    AND source_authority_receipt_sha256 IS NULL)
                OR
                (source_mission_id IS NOT NULL
                    AND source_authority_receipt_id IS NOT NULL
                    AND length(source_authority_receipt_sha256) = 64
                    AND source_authority_receipt_sha256 NOT GLOB '*[^0-9a-f]*')
            ),
            FOREIGN KEY(grant_id) REFERENCES hall_spoke_attachment_grants(grant_id),
            FOREIGN KEY(hub_repo_id) REFERENCES hall_repositories(repo_id),
            FOREIGN KEY(parent_link_receipt_id) REFERENCES hall_spoke_attachment_receipts(receipt_id),
            FOREIGN KEY(revokes_receipt_id) REFERENCES hall_spoke_attachment_receipts(receipt_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hall_spoke_attachment_receipts_target
        ON hall_spoke_attachment_receipts(hub_repo_id, slug, root_path_sha256, created_at);

        CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_spoke_attachment_receipts_revocation
        ON hall_spoke_attachment_receipts(revokes_receipt_id)
        WHERE event_kind = 'unlink_revocation';

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_receipt_grant_binding
        BEFORE INSERT ON hall_spoke_attachment_receipts
        BEGIN
            SELECT CASE WHEN NOT EXISTS (
                SELECT 1 FROM hall_spoke_attachment_grants grant_row
                WHERE grant_row.grant_id = NEW.grant_id
                  AND grant_row.source_authority_id = NEW.source_authority_id
                  AND grant_row.hub_repo_id = NEW.hub_repo_id
                  AND grant_row.slug = NEW.slug
                  AND grant_row.root_path_sha256 = NEW.root_path_sha256
                  AND grant_row.root_sha256 = NEW.root_sha256
                  AND grant_row.policy_sha256 = NEW.policy_sha256
                  AND grant_row.policy_path_sha256 = NEW.policy_path_sha256
                  AND grant_row.root_identity_sha256 = NEW.root_identity_sha256
                  AND grant_row.root_device = NEW.root_device
                  AND grant_row.root_inode = NEW.root_inode
                  AND grant_row.root_size = NEW.root_size
                  AND grant_row.root_mode = NEW.root_mode
                  AND grant_row.source_mission_id IS NEW.source_mission_id
                  AND grant_row.source_authority_receipt_id IS NEW.source_authority_receipt_id
                  AND grant_row.source_authority_receipt_sha256 IS NEW.source_authority_receipt_sha256
                  AND grant_row.authority_thread_id = NEW.authority_thread_id
                  AND grant_row.authority_turn_id = NEW.authority_turn_id
                  AND grant_row.authority_record_sha256 = NEW.authority_record_sha256
                  AND grant_row.authority_record_set_sha256 = NEW.authority_record_set_sha256
                  AND grant_row.authority_record_count = NEW.authority_record_count
                  AND grant_row.selected_record_index = NEW.selected_record_index
                  AND grant_row.parent_link_receipt_id IS NEW.parent_link_receipt_id
                  AND grant_row.action = CASE NEW.event_kind
                      WHEN 'link_authority' THEN 'link'
                      WHEN 'attachment_projection' THEN 'project'
                      WHEN 'unlink_revocation' THEN 'unlink'
                  END
            ) THEN RAISE(ABORT, 'spoke_attachment_receipt_grant_binding_invalid') END;
        END;

        DROP TRIGGER IF EXISTS hall_spoke_attachment_receipt_parent_link;

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_receipt_parent_link
        BEFORE INSERT ON hall_spoke_attachment_receipts
        WHEN NEW.parent_link_receipt_id IS NOT NULL
        BEGIN
            SELECT CASE WHEN NOT EXISTS (
                SELECT 1 FROM hall_spoke_attachment_receipts parent
                WHERE parent.receipt_id = NEW.parent_link_receipt_id
                  AND parent.event_kind = 'link_authority'
                  AND parent.hub_repo_id = NEW.hub_repo_id
                  AND parent.slug = NEW.slug
                  AND parent.root_path_sha256 = NEW.root_path_sha256
                  AND parent.root_sha256 = NEW.root_sha256
                  AND parent.policy_sha256 = NEW.policy_sha256
                  AND parent.policy_path_sha256 = NEW.policy_path_sha256
                  AND parent.root_identity_sha256 = NEW.root_identity_sha256
                  AND parent.root_device = NEW.root_device
                  AND parent.root_inode = NEW.root_inode
                  AND parent.root_size = NEW.root_size
                  AND parent.root_mode = NEW.root_mode
            ) THEN RAISE(ABORT, 'spoke_attachment_parent_link_invalid') END;
            SELECT CASE WHEN NEW.event_kind = 'attachment_projection' AND EXISTS (
                SELECT 1 FROM hall_spoke_attachment_receipts revocation
                WHERE revocation.event_kind = 'unlink_revocation'
                  AND revocation.revokes_receipt_id = NEW.parent_link_receipt_id
            ) THEN RAISE(ABORT, 'spoke_attachment_parent_link_revoked') END;
        END;

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_grants_immutable_update
        BEFORE UPDATE ON hall_spoke_attachment_grants
        BEGIN
            SELECT RAISE(ABORT, 'spoke_attachment_grant_immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_grants_immutable_delete
        BEFORE DELETE ON hall_spoke_attachment_grants
        BEGIN
            SELECT RAISE(ABORT, 'spoke_attachment_grant_immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_receipts_immutable_update
        BEFORE UPDATE ON hall_spoke_attachment_receipts
        BEGIN
            SELECT RAISE(ABORT, 'spoke_attachment_receipt_immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS hall_spoke_attachment_receipts_immutable_delete
        BEFORE DELETE ON hall_spoke_attachment_receipts
        BEGIN
            SELECT RAISE(ABORT, 'spoke_attachment_receipt_immutable');
        END;
    `;

export function ensureSpokeAttachmentSchema(db: Database.Database): void {
    db.exec(SPOKE_ATTACHMENT_SCHEMA_SQL);
}
