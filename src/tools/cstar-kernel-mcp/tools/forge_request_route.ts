import { findForgeRequestByDecisionBeforeMutation } from './forge_execute_request_authority.js';

export function isLegacyV2ForgeRequest(
    root: string,
    beadId: string,
    decisionId: string,
): boolean {
    const found = findForgeRequestByDecisionBeforeMutation(root, beadId, decisionId);
    try {
        if (!found.request) return false;
        const value = JSON.parse(found.request.request_summary_json) as Record<string, unknown>;
        return value.schema === 'cstar.forge_request.v2';
    } finally {
        found.release();
    }
}
