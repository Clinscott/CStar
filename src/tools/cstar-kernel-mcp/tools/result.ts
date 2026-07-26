import type { HallValidationRun } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { mcpFailedMutation, mcpMutation, textResponse } from '../contracts/responses.js';
import { PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import {
    appendTokenPathObservation,
    buildObservationFromAdvice,
    findRecentTokenPathAdvice,
    type TokenPathObservationPayload,
} from '../telemetry/token_path.js';

function beadTargetPaths(beadId: string): string[] {
    try {
        const bead = database.getHallBead(beadId);
        const targetPath = typeof bead?.target_path === 'string' ? bead.target_path : undefined;
        return targetPath ? [targetPath] : [];
    } catch {
        return [];
    }
}

export async function handleRecordResult({ bead_id, verdict, notes, token_path_episode_id, token_path_observation }: {
    bead_id: string,
    verdict: string,
    notes?: string,
    token_path_episode_id?: string,
    token_path_observation?: TokenPathObservationPayload,
}) {
    try {
        let root = PROJECT_ROOT;
        let repoId = 'cstar';
        const validationId = `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        try {
            root = registry.getRoot();
            const repo = database.getHallRepository(root);
            repoId = repo?.repo_id || repoId;
            database.saveValidationRun({
                validation_id: validationId,
                repo_id: repoId,
                bead_id,
                verdict: verdict as any,
                notes: notes || '',
                created_at: Date.now()
            } satisfies HallValidationRun);
        } catch (error) {
            logBootstrapError(error);
            return textResponse({
                status: 'not_recorded',
                error: {
                    code: 'PERSISTENCE_FAILED',
                    message: 'Validation result was not persisted.',
                    retryable: true,
                },
                bead_id,
                verdict,
                mutation: mcpFailedMutation(
                    'validation_result_record',
                    'Validation result was not persisted; no secondary observation was recorded.',
                ),
                token_path_observation_status: 'not_recorded',
                token_path_observation_warning: 'validation_persistence_failed',
            }, true);
        }

        let observationId: string | null = null;
        let observationPayload = token_path_observation;
        let linkedTokenPathEpisodeId = token_path_episode_id;
        let observationSource: string | undefined;
        let observationWarning: string | undefined;
        if (!observationPayload) {
            const advice = findRecentTokenPathAdvice({
                episodeId: token_path_episode_id,
                beadId: bead_id,
                targetPaths: beadTargetPaths(bead_id),
            });
            if (advice) {
                observationPayload = buildObservationFromAdvice(advice, notes);
                linkedTokenPathEpisodeId = advice.episode_id;
                observationSource = 'auto_linked_recent_advice';
            } else if (token_path_episode_id) {
                observationWarning = 'token_path_episode_id_not_found';
            } else {
                observationWarning = 'no_recent_token_path_advice_linked';
            }
        } else {
            observationSource = 'explicit_payload';
        }
        if (observationPayload
            && typeof observationPayload.scenario_class === 'string'
            && typeof observationPayload.selected_policy === 'string'
            && typeof observationPayload.advised_mode === 'string') {
            if (linkedTokenPathEpisodeId && !observationPayload.token_path_episode_id) {
                observationPayload = {
                    ...observationPayload,
                    token_path_episode_id: linkedTokenPathEpisodeId,
                };
            }
            observationId = appendTokenPathObservation(bead_id, observationPayload, verdict);
            linkedTokenPathEpisodeId = observationPayload.token_path_episode_id || linkedTokenPathEpisodeId;
        } else if (observationPayload) {
            observationWarning = 'malformed_token_path_observation_skipped';
        }

        const response: Record<string, unknown> = {
            status: 'recorded',
            bead_id,
            verdict,
            validation_id: validationId,
            token_path_observation_status: observationId ? 'recorded' : 'not_recorded',
            mutation: mcpMutation('validation_result_record', validationId, 'Validation result was persisted through the MCP write surface.'),
        };
        if (observationId) {
            response.token_path_observation_id = observationId;
        }
        if (observationSource) {
            response.token_path_observation_source = observationSource;
        }
        if (!observationId && observationWarning) {
            response.token_path_observation_warning = observationWarning;
        }
        if (linkedTokenPathEpisodeId) {
            response.token_path_episode_id = linkedTokenPathEpisodeId;
        }

        return textResponse(response);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
