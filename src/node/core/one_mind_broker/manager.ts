import { buildHallRepositoryId, normalizeHallPath, type HallOneMindBrokerRecord } from '../../../types/hall.js';
import { getHallOneMindBroker, saveHallOneMindBroker } from '../../../tools/pennyone/intel/database.js';
import { isHostSessionActive, resolveHostProvider } from '../../../core/host_session.js';
import { getOneMindFulfillmentCapability } from './fulfillment.js';

export interface OneMindBrokerStatus {
    running: boolean;
    responsive: boolean;
    fulfillmentReady: boolean;
    fulfillmentReason: string | null;
    fulfillmentMode: string | null;
    executionSurface: string | null;
    provider: string | null;
    sessionId: string | null;
    pid: number | null;
    port: number | null;
    bindingState: 'UNBOUND' | 'BOUND' | 'OFFLINE';
}

function mapRecordToStatus(record: HallOneMindBrokerRecord | null): OneMindBrokerStatus {
    if (!record || record.status === 'OFFLINE') {
        return {
            running: false,
            responsive: false,
            fulfillmentReady: false,
            fulfillmentReason: typeof record?.metadata?.fulfillment_reason === 'string' ? record.metadata.fulfillment_reason : null,
            fulfillmentMode: typeof record?.metadata?.fulfillment_mode === 'string' ? record.metadata.fulfillment_mode : null,
            executionSurface: typeof record?.metadata?.execution_surface === 'string' ? record.metadata.execution_surface : null,
            provider: record?.provider ?? null,
            sessionId: record?.session_id ?? null,
            pid: null,
            port: null,
            bindingState: 'OFFLINE',
        };
    }

    return {
        running: true,
        responsive: true,
        fulfillmentReady: record.fulfillment_ready,
        fulfillmentReason: typeof record.metadata?.fulfillment_reason === 'string' ? record.metadata.fulfillment_reason : null,
        fulfillmentMode: typeof record.metadata?.fulfillment_mode === 'string' ? record.metadata.fulfillment_mode : null,
        executionSurface: typeof record.metadata?.execution_surface === 'string' ? record.metadata.execution_surface : null,
        provider: record.provider ?? null,
        sessionId: record.session_id ?? null,
        pid: null,
        port: null,
        bindingState: record.binding_state,
    };
}

function buildRecord(rootPath: string, env: NodeJS.ProcessEnv, status: HallOneMindBrokerRecord['status']): HallOneMindBrokerRecord {
    const now = Date.now();
    const hostActive = isHostSessionActive(env);
    const fulfillment = getOneMindFulfillmentCapability(env);
    return {
        repo_id: buildHallRepositoryId(normalizeHallPath(rootPath)),
        status,
        binding_state: hostActive ? 'BOUND' : 'UNBOUND',
        fulfillment_ready: status === 'READY' && hostActive ? fulfillment.ready : false,
        provider: fulfillment.provider ?? resolveHostProvider(env) ?? undefined,
        session_id: env.CODEX_THREAD_ID ?? undefined,
        control_plane: 'hall',
        metadata: {
            host_session_active: hostActive,
            host_provider: resolveHostProvider(env) ?? null,
            fulfillment_reason: fulfillment.reason,
            fulfillment_mode: hostActive && fulfillment.ready ? 'host_session' : 'offline',
            execution_surface: hostActive && fulfillment.ready
                ? (fulfillment.reason === 'configured-codex-host-bridge' ? 'configured-bridge' : 'host-cli-inference')
                : 'unavailable',
        },
        created_at: now,
        updated_at: now,
    };
}

export async function getOneMindBrokerStatus(rootPath: string): Promise<OneMindBrokerStatus> {
    return mapRecordToStatus(getHallOneMindBroker(rootPath));
}

export async function ensureOneMindBroker(rootPath: string, env: NodeJS.ProcessEnv = process.env): Promise<OneMindBrokerStatus> {
    const existing = getHallOneMindBroker(rootPath);
    const nextRecord = {
        ...buildRecord(rootPath, env, 'READY'),
        created_at: existing?.created_at ?? Date.now(),
    };
    saveHallOneMindBroker(nextRecord, rootPath);
    return mapRecordToStatus(nextRecord);
}

export async function stopOneMindBroker(rootPath: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    const existing = getHallOneMindBroker(rootPath);
    if (!existing || existing.status === 'OFFLINE') {
        return false;
    }

    saveHallOneMindBroker({
        ...buildRecord(rootPath, env, 'OFFLINE'),
        binding_state: 'UNBOUND',
        fulfillment_ready: false,
        created_at: existing.created_at,
    }, rootPath);
    return true;
}
