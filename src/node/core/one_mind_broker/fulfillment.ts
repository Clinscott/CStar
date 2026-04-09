import path from 'node:path';
import Database from 'better-sqlite3';

import {
    claimHallOneMindRequest,
    getHallSkillActivation,
    claimNextHallOneMindRequest,
    getHallOneMindBroker,
    getHallOneMindRequest,
    listHallOneMindRequests,
    saveHallOneMindBroker,
    saveHallOneMindRequest,
} from '../../../tools/pennyone/intel/database.js';
import { requestHostText } from '../../../core/host_intelligence.js';
import {
    requestHostDelegatedExecution,
    resolveHostDelegatedExecution,
    type DelegatedExecutionRequest,
} from '../../../core/host_delegation.js';
import { ensureHealthySynapseDb } from '../../../core/synapse_db.js';
import { buildHallRepositoryId, normalizeHallPath, type HallOneMindRequestRecord } from '../../../types/hall.js';
import { isHostSessionActive, resolveConfiguredDelegatePollBridge, resolveConfiguredHostBridge, resolveHostProvider } from '../../../core/host_session.js';
import { reconcileDelegatedWorkflowRequest } from '../runtime/host_workflows/delegated_request_reconciler.js';
import { StateRegistry } from '../state.js';

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
    outcome: 'fulfilled' | 'failed' | 'idle' | 'deferred';
    requestId?: string;
    responseText?: string;
    error?: string;
}

