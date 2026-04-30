import type Database from 'better-sqlite3';

// @napi-rs/keyring loaded dynamically so the module is importable in environments that cannot build the native binding (e.g. lint/type-check).
// Install on each machine once with: npm i @napi-rs/keyring
type KeyringEntry = {
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): boolean;
};

type KeyringCtor = new (service: string, account: string) => KeyringEntry;

let cachedCtor: KeyringCtor | null = null;
async function loadKeyring(): Promise<KeyringCtor> {
    if (cachedCtor) {
        return cachedCtor;
    }
    const mod = await import('@napi-rs/keyring').catch((err: Error) => {
        throw new Error(
            `@napi-rs/keyring not installed. Run "npm i @napi-rs/keyring" in CStar. Underlying error: ${err.message}`,
        );
    });
    cachedCtor = (mod as { Entry: KeyringCtor }).Entry;
    return cachedCtor;
}

function keyringService(provider: string, sub: string, service: string): string {
    return `corvus-star.${provider}.${sub}.${service}`;
}

function upsertSecretRef(
    db: Database.Database,
    provider: string,
    sub: string,
    service: string,
    keyringKey: string,
    metadata: Record<string, unknown>,
): void {
    const now = Date.now();
    db.prepare(`
        INSERT INTO cs_secret_refs (oauth_provider, oauth_sub, service, keyring_key, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (oauth_provider, oauth_sub, service) DO UPDATE SET
            keyring_key = excluded.keyring_key,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
    `).run(provider, sub, service, keyringKey, JSON.stringify(metadata), now, now);
}

function deleteSecretRef(
    db: Database.Database,
    provider: string,
    sub: string,
    service: string,
): void {
    db.prepare('DELETE FROM cs_secret_refs WHERE oauth_provider = ? AND oauth_sub = ? AND service = ?')
        .run(provider, sub, service);
}

export interface StoreSecretInput {
    provider: string;
    sub: string;
    service: string;
    secret: string;
    metadata?: Record<string, unknown>;
}

export async function storeSecret(db: Database.Database, input: StoreSecretInput): Promise<void> {
    const Entry = await loadKeyring();
    const keyringKey = keyringService(input.provider, input.sub, input.service);
    const entry = new Entry(keyringKey, input.sub);
    entry.setPassword(input.secret);
    upsertSecretRef(db, input.provider, input.sub, input.service, keyringKey, input.metadata ?? {});
}

export async function deleteSecret(
    db: Database.Database,
    provider: string,
    sub: string,
    service: string,
): Promise<boolean> {
    const Entry = await loadKeyring();
    const keyringKey = keyringService(provider, sub, service);
    const entry = new Entry(keyringKey, sub);
    const deleted = entry.deletePassword();
    deleteSecretRef(db, provider, sub, service);
    return deleted;
}

// Loans a decrypted secret to a callback. The secret never returns from this function,
// so MCP tool handlers cannot accidentally echo it back to Claude. The caller gets the
// result of their operation only.
export async function useSecret<T>(
    provider: string,
    sub: string,
    service: string,
    fn: (secret: string) => Promise<T> | T,
): Promise<T> {
    const Entry = await loadKeyring();
    const keyringKey = keyringService(provider, sub, service);
    const entry = new Entry(keyringKey, sub);
    const secret = entry.getPassword();
    if (secret === null) {
        throw new Error(`No secret stored for service "${service}" under ${provider}:${sub}`);
    }
    return fn(secret);
}
