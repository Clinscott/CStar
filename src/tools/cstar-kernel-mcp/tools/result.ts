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
    mcpErrorCode,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
} from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { CODE_ROOT, CONTROL_ROOT, PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import { resolveValidationEvidenceRoot } from '../contracts/validation_evidence_root.js';
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
import {
    consumeIndependentValidatorTicket,
    deriveIndependentValidatorIdentity,
    issueIndependentValidatorTicket,
    type ValidationTicketIssueResult,
} from '../../pennyone/intel/validation_ticket_controller.js';
import {
    buildReliabilityContinuation,
    deriveReliabilityRiskTier,
    isReliabilityEnabled,
    unverifiedReliabilityReceipt,
    verifyReliabilityReceipt,
    type ReliabilityReceiptInput,
    type ReliabilityRiskTier,
    type VerifiedReliabilityReceipt,
} from './reliability_loop.js';
interface ValidationTicketRequestInput {
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    expires_at?: number;
    validator_thread_id?: string;
    validator_turn_id?: string;
}
function normalizedRoot(value: unknown): string {
    return String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
}
const MAX_BEAD_JSON_BYTES = 64 * 1024;
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseBoundedRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf-8') > MAX_BEAD_JSON_BYTES) return undefined;
    try {
        const parsed: unknown = JSON.parse(value);
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}
function parseBoundedStringArray(value: unknown): string[] | undefined {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf-8') > MAX_BEAD_JSON_BYTES) return undefined;
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')
            ? parsed : undefined;
    } catch {
        return undefined;
    }
}

interface BeadResultRow {
    repo_id?: string;
    target_kind?: string;
    target_path?: string;
    target_ref?: string;
    rationale?: string;
    acceptance_criteria?: string;
    checker_shell?: string;
    contract_refs?: string[];
    contract_refs_json?: string | null;
    metadata_json?: string | null;
    root_path?: string;
}

function ticketValidatorIdentity(): { thread_id: string; turn_id: string } {
    const testFixture = Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (!testFixture) return { thread_id: '', turn_id: '' };
    return {
        thread_id: process.env.CSTAR_VALIDATION_TEST_THREAD_ID?.trim() || 'test-independent-validator-thread',
        turn_id: process.env.CSTAR_VALIDATION_TEST_TURN_ID?.trim() || 'test-independent-validator-turn',
    };
}

function issueValidationTicket(
    beadId: string,
    request: ValidationTicketRequestInput,
    requestIdentity: Awaited<ReturnType<typeof verifyCodexRequestIdentity>>,
): ReturnType<typeof textResponse> {
    let releaseReadDb: (() => void) | null = null;
    try {
        const controlRoot = registry.getRoot();
        const readHandle = openForgeReadDb(controlRoot);
        releaseReadDb = readHandle.release;
        const bead = readHandle.db.prepare(`
            SELECT b.repo_id AS repo_id, r.root_path AS root_path
            FROM hall_beads b
            JOIN hall_repositories r ON r.repo_id = b.repo_id
            WHERE b.bead_id = ?
        `).get(beadId) as { repo_id?: string; root_path?: string } | undefined;
        if (!bead?.repo_id || !normalizedRoot(bead.root_path)) {
            throw new Error('validation_bead_not_found_in_repository');
        }
        releaseReadDb();
        releaseReadDb = null;
        const identity = request.validator_thread_id || request.validator_turn_id
            ? {
                thread_id: request.validator_thread_id ?? '',
                turn_id: request.validator_turn_id ?? '',
            }
            : ticketValidatorIdentity();
        if (!identity.thread_id || !identity.turn_id) {
            throw new Error('validation_ticket_validator_invalid');
        }
        if (identity.thread_id === requestIdentity.thread_id) {
            throw new Error('validation_ticket_validator_not_independent');
        }
        const issued: ValidationTicketIssueResult = issueIndependentValidatorTicket(
            getForgeWritableDb(controlRoot),
            {
                repository_id: bead.repo_id,
                bead_id: beadId,
                execution_receipt_id: request.execution_receipt_id,
                attempt_id: request.attempt_id,
                scope_sha256: request.scope_sha256,
                validator_thread_id: identity.thread_id,
                validator_turn_id: identity.turn_id,
                expires_at: request.expires_at,
            },
        );
        return textResponse({
            status: 'validation_ticket_issued',
            bead_id: issued.bead_id,
            repository_id: issued.repository_id,
            execution_receipt_id: issued.execution_receipt_id,
            attempt_id: issued.attempt_id,
            scope_sha256: issued.scope_sha256,
            expires_at: issued.expires_at,
            validation_ticket: issued.ticket,
        });
    } catch (error) {
        releaseReadDb?.();
        const message = error instanceof Error ? error.message : String(error);
        logBootstrapError(error);
        return textResponse({
            status: 'partial',
            bead_id: beadId,
            validation_persisted: false,
            validation_warning: message,
        }, true);
    }
}

