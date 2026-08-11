import path from 'node:path';

import {
    BlindMappingReveal,
    COUNCIL_AUTORESEARCH_SCHEMA,
    FrozenCouncilPacket,
    canonicalPrivateDirectory,
    canonicalJson,
    fail,
    readJson,
    writeImmutableJson,
} from './contracts.js';
import { verifyFrozenPacket, verifyFrozenPacketStructure } from './packet.js';
import { verifyPacketTrust } from './execution_trust.js';
import { CouncilDecision, evaluateCouncilRatings } from './decision.js';
import {
    FrozenMappingReveal,
    FrozenRatings,
    freezeMappingReveal,
    verifyFrozenRatings,
} from './rating.js';
import { PublicationReceipt, verifyPublication } from './publication.js';
import { withRepositoryLeaseOperation } from './repository_lease.js';
import {
    coordinatorReceiptPaths as paths,
    councilRunStatus,
    validatePublicationSubject,
} from './coordinator_state.js';

export {
    councilRunStatus,
    preregisteredPublicationSubject,
    type CouncilRunPhase,
} from './coordinator_state.js';

type LeaseInput = { repoRoot: string; controlRoot: string; runId: string; resumeToken: string };

export function persistFrozenPacket(input: LeaseInput & {
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    packet: FrozenCouncilPacket;
}): { sha256: string; created: boolean } {
    return withRepositoryLeaseOperation(input, (lease) => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot,
            runId: input.runId,
            bundleRoot: input.bundleRoot,
            runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        });
        if (!['LEASED', 'PACKET_FROZEN'].includes(phase)) fail('packet can be frozen only after lease acquisition');
        verifyFrozenPacketStructure(input.packet);
        verifyPacketTrust(input.packet, input.controlRoot);
        verifyFrozenPacket(input.packet, input.bundleRoot, input.runnerPublicationRepoRoot);
        if (input.packet.run_id !== input.runId
            || input.packet.source_head !== lease.source_head
            || input.packet.source_manifest_sha256 !== lease.source_manifest.manifest_sha256
            || canonicalJson(input.packet.governed_paths) !== canonicalJson(lease.governed_paths)) {
            fail('packet does not match the repository lease');
        }
        const packetFile = paths(input.controlRoot, input.runId).packet;
        if (phase === 'PACKET_FROZEN') {
            const existing = readJson<FrozenCouncilPacket>(packetFile);
            if (canonicalJson(existing) !== canonicalJson(input.packet)) {
                fail('immutable packet replay conflicts with the frozen packet');
            }
        }
        const claim = path.join(
            canonicalPrivateDirectory(input.controlRoot, 'control root'),
            'council-autoresearch', 'experiments',
            `${input.packet.experiment_sha256}.json`,
        );
        writeImmutableJson(claim, {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            experiment_sha256: input.packet.experiment_sha256,
            run_id: input.runId,
            packet_sha256: input.packet.packet_sha256,
        });
        return writeImmutableJson(packetFile, input.packet);
    });
}

export function persistFrozenRatings(input: LeaseInput & {
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    ratings: FrozenRatings;
}): { sha256: string; created: boolean } {
    return withRepositoryLeaseOperation(input, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot,
            runId: input.runId,
            bundleRoot: input.bundleRoot,
            runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        });
        if (!['PACKET_FROZEN', 'RATINGS_FROZEN'].includes(phase)) fail('ratings may be frozen only before reveal');
        const packet = readJson<FrozenCouncilPacket>(paths(input.controlRoot, input.runId).packet);
        const trustPolicy = verifyPacketTrust(packet, input.controlRoot);
        verifyFrozenRatings(packet, input.ratings, input.bundleRoot, trustPolicy);
        return writeImmutableJson(paths(input.controlRoot, input.runId).ratings, input.ratings);
    });
}

