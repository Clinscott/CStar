import path from 'node:path';
import Database from 'better-sqlite3';

import {
    claimHallOneMindRequest,
    claimNextHallOneMindRequest,
    getHallOneMindBroker,
    getHallOneMindRequest,
    listHallOneMindRequests,
    saveHallOneMindBroker,
    saveHallOneMindRequest,
} from '../../../tools/pennyone/intel/database.js';
import { requestHostText } from '../../../core/host_intelligence.js';
import { ensureHealthySynapseDb } from '../../../core/synapse_db.js';
import { buildHallRepositoryId, normalizeHallPath, type HallOneMindRequestRecord } from '../../../types/hall.js';
import { isHostSessionActive, resolveConfiguredHostBridge, resolveHostProvider } from '../../../core/host_session.js';

export interface OneMindFulfillmentCapability {
    ready: boolean;
    provider: string | null;
    reason: string;
}

function resolveExecutionSurface(capability: OneMindFulfillmentCapability): string {
    if (capability.reason === 'configured-codex-host-bridge') {
        return 'configured-bridge';
    }
    if (capability.reason === 'codex-host-cli-inference') {
        return 'host-cli-inference';
    }
    if (capability.reason.endsWith('-host-session-available')) {
        return 'host-cli-inference';
    }
    return 'unavailable';
}

export interface OneMindFulfillmentResult {
    outcome: 'fulfilled' | 'failed' | 'idle';
    requestId?: string;
    responseText?: string;
    error?: string;
}

export interface OneMindFulfillmentDependencies {
    hostTextInvoker?: typeof requestHostText;
}

function buildRepoId(rootPath: string): string {
    return buildHallRepositoryId(normalizeHallPath(rootPath));
}

export function getOneMindFulfillmentCapability(
    env: NodeJS.ProcessEnv = process.env,
): OneMindFulfillmentCapability {
    const provider = resolveHostProvider(env);
    if (!isHostSessionActive(env) || !provider) {
        return { ready: false, provider: null, reason: 'host-session-inactive' };
    }

    if (provider === 'codex') {
        const explicitBridge = resolveConfiguredHostBridge(env, provider);
        if (explicitBridge) {
            return { ready: true, provider, reason: 'configured-codex-host-bridge' };
        }
        return { ready: true, provider, reason: 'codex-host-cli-inference' };
    }

    return { ready: true, provider, reason: `${provider}-host-session-available` };
}

export function syncOneMindBrokerFulfillment(
    rootPath: string,
    env: NodeJS.ProcessEnv = process.env,
): void {
    const existing = getHallOneMindBroker(rootPath);
    if (!existing || existing.status === 'OFFLINE') {
        return;
    }

    const capability = getOneMindFulfillmentCapability(env);
    saveHallOneMindBroker({
        ...existing,
        fulfillment_ready: capability.ready && existing.binding_state === 'BOUND',
        provider: capability.provider ?? existing.provider,
        metadata: {
            ...(existing.metadata ?? {}),
            fulfillment_reason: capability.reason,
            fulfillment_mode: capability.ready ? 'host_session' : 'offline',
            execution_surface: resolveExecutionSurface(capability),
        },
        updated_at: Date.now(),
    }, rootPath);
}

function updateSynapseRecord(
    rootPath: string,
    synapseId: number,
    status: 'COMPLETED' | 'FAILED',
    responseOrError: string,
): void {
    const dbPath = path.join(rootPath, '.agents', 'synapse.db');
    ensureHealthySynapseDb(dbPath);
    const db = new Database(dbPath);
    try {
        db.prepare('UPDATE synapse SET response = ?, status = ? WHERE id = ?')
            .run(responseOrError, status, synapseId);
    } finally {
        db.close();
    }
}

function finalizeRequest(
    rootPath: string,
    request: HallOneMindRequestRecord,
    fields: Partial<HallOneMindRequestRecord>,
): HallOneMindRequestRecord {
    const nextRecord: HallOneMindRequestRecord = {
        ...request,
        ...fields,
        metadata: {
            ...(request.metadata ?? {}),
            ...(fields.metadata ?? {}),
        },
        updated_at: Date.now(),
    };
    saveHallOneMindRequest(nextRecord, rootPath);
    return nextRecord;
}

