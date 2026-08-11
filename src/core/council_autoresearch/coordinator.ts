import fs from 'node:fs';
import path from 'node:path';

import {
    BlindMappingReveal,
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    FrozenCouncilPacket,
    assertRunId,
    assertSha256,
    canonicalJson,
    fail,
    readJson,
    sha256File,
    writeImmutableJson,
} from './contracts.js';
import { stagePacketBundle, stageRatingOutputs } from './frozen_bundle.js';
import { verifyFrozenPacket, verifyFrozenPacketStructure } from './packet.js';
import {
    CouncilDecision,
    FrozenMappingReveal,
    FrozenRatings,
    evaluateCouncilRatings,
    freezeMappingReveal,
    verifyDecisionReceipt,
    verifyFrozenRatings,
    verifyMappingReveal,
} from './rating.js';
import { PublicationReceipt, verifyPublication, verifyPublicationReceiptStructure } from './publication.js';
import { physicalReceiptPresent, receiptPairState } from './receipt_seal.js';
import {
    RepositoryLeaseDisposition,
    RepositoryLeaseRecord,
    RepositoryLeaseReleaseRecord,
    releaseRepositoryLease,
    verifyRepositoryLeaseRecordStructure,
    verifyRepositoryLeaseReleaseStructure,
    withRepositoryLeaseOperation,
} from './repository_lease.js';

export type CouncilRunPhase =
    | 'NEW'
    | 'LEASED'
    | 'PACKET_FROZEN'
    | 'RATINGS_FROZEN'
    | 'MAPPING_REVEALED'
    | 'DECIDED'
    | 'PAUSED'
    | 'ABORTED'
    | 'RELEASED';

const receiptNames = {
    lease: '00-source-lease.json',
    packet: '10-packet.json',
    ratings: '20-ratings.json',
    reveal: '25-mapping-reveal.json',
    decision: '30-decision.json',
    publication: '40-publication.json',
} as const;

const releaseReceiptName = '50-source-release.json';

