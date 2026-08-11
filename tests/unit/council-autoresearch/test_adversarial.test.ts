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
    persistFrozenPacket,
    persistFrozenRatings,
    persistMappingReveal,
    releaseRepositoryLease,
    sha256,
    verifyFrozenPacket,
} from '../../../src/core/council_autoresearch/index.js';
import {
    bundleFixture,
    cleanup,
    experts,
    repository,
    resumeToken,
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
        ), /binding mismatch/i);

        const outputDrift = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        fs.appendFileSync(path.join(fixture.bundle, outputDrift.ratings[0].execution_receipt.output_path), '\n');
        assert.throws(() => evaluateCouncilRatings(
            packet,
            outputDrift,
            freezeMappingReveal(packet, outputDrift, fixture.mapping),
            fixture.bundle,
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
        const token = resumeToken('reveal-boundary');
        const lease = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
            resumeToken: token,
        });
        fixture.packetInput.sourceHead = lease.record.source_head;
        fixture.packetInput.sourceManifestSha256 = lease.record.source_manifest.manifest_sha256;
        const packet = freezeCouncilPacket(fixture.packetInput);
        const common = {
            repoRoot: source, controlRoot: control, runId: packet.run_id, resumeToken: token,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
        };
        persistFrozenPacket({ ...common, bundleRoot: fixture.bundle, packet });
        assert.throws(() => persistMappingReveal({
            ...common, bundleRoot: fixture.bundle, mappingReveal: fixture.mapping,
        }), /only after ratings/i);
        const signed = signedRatings(packet, fixture.bundle, fixture.privateKey, 'B');
        assert.throws(() => freezeMappingReveal(packet, signed, {
            A: 'candidate', B: 'baseline', nonce: fixture.mapping.nonce,
        }), /commitment/i);
        releaseRepositoryLease({ ...common, disposition: 'abandoned' });
    });

    it('enforces canonical protocols and exact Token-Path quarantine', () => {
        const fixture = bundleFixture();
        const reusedProtocol = { ...fixture.packetInput };
        reusedProtocol.protocolPathByExpert = { ...fixture.packetInput.protocolPathByExpert };
        reusedProtocol.protocolSha256ByExpert = { ...fixture.packetInput.protocolSha256ByExpert };
        reusedProtocol.protocolPathByExpert.karpathy = reusedProtocol.protocolPathByExpert.torvalds;
        reusedProtocol.protocolSha256ByExpert.karpathy = reusedProtocol.protocolSha256ByExpert.torvalds;
        assert.throws(() => freezeCouncilPacket(reusedProtocol), /protocol paths must be unique|unique protocol/i);

        const packet = freezeCouncilPacket(fixture.packetInput);
        const tampered = structuredClone(packet) as any;
        tampered.token_path.hidden_steering = true;
        const { packet_sha256: _digest, ...base } = tampered;
        tampered.packet_sha256 = sha256(canonicalJson(base));
        assert.throws(() => verifyFrozenPacket(tampered, fixture.bundle), /unknown or missing|unexpected/i);

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
        ), /violates quarantine/i);
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
        const firstToken = resumeToken('experiment-first');
        const first = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-1', governedPaths: ['src'],
            resumeToken: firstToken,
        });
        fixture.packetInput.sourceHead = first.record.source_head;
        fixture.packetInput.sourceManifestSha256 = first.record.source_manifest.manifest_sha256;
        const packetOne = freezeCouncilPacket(fixture.packetInput);
        persistFrozenPacket({
            repoRoot: source,
            controlRoot: control,
            runId: first.record.run_id,
            resumeToken: firstToken,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
            bundleRoot: fixture.bundle,
            packet: packetOne,
        });
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: first.record.run_id,
            resumeToken: firstToken, disposition: 'abandoned',
        });

        const secondToken = resumeToken('experiment-second');
        const second = acquireRepositoryLease({
            repoRoot: source, controlRoot: control, runId: 'council-test-run-2', governedPaths: ['src'],
            resumeToken: secondToken,
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
            resumeToken: secondToken,
            runnerExecutionRepoRoot: fixture.packetInput.runnerExecutionRepoRoot,
            bundleRoot: fixture.bundle,
            packet: packetTwo,
        }), /immutable receipt conflicts/i);
        releaseRepositoryLease({
            repoRoot: source, controlRoot: control, runId: second.record.run_id,
            resumeToken: secondToken, disposition: 'abandoned',
        });
    });
});
