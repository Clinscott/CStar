import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    CouncilRating,
    acquireRepositoryLease,
    canonicalJson,
    councilRunStatus,
    evaluateCouncilRatings,
    freezeCouncilPacket,
    freezeCouncilRatings,
    freezeMappingReveal,
    persistFirstDecision,
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    persistPublicationReceipt,
    releaseRepositoryLease,
    sha256,
    sha256File,
    verifyDecisionReceipt,
    verifyDecisionReceiptStructure,
    verifyFrozenPacket,
    verifyPublication,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture,
    cleanup,
    experts,
    git,
    repository,
    provisionTrustPolicy,
    resignRecord,
    signedRatings,
    temporary,
    writeJson,
} from './test_helpers.js';

afterEach(cleanup);

function rating(expert: string): CouncilRating {
    return {
        expert,
        preference: 'B',
        rationale: `${expert} fabricated a plausible but unauthenticated Council rationale.`,
        axis_scores: {
            truth_provenance: { A: 3, B: 4 },
            accessibility: { A: 3, B: 4 },
            privacy: { A: 3, B: 4 },
            maintainability: { A: 3, B: 4 },
        },
        protected_axis_regressions: {
            truth_provenance: false,
            accessibility: false,
            privacy: false,
            token_path_quarantine: false,
        },
    };
}

