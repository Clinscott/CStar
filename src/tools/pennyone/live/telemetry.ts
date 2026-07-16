import type { Request, Response } from 'express';
import type { SubspaceRelay } from './socket.js';
import { PENNYONE_LIVE_RETIRED } from './recorder.js';

export function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

/** Retired before reading request bodies, broadcasting, or writing Hall state. */
export async function handleTelemetryPing(
    _request: Request,
    response: Response,
    _relay: SubspaceRelay,
    _targetRepo: string,
): Promise<unknown> {
    return response.status(410).json({ error: PENNYONE_LIVE_RETIRED });
}

/** Retired before reading request bodies, broadcasting, or writing Hall state. */
export async function handleTelemetryTrace(
    _request: Request,
    response: Response,
    _relay: SubspaceRelay,
): Promise<unknown> {
    return response.status(410).json({ error: PENNYONE_LIVE_RETIRED });
}
