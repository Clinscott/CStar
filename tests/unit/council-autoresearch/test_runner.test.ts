import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hostname as systemHostname } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    assertCouncilRuntimePlatform,
    buildArtifactManifest,
    councilRunStatus,
    evaluateCouncilRatings,
    freezeCouncilPacket,
    freezeMappingReveal,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    releaseRepositoryLease,
    sha256,
    sha256File,
    verifyArtifactManifest,
    verifyPublication,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture,
    cleanup,
    git,
    provisionTrustPolicy,
    repository,
    signedRatings,
    temporary,
    writeJson,
} from './test_helpers.js';

afterEach(cleanup);

describe('Council autoresearch source lease and artifact manifests', () => {
    it('requires the exact worktree top-level and a trusted absolute Git executable', () => {
        const repo = repository();
        assert.throws(() => acquireRepositoryLease({
            repoRoot: path.join(repo, 'src'),
            controlRoot: temporary('cstar-council-control-'),
            runId: 'council-test-run-1',
            governedPaths: ['site.txt'],
        }), /Git worktree top-level/i);

        const fakeBin = temporary('cstar-council-fake-git-');
        const fakeGit = path.join(fakeBin, 'git');
        fs.writeFileSync(fakeGit, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
        const previousPath = process.env.PATH;
        process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
        try {
            const control = temporary('cstar-council-control-');
            const lease = acquireRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: 'council-test-run-2',
                governedPaths: ['src'],
            });
            releaseRepositoryLease({
                repoRoot: repo,
                controlRoot: control,
                runId: lease.record.run_id,
                resumeToken: lease.resume_token,
            });
        } finally {
            if (previousPath === undefined) delete process.env.PATH;
            else process.env.PATH = previousPath;
        }
    });

    it('rejects inherited Git topology overrides before lease effects', () => {
        const repo = repository();
        for (const name of ['GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
            const previous = process.env[name];
            process.env[name] = path.join(repo, `attacker-${name.toLowerCase()}`);
            try {
                assert.throws(() => acquireRepositoryLease({
                    repoRoot: repo,
                    controlRoot: temporary('cstar-council-control-'),
                    runId: `council-${name.toLowerCase()}-test`,
                    governedPaths: ['src'],
                }), new RegExp(`ambient Git topology override.*${name}`, 'i'));
            } finally {
                if (previous === undefined) delete process.env[name];
                else process.env[name] = previous;
            }
        }
    });

    it('keeps an acquired lock when contenders and wrong-root tokens fail', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-contender-'),
            runId: 'council-test-run-2',
            governedPaths: ['src'],
        }), /EEXIST|exist|lock/i);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }));
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-wrong-control-'),
            runId: lease.record.run_id,
            resumeToken: lease.resume_token,
        }), /identity|control/i);
        assert.throws(() => releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: 'wrong-token',
        }), /token/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'drift\n');
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }), /uncommitted|mismatch|differ from HEAD/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        });
    });

    it('recovers only a dead same-host operation guard bound to the active lease', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        const commonDirectory = fs.realpathSync(path.resolve(
            repo, git(repo, ['rev-parse', '--git-common-dir']),
        ));
        const guard = path.join(commonDirectory, 'cstar-council-autoresearch.lock.operation');
        const record = (pid: number) => ({
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            lease_id: lease.record.lease_id,
            run_id: lease.record.run_id,
            resume_token_sha256: sha256(lease.resume_token),
            owner: { pid, hostname: systemHostname() },
            acquired_at: new Date().toISOString(),
        });
        fs.writeFileSync(guard, `${JSON.stringify(record(process.pid), null, 2)}\n`, { mode: 0o600 });
        assert.throws(() => releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }), /operation is active/i);
        assert.equal(fs.existsSync(guard), true);
        fs.unlinkSync(guard);
        fs.writeFileSync(guard, `${JSON.stringify(record(2_147_483_647), null, 2)}\n`, { mode: 0o600 });
        assert.doesNotThrow(() => releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }));
        assert.equal(fs.existsSync(guard), false);
    });

    it('recursively binds nested files and rejects symlinks and content drift', () => {
        const root = temporary('cstar-council-manifest-');
        fs.mkdirSync(path.join(root, 'evidence', 'nested'), { recursive: true });
        fs.writeFileSync(path.join(root, 'evidence', 'nested', 'proof.bin'), Buffer.from([1, 2, 3]));
        const manifest = buildArtifactManifest({ root, rootLabel: 'evidence', includedPaths: ['evidence'] });
        assert.deepEqual(manifest.entries.map(({ path: file }) => file), ['evidence/nested/proof.bin']);
        verifyArtifactManifest(manifest, root);
        fs.writeFileSync(path.join(root, 'evidence', 'nested', 'proof.bin'), Buffer.from([1, 2, 4]));
        assert.throws(() => verifyArtifactManifest(manifest, root), /mismatch/i);
        fs.unlinkSync(path.join(root, 'evidence', 'nested', 'proof.bin'));
        fs.symlinkSync('missing', path.join(root, 'evidence', 'link'));
        assert.throws(() => buildArtifactManifest({
            root, rootLabel: 'evidence', includedPaths: ['evidence'],
        }), /symbolic link/i);
    });

    it('rejects worktree bytes hidden by assume-unchanged index flags', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        git(repo, ['update-index', '--assume-unchanged', 'src/site.txt']);
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }), /hidden or unsupported flags/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'hidden drift\n');
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        }), /hidden or unsupported flags/i);
        git(repo, ['update-index', '--no-assume-unchanged', 'src/site.txt']);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        });
    });

    it('rejects symlinked and non-private control roots before lock acquisition', () => {
        const repo = repository();
        const parent = temporary('cstar-council-control-parent-');
        const real = path.join(parent, 'real');
        const linked = path.join(parent, 'linked');
        fs.mkdirSync(real, { mode: 0o700 });
        fs.symlinkSync(real, linked);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo, controlRoot: linked, runId: 'council-test-run-1', governedPaths: ['src'],
        }), /real directory|symbolic-link/i);
        const missingBelowLink = path.join(linked, 'missing');
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: missingBelowLink,
            runId: 'council-test-run-1',
            governedPaths: ['src'],
        }), /real directory|symbolic-link/i);
        assert.equal(fs.existsSync(path.join(real, 'missing')), false);
        const publicRoot = temporary('cstar-council-public-control-');
        fs.chmodSync(publicRoot, 0o755);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo, controlRoot: publicRoot, runId: 'council-test-run-1', governedPaths: ['src'],
        }), /private real directory/i);
    });

    it('rejects a missing repository-overlapping control root without creating it', () => {
        const repo = repository();
        const invalidParent = path.join(repo, 'missing-control');
        const invalidTarget = path.join(invalidParent, 'nested');
        assert.equal(fs.existsSync(invalidParent), false);
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: invalidTarget,
            runId: 'council-test-run-1',
            governedPaths: ['src'],
        }), /must not contain or be contained/i);
        assert.equal(fs.existsSync(invalidParent), false);
    });

    it('creates a valid missing control root as private real components', () => {
        const repo = repository();
        const parent = temporary('cstar-council-missing-control-parent-');
        const first = path.join(parent, 'first');
        const control = path.join(first, 'control');
        assert.equal(fs.existsSync(first), false);
        const lease = acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: 'council-test-run-1',
            governedPaths: ['src'],
        });
        assert.equal(lease.record.control_root, fs.realpathSync(control));
        assert.equal(fs.lstatSync(first).mode & 0o077, 0);
        assert.equal(fs.lstatSync(control).mode & 0o077, 0);
        releaseRepositoryLease({
            repoRoot: repo,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: lease.resume_token,
        });
    });

    it('normalizes POSIX modes and explicitly rejects unsupported Windows execution', () => {
        const root = temporary('cstar-council-mode-');
        fs.writeFileSync(path.join(root, 'artifact.txt'), 'mode normalized\n');
        fs.chmodSync(path.join(root, 'artifact.txt'), 0o664);
        const regular = buildArtifactManifest({
            root, rootLabel: 'mode', includedPaths: ['artifact.txt'],
        });
        assert.equal(regular.entries[0].mode, 0o644);
        fs.chmodSync(path.join(root, 'artifact.txt'), 0o744);
        const executable = buildArtifactManifest({
            root, rootLabel: 'mode', includedPaths: ['artifact.txt'],
        });
        assert.equal(executable.entries[0].mode, 0o755);
        assert.throws(() => assertCouncilRuntimePlatform('win32'), /POSIX runtime/i);
    });
});

