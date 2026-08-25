import path from 'node:path';

import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';

function normalizeRoot(value: string, label: string): string {
    const normalized = normalizeHallPath(value.trim());
    if (!normalized) throw new Error(`validation_${label}_root_empty`);
    return normalizeHallPath(path.resolve(normalized));
}

export function resolveValidationEvidenceRoot(
    repositoryId: string,
    repositoryRoot: string,
    codeRoot: string,
    controlRoot: string,
): string {
    const normalizedRepositoryId = repositoryId.trim();
    if (!normalizedRepositoryId) throw new Error('validation_repository_id_empty');
    const normalizedRepositoryRoot = normalizeRoot(repositoryRoot, 'repository');
    const normalizedCodeRoot = normalizeRoot(codeRoot, 'code');
    const normalizedControlRoot = normalizeRoot(controlRoot, 'control');
    const expectedRepositoryId = buildHallRepositoryId(normalizeHallPath(normalizedRepositoryRoot));
    if (normalizedRepositoryId !== expectedRepositoryId) {
        throw new Error('validation_repository_binding_mismatch');
    }
    return normalizedRepositoryRoot === normalizedControlRoot ? normalizedCodeRoot : normalizedRepositoryRoot;
}
