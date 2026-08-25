import { registry } from '../../pennyone/pathRegistry.js';
import { database } from '../../pennyone/intel/database.js';
import { StateRegistry } from '../../../node/core/state.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { resolveActiveTraceStatusPayload } from '../../../node/core/commands/trace.js';

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

        const awakeningAgeSeconds = fw.last_awakening > 0
            ? Math.max(0, Math.floor((Date.now() - fw.last_awakening) / 1000))
            : null;
        const currentMission = resolveActiveTraceStatusPayload(root);

        return textResponse({
            framework: {
                authority: 'compatibility_projection',
                source: 'state_registry_projection',
                current_mission_authority: false,
                status: fw.status,
                active_persona: fw.active_persona,
                last_awakening: fw.last_awakening,
                process_uptime_seconds: Math.floor(process.uptime()),
                awakening_age_seconds: awakeningAgeSeconds,
                active_task: null,
                mission_id: null,
                bead_id: null,
                stale_activity_suppressed: true,
                baseline_gungnir_score: null,
                baseline_gungnir_measurement: 'not_run',
                intent_integrity: null,
                intent_integrity_measurement: 'not_run',
            },
            current_mission: currentMission ? {
                authority: 'cstar_lifecycle',
                origin: currentMission.origin,
                session_id: currentMission.session_id ?? null,
                status: currentMission.status,
                updated_at: currentMission.updated_at,
                focus: currentMission.focus,
                current_bead_id: currentMission.current_bead_id ?? null,
                target_paths: currentMission.agent_handoff?.target_paths ?? [],
                execution_gate: currentMission.agent_handoff?.execution_gate ?? null,
            } : null,
            persona: {
                name: fw.active_persona,
                authority: 'style_only',
                affects: ['tone', 'domain_emphasis'],
                does_not_affect: ['execution_authority', 'risk_gate', 'operator_gate', 'lifecycle_state'],
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
                status: /autobot/i.test(`${a.id} ${a.name}`) ? 'retired' : a.status,
                current_authority: false,
                source: 'compatibility_projection',
                last_seen: a.last_seen || null,
            })),
        });
    } catch (error) {
        return errorResponse(error);
    }
}
