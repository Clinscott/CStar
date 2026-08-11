import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
    REQUIRED_RUNNER_PUBLICATION_PATHS,
    verifyRunnerPublication,
    verifyRunnerPublicationCheckpointStructure,
} from '../../../src/core/council_autoresearch/index.js';
import { bundleFixture, cleanup, git } from './test_helpers.js';

afterEach(cleanup);

describe('Council autoresearch runner publication checkpoint', () => {
    it('binds the exact executing source set and rejects subsets, extras, drift, and executable blobs', () => {
        assert.equal(REQUIRED_RUNNER_PUBLICATION_PATHS.length, 64);
        const fixture = bundleFixture();
        const checkpoint = fixture.packetInput.runnerPublication.checkpoint;
        const base = {
            repoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            repository: checkpoint.repository,
            expectedRepositoryUrl: checkpoint.repository_url,
            branch: checkpoint.branch,
            commit: checkpoint.commit,
            requiredFiles: fixture.runnerRequiredFiles,
        };

        assert.deepEqual(verifyRunnerPublication(base), checkpoint);
        assert.doesNotThrow(() => verifyRunnerPublicationCheckpointStructure(checkpoint));

        const subset = { ...fixture.runnerRequiredFiles };
        delete subset[REQUIRED_RUNNER_PUBLICATION_PATHS[0]];
        assert.throws(
            () => verifyRunnerPublication({ ...base, requiredFiles: subset }),
            /exact canonical source path set/i,
        );
        assert.throws(
            () => verifyRunnerPublication({
                ...base,
                requiredFiles: { ...fixture.runnerRequiredFiles, 'attacker-selected.txt': 'f'.repeat(64) },
            }),
            /exact canonical source path set/i,
        );

        const drifted = { ...fixture.runnerRequiredFiles };
        drifted['package.json'] = 'f'.repeat(64);
        assert.throws(
            () => verifyRunnerPublication({ ...base, requiredFiles: drifted }),
            /does not match the executing source: package\.json/i,
        );

        const executablePath = 'src/tools/council-autoresearch.ts';
        git(base.repoRoot, ['update-index', '--chmod=+x', executablePath]);
        git(base.repoRoot, ['commit', '-m', 'make canonical runner path executable']);
        git(base.repoRoot, ['push', 'origin', 'main']);
        assert.throws(
            () => verifyRunnerPublication({
                ...base,
                commit: git(base.repoRoot, ['rev-parse', 'HEAD']),
            }),
            /regular 100644 blob/i,
        );
    });
});
