import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
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
    releaseCouncilRun,
    releaseRepositoryLease,
    receiptSealPath,
    sha256,
    sha256File,
    stageFrozenFile,
    verifyArtifactManifest,
    verifyPublication,
    verifyRepositoryLease,
    withRepositoryLeaseOperation,
    writeImmutableFile,
    writeImmutableJson,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture,
    cleanup,
    git,
    repository,
    resumeToken,
    signedRatings,
    temporary,
} from './test_helpers.js';

afterEach(cleanup);

describe('Council autoresearch source lease and artifact manifests', () => {
    it('keeps an acquired lock when contenders and wrong-root tokens fail', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('source-lease-primary');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
            resumeToken: token,
        });
        assert.throws(() => acquireRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-contender-'),
            runId: 'council-test-run-2',
            governedPaths: ['src'],
            resumeToken: resumeToken('source-lease-contender'),
        }), /EEXIST|exist|lock|different acquisition/i);
        assert.doesNotThrow(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }));
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo,
            controlRoot: temporary('cstar-council-wrong-control-'),
            runId: lease.record.run_id,
            resumeToken: token,
        }), /identity|control/i);
        assert.throws(() => releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: 'f'.repeat(64), disposition: 'abandoned',
        }), /identity|token/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'drift\n');
        assert.throws(() => verifyRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }), /uncommitted|mismatch/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: token, disposition: 'abandoned',
        });
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

        const immutable = path.join(root, 'mode-bound.bin');
        writeImmutableFile(immutable, Buffer.from('mode-bound\n'), 0o640);
        assert.equal(fs.statSync(immutable).mode & 0o777, 0o640);
        assert.throws(() => writeImmutableFile(immutable, Buffer.from('mode-bound\n'), 0o600), /conflicts/i);
    });

    it('stages one contained inode without following final or intermediate links', () => {
        const source = temporary('cstar-council-stage-source-');
        const destination = path.join(temporary('cstar-council-stage-destination-'), 'bundle');
        fs.mkdirSync(path.join(source, 'real'));
        const file = path.join(source, 'real/content.txt');
        fs.writeFileSync(file, 'frozen bytes\n');
        fs.chmodSync(file, 0o640);
        const expectation = { sha256: sha256('frozen bytes\n'), bytes: 13, mode: 0o640 };
        stageFrozenFile(source, destination, 'real/content.txt', expectation);
        assert.equal(fs.readFileSync(path.join(destination, 'real/content.txt'), 'utf8'), 'frozen bytes\n');
        assert.equal(fs.statSync(path.join(destination, 'real/content.txt')).mode & 0o777, 0o640);

        fs.symlinkSync('real/content.txt', path.join(source, 'final-link.txt'));
        assert.throws(() => stageFrozenFile(
            source, destination, 'final-link.txt', expectation,
        ), /symbolic link/i);
        fs.symlinkSync('real', path.join(source, 'parent-link'));
        assert.throws(() => stageFrozenFile(
            source, destination, 'parent-link/content.txt', expectation,
        ), /symbolic link|not a real directory/i);

        const drifting = path.join(source, 'real/drifting.txt');
        fs.writeFileSync(drifting, 'expected bytes\n');
        fs.chmodSync(drifting, 0o644);
        const driftExpectation = { sha256: sha256('expected bytes\n'), bytes: 15, mode: 0o644 };
        fs.writeFileSync(drifting, 'drifted bytes\n');
        assert.throws(() => stageFrozenFile(
            source, destination, 'real/drifting.txt', driftExpectation,
        ), /changed before immutable staging/i);
        assert.equal(fs.existsSync(path.join(destination, 'real/drifting.txt')), false);
    });

    it('does not commit a prepared receipt after governed source drifts', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('post-operation-source-attestation');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
            resumeToken: token,
        });
        const target = path.join(control, 'council-autoresearch', lease.record.run_id, '10-packet.json');
        assert.throws(() => withRepositoryLeaseOperation({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id, resumeToken: token,
        }, target, () => {
            fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'drift during preparation\n');
            return () => writeImmutableJson(target, { committed: true });
        }), /uncommitted|attestation/i);
        assert.equal(fs.existsSync(target), false);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        releaseRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: lease.record.run_id,
            resumeToken: token, disposition: 'abandoned',
        });
    });
});

