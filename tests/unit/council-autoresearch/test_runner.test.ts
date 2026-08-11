import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    assertCouncilRuntimePlatform,
    buildArtifactManifest,
    councilRunStatus,
    currentOperationOwner,
    evaluateCouncilRatings,
    freezeCouncilPacket,
    freezeMappingReveal,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    recoverRepositoryLeaseOperation,
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
