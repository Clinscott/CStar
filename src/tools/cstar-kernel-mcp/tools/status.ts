import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { StateRegistry } from '../../../node/core/state.js';
import { parseCanonicalPersona } from '../../../core/persona_contract.js';
import {
    readHallPersonaProjectionState,
    type HallPersonaProjectionState,
} from '../../pennyone/persona_projection.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { buildKernelRuntimeLineage, evaluateKernelForgeReadiness } from '../contracts/runtime.js';

export function buildStatusPersonaProjection(
    personaName: unknown,
    projectionStatus: HallPersonaProjectionState['projection_status'] = 'unavailable',
): Record<string, unknown> {
    const persona = parseCanonicalPersona(personaName);
    if (!persona || projectionStatus === 'unavailable') {
        return {
            persona: null,
            persona_projection_status: 'unavailable',
            persona_freshness_gap: 'active_persona_projection_unavailable',
        };
    }
    return {
        persona,
        persona_projection_status: projectionStatus,
    };
}

// cstar_status — deterministic vitals snapshot from StateRegistry.
export async function handleStatus(): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const snapshot = StateRegistry.get();
        const fw = snapshot.framework;
        const personaProjection = readHallPersonaProjectionState(root);
        const runtimeLineage = buildKernelRuntimeLineage();
        const forgeReadiness = evaluateKernelForgeReadiness(runtimeLineage);

        let hallReachable = false;
        try {
            const db = database.getReadDb(root);
            hallReachable = db !== null;
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
            workspace: root,
            runtime_lineage: runtimeLineage,
            readiness: {
                kernel_root_binding: runtimeLineage.binding_mode === 'live_launcher',
                dependency_lineage: runtimeLineage.dependency_lineage === 'verified_lock_match',
                forge_runtime_manifest: runtimeLineage.forge_runtime_manifest_present,
                forge: forgeReadiness.ready,
                forge_failures: forgeReadiness.failures,
            },
            hall_reachable: hallReachable,
            managed_spokes: snapshot.managed_spokes.map((s) => ({
                slug: s.slug,
                mount_status: s.mount_status,
                trust_level: s.trust_level,
                write_policy: s.write_policy,
                root_path: s.root_path,
            })),
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
