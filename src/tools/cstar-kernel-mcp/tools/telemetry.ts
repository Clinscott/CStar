import {
    summarizeRecentMcpUsage,
    summarizeRecentMcpUsefulness,
} from '../telemetry/usage.js';
import { summarizeRecentTokenPathIntegration } from '../telemetry/token_path.js';
import {
    errorResponse,
    mcpGuardrail,
    textResponse,
    type McpTextResponse,
} from '../contracts/responses.js';

export async function handleTelemetry({
    section,
}: {
    section?: 'all' | 'usage' | 'usefulness' | 'token_path';
}): Promise<McpTextResponse> {
    try {
        const which = section ?? 'all';
        const payload: Record<string, unknown> = {
            status: 'ok',
            section: which,
            guardrail: mcpGuardrail('allow', 'continue', 'Telemetry was read successfully.'),
        };
        if (which === 'all' || which === 'usage') {
            payload.usage = summarizeRecentMcpUsage();
        }
        if (which === 'all' || which === 'usefulness') {
            payload.usefulness = summarizeRecentMcpUsefulness();
        }
        if (which === 'all' || which === 'token_path') {
            payload.token_path = summarizeRecentTokenPathIntegration();
        }
        return textResponse(payload);
    } catch (error) {
        return errorResponse(error);
    }
}
