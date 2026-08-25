import path from 'node:path';

import { buildDefaultSovereignState } from './state_defaults.js';
import { database } from '../../tools/pennyone/intel/database.js';
import { registry } from '../../tools/pennyone/pathRegistry.js';
import { readHallPersonaProjection } from '../../tools/pennyone/persona_projection.js';
import type { HallMountedSpokeRecord } from '../../types/hall.js';

export const STATE_REGISTRY_MUTATION_RETIRED_ERROR =
    'legacy_state_registry_mutation_retired_use_cstar_kernel';

export interface FrameworkState {
    status: 'AWAKE' | 'DORMANT' | 'AGENT_LOOP';
    last_awakening: number;
    active_persona: string;
    active_task?: string;
    mission_id?: string;
    bead_id?: string;
    gungnir_score: number;
    intent_integrity: number;
}

export interface SystemIdentity {
    name: string;
    tagline: string;
    guiding_principles: string[];
    use_systems: {
        interface: string;
        orchestration: string;
        intelligence: string;
        memory: string;
        visualization: string;
    };
}

export interface HallOfRecordsMetadata {
    description: string;
    primary_assets: {
        database: string;
        contracts: string;
        lore: string;
        history: string;
    };
}

export type ManagedSpokeProjection = Omit<
    HallMountedSpokeRecord,
    'repo_id' | 'metadata' | 'created_at' | 'updated_at'
>;

export interface OperatorConsoleProjection {
    default_entrypoint: 'cli' | 'tui';
    preferred_prompt_position: 'top' | 'bottom' | 'left';
    verbose_stream: boolean;
    theme: 'alfred' | 'odin' | 'matrix';
}

export interface AgentState {
    id: string;
    name: string;
    status: 'SLEEPING' | 'THINKING' | 'WORKING' | 'WAITING_FOR_HANDOFF' | 'OFFLINE';
    last_seen: number;
    current_task?: string;
    active_bead_id?: string;
    pid?: number;
}

export interface BlackboardEntry {
    at: number;
    from: string;
    to?: string;
    message: string;
    type: 'HANDOFF' | 'BROADCAST' | 'INFO' | 'ALERT';
}

export interface SovereignState {
    framework: FrameworkState;
    identity: SystemIdentity;
    hall_of_records: HallOfRecordsMetadata;
    managed_spokes: ManagedSpokeProjection[];
    operator_console: OperatorConsoleProjection;
    agents: Record<string, AgentState>;
    blackboard: BlackboardEntry[];
    terminal_logs: string[];
    [key: string]: unknown;
}

function projectManagedSpoke(record: HallMountedSpokeRecord): ManagedSpokeProjection {
    return {
        spoke_id: record.spoke_id,
        slug: record.slug,
        kind: record.kind,
        root_path: record.root_path,
        remote_url: record.remote_url,
        default_branch: record.default_branch,
        mount_status: record.mount_status,
        trust_level: record.trust_level,
        write_policy: record.write_policy,
        projection_status: record.projection_status,
        last_scan_at: record.last_scan_at,
        last_health_at: record.last_health_at,
    };
}

/**
 * Read-only compatibility view over canonical Hall tables.
 *
 * The former registry mixed legacy JSON, arbitrary repository metadata, Hall
 * writes, and file mirroring. Mutations now fail before reading or writing;
 * callers must use a request-classified cstar-kernel lifecycle tool.
 */
export class StateRegistry {
    private static getControlRoot(): string {
        const configuredRoot = process.env.CSTAR_CONTROL_ROOT ?? process.env.CSTAR_PROJECT_ROOT;
        return configuredRoot?.trim()
            ? path.resolve(configuredRoot.trim())
            : registry.getRoot();
    }

    static get(): SovereignState {
        const state = buildDefaultSovereignState();
        const root = this.getControlRoot();

        try {
            const summary = database.getHallSummary(root);
            const repository = database.getHallRepository(root);
            if (summary) {
                state.framework = {
                    ...state.framework,
                    status: summary.status,
                    last_awakening: repository?.updated_at ?? 0,
                    active_persona: readHallPersonaProjection(root) ?? '',
                    gungnir_score: summary.baseline_gungnir_score,
                    intent_integrity: summary.intent_integrity,
                };
            }
        } catch {
            // Missing or unsafe Hall state yields the inert compatibility view.
        }

        try {
            state.managed_spokes = database.listHallMountedSpokes(root).map(projectManagedSpoke);
        } catch {
            state.managed_spokes = [];
        }

        try {
            state.agents = Object.fromEntries(
                database.listHallAgentPresence(root).map((agent) => [agent.agent_id, {
                    id: agent.agent_id,
                    name: agent.name,
                    status: agent.status,
                    last_seen: agent.updated_at,
                    current_task: agent.current_task,
                    active_bead_id: agent.active_bead_id,
                    pid: agent.pid,
                }]),
            );
        } catch {
            state.agents = {};
        }

        return state;
    }

    static updateMission(id: string, task: string, beadId?: string): never {
        void id;
        void task;
        void beadId;
        throw new Error(STATE_REGISTRY_MUTATION_RETIRED_ERROR);
    }

    static updateFramework(patch: Partial<FrameworkState>): never {
        void patch;
        throw new Error(STATE_REGISTRY_MUTATION_RETIRED_ERROR);
    }

    static postToBlackboard(entry: Omit<BlackboardEntry, 'at'>): never {
        void entry;
        throw new Error(STATE_REGISTRY_MUTATION_RETIRED_ERROR);
    }

    static pushTerminalLog(line: string): never {
        void line;
        throw new Error(STATE_REGISTRY_MUTATION_RETIRED_ERROR);
    }

    static save(state: SovereignState): never {
        void state;
        throw new Error(STATE_REGISTRY_MUTATION_RETIRED_ERROR);
    }
}
