import type Database from 'better-sqlite3';

const RETIRED_SECRET_STORE =
    'legacy_secret_store_retired_requires_request_scoped_operator_gate';

export interface StoreSecretInput {
    provider: string;
    sub: string;
    service: string;
    secret: string;
    metadata?: Record<string, unknown>;
}

function failRetiredSecretStore(): never {
    throw new Error(RETIRED_SECRET_STORE);
}

/** @deprecated Secret storage has no request-scoped CStar authority surface. */
export async function storeSecret(
    _db: Database.Database,
    _input: StoreSecretInput,
): Promise<never> {
    return failRetiredSecretStore();
}

/** @deprecated Secret storage has no request-scoped CStar authority surface. */
export async function deleteSecret(
    _db: Database.Database,
    _provider: string,
    _sub: string,
    _service: string,
): Promise<never> {
    return failRetiredSecretStore();
}

/** @deprecated Secret loans have no request-scoped CStar authority surface. */
export async function useSecret<T>(
    _provider: string,
    _sub: string,
    _service: string,
    _fn: (secret: string) => Promise<T> | T,
): Promise<never> {
    return failRetiredSecretStore();
}
