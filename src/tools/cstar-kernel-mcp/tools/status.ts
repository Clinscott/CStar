import { createHash } from 'node:crypto';
import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { StateRegistry } from '../../../node/core/state.js';
import { parseCanonicalPersona } from '../../../core/persona_contract.js';
import {
    readActivePersonaProjectionState,
    type ActivePersonaProjectionState,
} from '../../pennyone/persona_projection.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { buildKernelRuntimeLineage, evaluateKernelForgeReadiness } from '../contracts/runtime.js';
import {
    getForgeAttemptByExecutionReceipt,
    getForgeRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { inspectForgeAttemptRecovery } from './forge_attempt_recovery.js';
import { verifyMountedSpokeAuthority } from '../../../node/core/spokes/spoke_attachment_authority.js';

export interface StatusArgs {
    forge_execution_receipt_id?: string;
}

export function buildStatusPersonaProjection(
    personaName: unknown,
    projectionStatus: ActivePersonaProjectionState['projection_status'] = 'unavailable',
): Record<string, unknown> {
    const persona = parseCanonicalPersona(personaName);
    if (!persona || projectionStatus === 'unavailable'
        || projectionStatus === 'bounded_config_invalid'
        || projectionStatus === 'bounded_config_reader_unavailable') {
        const reportedStatus = projectionStatus === 'bounded_config_invalid'
            || projectionStatus === 'bounded_config_reader_unavailable'
            ? projectionStatus : 'unavailable';
        const freshnessGap = projectionStatus === 'bounded_config_invalid'
            ? 'active_persona_configuration_invalid'
            : projectionStatus === 'bounded_config_reader_unavailable'
                ? 'active_persona_reader_unavailable'
                : 'active_persona_projection_unavailable';
        return {
            persona: null,
            persona_projection_status: reportedStatus,
            persona_freshness_gap: freshnessGap,
        };
    }
    return {
        persona,
        persona_projection_status: projectionStatus,
    };
}

// cstar_status — deterministic vitals snapshot from StateRegistry.
export async function handleStatus(args: StatusArgs = {}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const snapshot = StateRegistry.get();
        const fw = snapshot.framework;
        const personaProjection = readActivePersonaProjectionState(root);
        const runtimeLineage = buildKernelRuntimeLineage();
        const forgeReadiness = evaluateKernelForgeReadiness(runtimeLineage);

        let hallReachable = false;
        let forgeExecution: Record<string, unknown> | undefined;
        try {
            const db = database.getReadDb(root);
            hallReachable = db !== null;
            if (args.forge_execution_receipt_id) {
                const attempt = getForgeAttemptByExecutionReceipt(
                    db,
                    args.forge_execution_receipt_id,
                );
                const request = attempt ? getForgeRequest(db, attempt.request_id) : null;
                forgeExecution = attempt && request ? {
                    found: true,
                    execution_receipt_id: attempt.execution_receipt_id,
                    attempt_id: attempt.attempt_id,
                    attempt_status: attempt.status,
                    request_status: request.status,
                    result_status: attempt.result_status ?? null,
                    error_code: attempt.error_code ?? null,
                    spawn_started_at: attempt.spawn_started_at ?? null,
                    completed_at: attempt.completed_at ?? null,
                    recovery: inspectForgeAttemptRecovery(root, attempt),
                } : {
                    found: false,
                    execution_receipt_id: args.forge_execution_receipt_id,
                };
            }
        } catch {
            hallReachable = false;
        }

        const uptimeSeconds = fw.last_awakening > 0
            ? Math.max(0, Math.floor((Date.now() - fw.last_awakening) / 1000))
            : null;

        return textResponse({
            framework: {
                status: fw.status,
                last_awakening: fw.last_awakening,
                uptime_seconds: uptimeSeconds,
                active_task: fw.active_task,
                mission_id: fw.mission_id,
                bead_id: fw.bead_id,
                gungnir_score: fw.gungnir_score,
                intent_integrity: fw.intent_integrity,
            },
            ...buildStatusPersonaProjection(
                personaProjection.active_persona,
                personaProjection.projection_status,
            ),
            workspace: createHash('sha256').update(root, 'utf-8').digest('hex'),
            runtime_lineage: runtimeLineage,
            readiness: {
                kernel_root_binding: runtimeLineage.binding_mode === 'live_launcher',
                dependency_lineage: runtimeLineage.dependency_lineage === 'verified_lock_match',
                forge_runtime_manifest: runtimeLineage.forge_runtime_manifest_present,
                forge: forgeReadiness.ready,
                forge_failures: forgeReadiness.failures,
            },
            hall_reachable: hallReachable,
            ...(forgeExecution ? { forge_execution: forgeExecution } : {}),
            managed_spokes: snapshot.managed_spokes.map((s) => {
                const full = database.getHallMountedSpoke(s.slug, root);
                const authority = full ? verifyMountedSpokeAuthority(full) : {
                    authority_verification: 'failed' as const,
                    failure_code: 'spoke_attachment_wrong_hub' as const,
                    mount_token: 'unproven' as const,
                };
                return {
                    slug: s.slug,
                    mount_status: s.mount_status,
                    trust_level: s.trust_level,
                    write_policy: s.write_policy,
                    authority_verification: authority.authority_verification,
                    ...(authority.failure_code ? { authority_failure_code: authority.failure_code } : {}),
                    mount_token: authority.mount_token,
                };
            }),
            agents: Object.values(snapshot.agents).map((a) => ({
                id: a.id,
                name: a.name,
                status: a.status,
                last_seen: a.last_seen || null,
            })),
        });
    } catch (error) {
        return errorResponse(error);
    }
}
