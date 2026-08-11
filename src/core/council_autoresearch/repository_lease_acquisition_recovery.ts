import path from 'node:path';

import {
    assertRunId,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    sha256,
    validateDirectoryCreationTarget,
} from './contracts.js';
import { gitCommonDirectory, repositoryRoot } from './git_trust.js';
import { currentOperationOwner, operationOwnerDefinitelyDead } from './operation_identity.js';
import {
    acquireRecoveryOwner,
    claimAndRemoveOperationGuard,
    normalizeOperationGuardPublication,
    releaseRecoveryOwner,
    repositoryOperationPaths,
    selectRecoveryTarget,
} from './repository_operation_guard.js';
import {
    UUID_V4_PATTERN,
    assertAcquisitionBindsInput,
    assertResumeToken,
    operationRecoveryTarget,
    repositoryLeaseIntentFromRecord,
    validateRepositoryLeaseIntent,
    type RepositoryLeaseAcquisitionOperationRecord,
    type RepositoryLeaseIntent,
    type RepositoryLeaseRecord,
    type RepositoryOperationRecord,
    type RepositoryOperationRecovery,
    type RepositoryOperationRecoveryTarget,
} from './repository_lease_contract.js';
import { atomicPrivateTemporaryPath, optionalStat } from './repository_private_file.js';
import {
    assertNoForeignRecoveryTemporary,
    assertSameRecoveryArtifact,
    readRecoveryArtifact,
    repairRecoveryArtifact,
    type RecoveryArtifactSnapshot,
} from './repository_lease_recovery_artifact.js';
import {
    expectedReceiptSeal,
    receiptSealPath,
    validateReceiptSealStructure,
    verifyReceiptSeal,
    type ReceiptSeal,
} from './receipt_seal.js';
import {
    assertLeaseIntent,
    assertLeasePathSeparated,
    assertLeaseRecord,
    repositoryLeaseLockPathFromCommon,
    verifyLeaseSource,
    verifyRepositoryLease,
    verifySelfBoundLeaseIntent,
    type CanonicalLeaseScope,
} from './repository_lease_state.js';
import { assertGovernedPaths } from './source_attestation.js';

interface RecoveryScope extends CanonicalLeaseScope {
    governedPaths: string[];
}

interface ArtifactLocation {
    target: string;
    temporary: string;
    commonDirectory: string;
    label: string;
}

interface MatchingEvidence {
    intent?: RecoveryArtifactSnapshot<RepositoryLeaseIntent>;
    receipt?: RecoveryArtifactSnapshot<RepositoryLeaseRecord>;
    seal?: RecoveryArtifactSnapshot<ReceiptSeal>;
}

function acquisitionRecoveryScope(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    operationId: string;
    resumeToken: string;
}): RecoveryScope {
    assertRunId(input.runId);
    assertResumeToken(input.resumeToken);
    if (!UUID_V4_PATTERN.test(input.operationId)) {
        fail('repository lease acquisition recovery operation ID is invalid');
    }
    const repoRoot = repositoryRoot(input.repoRoot);
    const commonDirectory = gitCommonDirectory(repoRoot);
    const controlRoot = validateDirectoryCreationTarget(input.controlRoot, 'control root');
    assertLeasePathSeparated(controlRoot, repoRoot, commonDirectory, 'control root');
    const governedPaths = [...new Set(input.governedPaths)].sort();
    assertGovernedPaths(governedPaths);
    return { repoRoot, commonDirectory, controlRoot, governedPaths, runId: input.runId };
}

function assertDeadAcquisitionTarget(
    paths: ReturnType<typeof repositoryOperationPaths>,
    target: RepositoryOperationRecoveryTarget,
    input: Parameters<typeof assertAcquisitionBindsInput>[1],
): void {
    const current = selectRecoveryTarget(paths);
    if (current === undefined
        || canonicalJson(operationRecoveryTarget(current)) !== canonicalJson(target)) {
        fail('repository lease acquisition guard changed during recovery');
    }
    assertAcquisitionBindsInput(current.record, input);
    if (!operationOwnerDefinitelyDead(current.record.owner)) {
        fail('another repository operation is active');
    }
}

