import type {
    CStarValidationRunRecord,
    CStarValidationVerdict,
} from '../../../types/validation_evidence.js';
import { registry } from '../../pennyone/pathRegistry.js';
import {
    getForgeWritableDb,
    openForgeReadDb,
} from '../../pennyone/intel/forge_hall_store.js';
import {
    finalizeForgeValidation,
    resolveForgeValidationSubject,
} from '../../pennyone/intel/forge_validation_controller.js';
import {
    advanceForgePostValidation,
    forgePostValidationFailed,
    forgePostValidationNotTriggered,
    isV2AuguryForgeChild,
    readForgePostValidationAdvancement,
    type ForgePostValidationAdvancementOutcome,
} from '../../pennyone/intel/forge_post_validation_advancement.js';
import {
    mcpErrorCode,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CODE_ROOT, PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import {
    verifyValidationEvidence,
    type ValidationEvidencePayload,
} from './validation_evidence.js';
import {
    verifyHostWorkflowValidationEvidence,
    type HostValidationReceiptInput,
} from './host_workflow_validation.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import { saveValidationRunToDb } from './validation_run_store.js';
import { resolveForgeRuntimeRoots } from './forge_runtime_roots.js';
import { resolveValidationEvidenceRoots } from './shared.js';

function isPositiveValidationVerdict(verdict: string): boolean {
    return verdict === 'ACCEPTED' || verdict === 'SUCCESS';
}

export async function handleRecordResult({ bead_id, verdict, notes, validation_id, forge_execution_receipt_id, host_validation_receipt, validation_evidence }: {
    bead_id: string,
    verdict: CStarValidationVerdict,
    notes?: string,
    validation_id?: string,
    forge_execution_receipt_id?: string,
    host_validation_receipt?: HostValidationReceiptInput,
    validation_evidence?: ValidationEvidencePayload,
}, requestContext?: McpRequestContext) {
    let requestIdentityVerified = false;
    try {
        const requestIdentity = await verifyCodexRequestIdentity(requestContext);
        requestIdentityVerified = true;
        let root = PROJECT_ROOT;
        let repoId = 'cstar';
        const validationId = validation_id?.trim()
            || `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const forgeExecutionReceiptId = forge_execution_receipt_id?.trim();
        if (forgeExecutionReceiptId && host_validation_receipt) {
            throw new Error('validation_subject_kind_ambiguous');
        }
        let validationError: string | undefined;
        let validationAuthority: 'reported' | 'verified_v2' | 'verified_v3' = 'reported';
        let storedVerdict: CStarValidationVerdict = verdict;
        let verifiedEvidence: Awaited<ReturnType<typeof verifyValidationEvidence>> = null;
        let beadTargetPath: string | undefined;
        let forgeValidation: ReturnType<typeof finalizeForgeValidation> | null = null;
        let forgeValidationError: string | undefined;
        let forgeAdvancement: ForgePostValidationAdvancementOutcome | null = null;

        let releaseReadDb: (() => void) | null = null;
        try {
            root = registry.getRoot();
            const readHandle = openForgeReadDb(root);
            releaseReadDb = readHandle.release;
            const bead = readHandle.db.prepare(`
                SELECT b.repo_id, b.target_path, b.metadata_json, r.root_path
                FROM hall_beads b
                JOIN hall_repositories r ON r.repo_id = b.repo_id
                WHERE b.bead_id = ?
            `).get(bead_id) as {
                repo_id?: string;
                target_path?: string;
                metadata_json?: string | null;
                root_path?: string;
            } | undefined;
            if (!bead?.repo_id || !bead.root_path) {
                throw new Error('validation_bead_not_found_in_repository');
            }
            const validationRoots = resolveValidationEvidenceRoots({
                controlRoot: root,
                codeRoot: CODE_ROOT,
                beadRepositoryRoot: bead.root_path,
                beadMetadataJson: bead.metadata_json,
            });
            repoId = bead.repo_id;
            beadTargetPath = bead.target_path;
            const forgeSubject = forgeExecutionReceiptId
                ? resolveForgeValidationSubject(readHandle.db, {
                    execution_receipt_id: forgeExecutionReceiptId,
                    repository_id: repoId,
                    bead_id,
                }).subject
                : undefined;
            verifiedEvidence = host_validation_receipt
                ? verifyHostWorkflowValidationEvidence(
                    validationRoots.v3Root,
                    validation_evidence,
                    host_validation_receipt,
                    {
                        repository_id: repoId,
                        bead_id,
                        target_path: beadTargetPath ?? null,
                        validation_id: validationId,
                        verdict,
                    },
                    requestIdentity,
                )
                : await verifyValidationEvidence(
                    validationRoots.v2Root,
                    validation_evidence,
                    requestContext,
                    forgeSubject,
                );
            validationAuthority = verifiedEvidence?.manifest.schema === 'cstar.validation-evidence.v3'
                ? 'verified_v3' : verifiedEvidence ? 'verified_v2' : 'reported';
            if (isPositiveValidationVerdict(verdict) && !verifiedEvidence) {
                storedVerdict = 'INCONCLUSIVE';
            }
            const validationRecord = {
                validation_id: validationId,
                repo_id: repoId,
                bead_id,
                target_path: beadTargetPath,
                verdict: storedVerdict,
                notes: storedVerdict === verdict
                    ? notes || ''
                    : `reported_verdict=${verdict}; ${notes || 'No hash-verified validation evidence supplied.'}`,
                authority_class: validationAuthority,
                evidence_sha256: verifiedEvidence?.evidence_sha256,
                validator_identity: verifiedEvidence?.validator_identity,
                validator_identity_source: verifiedEvidence?.validator_identity_source,
                evidence_manifest: verifiedEvidence?.manifest,
                created_at: Date.now()
            } satisfies CStarValidationRunRecord;
            releaseReadDb();
            releaseReadDb = null;
            const db = getForgeWritableDb(root);
            if (forgeExecutionReceiptId) {
                const persist = db.transaction(() => {
                    saveValidationRunToDb(db, validationRecord, verifiedEvidence ?? undefined);
                    return finalizeForgeValidation(db, {
                        execution_receipt_id: forgeExecutionReceiptId,
                        validation_id: validationId,
                    });
                });
                forgeValidation = persist.immediate();
                const existingAdvancement = readForgePostValidationAdvancement(
                    db, forgeExecutionReceiptId,
                );
                if (existingAdvancement) {
                    forgeAdvancement = existingAdvancement;
                } else if (
                    forgeValidation.mode === 'delivery_finalization'
                    && forgeValidation.accepted === true
                    && forgeValidation.execution_status_changed
                    && validationAuthority === 'verified_v2'
                    && isV2AuguryForgeChild(db, forgeValidation.request.bead_id)
                ) {
                    const roots = resolveForgeRuntimeRoots();
                    try {
                        forgeAdvancement = await advanceForgePostValidation({
                            db,
                            control_root: roots.controlRoot,
                            code_root: roots.codeRoot,
                            execution_receipt_id: forgeExecutionReceiptId,
                            validation_id: validationId,
                            request_id: forgeValidation.request.request_id,
                            request_sha256: forgeValidation.request.request_sha256,
                        });
                    } catch (error) {
                        forgeAdvancement = forgePostValidationFailed({
                            execution_receipt_id: forgeExecutionReceiptId,
                            validation_id: validationId,
                            error,
                        });
                    }
                } else {
                    const reason = forgeValidation.mode !== 'delivery_finalization'
                        ? `forge_advancement_mode_${forgeValidation.mode}`
                        : forgeValidation.accepted !== true
                            ? 'forge_advancement_validation_not_accepted'
                            : !forgeValidation.execution_status_changed
                                ? 'forge_advancement_validation_replay'
                                : validationAuthority !== 'verified_v2'
                                    ? 'forge_advancement_validation_unverified'
                                    : 'forge_advancement_non_augury_v2_child';
                    forgeAdvancement = forgePostValidationNotTriggered({
                        execution_receipt_id: forgeExecutionReceiptId,
                        validation_id: validationId,
                        reason,
                    });
                }
            } else {
                saveValidationRunToDb(db, validationRecord, verifiedEvidence ?? undefined);
            }
        } catch (error) {
            releaseReadDb?.();
            const message = error instanceof Error ? error.message : String(error);
            if (forge_execution_receipt_id?.trim()) {
                forgeValidationError = message;
                validationError = 'validation_transaction_rolled_back';
            } else {
                validationError = message;
            }
            logBootstrapError(error);
        }

        const validationPersisted = !validationError;
        const response: Record<string, unknown> = {
            status: validationError || forgeValidationError
                ? 'partial'
                : validationAuthority === 'verified_v2' || validationAuthority === 'verified_v3'
                    ? 'recorded_verified' : 'recorded_unverified',
            bead_id,
            reported_verdict: verdict,
            stored_verdict: validationPersisted ? storedVerdict : null,
            verdict: validationPersisted ? storedVerdict : null,
            validation_id: validationId,
            validation_persisted: validationPersisted,
            validation_authority: validationPersisted ? validationAuthority : 'not_persisted',
            authoritative: validationPersisted
                && (validationAuthority === 'verified_v2' || validationAuthority === 'verified_v3'),
            validation_evidence_sha256: verifiedEvidence?.evidence_sha256 ?? null,
            validator_identity: verifiedEvidence?.validator_identity ?? null,
            validator_identity_source: verifiedEvidence?.validator_identity_source ?? null,
            validation_request_thread_id: verifiedEvidence?.request_thread_id ?? null,
            validation_request_turn_id: verifiedEvidence?.request_turn_id ?? null,
            validation_request_record_sha256: verifiedEvidence?.session_turn_record_sha256 ?? null,
            validation_request_record_set_sha256: verifiedEvidence?.session_turn_record_set_sha256 ?? null,
            validation_request_record_count: verifiedEvidence?.session_turn_record_count ?? null,
            validation_request_first_timestamp: verifiedEvidence?.session_turn_first_timestamp ?? null,
            validation_request_timestamp: verifiedEvidence?.session_turn_timestamp ?? null,
        };
        if (!validationError) {
            response.mutation = mcpMutation('validation_result_record', validationId, 'Validation result was persisted through the MCP write surface.');
        }
        if (validationError) {
            response.validation_warning = validationError;
        }
        if (forgeValidation) {
            response.forge_validation = {
                execution_receipt_id: forge_execution_receipt_id,
                accepted: forgeValidation.accepted,
                mode: forgeValidation.mode,
                execution_status_changed: forgeValidation.execution_status_changed,
                attempt_id: forgeValidation.attempt.attempt_id,
                attempt_status: forgeValidation.attempt.status,
                request_status: forgeValidation.request.status,
            };
        }
        if (forgeValidationError) {
            response.forge_validation_warning = forgeValidationError;
        }
        if (forgeAdvancement) {
            response.forge_advancement = forgeAdvancement;
        }
        return textResponse(response, Boolean(validationError || forgeValidationError));
    } catch (error: any) {
        if (!requestIdentityVerified) {
            return preAuthorizationErrorResponse(mcpErrorCode(error), error);
        }
        return textResponse({ error: error.message }, true);
    }
}
