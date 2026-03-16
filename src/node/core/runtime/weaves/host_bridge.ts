import { MimirClient } from '../../../../core/mimir_client.ts';
import type { HostProvider } from '../../../../core/host_session.ts';
import { resolveHostProvider } from '../../../../core/host_session.ts';
import type { RuntimeContext } from '../contracts.ts';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    provider: HostProvider;
    projectRoot: string;
    source: string;
}

export type HostTextInvoker = (request: HostTextRequest) => Promise<string>;

export function resolveRuntimeHostProvider(context: RuntimeContext): HostProvider | null {
    return resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);
}

export async function defaultHostTextInvoker(request: HostTextRequest): Promise<string> {
    const client = new MimirClient({
        projectRoot: request.projectRoot,
        hostSessionActive: true,
        hostProvider: request.provider,
    });
    const response = await client.request({
        prompt: request.prompt,
        system_prompt: request.systemPrompt,
        caller: { source: request.source },
        transport_mode: 'host_session',
    });

    if (response.status !== 'success') {
        throw new Error(response.error ?? `${request.provider} host session invocation failed.`);
    }

    const rawText = String(response.raw_text ?? '').trim();
    if (!rawText) {
        throw new Error(`${request.provider} host session returned no output.`);
    }

    return rawText;
}

export function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host session did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