function validateRunDirectory(directory: string): void {
    if (optionalStat(directory) === undefined) return;
    if (canonicalPrivateDirectory(directory, 'receipt run directory') !== directory) {
        fail('receipt run directory changed during acquisition recovery');
    }
}

function validateMatchingIntent(
    snapshot: RecoveryArtifactSnapshot<RepositoryLeaseIntent>,
    acquisition: RepositoryLeaseAcquisitionOperationRecord,
    scope: RecoveryScope,
): void {
    validateRepositoryLeaseIntent(snapshot.record);
    assertLeaseIntent(snapshot.record, scope, acquisition.resume_token_sha256);
    if (snapshot.record.lease_id !== acquisition.lease_id
        || canonicalJson(snapshot.record.governed_paths) !== canonicalJson(scope.governedPaths)
        || sha256(canonicalJson(snapshot.record)) !== acquisition.lease_intent_sha256) {
        fail('repository source lease intent does not bind the acquisition guard');
    }
}

function validateReceipt(
    snapshot: RecoveryArtifactSnapshot<RepositoryLeaseRecord>,
    intent: RepositoryLeaseIntent,
    scope: RecoveryScope,
): void {
    assertLeaseRecord(snapshot.record, scope, intent.resume_token_sha256);
    if (canonicalJson(repositoryLeaseIntentFromRecord(snapshot.record))
        !== canonicalJson(intent)) {
        fail('repository source lease receipt does not match its intent');
    }
    verifyLeaseSource(snapshot.record);
}

function validateSeal(
    snapshot: RecoveryArtifactSnapshot<ReceiptSeal>,
    receipt: RecoveryArtifactSnapshot<RepositoryLeaseRecord>,
    receiptFile: string,
): void {
    validateReceiptSealStructure(snapshot.record);
    const expected = expectedReceiptSeal(receiptFile, receipt.record, receipt.content);
    if (canonicalJson(snapshot.record) !== canonicalJson(expected)) {
        fail('repository source lease seal does not bind the recovered body');
    }
}

function readEvidence(locations: {
    intent: ArtifactLocation;
    receipt: ArtifactLocation;
    seal: ArtifactLocation;
}): MatchingEvidence {
    return {
        intent: readRecoveryArtifact<RepositoryLeaseIntent>(locations.intent),
        receipt: readRecoveryArtifact<RepositoryLeaseRecord>(locations.receipt),
        seal: readRecoveryArtifact<ReceiptSeal>(locations.seal),
    };
}

function validateMatchingEvidence(
    evidence: MatchingEvidence,
    acquisition: RepositoryLeaseAcquisitionOperationRecord,
    scope: RecoveryScope,
    receiptFile: string,
): void {
    if (evidence.intent === undefined && (evidence.receipt || evidence.seal)) {
        fail('repository source lease evidence exists without its intent');
    }
    if (evidence.intent && evidence.intent.state !== 'complete'
        && (evidence.receipt || evidence.seal)) {
        fail('repository source lease evidence crossed an incomplete intent publication');
    }
    if (evidence.seal && !evidence.receipt) {
        fail('repository source lease seal exists without its body');
    }
    if (evidence.receipt && evidence.receipt.state !== 'complete' && evidence.seal) {
        fail('repository source lease seal crossed an incomplete body publication');
    }
    if (evidence.intent) validateMatchingIntent(evidence.intent, acquisition, scope);
    if (evidence.receipt) {
        if (!evidence.intent) fail('repository source lease receipt has no intent');
        validateReceipt(evidence.receipt, evidence.intent.record, scope);
    }
    if (evidence.seal) validateSeal(evidence.seal, evidence.receipt!, receiptFile);
}

function assertEvidenceUnchanged(
    locations: { intent: ArtifactLocation; receipt: ArtifactLocation; seal: ArtifactLocation },
    expected: MatchingEvidence,
): MatchingEvidence {
    return {
        intent: assertSameRecoveryArtifact(locations.intent, expected.intent),
        receipt: assertSameRecoveryArtifact(locations.receipt, expected.receipt),
        seal: assertSameRecoveryArtifact(locations.seal, expected.seal),
    };
}

