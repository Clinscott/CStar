import type Database from 'better-sqlite3';

export interface Profile {
    oauth_provider: string;
    oauth_sub: string;
    email: string | null;
    display_name: string | null;
    persona: string | null;
    preferences: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

interface ProfileRow {
    oauth_provider: string;
    oauth_sub: string;
    email: string | null;
    display_name: string | null;
    persona: string | null;
    preferences: string;
    created_at: number;
    updated_at: number;
}

export function ensureCorvusStarSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS cs_profiles (
            oauth_provider TEXT NOT NULL,
            oauth_sub      TEXT NOT NULL,
            email          TEXT,
            display_name   TEXT,
            persona        TEXT DEFAULT 'ALFRED',
            preferences    TEXT NOT NULL DEFAULT '{}',
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            PRIMARY KEY (oauth_provider, oauth_sub)
        );

        CREATE TABLE IF NOT EXISTS cs_secret_refs (
            oauth_provider TEXT NOT NULL,
            oauth_sub      TEXT NOT NULL,
            service        TEXT NOT NULL,
            keyring_key    TEXT NOT NULL,
            metadata       TEXT NOT NULL DEFAULT '{}',
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            PRIMARY KEY (oauth_provider, oauth_sub, service)
        );

        CREATE INDEX IF NOT EXISTS idx_cs_profiles_email ON cs_profiles(email);
    `);
}

function rowToProfile(row: ProfileRow): Profile {
    let preferences: Record<string, unknown> = {};
    try {
        preferences = JSON.parse(row.preferences) as Record<string, unknown>;
    } catch {
        preferences = {};
    }
    return {
        oauth_provider: row.oauth_provider,
        oauth_sub: row.oauth_sub,
        email: row.email,
        display_name: row.display_name,
        persona: row.persona,
        preferences,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export function getProfile(
    db: Database.Database,
    provider: string,
    sub: string,
): Profile | null {
    const row = db
        .prepare('SELECT * FROM cs_profiles WHERE oauth_provider = ? AND oauth_sub = ?')
        .get(provider, sub) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
}

export function getProfileByEmail(db: Database.Database, email: string): Profile | null {
    const row = db
        .prepare('SELECT * FROM cs_profiles WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
        .get(email) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
}

export interface UpsertProfileInput {
    oauth_provider: string;
    oauth_sub: string;
    email?: string | null;
    display_name?: string | null;
    persona?: string | null;
    preferences?: Record<string, unknown>;
}

export function upsertProfile(db: Database.Database, input: UpsertProfileInput): Profile {
    const now = Date.now();
    const existing = getProfile(db, input.oauth_provider, input.oauth_sub);
    const merged: Profile = {
        oauth_provider: input.oauth_provider,
        oauth_sub: input.oauth_sub,
        email: input.email ?? existing?.email ?? null,
        display_name: input.display_name ?? existing?.display_name ?? null,
        persona: input.persona ?? existing?.persona ?? 'ALFRED',
        preferences: { ...(existing?.preferences ?? {}), ...(input.preferences ?? {}) },
        created_at: existing?.created_at ?? now,
        updated_at: now,
    };
    db.prepare(`
        INSERT INTO cs_profiles (oauth_provider, oauth_sub, email, display_name, persona, preferences, created_at, updated_at)
        VALUES (@oauth_provider, @oauth_sub, @email, @display_name, @persona, @preferences, @created_at, @updated_at)
        ON CONFLICT (oauth_provider, oauth_sub) DO UPDATE SET
            email = excluded.email,
            display_name = excluded.display_name,
            persona = excluded.persona,
            preferences = excluded.preferences,
            updated_at = excluded.updated_at
    `).run({
        ...merged,
        preferences: JSON.stringify(merged.preferences),
    });
    return merged;
}

export function setPreference(
    db: Database.Database,
    provider: string,
    sub: string,
    key: string,
    value: unknown,
): Profile {
    const existing = getProfile(db, provider, sub);
    const prefs = { ...(existing?.preferences ?? {}), [key]: value };
    return upsertProfile(db, {
        oauth_provider: provider,
        oauth_sub: sub,
        preferences: prefs,
    });
}

export function listSecretServices(
    db: Database.Database,
    provider: string,
    sub: string,
): string[] {
    const rows = db
        .prepare('SELECT service FROM cs_secret_refs WHERE oauth_provider = ? AND oauth_sub = ? ORDER BY service')
        .all(provider, sub) as Array<{ service: string }>;
    return rows.map((row) => row.service);
}

export function buildProfileDigest(profile: Profile, connectedServices: string[]): string {
    const services = connectedServices.length > 0 ? connectedServices.join(', ') : 'none';
    const prefsKeys = Object.keys(profile.preferences);
    const prefsSummary = prefsKeys.length > 0 ? prefsKeys.slice(0, 5).join(', ') : 'none';
    return [
        `user: ${profile.display_name ?? profile.email ?? profile.oauth_sub}`,
        `persona: ${profile.persona ?? 'ALFRED'}`,
        `services: ${services}`,
        `prefs: ${prefsSummary}`,
    ].join(' | ').slice(0, 400);
}
