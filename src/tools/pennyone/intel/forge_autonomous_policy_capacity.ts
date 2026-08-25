import type Database from 'better-sqlite3';

export function assertAutonomousDispatchPolicyCapacity(args: {
    db: Database.Database;
    root_bead_id: string;
    ceiling: number | undefined;
}): void {
    const ceiling = args.ceiling;
    if (typeof ceiling !== 'number' || !Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > 4_096) {
        throw new Error('forge_autonomous_policy_capacity_invalid');
    }
    const count = Number((args.db.prepare(`
        SELECT COUNT(*) AS count FROM hall_forge_mission_grants
        WHERE root_bead_id = ?
    `).get(args.root_bead_id) as { count?: number }).count ?? 0);
    if (count >= ceiling) throw new Error('forge_autonomous_policy_capacity_exhausted');
}