export function recoverRepositoryLeaseAcquisition(input: {
    repoRoot: string;
    controlRoot: string;
    runId: string;
    governedPaths: string[];
    operationId: string;
    resumeToken: string;
}): RepositoryOperationRecovery {
    currentOperationOwner();
    const scope = acquisitionRecoveryScope(input);
    const paths = repositoryOperationPaths(scope.repoRoot);
    const selected = selectRecoveryTarget(paths);
    if (selected === undefined) return { recovered: false };
    const acquisition = selected.record;
    const boundInput = {
        operationId: input.operationId,
        runId: input.runId,
        repositoryRoot: scope.repoRoot,
        gitCommonDirectory: scope.commonDirectory,
        controlRoot: scope.controlRoot,
        governedPaths: scope.governedPaths,
        resumeToken: input.resumeToken,
    };
    assertAcquisitionBindsInput(acquisition, boundInput);
    if (!operationOwnerDefinitelyDead(selected.record.owner)) {
        fail('another repository operation is active');
    }
    const target = operationRecoveryTarget(selected);
    const recoveryOwner = acquireRecoveryOwner(paths, target);
    try {
        normalizeOperationGuardPublication(paths, target);
        assertDeadAcquisitionTarget(paths, target, boundInput);
        const sourceReceipt = path.join(
            scope.controlRoot,
            'council-autoresearch',
            scope.runId,
            '00-source-lease.json',
        );
        const runDirectory = path.dirname(sourceReceipt);
        const locations = {
            intent: {
                target: repositoryLeaseLockPathFromCommon(scope.commonDirectory),
                temporary: '',
                commonDirectory: scope.commonDirectory,
                label: 'repository source lease intent',
            },
            receipt: {
                target: sourceReceipt,
                temporary: '',
                commonDirectory: runDirectory,
                label: 'repository source lease receipt',
            },
            seal: {
                target: receiptSealPath(sourceReceipt),
                temporary: '',
                commonDirectory: runDirectory,
                label: 'repository source lease seal',
            },
        };
        for (const location of Object.values(locations)) {
            location.temporary = atomicPrivateTemporaryPath(
                location.target,
                acquisition.owner.pid,
                acquisition.operation_id,
            );
        }
        validateRunDirectory(runDirectory);
        for (const location of Object.values(locations)) {
            assertNoForeignRecoveryTemporary(location.target, location.temporary);
        }
        let evidence = readEvidence(locations);

        if (evidence.intent
            && sha256(canonicalJson(evidence.intent.record)) !== acquisition.lease_intent_sha256) {
            if (evidence.intent.state !== 'complete') {
                fail('an incomplete foreign repository lease intent blocks recovery');
            }
            const foreignRecord = verifySelfBoundLeaseIntent(evidence.intent.record);
            if (foreignRecord.git_common_directory !== scope.commonDirectory) {
                fail('foreign repository source lease does not bind this lock path');
            }
            const foreignReceipt = path.join(
                foreignRecord.control_root,
                'council-autoresearch',
                foreignRecord.run_id,
                '00-source-lease.json',
            );
            const foreignDirectory = path.dirname(foreignReceipt);
            validateRunDirectory(foreignDirectory);
            const foreignLocations = {
                intent: locations.intent,
                receipt: {
                    target: foreignReceipt,
                    temporary: atomicPrivateTemporaryPath(
                        foreignReceipt,
                        acquisition.owner.pid,
                        acquisition.operation_id,
                    ),
                    commonDirectory: foreignDirectory,
                    label: 'foreign repository source lease receipt',
                },
                seal: {
                    target: receiptSealPath(foreignReceipt),
                    temporary: atomicPrivateTemporaryPath(
                        receiptSealPath(foreignReceipt),
                        acquisition.owner.pid,
                        acquisition.operation_id,
                    ),
                    commonDirectory: foreignDirectory,
                    label: 'foreign repository source lease seal',
                },
            };
            assertNoForeignRecoveryTemporary(
                foreignLocations.receipt.target,
                foreignLocations.receipt.temporary,
            );
            assertNoForeignRecoveryTemporary(
                foreignLocations.seal.target,
                foreignLocations.seal.temporary,
            );
            const foreignEvidence = readEvidence(foreignLocations);
            if (!foreignEvidence.intent || foreignEvidence.intent.state !== 'complete'
                || !foreignEvidence.receipt || foreignEvidence.receipt.state !== 'complete'
                || !foreignEvidence.seal || foreignEvidence.seal.state !== 'complete') {
                fail('foreign repository source lease evidence is incomplete');
            }
            verifyReceiptSeal(foreignReceipt, foreignRecord);
            const validateForeign = (record: RepositoryOperationRecord): void => {
                assertAcquisitionBindsInput(record, boundInput);
                assertEvidenceUnchanged(foreignLocations, foreignEvidence);
                verifySelfBoundLeaseIntent(foreignEvidence.intent!.record);
            };
            const operation = claimAndRemoveOperationGuard(paths, target, validateForeign);
            return { recovered: true, outcome: 'acquisition-not-committed', operation };
        }

        if (!evidence.intent && evidence.receipt && evidence.seal
            && evidence.receipt.state === 'complete' && evidence.seal.state === 'complete') {
            assertLeaseRecord(evidence.receipt.record, scope, evidence.receipt.record.resume_token_sha256);
            if (sha256(canonicalJson(repositoryLeaseIntentFromRecord(evidence.receipt.record)))
                === acquisition.lease_intent_sha256) {
                fail('a matching sealed receipt is missing its repository lease intent');
            }
            validateSeal(evidence.seal, evidence.receipt, sourceReceipt);
            verifyLeaseSource(evidence.receipt.record);
            const foreignReleased = evidence;
            const validateReleased = (record: RepositoryOperationRecord): void => {
                assertAcquisitionBindsInput(record, boundInput);
                const repeated = assertEvidenceUnchanged(locations, foreignReleased);
                validateSeal(repeated.seal!, repeated.receipt!, sourceReceipt);
            };
            const operation = claimAndRemoveOperationGuard(paths, target, validateReleased);
            return { recovered: true, outcome: 'acquisition-not-committed', operation };
        }

        validateMatchingEvidence(evidence, acquisition, scope, sourceReceipt);
        const repair = <T>(
            location: ArtifactLocation,
            snapshot: RecoveryArtifactSnapshot<T> | undefined,
        ): void => {
            if (!snapshot || snapshot.state === 'complete') return;
            assertDeadAcquisitionTarget(paths, target, boundInput);
            validateRunDirectory(runDirectory);
            repairRecoveryArtifact(location, snapshot);
            assertDeadAcquisitionTarget(paths, target, boundInput);
        };
        repair(locations.intent, evidence.intent);
        repair(locations.receipt, evidence.receipt);
        repair(locations.seal, evidence.seal);
        evidence = readEvidence(locations);
        validateMatchingEvidence(evidence, acquisition, scope, sourceReceipt);
        for (const snapshot of [evidence.intent, evidence.receipt, evidence.seal]) {
            if (snapshot && snapshot.state !== 'complete') {
                fail('repository lease recovery did not reach a stable publication state');
            }
        }
        const completeEvidence = evidence;
        if (completeEvidence.seal) {
            verifyRepositoryLease({
                repoRoot: scope.repoRoot,
                controlRoot: scope.controlRoot,
                runId: scope.runId,
                resumeToken: input.resumeToken,
            });
        }
        const outcome = completeEvidence.seal
            ? 'acquisition-active'
            : 'acquisition-not-committed';
        const operation = claimAndRemoveOperationGuard(paths, target, (record) => {
            assertAcquisitionBindsInput(record, boundInput);
            validateRunDirectory(runDirectory);
            const repeated = assertEvidenceUnchanged(locations, completeEvidence);
            validateMatchingEvidence(repeated, acquisition, scope, sourceReceipt);
            if (repeated.seal) {
                verifyRepositoryLease({
                    repoRoot: scope.repoRoot,
                    controlRoot: scope.controlRoot,
                    runId: scope.runId,
                    resumeToken: input.resumeToken,
                });
            }
        });
        return { recovered: true, outcome, operation };
    } finally {
        releaseRecoveryOwner(recoveryOwner);
    }
}