describe('Council autoresearch adversarial boundaries', () => {
    it('rejects fabricated unanimous ratings without signed host executions', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const fabricated = freezeCouncilRatings({
            run_id: packet.run_id,
            packet_sha256: packet.packet_sha256,
            ratings: experts.map((expert) => ({ rating: rating(expert) } as any)),
        });
        assert.throws(() => evaluateCouncilRatings(
            packet,
            fabricated,
            freezeMappingReveal(packet, fabricated, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /unexpected or missing fields|execution_receipt/i);
    });

    it('rejects reused invocations, input drift, output drift, and forged signatures', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);

        const reused = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        reused.ratings[1].execution_receipt.invocation_id = reused.ratings[0].execution_receipt.invocation_id;
        resignRecord(reused.ratings[1], fixture.privateKey);
        const reusedFrozen = freezeCouncilRatings({
            run_id: packet.run_id, packet_sha256: packet.packet_sha256, ratings: reused.ratings,
        });
        assert.throws(() => evaluateCouncilRatings(
            packet,
            reusedFrozen,
            freezeMappingReveal(packet, reusedFrozen, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /invocation is reused/i);

        const inputDrift = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        inputDrift.ratings[0].execution_receipt.input_binding_sha256 = 'f'.repeat(64);
        const inputFrozen = freezeCouncilRatings({
            run_id: packet.run_id, packet_sha256: packet.packet_sha256, ratings: inputDrift.ratings,
        });
        assert.throws(() => evaluateCouncilRatings(
            packet,
            inputFrozen,
            freezeMappingReveal(packet, inputFrozen, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /binding mismatch/i);

        const outputDrift = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        fs.appendFileSync(path.join(fixture.bundle, outputDrift.ratings[0].execution_receipt.output_path), '\n');
        assert.throws(() => evaluateCouncilRatings(
            packet,
            outputDrift,
            freezeMappingReveal(packet, outputDrift, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /output artifact hash mismatch/i);

        const forged = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        forged.ratings[0].execution_receipt.signature_base64 = Buffer.alloc(64).toString('base64');
        const forgedFrozen = freezeCouncilRatings({
            run_id: packet.run_id, packet_sha256: packet.packet_sha256, ratings: forged.ratings,
        });
        assert.throws(() => evaluateCouncilRatings(
            packet,
            forgedFrozen,
            freezeMappingReveal(packet, forgedFrozen, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /signature verification failed/i);
    });

    it('withholds reveal until ratings freeze and rejects schema or commitment smuggling', () => {
        const fixture = bundleFixture();
        assert.throws(() => freezeCouncilRatings({
            run_id: 'council-test-run-1',
            packet_sha256: 'f'.repeat(64),
            ratings: [],
            generation: 2,
        } as any), /unexpected or missing fields/i);
        assert.throws(() => freezeCouncilRatings({
            run_id: 'council-test-run-1',
            packet_sha256: 'f'.repeat(64),
            ratings: [],
            mapping_reveal: fixture.mapping,
        } as any), /unexpected or missing fields/i);

        const source = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
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
        assert.throws(() => persistMappingReveal({
            ...evidence, mappingReveal: fixture.mapping,
        }), /only after ratings/i);
        const signed = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        assert.throws(() => freezeMappingReveal(packet, signed, {
            A: 'candidate', B: 'baseline', nonce: fixture.mapping.nonce,
        }), /commitment/i);
        releaseRepositoryLease(common);
    });

    it('enforces canonical protocols and exact Token-Path quarantine', () => {
        const fixture = bundleFixture();
        const reusedProtocol = { ...fixture.packetInput };
        reusedProtocol.protocolPathByExpert = { ...fixture.packetInput.protocolPathByExpert };
        reusedProtocol.protocolSha256ByExpert = { ...fixture.packetInput.protocolSha256ByExpert };
        reusedProtocol.protocolPathByExpert.karpathy = reusedProtocol.protocolPathByExpert.torvalds;
        reusedProtocol.protocolSha256ByExpert.karpathy = reusedProtocol.protocolSha256ByExpert.torvalds;
        assert.throws(() => freezeCouncilPacket(reusedProtocol), /protocol.*unique/i);

        const packet = freezeCouncilPacket(fixture.packetInput);
        const tampered = structuredClone(packet) as any;
        tampered.token_path.hidden_steering = true;
        const { packet_sha256: _digest, ...base } = tampered;
        tampered.packet_sha256 = sha256(canonicalJson(base));
        assert.throws(() => verifyFrozenPacket(
            tampered, fixture.bundle, fixture.packetInput.runnerPublicationRepoRoot,
        ), /unknown or missing|unexpected/i);

        const channelDrift = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        channelDrift.ratings[0].execution_receipt.channel_attestation.token_path_read = true as false;
        resignRecord(channelDrift.ratings[0], fixture.privateKey);
        const frozen = freezeCouncilRatings({
            run_id: packet.run_id, packet_sha256: packet.packet_sha256, ratings: channelDrift.ratings,
        });
        assert.throws(() => evaluateCouncilRatings(
            packet,
            frozen,
            freezeMappingReveal(packet, frozen, fixture.mapping),
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        ), /violates quarantine/i);
    });

    it('rejects untrusted execution keys, invented contracts, and invalid nominal boundaries', () => {
        const source = repository();
        const control = temporary('cstar-council-control-');
        const trusted = bundleFixture();
        const attacker = bundleFixture();
        provisionTrustPolicy(control, trusted);
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        trusted.packetInput.sourceHead = lease.record.source_head;
        trusted.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;

        const inventedContract = {
            ...trusted.packetInput,
            contractManifest: { ...trusted.packetInput.contractManifest, sha256: 'f'.repeat(64) },
        };
        assert.throws(() => freezeCouncilPacket(inventedContract), /contract.*hash mismatch/i);

        const invalidBoundaries = {
            ...trusted.packetInput,
            ratingPolicy: {
                ...trusted.packetInput.ratingPolicy,
                nominal_alpha: 0.9,
                nominal_beta: 0.9,
            },
        };
        assert.throws(() => freezeCouncilPacket(invalidBoundaries), /alpha plus beta/i);

        const malformedAxes = structuredClone(trusted.packetInput) as any;
        malformedAxes.ratingPolicy.axes = ['truth_provenance', 7];
        assert.throws(() => freezeCouncilPacket(malformedAxes), /rating axes/i);
        const coercibleProbability = structuredClone(trusted.packetInput) as any;
        coercibleProbability.ratingPolicy.p0 = '0.5';
        assert.throws(() => freezeCouncilPacket(coercibleProbability), /finite numbers/i);

        const attackerPacket = freezeCouncilPacket({
            ...trusted.packetInput,
            executionAuthority: attacker.packetInput.executionAuthority,
        });
        const attackerRatings = signedRatings(
            attackerPacket, trusted.bundle, attacker.privateKey, 'B',
        );
        assert.throws(() => evaluateCouncilRatings(
            attackerPacket,
            attackerRatings,
            freezeMappingReveal(attackerPacket, attackerRatings, trusted.mapping),
            trusted.bundle,
            trusted.packetInput.runnerPublicationRepoRoot,
            trusted.trustPolicy,
        ), /execution authority is not trusted/i);
        assert.throws(() => persistFrozenPacket({
            repoRoot: source,
            controlRoot: control,
            runId: lease.record.run_id,
            resumeToken: lease.resume_token,
            bundleRoot: trusted.bundle,
            runnerPublicationRepoRoot: trusted.packetInput.runnerPublicationRepoRoot,
            packet: attackerPacket,
        }), /execution authority is not trusted/i);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        });
    });

    it('rejects a structurally valid self-hashed decision that disagrees with frozen evidence', () => {
        const fixture = bundleFixture();
        const packet = freezeCouncilPacket(fixture.packetInput);
        const ratings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        const reveal = freezeMappingReveal(packet, ratings, fixture.mapping);
        const decision = evaluateCouncilRatings(
            packet,
            ratings,
            reveal,
            fixture.bundle,
            fixture.packetInput.runnerPublicationRepoRoot,
            fixture.trustPolicy,
        );
        const forged = structuredClone(decision);
        forged.verdict = 'INCONCLUSIVE';
        forged.promotion_eligible = false;
        const { decision_sha256: _claimed, ...base } = forged;
        forged.decision_sha256 = sha256(canonicalJson(base));
        assert.doesNotThrow(() => verifyDecisionReceiptStructure(forged));
        assert.throws(() => verifyDecisionReceipt({
            decision: forged,
            packet,
            ratings,
            reveal,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            trustPolicy: fixture.trustPolicy,
        }), /does not match the frozen evidence/i);
    });

    it('rejects a remote-valid publication that swaps receipt roles', () => {
        const source = repository();
        const control = temporary('cstar-council-control-');
        const fixture = bundleFixture();
        provisionTrustPolicy(control, fixture);
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const packet = freezeCouncilPacket(fixture.packetInput);
        const evidence = {
            repoRoot: source,
            controlRoot: control,
            runId: packet.run_id,
            resumeToken: lease.resume_token,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        };
        persistFrozenPacket({ ...evidence, packet });
        const ratings = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        persistFrozenRatings({ ...evidence, ratings });
        const reveal = persistMappingReveal({ ...evidence, mappingReveal: fixture.mapping }).reveal;
        const decision = persistFirstDecision(evidence).decision;

        const publication = temporary('cstar-council-swapped-publication-');
        git(publication, ['init', '-b', 'main']);
        git(publication, ['config', 'user.email', 'council@example.test']);
        git(publication, ['config', 'user.name', 'Council Test']);
        fs.mkdirSync(path.join(publication, 'results'));
        const receiptRoot = path.join(control, 'council-autoresearch', packet.run_id);
        for (const [receipt, result] of [
            ['10-packet.json', 'decision.json'],
            ['20-ratings.json', 'ratings.json'],
            ['25-mapping-reveal.json', 'mapping-reveal.json'],
            ['30-decision.json', 'packet.json'],
        ]) fs.copyFileSync(path.join(receiptRoot, receipt), path.join(publication, 'results', result));
        git(publication, ['add', 'results']);
        git(publication, ['commit', '-m', 'publish semantically swapped receipts']);
        git(publication, ['remote', 'add', 'origin', fixture.publicationRemote]);
        git(publication, ['push', '-u', 'origin', 'main']);
        const requiredFiles = Object.fromEntries([
            'packet.json', 'ratings.json', 'mapping-reveal.json', 'decision.json',
        ].map((file) => [`results/${file}`, sha256File(path.join(publication, 'results', file))]));
        const receipt = verifyPublication({
            repoRoot: publication,
            runId: packet.run_id,
            packetSha256: packet.packet_sha256,
            ratingsSha256: ratings.ratings_sha256,
            mappingRevealSha256: reveal.reveal_sha256,
            decisionSha256: decision.decision_sha256,
            repository: 'origin',
            expectedRepositoryUrl: packet.publication_subject.repository_url,
            branch: 'main',
            commit: git(publication, ['rev-parse', 'HEAD']),
            requiredFiles,
        });
        assert.throws(() => persistPublicationReceipt({
            ...evidence, publicationRepoRoot: publication, receipt,
        }), /packet path does not bind/i);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: lease.record.run_id, resumeToken: lease.resume_token,
        });
    });

    it('rejects preplanted progress and a second run id for the same experiment', () => {
        const poisonedControl = temporary('cstar-council-poisoned-control-');
        writeJson(path.join(
            poisonedControl, 'council-autoresearch', 'council-test-run-1', '40-publication.json',
        ), {});
        assert.throws(() => councilRunStatus({
            controlRoot: poisonedControl, runId: 'council-test-run-1',
        }), /out-of-order/i);

        const source = repository();
        const control = temporary('cstar-council-control-');
        const fixture = bundleFixture();
        provisionTrustPolicy(control, fixture);
        const first = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
        });
        fixture.packetInput.sourceHead = first.record.source_head;
        fixture.packetInput.sourceManifestSha256 = first.record.source_manifest.manifest_sha256;
        const packetOne = freezeCouncilPacket(fixture.packetInput);
        persistFrozenPacket({
            repoRoot: source,
            controlRoot: control,
            runId: first.record.run_id,
            resumeToken: first.resume_token,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            packet: packetOne,
        });
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: first.record.run_id, resumeToken: first.resume_token,
        });

        const second = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-2', governedPaths: ['src'],
        });
        const secondInput = {
            ...fixture.packetInput,
            runId: second.record.run_id,
            sourceHead: second.record.source_head,
            sourceManifestSha256: second.record.source_manifest.manifest_sha256,
        };
        const packetTwo = freezeCouncilPacket(secondInput);
        assert.equal(packetTwo.experiment_sha256, packetOne.experiment_sha256);
        assert.throws(() => persistFrozenPacket({
            repoRoot: source,
            controlRoot: control,
            runId: second.record.run_id,
            resumeToken: second.resume_token,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            packet: packetTwo,
        }), /immutable receipt conflicts/i);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: second.record.run_id, resumeToken: second.resume_token,
        });
        fs.unlinkSync(path.join(
            control,
            'council-autoresearch',
            'experiments',
            `${packetOne.experiment_sha256}.json`,
        ));
        assert.throws(() => councilRunStatus({
            controlRoot: control,
            runId: packetOne.run_id,
            bundleRoot: fixture.bundle,
            runnerPublicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        }), /experiment claim is missing/i);
    });
});