function isPositiveValidationVerdict(verdict: string): boolean {
    return verdict === 'ACCEPTED' || verdict === 'SUCCESS';
}

export async function handleRecordResult({
    bead_id,
    verdict,
    notes,
    validation_id,
    forge_execution_receipt_id,
    host_validation_receipt,
    validation_evidence,
    validation_ticket,
    validation_ticket_request,
    reliability_receipt,
}: {
    bead_id: string,
    verdict: CStarValidationVerdict,
    notes?: string,
    validation_id?: string,
    forge_execution_receipt_id?: string,
    host_validation_receipt?: HostValidationReceiptInput,
    validation_evidence?: ValidationEvidencePayload,
    validation_ticket?: string,
    validation_ticket_request?: ValidationTicketRequestInput,
    reliability_receipt?: ReliabilityReceiptInput,
}, requestContext?: McpRequestContext) {
    let requestIdentityVerified = false;
    try {
        const requestIdentity = await verifyCodexRequestIdentity(requestContext);
        requestIdentityVerified = true;
        if (validation_ticket_request) {
            if (validation_ticket) throw new Error('validation_ticket_request_ambiguous');
            return issueValidationTicket(bead_id, validation_ticket_request, requestIdentity);
        }
        let root = PROJECT_ROOT;
        let repoId = 'cstar';
        const validationId = validation_id?.trim()
            || `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        let validationError: string | undefined;
        let validationAuthority: 'reported' | 'verified_v2' | 'verified_v3' = 'reported';
        let storedVerdict: CStarValidationVerdict = verdict;
        let verifiedEvidence: Awaited<ReturnType<typeof verifyValidationEvidence>> = null;
        let beadTargetPath: string | undefined;
        let beadMetadata: Record<string, unknown> | undefined;
        let beadScope: BeadResultRow & { bead_id: string; repo_id: string } = {
            bead_id,
            repo_id: repoId,
        };
        let reliabilityEnabled = Boolean(reliability_receipt);
        let reliabilityRiskTier: ReliabilityRiskTier = 'routine';
        let verifiedReliability: VerifiedReliabilityReceipt = unverifiedReliabilityReceipt(
            Boolean(reliability_receipt),
            reliability_receipt ? 'reliability_validation_evidence_missing' : 'reliability_receipt_missing',
        );
        let reliabilityBlocksPositiveForge = false;
        let forgeValidation: ReturnType<typeof finalizeForgeValidation> | null = null;
        let forgeValidationError: string | undefined;

        let releaseReadDb: (() => void) | null = null;
        try {
            root = registry.getRoot();
            const readHandle = openForgeReadDb(root);
            releaseReadDb = readHandle.release;
            const bead = readHandle.db.prepare(`
                SELECT b.repo_id, b.target_kind, b.target_path, b.target_ref,
                       b.rationale, b.acceptance_criteria, b.checker_shell,
                       b.contract_refs_json, b.metadata_json, r.root_path
                FROM hall_beads b
                JOIN hall_repositories r ON r.repo_id = b.repo_id
                WHERE b.bead_id = ?
            `).get(bead_id) as BeadResultRow | undefined;
            const recordedRoot = normalizedRoot(bead?.root_path);
            if (!bead?.repo_id || !recordedRoot) {
                throw new Error('validation_bead_not_found_in_repository');
            }
            repoId = bead.repo_id;
            beadTargetPath = bead.target_path;
            beadMetadata = parseBoundedRecord(bead.metadata_json);
            beadScope = {
                bead_id,
                repo_id: repoId,
                target_kind: bead.target_kind,
                target_path: bead.target_path,
                target_ref: bead.target_ref,
                rationale: bead.rationale,
                acceptance_criteria: bead.acceptance_criteria,
                checker_shell: bead.checker_shell,
                contract_refs: parseBoundedStringArray(bead.contract_refs_json),
                contract_refs_json: bead.contract_refs_json,
                metadata_json: bead.metadata_json,
                root_path: bead.root_path,
            };
            reliabilityEnabled = isReliabilityEnabled(beadMetadata, Boolean(reliability_receipt));
            reliabilityRiskTier = deriveReliabilityRiskTier(beadMetadata, bead.target_path);
            const forgeExecutionReceiptId = forge_execution_receipt_id?.trim();
            const forgeSubject = forgeExecutionReceiptId
                ? resolveForgeValidationSubject(readHandle.db, {
                    execution_receipt_id: forgeExecutionReceiptId,
                    repository_id: repoId,
                    bead_id,
                }).subject
                : undefined;
            const beadRepositoryRoot = resolveValidationEvidenceRoot(repoId, recordedRoot, CODE_ROOT, CONTROL_ROOT);
            verifiedEvidence = host_validation_receipt
                ? verifyHostWorkflowValidationEvidence(
                    beadRepositoryRoot,
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
                    beadRepositoryRoot,
                    validation_evidence,
                    requestContext,
                    forgeSubject,
                );
            if (reliabilityEnabled) {
                verifiedReliability = verifiedEvidence
                    ? verifyReliabilityReceipt(beadRepositoryRoot, verifiedEvidence.manifest, reliability_receipt)
                    : unverifiedReliabilityReceipt(
                        Boolean(reliability_receipt),
                        reliability_receipt ? 'reliability_validation_evidence_missing' : 'reliability_receipt_missing',
                    );
                reliabilityBlocksPositiveForge = reliabilityRiskTier === 'critical'
                    && isPositiveValidationVerdict(verdict)
                    && (!verifiedReliability.verified || verifiedReliability.sprt_verdict !== 'ACCEPTED');
                if (reliabilityBlocksPositiveForge) storedVerdict = 'INCONCLUSIVE';
            }
            if (forgeExecutionReceiptId && (isPositiveValidationVerdict(verdict)
                || verifiedEvidence?.manifest.schema === 'cstar.validation-evidence.v3') && !validation_ticket) {
                if (!reliabilityBlocksPositiveForge) throw new Error('validation_ticket_required');
            }
            if (validation_ticket && !forgeExecutionReceiptId) {
                throw new Error('validation_ticket_receipt_required');
            }
            if (validation_ticket && !verifiedEvidence) {
                throw new Error('validation_ticket_evidence_required');
            }
            const ticketValidator = validation_ticket && verifiedEvidence
                ? deriveIndependentValidatorIdentity(verifiedEvidence)
                : undefined;
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
                ...(verifiedReliability.verified && verifiedReliability.receipt ? {
                    sprt_verdict: verifiedReliability.receipt.sprt_verdict as string,
                    ...(isRecord(verifiedReliability.receipt.post_scores)
                        ? { post_scores: verifiedReliability.receipt.post_scores } : {}),
                    ...(isRecord(verifiedReliability.receipt.benchmark)
                        ? { benchmark: verifiedReliability.receipt.benchmark } : {}),
                } : {}),
                evidence_sha256: verifiedEvidence?.evidence_sha256,
                validator_identity: verifiedEvidence?.validator_identity,
                validator_identity_source: verifiedEvidence?.validator_identity_source,
                evidence_manifest: verifiedEvidence?.manifest,
                created_at: Date.now()
            } satisfies CStarValidationRunRecord;
            releaseReadDb();
            releaseReadDb = null;
            const db = getForgeWritableDb(root);
            if (forgeExecutionReceiptId && !reliabilityBlocksPositiveForge) {
                const forgeValidationAuthority = validationAuthority;
                if (forgeValidationAuthority === 'reported') throw new Error('forge_terminal_validation_requires_verified_evidence_v2');
                const persist = db.transaction(() => {
                    if (validation_ticket) {
                        if (!forgeSubject || !ticketValidator) {
                            throw new Error('validation_ticket_binding_invalid');
                        }
                        consumeIndependentValidatorTicket(db, {
                            ticket: validation_ticket,
                            repository_id: forgeSubject.repository_id,
                            bead_id,
                            execution_receipt_id: forgeSubject.work_receipt_id,
                            attempt_id: forgeSubject.attempt_id,
                            scope_sha256: forgeSubject.target_paths_sha256,
                            validator_thread_id: ticketValidator?.thread_id ?? '',
                            validator_turn_id: ticketValidator?.turn_id ?? '',
                            validation_id: validationId,
                        });
                    }
                    saveValidationRunToDb(db, validationRecord, verifiedEvidence ?? undefined);
                    return finalizeForgeValidation(db, {
                        execution_receipt_id: forgeExecutionReceiptId,
                        validation_id: validationId,
                        validation_authority: forgeValidationAuthority,
                    });
                });
                forgeValidation = persist.immediate();
            } else {
                const persist = db.transaction(() => {
                    if (validation_ticket) {
                        if (!forgeSubject || !ticketValidator) {
                            throw new Error('validation_ticket_binding_invalid');
                        }
                        consumeIndependentValidatorTicket(db, {
                            ticket: validation_ticket,
                            repository_id: forgeSubject.repository_id,
                            bead_id,
                            execution_receipt_id: forgeSubject.work_receipt_id,
                            attempt_id: forgeSubject.attempt_id,
                            scope_sha256: forgeSubject.target_paths_sha256,
                            validator_thread_id: ticketValidator.thread_id,
                            validator_turn_id: ticketValidator.turn_id,
                            validation_id: validationId,
                        });
                    }
                    saveValidationRunToDb(db, validationRecord, verifiedEvidence ?? undefined);
                });
                persist.immediate();
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
        if (reliabilityBlocksPositiveForge && forge_execution_receipt_id?.trim()) {
            response.forge_validation_warning = 'forge_validation_suppressed:critical_reliability_proof_required';
        }
        if (reliabilityEnabled) {
            response.reliability_continuation = buildReliabilityContinuation({
                scope: {
                    bead_id: beadScope.bead_id,
                    repo_id: beadScope.repo_id,
                    target_kind: beadScope.target_kind,
                    target_path: beadScope.target_path,
                    target_ref: beadScope.target_ref,
                    rationale: beadScope.rationale,
                    acceptance_criteria: beadScope.acceptance_criteria,
                    checker_shell: beadScope.checker_shell,
                    contract_refs: beadScope.contract_refs,
                },
                metadata: beadMetadata,
                risk_tier: reliabilityRiskTier,
                reported_verdict: verdict,
                stored_verdict: validationPersisted ? storedVerdict : null,
                validation_persisted: validationPersisted,
                validation_authority: validationPersisted ? validationAuthority : 'not_persisted',
                authoritative: Boolean(response.authoritative),
                validation_id: validationId,
                validation_evidence_sha256: verifiedEvidence?.evidence_sha256 ?? null,
                reliability: verifiedReliability,
            });
        }
        return textResponse(response, Boolean(validationError || forgeValidationError));
    } catch (error: any) {
        if (!requestIdentityVerified) {
            return preAuthorizationErrorResponse(mcpErrorCode(error), error);
        }
        return textResponse({ error: error.message }, true);
    }
}
