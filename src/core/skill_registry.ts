export interface SkillRegistryManifestLike {
    entries?: unknown;
    skills?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function isSkillRegistryEntryMap<TEntry extends object = Record<string, unknown>>(
    value: unknown,
): value is Record<string, TEntry> {
    if (!isPlainObject(value)) {
        return false;
    }

    return Object.entries(value).every(([key, entry]) => (
        key.trim().length > 0
        && isPlainObject(entry)
    ));
}

export function getSkillRegistryEntries<TEntry extends object>(
    manifest: SkillRegistryManifestLike | null | undefined,
): Record<string, TEntry> {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return {};
    }

    if (Object.prototype.hasOwnProperty.call(manifest, 'entries')) {
        return isSkillRegistryEntryMap<TEntry>(manifest.entries) ? manifest.entries : {};
    }

    return isSkillRegistryEntryMap<TEntry>(manifest.skills) ? manifest.skills : {};
}
