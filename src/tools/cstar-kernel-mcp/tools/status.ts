import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { activePersona, resolvePersonaPolicy } from '../../pennyone/personaRegistry.js';
import { StateRegistry } from '../../../node/core/state.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';

// cstar_status — deterministic vitals snapshot from StateRegistry.
export async function handleStatus(): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const snapshot = StateRegistry.get();
        const fw = snapshot.framework;

        let hallReachable = false;
        try {
            const db = database.getDb(root);
            hallReachable = db !== null;
        } catch {
            hallReachable = false;
        }

        const uptimeSeconds = fw.last_awakening > 0
            ? Math.max(0, Math.floor((Date.now() - fw.last_awakening) / 1000))
            : null;

        const personaPolicy = resolvePersonaPolicy(fw.active_persona ?? activePersona?.name);

        return textResponse({
            framework: {
                status: fw.status,
                active_persona: fw.active_persona,
                last_awakening: fw.last_awakening,
                uptime_seconds: uptimeSeconds,
                active_task: fw.active_task,
                mission_id: fw.mission_id,
                bead_id: fw.bead_id,
                gungnir_score: fw.gungnir_score,
                intent_integrity: fw.intent_integrity,
            },
            persona: {
                name: fw.active_persona,
                planning_stance: personaPolicy.planning.stance,
                risk_tolerance: personaPolicy.planning.riskTolerance,
                execution_gate: personaPolicy.planning.executionGate,
                investigation_stance: personaPolicy.investigation.stance,
                repair_bias: personaPolicy.investigation.repairBias,
            },
            workspace: root,
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
