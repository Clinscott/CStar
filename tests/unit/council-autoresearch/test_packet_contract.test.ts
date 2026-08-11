import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    canonicalJson,
    freezeCouncilPacket,
    persistFrozenPacket,
    releaseRepositoryLease,
    sha256,
    verifyFrozenPacket,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture, cleanup, git, repository, resumeToken, temporary,
} from './test_helpers.js';

afterEach(cleanup);

describe('Council autoresearch packet contract boundaries', () => {
    it('rejects malformed or duplicate rating-axis identifiers', () => {
        const fixture = bundleFixture();
        const base = fixture.packetInput.ratingPolicy;
        const invalidPolicies = [
            { ...base, axes: ['privacy', 7] },
            { ...base, axes: ['a'.repeat(65)] },
            {
                ...base,
                protected_axes: ['privacy', 'privacy', 'token_path_quarantine'],
            },
            {
                ...base,
                protected_axes: ['Privacy', 'token_path_quarantine'],
            },
        ];

        for (const ratingPolicy of invalidPolicies) {
            assert.throws(() => freezeCouncilPacket({
                ...fixture.packetInput,
                ratingPolicy: ratingPolicy as any,
            }), /rating_policy\.(?:axes|protected_axes).*unique lowercase identifiers/i);
        }
    });

    it('rejects runner publication path renaming even when the digest multiset matches', () => {
        const fixture = bundleFixture();
        const checkpoint = structuredClone(fixture.packetInput.runnerPublication.checkpoint);
        const digest = Object.values(checkpoint.required_files)[0];
        checkpoint.required_files = { 'renamed/content.txt': digest };
        const { checkpoint_sha256: _claimed, ...checkpointBase } = checkpoint;
        checkpoint.checkpoint_sha256 = sha256(canonicalJson(checkpointBase));

        assert.throws(() => freezeCouncilPacket({
            ...fixture.packetInput,
            runnerPublication: {
                ...fixture.packetInput.runnerPublication,
                checkpoint,
            },
        }), /path-to-digest identities/i);
    });

    it('binds the checkpoint to the clean executing checkout and resumes offline', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const executionRoot = fixture.packetInput.runnerExecutionRepoRoot;
        git(executionRoot, ['remote', 'set-url', 'origin', path.join(executionRoot, 'missing-remote')]);
        assert.doesNotThrow(() => verifyFrozenPacket(packet, fixture.bundle, executionRoot));

        git(executionRoot, ['commit', '--allow-empty', '-m', 'different executing head']);
        assert.throws(() => verifyFrozenPacket(packet, fixture.bundle, executionRoot), /executing checkout/i);
    });

    it('rejects an otherwise valid published runner when the executing checkout is dirty', () => {
        const fixture = bundleFixture();
        fs.writeFileSync(path.join(fixture.packetInput.runnerExecutionRepoRoot, 'untracked-surprise.txt'), 'drift\n');
        assert.throws(() => freezeCouncilPacket(fixture.packetInput), /uncommitted changes/i);
    });

    it('reattests the executing checkout at the exported packet persistence boundary', () => {
        const fixture = bundleFixture();
        const source = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('packet-persistence-runner-binding');
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1',
            governedPaths: ['src'], resumeToken: token,
        });
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const packet = freezeCouncilPacket(fixture.packetInput);
        const otherRunner = bundleFixture().packetInput.runnerExecutionRepoRoot;
        git(otherRunner, ['commit', '--allow-empty', '-m', 'different executing runner']);
        assert.throws(() => persistFrozenPacket({
            repoRoot: source, controlRoot: control, runId: packet.run_id, resumeToken: token,
            runnerExecutionRepoRoot: otherRunner, bundleRoot: fixture.bundle, packet,
        }), /executing checkout/i);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: packet.run_id,
            resumeToken: token, disposition: 'abandoned',
        });
    });

    it('requires unique typed publication receipt paths', () => {
        const fixture = bundleFixture();
        const subject = structuredClone(fixture.packetInput.publicationSubject);
        subject.receipt_paths.decision = subject.receipt_paths.packet;
        assert.throws(() => freezeCouncilPacket({
            ...fixture.packetInput,
            publicationSubject: subject,
        }), /receipt paths must be unique/i);
    });
});