export interface OneMindFulfillmentDependencies {
    hostTextInvoker?: typeof requestHostText;
    delegatedExecutionInvoker?: typeof requestHostDelegatedExecution;
    delegatedExecutionResolver?: typeof resolveHostDelegatedExecution;
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
    const dbPath = path.join(rootPath, '.stats', 'synapse.db');
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

function withControlRoot<T>(rootPath: string, action: () => T): T {
    const previous = process.env.CSTAR_CONTROL_ROOT;
    process.env.CSTAR_CONTROL_ROOT = rootPath;
    try {
        return action();
    } finally {
        if (previous === undefined) {
            delete process.env.CSTAR_CONTROL_ROOT;
        } else {
            process.env.CSTAR_CONTROL_ROOT = previous;
        }
    }
}

function asString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function resolveDelegatedTelemetryBeadId(rootPath: string, request: HallOneMindRequestRecord): string {
    const activationId = asString(request.metadata?.activation_id);
    if (activationId) {
        const activation = getHallSkillActivation(activationId, rootPath);
        const beadId = asString(activation?.bead_id);
        if (beadId) {
            return beadId;
        }
    }

    return asString(request.metadata?.bead_id)
        ?? asString(request.metadata?.source_bead_id)
        ?? asString(request.metadata?.branch_id)
        ?? request.request_id;
}

function ensureAgentFocusRecord(agentId: string, state: ReturnType<typeof StateRegistry.get>) {
    if (state.agents[agentId]) {
        return;
    }
    state.agents[agentId] = {
        id: agentId,
        name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
        status: 'SLEEPING',
        last_seen: 0,
    };
}

function markDelegatedRequestActive(rootPath: string, request: HallOneMindRequestRecord, provider: string): void {
    const beadId = resolveDelegatedTelemetryBeadId(rootPath, request);
    const runtimeWeave = asString(request.metadata?.runtime_weave) ?? asString(request.metadata?.task_kind) ?? 'delegated-request';
    const missionId = asString(request.metadata?.mission_id) ?? `MISSION-ONE-MIND-${request.request_id}`;
    const taskLabel = `Delegated fulfillment: ${request.request_id}`;

    withControlRoot(rootPath, () => {
        StateRegistry.updateMission(missionId, taskLabel, beadId);
        const state = StateRegistry.get();
        ensureAgentFocusRecord(provider, state);
        state.agents[provider].status = 'WORKING';
        state.agents[provider].active_bead_id = beadId;
        state.agents[provider].current_task = taskLabel;
        state.agents[provider].last_seen = Date.now();
        StateRegistry.save(state);
        StateRegistry.postToBlackboard({
            from: state.framework.active_persona,
            to: provider,
            message: `Starting task: ${runtimeWeave} :: ${beadId}`,
            type: 'INFO',
        });
    });
}

function markDelegatedRequestSettled(rootPath: string, provider: string): void {
    withControlRoot(rootPath, () => {
        const state = StateRegistry.get();
        ensureAgentFocusRecord(provider, state);
        state.agents[provider].status = 'SLEEPING';
        state.agents[provider].active_bead_id = undefined;
        state.agents[provider].current_task = undefined;
        state.agents[provider].pid = undefined;
        state.agents[provider].last_seen = Date.now();
        StateRegistry.save(state);
    });
}

function normalizeDelegatedBoundary(boundary: HallOneMindRequestRecord['boundary']): 'subagent' | 'autobot' {
    return boundary === 'autobot' ? 'autobot' : 'subagent';
}

function buildDelegatedRequestFromHall(request: HallOneMindRequestRecord, rootPath: string): DelegatedExecutionRequest {
    const metadata = request.metadata ?? {};
    return {
        request_id: request.request_id,
        repo_root: rootPath,
        boundary: normalizeDelegatedBoundary(request.boundary),
        task_kind: String(metadata.task_kind ?? 'research') as DelegatedExecutionRequest['task_kind'],
        subagent_profile: typeof metadata.subagent_profile === 'string' ? metadata.subagent_profile as DelegatedExecutionRequest['subagent_profile'] : undefined,
        prompt: request.prompt,
        target_paths: Array.isArray(metadata.target_paths)
            ? metadata.target_paths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : undefined,
        acceptance_criteria: Array.isArray(metadata.acceptance_criteria)
            ? metadata.acceptance_criteria.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : undefined,
        checker_shell: typeof metadata.checker_shell === 'string' ? metadata.checker_shell : null,
        metadata,
    };
}

async function fulfillDelegatedRequest(
    rootPath: string,
    request: HallOneMindRequestRecord,
    env: NodeJS.ProcessEnv,
    dependencies: OneMindFulfillmentDependencies,
): Promise<OneMindFulfillmentResult> {
    const metadata = request.metadata ?? {};
    const provider = typeof metadata.provider === 'string'
        ? metadata.provider
        : resolveHostProvider(env);
    if (provider !== 'codex' && provider !== 'gemini' && provider !== 'claude') {
        return {
            outcome: 'failed',
            requestId: request.request_id,
            error: 'Delegated fulfillment requires a supported host provider.',
        };
    }

    const delegatedExecutionInvoker = dependencies.delegatedExecutionInvoker ?? requestHostDelegatedExecution;
    const delegatedExecutionResolver = dependencies.delegatedExecutionResolver ?? resolveHostDelegatedExecution;
    const handleId = typeof metadata.handle_id === 'string' ? metadata.handle_id.trim() : '';
    const subagentProfile = typeof metadata.subagent_profile === 'string' ? metadata.subagent_profile : undefined;

    try {
        const delegated = handleId
            ? await delegatedExecutionResolver(
                {
                    handle_id: handleId,
                    request_id: request.request_id,
                    repo_root: rootPath,
                    provider,
                    subagent_profile: subagentProfile as any,
                },
                env,
            )
            : await delegatedExecutionInvoker(buildDelegatedRequestFromHall(request, rootPath), env);

        if (delegated.status === 'completed') {
            const completed = finalizeRequest(rootPath, request, {
                request_status: 'COMPLETED',
                transport_preference: 'host_session',
                response_text: delegated.raw_text ?? delegated.summary ?? '',
                error_text: undefined,
                completed_at: Date.now(),
                metadata: {
                    provider: delegated.provider,
                    handle_id: delegated.handle_id,
                    execution_surface: delegated.metadata?.execution_surface ?? 'configured-delegate-bridge',
                    fulfillment_mode: 'delegate_bridge',
                    delegation_mode: delegated.metadata?.delegation_mode ?? 'configured-bridge',
                    delegation_status: delegated.status,
                    verification: delegated.verification ?? null,
                    artifacts: delegated.artifacts ?? null,
                },
            });
            await reconcileDelegatedWorkflowRequest(rootPath, completed, env);
            markDelegatedRequestSettled(rootPath, delegated.provider);
            return {
                outcome: 'fulfilled',
                requestId: completed.request_id,
                responseText: completed.response_text,
            };
        }

        if (delegated.status === 'failed' || delegated.status === 'cancelled') {
            const failed = finalizeRequest(rootPath, request, {
                request_status: 'FAILED',
                error_text: delegated.error ?? `Delegated execution returned ${delegated.status}.`,
                completed_at: Date.now(),
                metadata: {
                    provider: delegated.provider,
                    handle_id: delegated.handle_id,
                    execution_surface: delegated.metadata?.execution_surface ?? 'configured-delegate-bridge',
                    fulfillment_mode: 'delegate_bridge',
                    delegation_mode: delegated.metadata?.delegation_mode ?? 'configured-bridge',
                    delegation_status: delegated.status,
                },
            });
            await reconcileDelegatedWorkflowRequest(rootPath, failed, env);
            markDelegatedRequestSettled(rootPath, delegated.provider);
            return {
                outcome: 'failed',
                requestId: failed.request_id,
                error: failed.error_text,
            };
        }

        if (!resolveConfiguredDelegatePollBridge(env, delegated.provider)) {
            const failed = finalizeRequest(rootPath, request, {
                request_status: 'FAILED',
                error_text: `Delegated execution for ${delegated.provider} returned non-terminal status '${delegated.status}' without a configured poll bridge.`,
                completed_at: Date.now(),
                metadata: {
                    provider: delegated.provider,
                    handle_id: delegated.handle_id,
                    delegation_status: delegated.status,
                    fulfillment_mode: 'delegate_bridge',
                    execution_surface: delegated.metadata?.execution_surface ?? 'configured-delegate-bridge',
                },
            });
            markDelegatedRequestSettled(rootPath, delegated.provider);
            return {
                outcome: 'failed',
                requestId: failed.request_id,
                error: failed.error_text,
            };
        }

        const claimed = finalizeRequest(rootPath, request, {
            request_status: 'CLAIMED',
            transport_preference: 'host_session',
            completed_at: undefined,
            metadata: {
                provider: delegated.provider,
                handle_id: delegated.handle_id,
                delegation_status: delegated.status,
                fulfillment_mode: 'delegate_bridge',
                execution_surface: delegated.metadata?.execution_surface ?? 'configured-delegate-bridge',
                delegation_mode: delegated.metadata?.delegation_mode ?? 'configured-bridge',
            },
        });
        return {
            outcome: 'deferred',
            requestId: claimed.request_id,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = finalizeRequest(rootPath, request, {
            request_status: 'FAILED',
            error_text: message,
            completed_at: Date.now(),
            metadata: {
                provider,
                fulfillment_mode: 'delegate_bridge',
            },
        });
        await reconcileDelegatedWorkflowRequest(rootPath, failed, env);
        markDelegatedRequestSettled(rootPath, provider);
        return {
            outcome: 'failed',
            requestId: failed.request_id,
            error: failed.error_text,
        };
    }
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
        : claimHallOneMindRequest(
            request.request_id,
            rootPath,
            `one-mind:${process.pid}`,
            ['PENDING'],
            [request.boundary],
        );

    if (!claimed || claimed.request_id !== request.request_id) {
        return {
            outcome: 'failed',
            requestId,
            error: `Unable to claim request '${requestId}' for fulfillment.`,
        };
    }

    if (claimed.boundary !== 'primary') {
        let requestForFulfillment = claimed;
        const telemetryProvider = capability.provider ?? asString(claimed.metadata?.provider);
        if (!asString(requestForFulfillment.metadata?.broker_state_started_at) && telemetryProvider) {
            markDelegatedRequestActive(rootPath, requestForFulfillment, telemetryProvider);
            requestForFulfillment = finalizeRequest(rootPath, requestForFulfillment, {
                metadata: {
                    broker_state_started_at: String(Date.now()),
                    broker_state_provider: telemetryProvider,
                },
            });
        }
        return fulfillDelegatedRequest(rootPath, requestForFulfillment, env, dependencies);
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
    const claimedDelegated = listHallOneMindRequests(rootPath, ['CLAIMED'])
        .filter((request) => request.boundary !== 'primary')
        .sort((left, right) => left.created_at - right.created_at)[0];
    if (claimedDelegated) {
        return fulfillOneMindRequestById(rootPath, claimedDelegated.request_id, env, dependencies);
    }

    const request = claimNextHallOneMindRequest(rootPath, `one-mind:${process.pid}`, ['PENDING'], ['primary', 'subagent', 'autobot']);
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
