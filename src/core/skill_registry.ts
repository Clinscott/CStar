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

export function isSafeSkillRegistryId(value: string): boolean {
    return /^[a-z0-9](?:[a-z0-9:_-]*[a-z0-9])?$/.test(value);
}

export function isSkillRegistryEntryMap<TEntry extends object = Record<string, unknown>>(
    value: unknown,
): value is Record<string, TEntry> {
    if (!isPlainObject(value)) {
        return false;
    }

    const normalizedIds = new Set<string>();
    return Object.entries(value).every(([key, entry]) => {
        const normalized = key.trim().toLowerCase();
        if (
            key !== normalized
            || !isSafeSkillRegistryId(key)
            || normalizedIds.has(normalized)
            || !isPlainObject(entry)
        ) {
            return false;
        }
        const declaredId = entry.id;
        if (declaredId !== undefined && declaredId !== key) {
            return false;
        }
        normalizedIds.add(normalized);
        return true;
    });
}

/**
 * Resolve the canonical capability-id keyed registry map.
 *
 * `entries` is authoritative when present, including when malformed. The
 * legacy `skills` map is read only when `entries` is absent, preventing a
 * malformed canonical map from silently activating compatibility entries.
 */
export function getSkillRegistryEntries<TEntry extends object>(
    manifest: SkillRegistryManifestLike | null | undefined,
): Record<string, TEntry> {
    if (!isPlainObject(manifest)) {
        return {};
    }
    if (Object.prototype.hasOwnProperty.call(manifest, 'entries')) {
        return isSkillRegistryEntryMap<TEntry>(manifest.entries) ? manifest.entries : {};
    }
    return isSkillRegistryEntryMap<TEntry>(manifest.skills) ? manifest.skills : {};
}