function runDirectory(controlRootInput: string, runId: string): string {
    assertRunId(runId);
    const requested = path.resolve(controlRootInput);
    const controlRoot = fs.realpathSync(requested);
    if (requested !== controlRoot) fail('control root must not traverse a symbolic link');
    let current = controlRoot;
    for (const segment of ['council-autoresearch', runId]) {
        current = path.join(current, segment);
        try {
            const stat = fs.lstatSync(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`invalid receipt directory: ${current}`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            break;
        }
    }
    return path.join(controlRoot, 'council-autoresearch', runId);
}

function paths(controlRoot: string, runId: string): Record<keyof typeof receiptNames, string> {
    const root = runDirectory(controlRoot, runId);
    return Object.fromEntries(
        Object.entries(receiptNames).map(([key, name]) => [key, path.join(root, name)]),
    ) as Record<keyof typeof receiptNames, string>;
}

function durableBundleRoot(controlRoot: string, runId: string): string {
    return path.join(runDirectory(controlRoot, runId), 'bundle');
}

function validationBundleRoot(controlRoot: string, runId: string, supplied?: string): string {
    const durable = durableBundleRoot(controlRoot, runId);
    try {
        const stat = fs.lstatSync(durable);
        if (stat.isSymbolicLink() || !stat.isDirectory()) fail('durable frozen bundle root is invalid');
        return fs.realpathSync(durable);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!supplied) fail('bundle root is required until the frozen bundle has been staged');
    return fs.realpathSync(supplied);
}

function validateLeaseReceipt(record: RepositoryLeaseRecord, controlRoot: string, runId: string): void {
    verifyRepositoryLeaseRecordStructure(record);
    if (record.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || record.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || record.run_id !== runId
        || record.control_root !== fs.realpathSync(controlRoot)
        || !/^[a-f0-9]{40}$/.test(record.source_head)) fail('source lease receipt identity is invalid');
    assertSha256(record.resume_token_sha256, 'resume_token_sha256');
    assertSha256(record.source_manifest?.manifest_sha256, 'source_manifest.manifest_sha256');
}

function assertNoReceiptGap(
    files: ReturnType<typeof paths>,
    last: keyof typeof receiptNames,
    includeUnsealedRelease = true,
): void {
    const ordered = Object.keys(receiptNames) as Array<keyof typeof receiptNames>;
    const lastIndex = ordered.indexOf(last);
    for (let index = lastIndex + 1; index < ordered.length; index += 1) {
        if (physicalReceiptPresent(files[ordered[index]])) fail('receipt chain contains an out-of-order suffix');
    }
    if (includeUnsealedRelease
        && physicalReceiptPresent(path.join(path.dirname(files.lease), releaseReceiptName))) {
        fail('receipt chain contains an out-of-order terminal suffix');
    }
}

function assertPublicationRoleBindings(
    packet: FrozenCouncilPacket,
    files: ReturnType<typeof paths>,
    requiredFiles: Record<string, string>,
): void {
    const roleDigests = {
        packet: sha256File(files.packet),
        ratings: sha256File(files.ratings),
        mapping_reveal: sha256File(files.reveal),
        decision: sha256File(files.decision),
    };
    for (const [role, digest] of Object.entries(roleDigests)) {
        const publishedPath = packet.publication_subject.receipt_paths[
            role as keyof typeof packet.publication_subject.receipt_paths
        ];
        if (requiredFiles[publishedPath] !== digest) {
            fail(`publication ${role} receipt path does not match its durable receipt`);
        }
    }
}

export function councilRunStatus(input: {
    controlRoot: string;
    runId: string;
    bundleRoot?: string;
    publicationRepoRoot?: string;
    runnerExecutionRepoRoot?: string;
}): CouncilRunPhase {
    const files = paths(input.controlRoot, input.runId);
    if (receiptPairState(files.lease) !== 'sealed') {
        assertNoReceiptGap(files, 'lease');
        return 'NEW';
    }
    const lease = readJson<RepositoryLeaseRecord>(files.lease);
    validateLeaseReceipt(lease, input.controlRoot, input.runId);
    receiptPairState(files.lease, lease);
    const releaseFile = path.join(runDirectory(input.controlRoot, input.runId), releaseReceiptName);
    let terminal: RepositoryLeaseReleaseRecord | undefined;
    if (receiptPairState(releaseFile, lease) === 'sealed') {
        terminal = readJson<RepositoryLeaseReleaseRecord>(releaseFile);
        verifyRepositoryLeaseReleaseStructure(terminal);
        if (terminal.run_id !== lease.run_id
            || terminal.lease_id !== lease.lease_id
            || terminal.resume_token_sha256 !== lease.resume_token_sha256) {
            fail('release receipt does not bind the source lease');
        }
        if (terminal.disposition === 'abandoned') return 'ABORTED';
    }
    if (receiptPairState(files.packet, lease) !== 'sealed') {
        if (terminal) fail('completed release is missing a packet receipt');
        assertNoReceiptGap(files, 'packet', false);
        return 'LEASED';
    }
    const bundleRoot = validationBundleRoot(input.controlRoot, input.runId, input.bundleRoot);
    const packet = readJson<FrozenCouncilPacket>(files.packet);
    if (!input.runnerExecutionRepoRoot) fail('executing runner root is required after packet freeze');
    verifyFrozenPacket(packet, bundleRoot, input.runnerExecutionRepoRoot);
    if (packet.run_id !== input.runId
        || packet.source_head !== lease.source_head
        || packet.source_manifest_sha256 !== lease.source_manifest.manifest_sha256
        || canonicalJson(packet.governed_paths) !== canonicalJson(lease.governed_paths)) {
        fail('packet does not bind the source lease');
    }
    if (receiptPairState(files.ratings, lease) !== 'sealed') {
        if (terminal) fail('completed release is missing a ratings receipt');
        assertNoReceiptGap(files, 'ratings', false);
        return 'PACKET_FROZEN';
    }
    const ratings = readJson<FrozenRatings>(files.ratings);
    verifyFrozenRatings(packet, ratings, bundleRoot);
    if (receiptPairState(files.reveal, lease) !== 'sealed') {
        if (terminal) fail('completed release is missing a mapping reveal receipt');
        assertNoReceiptGap(files, 'reveal', false);
        return 'RATINGS_FROZEN';
    }
    const reveal = readJson<FrozenMappingReveal>(files.reveal);
    verifyMappingReveal(packet, ratings, reveal);
    if (receiptPairState(files.decision, lease) !== 'sealed') {
        if (terminal) fail('completed release is missing a decision receipt');
        assertNoReceiptGap(files, 'decision', false);
        return 'MAPPING_REVEALED';
    }
    const decision = readJson<CouncilDecision>(files.decision);
    verifyDecisionReceipt(decision);
    const expectedDecision = evaluateCouncilRatings(packet, ratings, reveal, bundleRoot);
    if (canonicalJson(expectedDecision) !== canonicalJson(decision)) fail('decision does not match the frozen evidence');
    if (receiptPairState(files.publication, lease) !== 'sealed') {
        if (terminal) fail('completed release is missing a publication receipt');
        return 'DECIDED';
    }
    const publication = readJson<PublicationReceipt>(files.publication);
    verifyPublicationReceiptStructure(publication);
    if (publication.run_id !== input.runId
        || publication.packet_sha256 !== packet.packet_sha256
        || publication.ratings_sha256 !== ratings.ratings_sha256
        || publication.mapping_reveal_sha256 !== reveal.reveal_sha256
        || publication.decision_sha256 !== decision.decision_sha256) {
        fail('publication receipt does not bind the valid receipt prefix');
    }
    assertPublicationRoleBindings(packet, files, publication.required_files);
    if (input.publicationRepoRoot) {
        const verified = verifyPublication({
            repoRoot: input.publicationRepoRoot,
            runId: publication.run_id,
            packetSha256: publication.packet_sha256,
            ratingsSha256: publication.ratings_sha256,
            mappingRevealSha256: publication.mapping_reveal_sha256,
            decisionSha256: publication.decision_sha256,
            repository: publication.repository,
            branch: publication.branch,
            commit: publication.commit,
            requiredFiles: publication.required_files,
        });
        if (canonicalJson(verified) !== canonicalJson(publication)) fail('publication remote verification changed');
    }
    return terminal ? 'RELEASED' : 'PAUSED';
}

type LeaseInput = {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    resumeToken: string;
    runnerExecutionRepoRoot: string;
};

function writeRunnerBoundJson(
    file: string,
    value: unknown,
    packet: FrozenCouncilPacket,
    bundleRoot: string,
    runnerExecutionRepoRoot: string,
): { sha256: string; created: boolean } {
    const persisted = writeImmutableJson(file, value);
    verifyFrozenPacket(packet, bundleRoot, runnerExecutionRepoRoot);
    return persisted;
}

export function persistFrozenPacket(input: LeaseInput & {
    bundleRoot: string;
    packet: FrozenCouncilPacket;
}): { sha256: string; created: boolean } {
    const receiptFile = paths(input.controlRoot, input.runId).packet;
    return withRepositoryLeaseOperation(input, receiptFile, (lease) => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot, runId: input.runId, bundleRoot: input.bundleRoot,
            runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
        });
        if (!['LEASED', 'PACKET_FROZEN'].includes(phase)) fail('packet can be frozen only after lease acquisition');
        verifyFrozenPacket(input.packet, input.bundleRoot, input.runnerExecutionRepoRoot);
        if (input.packet.run_id !== input.runId
            || input.packet.source_head !== lease.source_head
            || input.packet.source_manifest_sha256 !== lease.source_manifest.manifest_sha256
            || canonicalJson(input.packet.governed_paths) !== canonicalJson(lease.governed_paths)) {
            fail('packet does not match the repository lease');
        }
        const durable = durableBundleRoot(input.controlRoot, input.runId);
        stagePacketBundle(input.packet, input.bundleRoot, durable);
        const claim = path.join(
            path.resolve(input.controlRoot), 'council-autoresearch', 'experiments',
            `${input.packet.experiment_sha256}.json`,
        );
        return () => {
            writeImmutableJson(claim, {
                schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
                experiment_sha256: input.packet.experiment_sha256,
                run_id: input.runId,
                packet_sha256: input.packet.packet_sha256,
            });
            return writeRunnerBoundJson(
                receiptFile, input.packet, input.packet, durable, input.runnerExecutionRepoRoot,
            );
        };
    });
}

