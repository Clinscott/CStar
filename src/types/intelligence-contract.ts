import { randomUUID } from 'node:crypto';

export type IntelligenceTransportMode = 'auto' | 'host_session' | 'synapse_db';
export type IntelligenceStatus = 'success' | 'error';

export interface IntelligenceCaller {
    source: string;
    persona?: string;
    sector_path?: string;
    workflow?: string;
}

export interface IntelligenceRequest {
    prompt: string;
    system_prompt?: string;
    transport_mode?: IntelligenceTransportMode;
    correlation_id?: string;
    caller?: IntelligenceCaller;
    metadata?: Record<string, unknown>;
}

export interface NormalizedIntelligenceRequest {
    prompt: string;
    system_prompt?: string;
    transport_mode: IntelligenceTransportMode;
    correlation_id: string;
    caller: IntelligenceCaller;
    metadata: Record<string, unknown>;
}

export interface IntelligenceTrace {
    correlation_id: string;
    transport_mode: Exclude<IntelligenceTransportMode, 'auto'>;
    cached?: boolean;
}

export interface IntelligenceResponse {
    status: IntelligenceStatus;
    raw_text?: string;
    parsed_data?: unknown;
    error?: string;
    trace: IntelligenceTrace;
}

export function normalizeIntelligenceRequest(
    request: IntelligenceRequest,
    defaultSource: string,
): NormalizedIntelligenceRequest {
    return {
        prompt: request.prompt,
        system_prompt: request.system_prompt,
        transport_mode: request.transport_mode ?? 'auto',
        correlation_id: request.correlation_id ?? randomUUID(),
        caller: request.caller ?? { source: defaultSource },
        metadata: request.metadata ?? {},
    };
}

export function buildEffectivePrompt(request: NormalizedIntelligenceRequest): string {
    if (!request.system_prompt) {
        return request.prompt;
    }

    return `SYSTEM:\n${request.system_prompt}\n\nUSER:\n${request.prompt}`;
}

export function parseStructuredPayload(rawText: string): unknown {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        // Fall through and try to extract the first JSON object or array.
    }

    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
        try {
            return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
        } catch {
            // Ignore and continue.
        }
    }

    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        try {
            return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
        } catch {
            return undefined;
        }
    }

    return undefined;
}

export function buildIntelligenceSuccess(
    request: NormalizedIntelligenceRequest,
    rawText: string,
    transportMode: Exclude<IntelligenceTransportMode, 'auto'>,
    cached = false,
): IntelligenceResponse {
    return {
        status: 'success',
        raw_text: rawText,
        parsed_data: parseStructuredPayload(rawText),
        trace: {
            correlation_id: request.correlation_id,
            transport_mode: transportMode,
            cached,
        },
    };
}

export function buildIntelligenceError(
    request: NormalizedIntelligenceRequest,
    error: string,
    transportMode: Exclude<IntelligenceTransportMode, 'auto'>,
): IntelligenceResponse {
    return {
        status: 'error',
        error,
        trace: {
            correlation_id: request.correlation_id,
            transport_mode: transportMode,
        },
    };
}
