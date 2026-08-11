import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_SCHEMA,
    FrozenCouncilPacket,
    MAX_JSON_FILE_BYTES,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalPrivateDirectory,
    canonicalJson,
    fail,
    readJson,
    sha256File,
} from './contracts.js';
import { verifyDecisionReceipt, type CouncilDecision } from './decision.js';
import { verifyPacketTrust } from './execution_trust.js';
import { verifyFrozenPacket, verifyFrozenPacketStructure } from './packet.js';
import {
    verifyFrozenRatings,
    verifyMappingReveal,
    type FrozenMappingReveal,
    type FrozenRatings,
} from './rating.js';
import {
    verifyPublication,
    verifyPublicationReceiptStructure,
    type PublicationReceipt,
} from './publication.js';
import {
    verifyRepositoryLeaseRecordStructure,
    type RepositoryLeaseRecord,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    closeOwnedPrivateFile,
    openPrivateJson,
} from './repository_private_file.js';
import { physicalReceiptPresent, receiptPairState } from './receipt_seal.js';

export type CouncilRunPhase =
    | 'NEW'
    | 'LEASED'
    | 'PACKET_FROZEN'
    | 'RATINGS_FROZEN'
    | 'MAPPING_REVEALED'
    | 'DECIDED'
    | 'PAUSED';

const receiptNames = {
    lease: '00-source-lease.json',
    packet: '10-packet.json',
    ratings: '20-ratings.json',
    reveal: '25-mapping-reveal.json',
    decision: '30-decision.json',
    publication: '40-publication.json',
} as const;

export type CouncilReceiptPaths = Record<keyof typeof receiptNames, string>;

function runDirectory(controlRootInput: string, runId: string): string {
    assertRunId(runId);
    return path.join(canonicalPrivateDirectory(controlRootInput, 'control root'), 'council-autoresearch', runId);
}

export function coordinatorReceiptPaths(controlRoot: string, runId: string): CouncilReceiptPaths {
    const root = runDirectory(controlRoot, runId);
    return Object.fromEntries(
        Object.entries(receiptNames).map(([key, name]) => [key, path.join(root, name)]),
    ) as CouncilReceiptPaths;
}

export function preregisteredPublicationSubject(
    controlRoot: string,
    runId: string,
): FrozenCouncilPacket['publication_subject'] {
    const packet = readJson<FrozenCouncilPacket>(coordinatorReceiptPaths(controlRoot, runId).packet);
    verifyFrozenPacketStructure(packet);
    return packet.publication_subject;
}

export function validatePublicationSubject(
    packet: FrozenCouncilPacket,
    publication: PublicationReceipt,
    files: CouncilReceiptPaths,
): void {
    if (publication.repository !== packet.publication_subject.repository
        || publication.repository_url !== packet.publication_subject.repository_url
        || publication.branch !== packet.publication_subject.branch
        || canonicalJson(Object.keys(publication.required_files).sort())
            !== canonicalJson([...packet.publication_subject.required_paths].sort())) {
        fail('publication receipt does not match the preregistered subject');
    }
    const receiptFiles = {
        packet: files.packet,
        ratings: files.ratings,
        reveal: files.reveal,
        decision: files.decision,
    } as const;
    for (const [role, receiptFile] of Object.entries(receiptFiles)) {
        const publishedPath = packet.publication_subject.receipt_paths[
            role as keyof typeof packet.publication_subject.receipt_paths
        ];
        if (publication.required_files[publishedPath] !== sha256File(receiptFile)) {
            fail(`publication ${role} path does not bind its generation receipt`);
        }
    }
}