export function persistFrozenRatings(input: LeaseInput & {
    bundleRoot: string;
    ratings: FrozenRatings;
}): { sha256: string; created: boolean } {
    const receiptFile = paths(input.controlRoot, input.runId).ratings;
    return withRepositoryLeaseOperation(input, receiptFile, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot, runId: input.runId, bundleRoot: input.bundleRoot,
            runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
        });
        if (!['PACKET_FROZEN', 'RATINGS_FROZEN'].includes(phase)) fail('ratings may be frozen only before reveal');
        const packet = readJson<FrozenCouncilPacket>(paths(input.controlRoot, input.runId).packet);
        const durable = validationBundleRoot(input.controlRoot, input.runId, input.bundleRoot);
        if (phase === 'PACKET_FROZEN') {
            verifyFrozenRatings(packet, input.ratings, input.bundleRoot);
            stageRatingOutputs(input.ratings, input.bundleRoot, durable);
        }
        verifyFrozenRatings(packet, input.ratings, durable);
        return () => writeRunnerBoundJson(
            receiptFile, input.ratings, packet, durable, input.runnerExecutionRepoRoot,
        );
    });
}

export function persistMappingReveal(input: LeaseInput & {
    bundleRoot: string;
    mappingReveal: BlindMappingReveal;
}): { reveal: FrozenMappingReveal; created: boolean } {
    const receiptFile = paths(input.controlRoot, input.runId).reveal;
    return withRepositoryLeaseOperation(input, receiptFile, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot, runId: input.runId, bundleRoot: input.bundleRoot,
            runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
        });
        if (!['RATINGS_FROZEN', 'MAPPING_REVEALED'].includes(phase)) {
            fail('mapping may be revealed only after ratings are immutably frozen');
        }
        const files = paths(input.controlRoot, input.runId);
        const packet = readJson<FrozenCouncilPacket>(files.packet);
        const ratings = readJson<FrozenRatings>(files.ratings);
        const durable = validationBundleRoot(input.controlRoot, input.runId, input.bundleRoot);
        const reveal = freezeMappingReveal(packet, ratings, input.mappingReveal);
        return () => {
            const persisted = writeRunnerBoundJson(
                files.reveal, reveal, packet, durable, input.runnerExecutionRepoRoot,
            );
            return { reveal, created: persisted.created };
        };
    });
}

