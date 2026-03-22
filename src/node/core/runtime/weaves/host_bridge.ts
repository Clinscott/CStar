import { requestHostText } from  '../../../../core/host_intelligence.js';
import type { HostProvider } from  '../../../../core/host_session.js';
import { resolveHostProvider } from  '../../../../core/host_session.js';
import type { RuntimeContext } from  '../contracts.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    provider: HostProvider;
    projectRoot: string;
    source: string;
    env?: NodeJS.ProcessEnv;
}

export type HostTextInvoker = (request: HostTextRequest) => Promise<string>;

export function resolveRuntimeHostProvider(context: RuntimeContext): HostProvider | null {
    return resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);
}

export async function defaultHostTextInvoker(request: HostTextRequest): Promise<string> {
    const result = await requestHostText({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        projectRoot: request.projectRoot,
        source: request.source,
        provider: request.provider,
        env: request.env,
    });
    return result.text;
}

export function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host session did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
