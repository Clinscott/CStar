import type { HallValidationRun } from '../../../types/hall.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { mcpMutation, textResponse } from '../contracts/responses.js';
import { PROJECT_ROOT, logBootstrapError } from '../contracts/runtime.js';
import {
    appendTokenPathObservation,
    buildObservationFromAdvice,
    findRecentTokenPathAdvice,
    type TokenPathObservationPayload,
} from '../telemetry/token_path.js';

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
        let validationError: string | undefined;

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
            validationError = error instanceof Error ? error.message : String(error);
            logBootstrapError(error);
        }

        let observationId: string | null = null;
        let observationPayload = token_path_observation;
        let linkedTokenPathEpisodeId = token_path_episode_id;
        if (!observationPayload && token_path_episode_id) {
            const advice = findRecentTokenPathAdvice(token_path_episode_id, bead_id);
            if (advice) {
                observationPayload = buildObservationFromAdvice(advice, notes);
                linkedTokenPathEpisodeId = advice.episode_id;
            }
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
        }

        const response: Record<string, unknown> = {
            status: 'recorded',
            bead_id,
            verdict,
            validation_id: validationId,
            mutation: mcpMutation('validation_result_record', validationId, 'Validation result was persisted through the MCP write surface.'),
        };
        if (validationError) {
            response.validation_warning = validationError;
        }
        if (observationId) {
            response.token_path_observation_id = observationId;
        }
        if (linkedTokenPathEpisodeId) {
            response.token_path_episode_id = linkedTokenPathEpisodeId;
        }

        return textResponse(response);
    } catch (error: any) {
        return textResponse({ error: error.message }, true);
    }
}
