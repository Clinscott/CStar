import type Database from 'better-sqlite3';

const RETIRED_PROFILE_PERSISTENCE =
    'legacy_profile_persistence_retired_requires_supported_profile_surface';

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

export interface UpsertProfileInput {
    oauth_provider: string;
    oauth_sub: string;
    email?: string | null;
    display_name?: string | null;
    persona?: string | null;
    preferences?: Record<string, unknown>;
}

function failRetiredProfilePersistence(): never {
    throw new Error(RETIRED_PROFILE_PERSISTENCE);
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function ensureCorvusStarSchema(_db: Database.Database): never {
    return failRetiredProfilePersistence();
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function getProfile(
    _db: Database.Database,
    _provider: string,
    _sub: string,
): never {
    return failRetiredProfilePersistence();
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function getProfileByEmail(_db: Database.Database, _email: string): never {
    return failRetiredProfilePersistence();
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function upsertProfile(
    _db: Database.Database,
    _input: UpsertProfileInput,
): never {
    return failRetiredProfilePersistence();
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function setPreference(
    _db: Database.Database,
    _provider: string,
    _sub: string,
    _key: string,
    _value: unknown,
): never {
    return failRetiredProfilePersistence();
}

/** @deprecated Profile persistence has no request-scoped CStar authority surface. */
export function listSecretServices(
    _db: Database.Database,
    _provider: string,
    _sub: string,
): never {
    return failRetiredProfilePersistence();
}

/**
 * Pure compatibility formatter for synthetic data. This function performs no
 * identity lookup, Hall read, persona activation, or secret-service discovery.
 */
export function buildProfileDigest(profile: Profile, connectedServices: string[]): string {
    const services = connectedServices.length > 0 ? connectedServices.join(', ') : 'none';
    const prefsKeys = Object.keys(profile.preferences);
    const prefsSummary = prefsKeys.length > 0 ? prefsKeys.slice(0, 5).join(', ') : 'none';
    return [
        `user: ${profile.display_name ?? profile.email ?? profile.oauth_sub}`,
        `services: ${services}`,
        `prefs: ${prefsSummary}`,
    ].join(' | ').slice(0, 400);
}
