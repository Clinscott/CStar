import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { resolveValidationEvidenceRoot } from '../../../src/tools/cstar-kernel-mcp/contracts/validation_evidence_root.js';

function normalizedRoot(root: string): string {
    return normalizeHallPath(path.resolve(normalizeHallPath(root.trim())));
}

function repositoryId(root: string): string {
    return buildHallRepositoryId(normalizedRoot(root));
}

describe('resolveValidationEvidenceRoot', () => {
    it('uses the nested code worktree for a hub repository bound to the control root', () => {
        const controlRoot = '/__cstar_validation_evidence_root__/control';
        const codeRoot = `${controlRoot}/CStar/work/pr-worktrees/hub-luna`;
        assert.equal(
            resolveValidationEvidenceRoot(repositoryId(controlRoot), `${controlRoot}/`, codeRoot, controlRoot),
            normalizedRoot(codeRoot),
        );
    });

    it('uses the registered spoke root when it differs from the control root', () => {
        const repositoryRoot = '/__cstar_validation_evidence_root__/spoke';
        const codeRoot = '/__cstar_validation_evidence_root__/CStar/worktree';
        const controlRoot = '/__cstar_validation_evidence_root__/control';
        assert.equal(
            resolveValidationEvidenceRoot(repositoryId(repositoryRoot), repositoryRoot, codeRoot, controlRoot),
            normalizedRoot(repositoryRoot),
        );
    });

    it('rejects a repository id that is not bound to the repository root', () => {
        assert.throws(
            () => resolveValidationEvidenceRoot(
                repositoryId('/__cstar_validation_evidence_root__/other'),
                '/__cstar_validation_evidence_root__/spoke',
                '/__cstar_validation_evidence_root__/code',
                '/__cstar_validation_evidence_root__/control',
            ),
            /validation_repository_binding_mismatch/,
        );
    });

    it('rejects empty repository, code, control, and repository-id inputs', () => {
        const repositoryRoot = '/__cstar_validation_evidence_root__/spoke';
        const codeRoot = '/__cstar_validation_evidence_root__/code';
        const controlRoot = '/__cstar_validation_evidence_root__/control';
        assert.throws(
            () => resolveValidationEvidenceRoot(repositoryId(repositoryRoot), '  ', codeRoot, controlRoot),
            /validation_repository_root_empty/,
        );
        assert.throws(
            () => resolveValidationEvidenceRoot(repositoryId(repositoryRoot), repositoryRoot, '\t', controlRoot),
            /validation_code_root_empty/,
        );
        assert.throws(
            () => resolveValidationEvidenceRoot(repositoryId(repositoryRoot), repositoryRoot, codeRoot, '  '),
            /validation_control_root_empty/,
        );
        assert.throws(
            () => resolveValidationEvidenceRoot('  ', repositoryRoot, codeRoot, controlRoot),
            /validation_repository_id_empty/,
        );
    });

    it('normalizes Windows separators before resolving roots', () => {
        const controlRoot = '/__cstar_validation_evidence_root__/control';
        const codeRoot = `${controlRoot}/CStar/work/pr-worktrees/windows-seam`;
        const windowsControlRoot = controlRoot.replaceAll('/', '\\');
        const windowsCodeRoot = codeRoot.replaceAll('/', '\\');
        assert.equal(
            resolveValidationEvidenceRoot(
                repositoryId(controlRoot),
                `  ${windowsControlRoot}\\`,
                ` ${windowsCodeRoot} `,
                windowsControlRoot,
            ),
            normalizedRoot(codeRoot),
        );
    });

    it('does not require roots to exist or derive them from the current working directory', () => {
        const repositoryRoot = '/__cstar_validation_evidence_root__/missing/spoke';
        const codeRoot = '/__cstar_validation_evidence_root__/missing/code';
        const controlRoot = '/__cstar_validation_evidence_root__/missing/control';
        assert.equal(
            resolveValidationEvidenceRoot(repositoryId(repositoryRoot), repositoryRoot, codeRoot, controlRoot),
            normalizedRoot(repositoryRoot),
        );
    });
});