function receiptExists(file: string): boolean {
    try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail(`invalid receipt file: ${file}`);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

function receiptBodyAbsent(file: string): boolean {
    if (receiptExists(file)) return false;
    if (!physicalReceiptPresent(file)) return true;
    receiptPairState(file);
    return fail('receipt namespace changed while checking for a seal-only artifact');
}

function validateExperimentClaim(controlRoot: string, packet: FrozenCouncilPacket): void {
    const claimFile = path.join(
        path.resolve(controlRoot),
        'council-autoresearch',
        'experiments',
        `${packet.experiment_sha256}.json`,
    );
    if (!receiptExists(claimFile)) fail('experiment claim is missing for the frozen packet');
    const claim = readJson<Record<string, unknown>>(claimFile);
    assertExactObjectKeys(claim, [
        'schema_version', 'experiment_sha256', 'run_id', 'packet_sha256',
    ], 'experiment claim');
    if (claim.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || claim.experiment_sha256 !== packet.experiment_sha256
        || claim.run_id !== packet.run_id
        || claim.packet_sha256 !== packet.packet_sha256) {
        fail('experiment claim does not bind the frozen packet');
    }
    assertSha256(claim.experiment_sha256, 'experiment claim identity');
    assertSha256(claim.packet_sha256, 'experiment claim packet hash');
}

function validateLeaseReceipt(record: RepositoryLeaseRecord, controlRoot: string, runId: string): void {
    verifyRepositoryLeaseRecordStructure(record, 'source lease receipt');
    if (record.run_id !== runId
        || record.control_root !== canonicalPrivateDirectory(controlRoot, 'control root')
        || !/^[a-f0-9]{40}$/.test(record.source_head)) fail('source lease receipt identity is invalid');
}

function assertNoReceiptGap(files: CouncilReceiptPaths, last: keyof typeof receiptNames): void {
    const ordered = Object.keys(receiptNames) as Array<keyof typeof receiptNames>;
    const lastIndex = ordered.indexOf(last);
    for (let index = lastIndex + 1; index < ordered.length; index += 1) {
        if (physicalReceiptPresent(files[ordered[index]])) {
            fail('receipt chain contains an out-of-order suffix');
        }
    }
}

export function councilRunStatus(input: {
    controlRoot: string;
    runId: string;
    bundleRoot?: string;
    runnerPublicationRepoRoot?: string;
    publicationRepoRoot?: string;
}): CouncilRunPhase {
    const files = coordinatorReceiptPaths(input.controlRoot, input.runId);
    if (!physicalReceiptPresent(files.lease)) {
        assertNoReceiptGap(files, 'lease');
        return 'NEW';
    }
    if (!receiptExists(files.lease)) {
        receiptPairState(files.lease);
        return fail('source lease seal exists without its body');
    }
    const openedLease = openPrivateJson<RepositoryLeaseRecord>(
        files.lease,
        path.dirname(files.lease),
        'source lease receipt',
        MAX_JSON_FILE_BYTES,
    );
    let lease: RepositoryLeaseRecord;
    let leaseState: ReturnType<typeof receiptPairState>;
    try {
        lease = openedLease.record;
        validateLeaseReceipt(lease, input.controlRoot, input.runId);
        leaseState = receiptPairState(files.lease, lease);
        assertOwnedPrivateFile(openedLease, 'source lease receipt');
    } finally {
        closeOwnedPrivateFile(openedLease, 'source lease receipt');
    }
    if (leaseState === 'body-only') {
        assertNoReceiptGap(files, 'lease');
        return 'NEW';
    }
    if (receiptBodyAbsent(files.packet)) {
        assertNoReceiptGap(files, 'packet');
        return 'LEASED';
    }
    if (!input.bundleRoot || !input.runnerPublicationRepoRoot) {
        fail('bundle and runner publication roots are required to validate a frozen packet');
    }
    const packet = readJson<FrozenCouncilPacket>(files.packet);
    verifyFrozenPacketStructure(packet);
    const trustPolicy = verifyPacketTrust(packet, input.controlRoot);
    verifyFrozenPacket(packet, input.bundleRoot, input.runnerPublicationRepoRoot);
    if (packet.run_id !== input.runId
        || packet.source_head !== lease.source_head
        || packet.source_manifest_sha256 !== lease.source_manifest.manifest_sha256
        || canonicalJson(packet.governed_paths) !== canonicalJson(lease.governed_paths)) {
        fail('packet does not bind the source lease');
    }
    validateExperimentClaim(input.controlRoot, packet);
    if (receiptBodyAbsent(files.ratings)) {
        assertNoReceiptGap(files, 'ratings');
        return 'PACKET_FROZEN';
    }
    const ratings = readJson<FrozenRatings>(files.ratings);
    verifyFrozenRatings(packet, ratings, input.bundleRoot, trustPolicy);
    if (receiptBodyAbsent(files.reveal)) {
        assertNoReceiptGap(files, 'reveal');
        return 'RATINGS_FROZEN';
    }
    const reveal = readJson<FrozenMappingReveal>(files.reveal);
    verifyMappingReveal(packet, ratings, reveal);
    if (receiptBodyAbsent(files.decision)) {
        assertNoReceiptGap(files, 'decision');
        return 'MAPPING_REVEALED';
    }
    const decision = readJson<CouncilDecision>(files.decision);
    verifyDecisionReceipt({
        decision,
        packet,
        ratings,
        reveal,
        bundleRoot: input.bundleRoot,
        runnerPublicationRepoRoot: input.runnerPublicationRepoRoot,
        trustPolicy,
    });
    if (receiptBodyAbsent(files.publication)) return 'DECIDED';
    const publication = readJson<PublicationReceipt>(files.publication);
    verifyPublicationReceiptStructure(publication);
    if (publication.run_id !== input.runId
        || publication.packet_sha256 !== packet.packet_sha256
        || publication.ratings_sha256 !== ratings.ratings_sha256
        || publication.mapping_reveal_sha256 !== reveal.reveal_sha256
        || publication.decision_sha256 !== decision.decision_sha256) {
        fail('publication receipt does not bind the valid receipt prefix');
    }
    validatePublicationSubject(packet, publication, files);
    if (!input.publicationRepoRoot) return 'DECIDED';
    const verified = verifyPublication({
        repoRoot: input.publicationRepoRoot,
        runId: publication.run_id,
        packetSha256: publication.packet_sha256,
        ratingsSha256: publication.ratings_sha256,
        mappingRevealSha256: publication.mapping_reveal_sha256,
        decisionSha256: publication.decision_sha256,
        repository: publication.repository,
        expectedRepositoryUrl: packet.publication_subject.repository_url,
        branch: publication.branch,
        commit: publication.commit,
        requiredFiles: publication.required_files,
    });
    if (canonicalJson(verified) !== canonicalJson(publication)) fail('publication remote verification changed');
    return 'PAUSED';
}
