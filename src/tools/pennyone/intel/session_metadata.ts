import type {
    HallContextMetadata,
    HallPlanningSessionRecord,
    HallSkillProposalRecord,
} from '../../../types/hall.js';

function isLiveAuthorityPath(value: string | undefined): boolean {
    const normalized = (value ?? '').replace(/\\/g, '/').toLowerCase();
    return normalized.includes('/src/node/core/runtime/host_workflows/')
        || normalized.includes('/src/node/core/runtime/compat/')
        || normalized.endsWith('/.agents/skill_registry.json')
        || normalized.endsWith('/agents.qmd')
        || normalized.startsWith('src/node/core/runtime/host_workflows/')
        || normalized.startsWith('src/node/core/runtime/compat/')
        || normalized === '.agents/skill_registry.json'
        || normalized === 'agents.qmd';
}

function inferProposalAuthorityTier(
    record: Pick<HallSkillProposalRecord, 'status' | 'target_path' | 'contract_path' | 'proposal_path'>,
): HallContextMetadata['authority_tier'] {
    if (record.status === 'REJECTED' || record.status === 'SUPERSEDED') {
        return 'archive';
    }

    const paths = [record.target_path, record.contract_path, record.proposal_path];
    if (paths.some((entry) => {
        const normalized = (entry ?? '').replace(/\\/g, '/').toLowerCase();
        return normalized.includes('/docs/legacy_archive/') || normalized.startsWith('docs/legacy_archive/');
    })) {
        return 'archive';
    }

    if (paths.some((entry) => isLiveAuthorityPath(entry))) {
        return 'live_authority';
    }
    return 'reference';
}

export function normalizeSessionMetadata(record: HallPlanningSessionRecord): HallContextMetadata {
    const metadata: HallContextMetadata = { ...(record.metadata ?? {}) };
    return {
        ...metadata,
        authority_tier: metadata.authority_tier ?? 'live_authority',
        archived: typeof metadata.archived === 'boolean' ? metadata.archived : false,
    };
}

export function normalizeProposalMetadata(record: HallSkillProposalRecord): HallContextMetadata {
    const metadata: HallContextMetadata = { ...(record.metadata ?? {}) };
    const authorityTier = metadata.authority_tier ?? inferProposalAuthorityTier(record);
    return {
        ...metadata,
        authority_tier: authorityTier,
        archived: typeof metadata.archived === 'boolean'
            ? metadata.archived
            : authorityTier === 'archive',
    };
}
