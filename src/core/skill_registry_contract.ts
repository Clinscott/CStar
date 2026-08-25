export class SkillRegistryContractError extends Error {
    constructor(message: string) {
        super(`[skill-registry] ${message}`);
        this.name = 'SkillRegistryContractError';
    }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function validateSkillRegistryEntries<TEntry extends object = Record<string, unknown>>(
    entries: unknown,
    fieldName: 'entries' | 'skills' = 'entries',
): Record<string, TEntry> {
    if (!isPlainRecord(entries)) {
        throw new SkillRegistryContractError(`${fieldName} must be a plain object.`);
    }

    for (const [capabilityKey, entry] of Object.entries(entries)) {
        if (!capabilityKey.trim()) {
            throw new SkillRegistryContractError(`${fieldName} contains a blank capability key.`);
        }
        if (!isPlainRecord(entry)) {
            throw new SkillRegistryContractError(`${fieldName}.${capabilityKey} must be a plain object.`);
        }
        if (Object.prototype.hasOwnProperty.call(entry, 'id') && entry.id !== capabilityKey) {
            throw new SkillRegistryContractError(
                `${fieldName}.${capabilityKey}.id must match capability key '${capabilityKey}'.`,
            );
        }
    }

    return entries as Record<string, TEntry>;
}

export function resolveSkillRegistryEntries<TEntry extends object = Record<string, unknown>>(
    manifest: unknown,
): Record<string, TEntry> {
    if (manifest === null || manifest === undefined) {
        return {};
    }
    if (!isPlainRecord(manifest)) {
        throw new SkillRegistryContractError('manifest must be a plain object.');
    }

    if (Object.prototype.hasOwnProperty.call(manifest, 'entries')) {
        return validateSkillRegistryEntries<TEntry>(manifest.entries, 'entries');
    }
    if (Object.prototype.hasOwnProperty.call(manifest, 'skills')) {
        return validateSkillRegistryEntries<TEntry>(manifest.skills, 'skills');
    }
    return {};
}
