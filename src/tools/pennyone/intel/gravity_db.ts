const RETIRED_GRAVITY_STORE =
    'legacy_gravity_store_retired_use_cstar_kernel';

function failRetiredGravityStore(): never {
    throw new Error(RETIRED_GRAVITY_STORE);
}

/** @deprecated The detached gravity database is not a CStar authority surface. */
export function getGravityDb(): never {
    return failRetiredGravityStore();
}

/**
 * Source analysis is deterministic and does not collect Git churn, agent
 * pings, or detached cache state. Request-bound evidence may be joined later.
 */
export async function getFileGravity(_filepath: string): Promise<number> {
    return 0;
}

/** @deprecated Detached gravity mutation is retired. */
export function updateFileGravity(_filepath: string, _weight: number): never {
    return failRetiredGravityStore();
}

/** @deprecated Detached gravity mutation is retired. */
export function setFileGravity(_filepath: string, _weight: number): never {
    return failRetiredGravityStore();
}
