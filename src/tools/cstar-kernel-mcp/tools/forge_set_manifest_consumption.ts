import type Database from 'better-sqlite3';

export interface ForgeSetConsumptionIdentity {
    thread_id: string;
    turn_id: string;
    record_sha256: string;
    record_set_sha256: string;
}

function tableExists(db: Database.Database, table: string): boolean {
    return db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).pluck().get(table) === 1;
}

function hasRow(
    db: Database.Database,
    table: string,
    where: string,
    values: unknown[],
): boolean {
    if (!tableExists(db, table)) return false;
    return db.prepare(`SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`).get(...values) !== undefined;
}

/** A root SET identity is one-shot once a kernel mission or Forge lifecycle claims it. */
export function isForgeSetIdentityConsumed(
    db: Database.Database,
    identity: ForgeSetConsumptionIdentity,
): boolean {
    if (hasRow(
        db,
        'hall_augury_mission_receipts',
        'root_thread_id = ? AND set_turn_id = ? AND set_record_sha256 = ? AND set_record_set_sha256 = ?',
        [identity.thread_id, identity.turn_id, identity.record_sha256, identity.record_set_sha256],
    )) return true;
    if (hasRow(
        db,
        'hall_forge_mission_grants',
        'root_thread_id = ? AND set_turn_id = ? AND set_record_sha256 = ? AND set_record_set_sha256 = ?',
        [identity.thread_id, identity.turn_id, identity.record_sha256, identity.record_set_sha256],
    )) return true;
    if (hasRow(
        db,
        'hall_forge_authorizations',
        'operator_thread_id = ? AND operator_turn_id = ? AND operator_record_sha256 = ? AND operator_record_set_sha256 = ?',
        [identity.thread_id, identity.turn_id, identity.record_sha256, identity.record_set_sha256],
    )) return true;
    return hasRow(
        db,
        'hall_forge_requests',
        'requester_thread_id = ? AND requester_turn_id = ? AND requester_record_set_sha256 = ?',
        [identity.thread_id, identity.turn_id, identity.record_set_sha256],
    );
}