describe('Council autoresearch signed generation lifecycle', () => {
    it('evaluates signed ratings as advisory evidence and vetoes a protected regression', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const acceptedRatings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        const reveal = freezeMappingReveal(packet, acceptedRatings, fixture.mapping);
        const accepted = evaluateCouncilRatings(
            packet, acceptedRatings, reveal, fixture.bundle, fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        );
        assert.equal(accepted.verdict, 'ACCEPTED');
        assert.equal(accepted.advisory_outcome_only, true);
        assert.equal(accepted.promotion_authorized, false);
        assert.match(accepted.method_limitations.join(' '), /not established independent Bernoulli/i);

        const tiedRatings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'tie');
        const tied = evaluateCouncilRatings(
            packet, tiedRatings, freezeMappingReveal(packet, tiedRatings, fixture.mapping), fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        );
        assert.equal(tied.verdict, 'INCONCLUSIVE');
        assert.equal(tied.effective_non_tie_ratings, 0);

        const protectedRatings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B', (rating) => {
            if (rating.expert === 'torvalds') {
                rating.axis_scores.privacy.B = 2;
                rating.protected_axis_regressions.privacy = true;
            }
        });
        const protectedDecision = evaluateCouncilRatings(
            packet,
            protectedRatings,
            freezeMappingReveal(packet, protectedRatings, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        );
        assert.equal(protectedDecision.verdict, 'REJECTED_PROTECTED_AXIS');
    });

    it('uses the final bounded trajectory when an early nominal crossing reverses', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const earlyCandidate = new Set(packet.derived_order.slice(0, 9));
        const ratings = signedRatings(
            packet,
            fixture.bundle,
            fixture.privateKey,
            (expert) => earlyCandidate.has(expert) ? 'B' : 'A',
            (rating) => {
                for (const axis of packet.rating_policy.protected_axes) {
                    const scores = rating.axis_scores[axis];
                    if (scores) rating.axis_scores[axis] = { A: 3, B: 3 };
                }
            },
        );
        const reveal = freezeMappingReveal(packet, ratings, fixture.mapping);
        const decision = evaluateCouncilRatings(
            packet,
            ratings,
            reveal,
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        );
        assert.ok(decision.trajectory[8].cumulative > decision.nominal_boundaries.upper);
        assert.equal(decision.candidate_preferences, 9);
        assert.equal(decision.baseline_preferences, 10);
        assert.equal(decision.verdict, 'INCONCLUSIVE');
    });

    it('recovers one immutable decision and pauses only after remote verification', () => {
        const source = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        const fixture = bundleFixture();
        provisionTrustPolicy(control, fixture);
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const packet = freezeCouncilPacket(fixture.packetInput);
        const common = {
            repoRoot: source, controlRoot: control, runId: packet.run_id, resumeToken: lease.resume_token,
        };
        const evidence = {
            ...common,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        };
        persistFrozenPacket({ ...evidence, packet });
        const ratings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        persistFrozenRatings({ ...evidence, ratings });
        const persistedReveal = persistMappingReveal({
            ...evidence, mappingReveal: fixture.mapping,
        });
        assert.throws(() => persistFirstDecision({
            ...evidence, failAfterWrite: true,
        }), /injected failure/i);
        assert.equal(councilRunStatus({
            controlRoot: control, runId: packet.run_id, bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        }), 'DECIDED');
        const replay = persistFirstDecision(evidence);
        assert.equal(replay.created, false);

        const publication = temporary('cstar-council-publication-');
        git(publication, ['init', '-b', 'main']);
        git(publication, ['config', 'user.email', 'council@example.test']);
        git(publication, ['config', 'user.name', 'Council Test']);
        fs.mkdirSync(path.join(publication, 'results'));
        const receiptRoot = path.join(control, 'council-autoresearch', packet.run_id);
        for (const [receipt, result] of [
            ['10-packet.json', 'packet.json'],
            ['20-ratings.json', 'ratings.json'],
            ['25-mapping-reveal.json', 'mapping-reveal.json'],
            ['30-decision.json', 'decision.json'],
        ]) fs.copyFileSync(path.join(receiptRoot, receipt), path.join(publication, 'results', result));
        git(publication, ['add', 'results']);
        git(publication, ['commit', '-m', 'publish experiment']);
        git(publication, ['remote', 'add', 'origin', fixture.publicationRemote]);
        git(publication, ['push', '-u', 'origin', 'main']);
        const commit = git(publication, ['rev-parse', 'HEAD']);
        const requiredFiles = Object.fromEntries([
            'packet.json', 'ratings.json', 'mapping-reveal.json', 'decision.json',
        ].map((file) => [`results/${file}`, sha256File(path.join(publication, 'results', file))]));
        const receipt = verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: persistedReveal.reveal.reveal_sha256,
            decisionSha256: replay.decision.decision_sha256,
            repository: 'origin',
            expectedRepositoryUrl: packet.publication_subject.repository_url,
            branch: 'main', commit, requiredFiles,
        });
        persistPublicationReceipt({
            ...evidence, publicationRepoRoot: publication, receipt,
        });
        assert.equal(councilRunStatus({
            controlRoot: control, runId: packet.run_id, bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        }), 'DECIDED');
        assert.equal(councilRunStatus({
            controlRoot: control,
            runId: packet.run_id,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            publicationRepoRoot: publication,
        }), 'PAUSED');
        assert.throws(() => verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: persistedReveal.reveal.reveal_sha256,
            decisionSha256: replay.decision.decision_sha256,
            repository: 'origin',
            expectedRepositoryUrl: packet.publication_subject.repository_url,
            branch: 'main', commit: 'f'.repeat(40), requiredFiles,
        }), /remote branch/i);
        releaseRepositoryLease(common);
    });

    it('does not leave an experiment claim when a different packet conflicts with a frozen run', () => {
        const source = repository();
        const control = temporary('cstar-council-control-');
        const fixture = bundleFixture();
        provisionTrustPolicy(control, fixture);
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const first = freezeCouncilPacket(fixture.packetInput);
        const evidence = {
            repoRoot: source,
            controlRoot: control,
            runId: first.run_id,
            resumeToken: lease.resume_token,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        };
        persistFrozenPacket({ ...evidence, packet: first });

        fs.mkdirSync(path.join(fixture.bundle, 'contract-alt'));
        fs.writeFileSync(path.join(fixture.bundle, 'contract-alt', 'content.txt'), 'different contract\n');
        const alternateManifest = buildArtifactManifest({
            root: fixture.bundle,
            rootLabel: 'contract-alt',
            includedPaths: ['contract-alt'],
        });
        const alternateManifestPath = path.join(fixture.bundle, 'manifests', 'contract-alt.json');
        writeJson(alternateManifestPath, alternateManifest);
        const second = freezeCouncilPacket({
            ...fixture.packetInput,
            contractManifest: {
                path: 'manifests/contract-alt.json',
                sha256: sha256File(alternateManifestPath),
            },
        });
        assert.notEqual(second.experiment_sha256, first.experiment_sha256);
        const secondClaim = path.join(
            control, 'council-autoresearch', 'experiments', `${second.experiment_sha256}.json`,
        );
        assert.throws(() => persistFrozenPacket({ ...evidence, packet: second }), /packet replay conflicts/i);
        assert.equal(fs.existsSync(secondClaim), false);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: first.run_id, resumeToken: lease.resume_token,
        });
    });
});