export function persistFirstDecision(input: LeaseInput & {
    bundleRoot: string;
    failAfterWrite?: boolean;
}): { decision: CouncilDecision; created: boolean } {
    const receiptFile = paths(input.controlRoot, input.runId).decision;
    return withRepositoryLeaseOperation(input, receiptFile, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot, runId: input.runId, bundleRoot: input.bundleRoot,
            runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
        });
        if (!['MAPPING_REVEALED', 'DECIDED'].includes(phase)) fail('generation 1 requires a frozen reveal');
        const files = paths(input.controlRoot, input.runId);
        const durable = validationBundleRoot(input.controlRoot, input.runId, input.bundleRoot);
        const packet = readJson<FrozenCouncilPacket>(files.packet);
        const decision = evaluateCouncilRatings(
            packet,
            readJson<FrozenRatings>(files.ratings),
            readJson<FrozenMappingReveal>(files.reveal),
            durable,
        );
        return () => {
            const persisted = writeImmutableJson(files.decision, decision);
            if (input.failAfterWrite) fail('injected failure after immutable decision write');
            verifyFrozenPacket(packet, durable, input.runnerExecutionRepoRoot);
            return { decision, created: persisted.created };
        };
    });
}

export function persistPublicationReceipt(input: LeaseInput & {
    bundleRoot: string;
    publicationRepoRoot: string;
    receipt: PublicationReceipt;
}): { sha256: string; created: boolean } {
    const receiptFile = paths(input.controlRoot, input.runId).publication;
    return withRepositoryLeaseOperation(input, receiptFile, () => {
        const phase = councilRunStatus({
            controlRoot: input.controlRoot, runId: input.runId, bundleRoot: input.bundleRoot,
            runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
        });
        if (!['DECIDED', 'PAUSED'].includes(phase)) {
            fail('publication may be recorded only after generation 1 is decided');
        }
        const files = paths(input.controlRoot, input.runId);
        const durableBundle = validationBundleRoot(input.controlRoot, input.runId, input.bundleRoot);
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
        if (input.receipt.repository !== packet.publication_subject.repository
            || input.receipt.branch !== packet.publication_subject.branch
            || canonicalJson(Object.keys(input.receipt.required_files).sort())
                !== canonicalJson([...packet.publication_subject.required_paths].sort())) {
            fail('publication receipt does not match the preregistered subject');
        }
        assertPublicationRoleBindings(packet, files, input.receipt.required_files);
        if (phase === 'PAUSED') {
            const durable = readJson<PublicationReceipt>(files.publication);
            if (canonicalJson(durable) !== canonicalJson(input.receipt)) fail('publication replay conflicts');
            return () => writeRunnerBoundJson(
                files.publication, durable, packet, durableBundle, input.runnerExecutionRepoRoot,
            );
        }
        const verified = verifyPublication({
            repoRoot: input.publicationRepoRoot,
            runId: input.receipt.run_id,
            packetSha256: input.receipt.packet_sha256,
            ratingsSha256: input.receipt.ratings_sha256,
            mappingRevealSha256: input.receipt.mapping_reveal_sha256,
            decisionSha256: input.receipt.decision_sha256,
            repository: input.receipt.repository,
            branch: input.receipt.branch,
            commit: input.receipt.commit,
            requiredFiles: input.receipt.required_files,
        });
        if (canonicalJson(verified) !== canonicalJson(input.receipt)) fail('publication receipt changed during verification');
        return () => writeRunnerBoundJson(
            files.publication, verified, packet, durableBundle, input.runnerExecutionRepoRoot,
        );
    });
}

export function releaseCouncilRun(input: LeaseInput & {
    disposition: RepositoryLeaseDisposition;
    bundleRoot?: string;
}): ReturnType<typeof releaseRepositoryLease> {
    const phase = councilRunStatus({
        controlRoot: input.controlRoot,
        runId: input.runId,
        bundleRoot: input.bundleRoot,
        runnerExecutionRepoRoot: input.runnerExecutionRepoRoot,
    });
    if (input.disposition === 'completed' && !['PAUSED', 'RELEASED'].includes(phase)) {
        fail('completed release requires a remotely verified PAUSED run');
    }
    if (input.disposition === 'abandoned' && phase === 'RELEASED') {
        fail('a completed run cannot be replayed as abandoned');
    }
    return releaseRepositoryLease(input);
}