describe('Council autoresearch signed generation lifecycle', () => {
    it('evaluates signed ratings as advisory evidence and vetoes a protected regression', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const acceptedRatings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        const reveal = freezeMappingReveal(packet, acceptedRatings, fixture.mapping);
        const accepted = evaluateCouncilRatings(packet, acceptedRatings, reveal, fixture.bundle);
        assert.equal(accepted.verdict, 'ACCEPTED');
        assert.equal(accepted.advisory_outcome_only, true);
        assert.equal(accepted.promotion_authorized, false);
        assert.match(accepted.method_limitations.join(' '), /not established independent Bernoulli/i);

        const tiedRatings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'tie');
        const tied = evaluateCouncilRatings(
            packet, tiedRatings, freezeMappingReveal(packet, tiedRatings, fixture.mapping), fixture.bundle,
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
        );
        assert.equal(protectedDecision.verdict, 'REJECTED_PROTECTED_AXIS');
    });

    it('recovers one immutable decision and pauses only after remote verification', () => {
        const source = repository();
        const control = temporary('cstar-council-control-');
        const token = resumeToken('generation-lifecycle');
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
            resumeToken: token,
        });
        const fixture = bundleFixture();
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const packet = freezeCouncilPacket(fixture.packetInput);
        const common = {
            repoRoot: source, controlRoot: control, runId: packet.run_id, resumeToken: token,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        };
        persistFrozenPacket({ ...common, bundleRoot: fixture.bundle, packet });
        const ratings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        persistFrozenRatings({ ...common, bundleRoot: fixture.bundle, ratings });
        const persistedReveal = persistMappingReveal({
            ...common, bundleRoot: fixture.bundle, mappingReveal: fixture.mapping,
        });
        assert.throws(() => persistFirstDecision({
            ...common, bundleRoot: fixture.bundle, failAfterWrite: true,
        }), /injected failure/i);
        const decisionFile = path.join(control, 'council-autoresearch', packet.run_id, '30-decision.json');
        assert.equal(fs.existsSync(decisionFile), true);
        assert.equal(fs.existsSync(receiptSealPath(decisionFile)), false);
        assert.equal(councilRunStatus({
            controlRoot: control, runId: packet.run_id, bundleRoot: fixture.bundle,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        }), 'MAPPING_REVEALED');
        const replay = persistFirstDecision({ ...common, bundleRoot: fixture.bundle });
        assert.equal(replay.created, false);
        assert.equal(fs.existsSync(receiptSealPath(decisionFile)), true);

        const publication = temporary('cstar-council-publication-');
        const bare = temporary('cstar-council-remote-');
        git(bare, ['init', '--bare']);
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
        const packetResult = path.join(publication, 'results', 'packet.json');
        const decisionResult = path.join(publication, 'results', 'decision.json');
        const packetContent = fs.readFileSync(packetResult);
        const decisionContent = fs.readFileSync(decisionResult);
        fs.writeFileSync(packetResult, decisionContent);
        fs.writeFileSync(decisionResult, packetContent);
        git(publication, ['add', 'results']);
        git(publication, ['commit', '-m', 'publish path-swapped experiment']);
        git(publication, ['remote', 'add', 'origin', bare]);
        git(publication, ['push', '-u', 'origin', 'main']);
        const resultFiles = ['packet.json', 'ratings.json', 'mapping-reveal.json', 'decision.json'];
        const resultDigests = () => Object.fromEntries(resultFiles.map(
            (file) => [`results/${file}`, sha256File(path.join(publication, 'results', file))],
        ));
        const swappedReceipt = verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: persistedReveal.reveal.reveal_sha256,
            decisionSha256: replay.decision.decision_sha256,
            repository: 'origin', branch: 'main', commit: git(publication, ['rev-parse', 'HEAD']),
            requiredFiles: resultDigests(),
        });
        assert.throws(() => persistPublicationReceipt({
            ...common, bundleRoot: fixture.bundle, publicationRepoRoot: publication, receipt: swappedReceipt,
        }), /packet receipt path/i);

        fs.writeFileSync(packetResult, packetContent);
        fs.writeFileSync(decisionResult, decisionContent);
        git(publication, ['add', 'results']);
        git(publication, ['commit', '-m', 'publish experiment']);
        git(publication, ['push', 'origin', 'main']);
        const commit = git(publication, ['rev-parse', 'HEAD']);
        const requiredFiles = resultDigests();
        const receipt = verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: persistedReveal.reveal.reveal_sha256,
            decisionSha256: replay.decision.decision_sha256,
            repository: 'origin', branch: 'main', commit, requiredFiles,
        });
        persistPublicationReceipt({
            ...common, bundleRoot: fixture.bundle, publicationRepoRoot: publication, receipt,
        });
        assert.equal(councilRunStatus({
            controlRoot: control, runId: packet.run_id, bundleRoot: fixture.bundle,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        }), 'PAUSED');
        assert.equal(councilRunStatus({
            controlRoot: control,
            runId: packet.run_id,
            bundleRoot: fixture.bundle,
            publicationRepoRoot: publication,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        }), 'PAUSED');
        assert.throws(() => verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: persistedReveal.reveal.reveal_sha256,
            decisionSha256: replay.decision.decision_sha256,
            repository: 'origin', branch: 'main', commit: 'f'.repeat(40), requiredFiles,
        }), /remote branch/i);
        releaseCouncilRun({ ...common, bundleRoot: fixture.bundle, disposition: 'completed' });
        assert.equal(councilRunStatus({
            controlRoot: control, runId: packet.run_id, bundleRoot: fixture.bundle,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        }), 'RELEASED');
    });
});
