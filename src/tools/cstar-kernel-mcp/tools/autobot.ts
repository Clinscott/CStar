import { errorResponse, type McpTextResponse } from '../contracts/responses.js';

/** Stable failure code for every retained public AutoBot compatibility call. */
export const AUTOBOT_RETIRED_ERROR = 'legacy_autobot_retired_use_cstar_forge';

/** Compatibility-only input shape; this retired handler never inspects it. */
export type AutobotArgs = Readonly<Record<string, unknown>>;

/**
 * cstar_autobot is decommissioned. The retained symbol fails closed so stale
 * imports cannot recover the former execution path.
 */
export async function handleAutobot(_args: AutobotArgs): Promise<McpTextResponse> {
    return errorResponse(new Error(AUTOBOT_RETIRED_ERROR));
}