export async function fulfillOneMindRequestById(
    rootPath: string,
    requestId: string,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    const request = getHallOneMindRequest(requestId, rootPath);
    if (!request) {
        return {
            outcome: 'failed',
            requestId,
            error: `No Hall One Mind request found for '${requestId}'.`,
        };
    }

    if (request.request_status === 'COMPLETED') {
        return {
            outcome: 'fulfilled',
            requestId,
            responseText: request.response_text,
        };
    }

    if (request.request_status === 'FAILED' || request.request_status === 'CANCELLED') {
        return {
            outcome: 'failed',
            requestId,
            error: request.error_text ?? `Request is already ${request.request_status}.`,
        };
    }

    const capability = getOneMindFulfillmentCapability(env);
    if (!capability.ready || !capability.provider) {
        return {
            outcome: 'failed',
            requestId,
            error: `One Mind fulfillment unavailable: ${capability.reason}`,
        };
    }

    const claimed = request.request_status === 'CLAIMED'
        ? request
        : claimHallOneMindRequest(request.request_id, rootPath, `one-mind:${process.pid}`, ['PENDING']);

    if (!claimed || claimed.request_id !== request.request_id) {
        return {
            outcome: 'failed',
            requestId,
            error: `Unable to claim request '${requestId}' for fulfillment.`,
        };
    }

    try {
        const hostTextInvoker = dependencies.hostTextInvoker ?? requestHostText;
        const result = await hostTextInvoker({
            prompt: claimed.prompt,
            systemPrompt: claimed.system_prompt,
            projectRoot: rootPath,
            source: `one-mind:fulfill:${claimed.request_id}`,
            env,
            provider: capability.provider as any,
            correlationId: claimed.request_id,
            metadata: {
                ...(claimed.metadata ?? {}),
                transport_mode: 'host_session',
                one_mind_boundary: 'primary',
            },
        });

        const completed = finalizeRequest(rootPath, claimed, {
            request_status: 'COMPLETED',
            transport_preference: 'host_session',
            response_text: result.text,
            error_text: undefined,
            completed_at: Date.now(),
            metadata: {
                provider: result.provider,
                fulfillment_reason: capability.reason,
                fulfillment_mode: 'host_session',
                execution_surface: resolveExecutionSurface(capability),
            },
        });

        const synapseId = Number(completed.metadata?.synapse_id ?? 0);
        if (Number.isFinite(synapseId) && synapseId > 0) {
            updateSynapseRecord(rootPath, synapseId, 'COMPLETED', result.text);
        }

        return {
            outcome: 'fulfilled',
            requestId: completed.request_id,
            responseText: result.text,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = finalizeRequest(rootPath, claimed, {
            request_status: 'FAILED',
            error_text: message,
            completed_at: Date.now(),
            metadata: {
                fulfillment_reason: capability.reason,
                fulfillment_mode: 'host_session',
                execution_surface: resolveExecutionSurface(capability),
            },
        });

        const synapseId = Number(failed.metadata?.synapse_id ?? 0);
        if (Number.isFinite(synapseId) && synapseId > 0) {
            updateSynapseRecord(rootPath, synapseId, 'FAILED', message);
        }

        return {
            outcome: 'failed',
            requestId: failed.request_id,
            error: message,
        };
    }
}

export async function fulfillNextOneMindRequest(
    rootPath: string,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: OneMindFulfillmentDependencies = {},
): Promise<OneMindFulfillmentResult> {
    syncOneMindBrokerFulfillment(rootPath, env);
    const capability = getOneMindFulfillmentCapability(env);
    if (!capability.ready) {
        return {
            outcome: 'failed',
            error: `One Mind fulfillment unavailable: ${capability.reason}`,
        };
    }
    const request = claimNextHallOneMindRequest(rootPath, `one-mind:${process.pid}`, ['PENDING']);
    if (!request) {
        return { outcome: 'idle' };
    }
    return fulfillOneMindRequestById(rootPath, request.request_id, env, dependencies);
}

export function getOneMindQueueSummary(rootPath: string): Record<string, number> {
    const requests = listHallOneMindRequests(rootPath);
    return requests.reduce<Record<string, number>>((acc, request) => {
        acc[request.request_status] = (acc[request.request_status] ?? 0) + 1;
        return acc;
    }, {});
}

export function seedHallBrokerIfMissing(
    rootPath: string,
    env: NodeJS.ProcessEnv = process.env,
): void {
    if (getHallOneMindBroker(rootPath)) {
        syncOneMindBrokerFulfillment(rootPath, env);
        return;
    }

    const capability = getOneMindFulfillmentCapability(env);
    const now = Date.now();
    saveHallOneMindBroker({
        repo_id: buildRepoId(rootPath),
        status: 'READY',
        binding_state: isHostSessionActive(env) ? 'BOUND' : 'UNBOUND',
        fulfillment_ready: capability.ready && isHostSessionActive(env),
        provider: capability.provider ?? undefined,
        session_id: env.CODEX_THREAD_ID ?? undefined,
        control_plane: 'hall',
        metadata: {
            fulfillment_reason: capability.reason,
        },
        created_at: now,
        updated_at: now,
    }, rootPath);
}
