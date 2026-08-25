export const RETIRED_SYNAPSE_DB_ERROR =
    'legacy_synapse_db_writer_retired_use_cstar_kernel';

export interface SynapseRecoveryResult {
    recovered: boolean;
    backupPath?: string;
}

/** The legacy model-memory database is not a CStar lifecycle surface. */
export function ensureHealthySynapseDb(dbPath: string): SynapseRecoveryResult {
    void dbPath;
    throw new Error(RETIRED_SYNAPSE_DB_ERROR);
}
