import type { HallValidationRun, HallValidationVerdict } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { finalizeForgeValidation } from '../../pennyone/intel/forge_validation_controller.js';
import { mcpMutation, textResponse } from '../contracts/responses.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import {
    appendTokenPathObservation,
    isMeasuredTokenPathObservation,
    TOKEN_PATH_OBSERVATION_ACCEPTANCE_ENABLED,
    type TokenPathObservationPayload,
} from '../telemetry/token_path.js';
import {
    verifyValidationEvidence,
    type ValidationEvidencePayload,
} from './validation_evidence.js';

function isPositiveValidationVerdict(verdict: string): boolean {
    return verdict === 'ACCEPTED' || verdict === 'SUCCESS';
}

export async function handleRecordResult({ bead_id, verdict, notes, validation_id, forge_execution_receipt_id, validation_evidence, token_path_episode_id, token_path_observation }: {
    bead_id: string,
    verdict: HallValidationVerdict,
    notes?: string,
    validation_id?: string,
    forge_execution_receipt_id?: string,
    validation_evidence?: ValidationEvidencePayload,
    token_path_episode_id?: string,
    token_path_observation?: TokenPathObservationPayload,
}, requestContext?: McpRequestContext) {
    try {
        let root = PROJECT_ROOT;
        let repoId = 'cstar';
        const validationId = validation_id?.trim()
            || `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        let validationError: string | undefined;
        let validationAuthority: 'reported' | 'verified' = 'reported';
        let storedVerdict: HallValidationVerdict = verdict;
        let verifiedEvidence: Awaited<ReturnType<typeof verifyValidationEvidence>> = null;
        let beadTargetPath: string | undefined;
        let forgeValidation: ReturnType<typeof finalizeForgeValidation> | null = null;
        let forgeValidationError: string | undefined;

        try {
            root = registry.getRoot();
            const repo = database.getHallRepository(root);
            repoId = repo?.repo_id || repoId;
            const bead = database.getHallBead(bead_id);
            if (!bead || bead.repo_id !== repoId) throw new Error('validation_bead_not_found_in_repository');
            beadTargetPath = bead.target_path;
            verifiedEvidence = await verifyValidationEvidence(root, validation_evidence, requestContext);
            validationAuthority = verifiedEvidence ? 'verified' : 'reported';
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
                created_at: Date.now()
            } satisfies HallValidationRun;
            const forgeExecutionReceiptId = forge_execution_receipt_id?.trim();
            if (forgeExecutionReceiptId) {
                const db = database.getDb(root);
                const persist = db.transaction(() => {
                    database.saveValidationRun(validationRecord);
                    return finalizeForgeValidation(db, {
                        execution_receipt_id: forgeExecutionReceiptId,
                        bead_id,
                        validation_id: validationId,
                        verdict,
                        notes,
                        validation_authority: validationAuthority,
                        validation_evidence_sha256: verifiedEvidence?.evidence_sha256,
                        validation_artifact_paths: verifiedEvidence?.artifact_paths,
                        validation_artifact_hashes: verifiedEvidence?.artifact_hashes,
                    });
                });
                forgeValidation = persist.immediate();
            } else {
                database.saveValidationRun(validationRecord);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (forge_execution_receipt_id?.trim()) {
                forgeValidationError = message;
                validationError = 'validation_transaction_rolled_back';
            } else {
                validationError = message;
            }
            logBootstrapError(error);
        }

        let observationId: string | null = null;
        let observationPayload = token_path_observation;
        let linkedTokenPathEpisodeId = token_path_episode_id;
        let observationSource: string | undefined;
        let observationWarning: string | undefined;
        if (observationPayload) {
            observationSource = 'explicit_payload';
        } else {
            observationWarning = 'explicit_token_path_observation_required';
        }
        if (observationPayload && linkedTokenPathEpisodeId && observationPayload.token_path_episode_id
            && linkedTokenPathEpisodeId !== observationPayload.token_path_episode_id) {
            observationWarning = 'token_path_episode_id_mismatch';
            observationPayload = undefined;
        } else if (observationPayload && linkedTokenPathEpisodeId && !observationPayload.token_path_episode_id) {
            observationPayload = {
                ...observationPayload,
                token_path_episode_id: linkedTokenPathEpisodeId,
            };
        }
        if (validationError && observationPayload) {
            observationWarning = 'validation_not_persisted_observation_skipped';
        } else if (isMeasuredTokenPathObservation(observationPayload) && !TOKEN_PATH_OBSERVATION_ACCEPTANCE_ENABLED) {
            observationWarning = 'token_path_quarantined_no_promoted_episode';
        } else if (isMeasuredTokenPathObservation(observationPayload)) {
            observationId = appendTokenPathObservation(bead_id, observationPayload);
            linkedTokenPathEpisodeId = observationPayload.token_path_episode_id || linkedTokenPathEpisodeId;
            if (!observationId) observationWarning = 'token_path_observation_write_failed';
        } else if (observationPayload) {
            observationWarning = 'malformed_token_path_observation_skipped';
        }

        const validationPersisted = !validationError;
        const response: Record<string, unknown> = {
            status: validationError || forgeValidationError
                ? 'partial'
                : validationAuthority === 'verified' ? 'recorded_verified' : 'recorded_unverified',
            bead_id,
            reported_verdict: verdict,
            stored_verdict: validationPersisted ? storedVerdict : null,
            verdict: validationPersisted ? storedVerdict : null,
            validation_id: validationId,
            validation_persisted: validationPersisted,
            validation_authority: validationPersisted ? validationAuthority : 'not_persisted',
            authoritative: validationPersisted && validationAuthority === 'verified',
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
            token_path_observation_status: observationId ? 'recorded' : 'not_recorded',
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
                attempt_id: forgeValidation.attempt.attempt_id,
                attempt_status: forgeValidation.attempt.status,
                request_status: forgeValidation.request.status,
            };
        }
        if (forgeValidationError) {
            response.forge_validation_warning = forgeValidationError;
        }
        if (observationId) {
            response.token_path_observation_id = observationId;
        }
        if (observationSource) {
            response.token_path_observation_source = observationSource;
        }
        if (!observationId && observationWarning) {
            response.token_path_observation_warning = observationWarning;
        }
        if (observationId && linkedTokenPathEpisodeId) {
            response.token_path_episode_id = linkedTokenPathEpisodeId;
        } else if (linkedTokenPathEpisodeId) {
            response.reported_token_path_episode_id = linkedTokenPathEpisodeId;
        }

        return textResponse(response, Boolean(validationError || forgeValidationError));
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