export function persistMappingReveal(input: LeaseInput & {
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    mappingReveal: BlindMappingReveal;
}): { reveal: FrozenMappingReveal; created: boolean } {
    return withRepositoryLeaseOperation(input, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot,
            runId: input.runId,
            bundleRoot: input.bundleRoot,
            runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        });
        if (!['RATINGS_FROZEN', 'MAPPING_REVEALED'].includes(phase)) {
            fail('mapping may be revealed only after ratings are immutably frozen');
        }
        const files = paths(input.controlRoot, input.runId);
        const packet = readJson<FrozenCouncilPacket>(files.packet);
        const ratings = readJson<FrozenRatings>(files.ratings);
        const reveal = freezeMappingReveal(packet, ratings, input.mappingReveal);
        const persisted = writeImmutableJson(files.reveal, reveal);
        return { reveal, created: persisted.created };
    });
}

export function persistFirstDecision(input: LeaseInput & {
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    failAfterWrite?: boolean;
}): { decision: CouncilDecision; created: boolean } {
    return withRepositoryLeaseOperation(input, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot,
            runId: input.runId,
            bundleRoot: input.bundleRoot,
            runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        });
        if (!['MAPPING_REVEALED', 'DECIDED'].includes(phase)) fail('generation 1 requires a frozen reveal');
        const files = paths(input.controlRoot, input.runId);
        const packet = readJson<FrozenCouncilPacket>(files.packet);
        const trustPolicy = verifyPacketTrust(packet, input.controlRoot);
        const decision = evaluateCouncilRatings(
            packet,
            readJson<FrozenRatings>(files.ratings),
            readJson<FrozenMappingReveal>(files.reveal),
            input.bundleRoot,
            input.runnerPublicationRepoRoot,
            trustPolicy,
        );
        const persisted = writeImmutableJson(files.decision, decision);
        if (input.failAfterWrite) fail('injected failure after immutable decision write');
        return { decision, created: persisted.created };
    });
}

export function persistPublicationReceipt(input: LeaseInput & {
    bundleRoot: string;
    runnerPublicationRepoRoot: string;
    publicationRepoRoot: string;
    receipt: PublicationReceipt;
}): { sha256: string; created: boolean } {
    return withRepositoryLeaseOperation(input, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot,
            runId: input.runId,
            bundleRoot: input.bundleRoot,
            runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        });
        if (phase !== 'DECIDED') fail('publication may be recorded only after generation 1 is decided');
        const files = paths(input.controlRoot, input.runId);
        const packet = readJson<FrozenCouncilPacket>(files.packet);
        const ratings = readJson<FrozenRatings>(files.ratings);
        const reveal = readJson<FrozenMappingReveal>(files.reveal);
        const decision = readJson<CouncilDecision>(files.decision);
        if (input.receipt.run_id !== input.runId
            || input.receipt.packet_sha256 !== packet.packet_sha256
            || input.receipt.ratings_sha256 !== ratings.ratings_sha256
            || input.receipt.mapping_reveal_sha256 !== reveal.reveal_sha256
            || input.receipt.decision_sha256 !== decision.decision_sha256) {
            fail('publication receipt does not bind the completed generation');
        }
        validatePublicationSubject(packet, input.receipt, files);
        const verified = verifyPublication({
            repoRoot: input.publicationRepoRoot,
            runId: input.receipt.run_id,
            packetSha256: input.receipt.packet_sha256,
            ratingsSha256: input.receipt.ratings_sha256,
            mappingRevealSha256: input.receipt.mapping_reveal_sha256,
            decisionSha256: input.receipt.decision_sha256,
            repository: input.receipt.repository,
            expectedRepositoryUrl: packet.publication_subject.repository_url,
            branch: input.receipt.branch,
            commit: input.receipt.commit,
            requiredFiles: input.receipt.required_files,
        });
        if (canonicalJson(verified) !== canonicalJson(input.receipt)) fail('publication receipt changed during verification');
        return writeImmutableJson(files.publication, verified);
    });
}
