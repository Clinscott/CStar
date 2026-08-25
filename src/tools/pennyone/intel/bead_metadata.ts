import type { HallBeadRecord, HallContextMetadata } from '../../../types/hall.js';

function inferBeadAuthorityTier(
    record: Pick<HallBeadRecord, 'target_path' | 'status'>,
): HallContextMetadata['authority_tier'] {
    const normalizedPath = (record.target_path ?? '').replace(/\\/g, '/').toLowerCase();
    if (record.status === 'ARCHIVED' || record.status === 'SUPERSEDED') {
        return 'archive';
    }
    if (normalizedPath.includes('/docs/legacy_archive/') || normalizedPath.startsWith('docs/legacy_archive/')) {
        return 'archive';
    }
    if (normalizedPath.includes('/src/node/core/runtime/host_workflows/')
        || normalizedPath.includes('/src/node/core/runtime/compat/')
        || normalizedPath.endsWith('/.agents/skill_registry.json')
        || normalizedPath.endsWith('/agents.qmd')) {
        return 'live_authority';
    }
    return 'reference';
}

export function normalizeBeadMetadata(record: HallBeadRecord): HallContextMetadata {
    const metadata: HallContextMetadata = { ...(record.metadata ?? {}) };
    const authorityTier = metadata.authority_tier ?? inferBeadAuthorityTier(record);
    return {
        ...metadata,
        authority_tier: authorityTier,
        archived: typeof metadata.archived === 'boolean'
            ? metadata.archived
            : authorityTier === 'archive',
    };
}
