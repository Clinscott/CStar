import { errorResponse, type McpTextResponse } from '../contracts/responses.js';

export interface AutobotArgs {
    intent: string;
    project_root?: string;
    target_paths?: string[];
    payload?: {
        hermes_profile?: string;
        model?: string;
        expected_output?: 'markdown' | 'json' | 'plain';
        max_chars?: number;
        session_name?: string | null;
        write_to?: string | null;
        append_with_separator?: string | null;
        tags?: string[];
        timeout_seconds?: number;
    };
}

export function isAutobotMcpEnabled(): boolean {
    return false;
}

/**
 * @deprecated AutoBot is retained only as a fail-closed source compatibility
 * tombstone. It is not registered, exported, or environment-reactivatable.
 */
export async function handleAutobot(_args: AutobotArgs): Promise<McpTextResponse> {
    return errorResponse(new Error(
        'cstar_autobot is permanently decommissioned; use an explicitly authorized CStar Forge or Researcher surface.',
    ));
}
