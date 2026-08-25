import type Database from 'better-sqlite3';

export const AUGURY_MISSION_RECEIPT_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS hall_augury_mission_receipts (
        receipt_id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        logical_repository_id TEXT NOT NULL,
        repository_root TEXT NOT NULL,
        repository_identity_sha256 TEXT NOT NULL,
        parent_bead_id TEXT NOT NULL,
        mission_decision_id TEXT NOT NULL,
        design_revision INTEGER NOT NULL CHECK(design_revision >= 1),
        design_sha256 TEXT NOT NULL,
        root_thread_id TEXT NOT NULL,
        set_turn_id TEXT NOT NULL,
        set_record_sha256 TEXT NOT NULL,
        set_record_set_sha256 TEXT NOT NULL,
        canonical_payload_sha256 TEXT NOT NULL,
        canonical_receipt_sha256 TEXT NOT NULL,
        canonical_receipt_json TEXT NOT NULL,
        ordered_plan_count INTEGER NOT NULL CHECK(ordered_plan_count >= 1),
        ordered_plan_sha256 TEXT NOT NULL,
        target_count INTEGER NOT NULL CHECK(target_count >= 1),
        dependency_count INTEGER NOT NULL CHECK(dependency_count >= 0),
        acceptance_obligation_count INTEGER NOT NULL
            CHECK(acceptance_obligation_count >= 1),
        checker_obligation_count INTEGER NOT NULL
            CHECK(checker_obligation_count >= 1),
        created_at INTEGER NOT NULL,
        UNIQUE(receipt_id, parent_bead_id),
        UNIQUE(repo_id, mission_decision_id, parent_bead_id),
        UNIQUE(repo_id, canonical_payload_sha256),
        FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
        FOREIGN KEY(parent_bead_id) REFERENCES hall_beads(bead_id)
    );

    CREATE TABLE IF NOT EXISTS hall_augury_mission_receipt_membership (
        receipt_id TEXT NOT NULL,
        bead_id TEXT NOT NULL UNIQUE,
        plan_order INTEGER NOT NULL CHECK(plan_order >= 1),
        plan_item_sha256 TEXT NOT NULL,
        plan_item_json TEXT NOT NULL,
        bead_metadata_sha256 TEXT NOT NULL,
        bead_metadata_json TEXT NOT NULL,
        bead_row_sha256 TEXT NOT NULL,
        bead_row_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(receipt_id, bead_id),
        UNIQUE(receipt_id, plan_order),
        FOREIGN KEY(receipt_id) REFERENCES hall_augury_mission_receipts(receipt_id),
        FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
    );

    CREATE TABLE IF NOT EXISTS hall_augury_mission_dependency_edges (
        receipt_id TEXT NOT NULL,
        child_bead_id TEXT NOT NULL,
        dependency_order INTEGER NOT NULL CHECK(dependency_order >= 1),
        dependency_bead_id TEXT NOT NULL,
        dependency_kind TEXT NOT NULL
            CHECK(dependency_kind IN ('parent_root', 'receipt_child')),
        parent_dependency_bead_id TEXT,
        child_dependency_bead_id TEXT,
        edge_sha256 TEXT NOT NULL,
        edge_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(receipt_id, child_bead_id, dependency_order),
        UNIQUE(receipt_id, child_bead_id, dependency_bead_id),
        CHECK(
            (
                dependency_kind = 'parent_root'
                AND parent_dependency_bead_id = dependency_bead_id
                AND child_dependency_bead_id IS NULL
            ) OR (
                dependency_kind = 'receipt_child'
                AND child_dependency_bead_id = dependency_bead_id
                AND parent_dependency_bead_id IS NULL
            )
        ),
        FOREIGN KEY(receipt_id, child_bead_id)
            REFERENCES hall_augury_mission_receipt_membership(receipt_id, bead_id),
        FOREIGN KEY(receipt_id, parent_dependency_bead_id)
            REFERENCES hall_augury_mission_receipts(receipt_id, parent_bead_id),
        FOREIGN KEY(receipt_id, child_dependency_bead_id)
            REFERENCES hall_augury_mission_receipt_membership(receipt_id, bead_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hall_augury_mission_receipts_parent
    ON hall_augury_mission_receipts(repo_id, parent_bead_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_hall_augury_mission_edges_dependency
    ON hall_augury_mission_dependency_edges(
        receipt_id, dependency_bead_id, child_bead_id
    );
`;

export function ensureAuguryMissionReceiptSchema(db: Database.Database): void {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(AUGURY_MISSION_RECEIPT_SCHEMA_SQL);
}
