import type { HallOneMindRequestRecord } from '../../../../types/hall.js';

export interface RetiredDelegatedReconciliationResult {
    reconciled: false;
    activationId?: string;
    beadId?: string;
    finalStatus?: string;
}

/**
 * Retained for source compatibility only. One Mind callbacks cannot reconcile,
 * advance, or otherwise mutate CStar lifecycle state.
 */
export async function reconcileDelegatedWorkflowRequest(
    _rootPath: string,
    request: HallOneMindRequestRecord,
    _env: NodeJS.ProcessEnv = process.env,
): Promise<RetiredDelegatedReconciliationResult> {
    throw new Error(
        `One Mind delegated reconciliation is retired for '${request.request_id}'; no lifecycle state was changed.`,
    );
}
