import fs from 'node:fs';
import path from 'node:path';
import { registry } from '../../tools/pennyone/pathRegistry.js';
import { activePersona } from '../../tools/pennyone/personaRegistry.js';
import {
    database,
} from '../../tools/pennyone/intel/database.ts';
import type { HallMountedSpokeRecord } from  '../../types/hall.js';

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

export type ManagedSpokeProjection = Omit<HallMountedSpokeRecord, 'repo_id' | 'metadata' | 'created_at' | 'updated_at'>;

export interface OperatorConsoleProjection {
    default_entrypoint: 'cli' | 'tui';
    preferred_prompt_position: 'top' | 'bottom' | 'left';
    verbose_stream: boolean;
    theme: 'alfred' | 'odin' | 'matrix';
}

export interface SovereignState {
    framework: FrameworkState;
    identity: SystemIdentity;
    hall_of_records: HallOfRecordsMetadata;
    managed_spokes: ManagedSpokeProjection[];
    operator_console: OperatorConsoleProjection;
    [key: string]: unknown;
}

type SovereignProjectionMetadata = {
    framework?: Partial<FrameworkState>;
    identity?: SystemIdentity;
    hall_of_records?: HallOfRecordsMetadata;
    managed_spokes?: ManagedSpokeProjection[];
    operator_console?: OperatorConsoleProjection;
    extras?: Record<string, unknown>;
};

type SovereignStatePatch = {
    framework?: Partial<FrameworkState>;
    identity?: Partial<SystemIdentity>;
    hall_of_records?: Partial<HallOfRecordsMetadata> & {
        primary_assets?: Partial<HallOfRecordsMetadata['primary_assets']>;
    };
    managed_spokes?: ManagedSpokeProjection[];
    operator_console?: Partial<OperatorConsoleProjection>;
    [key: string]: unknown;
};

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

export class StateRegistry {
    private static readonly SOVEREIGN_PROJECTION_KEY = 'sovereign_projection';
    private static getControlRoot(): string {
        const configuredRoot = process.env.CSTAR_CONTROL_ROOT ?? process.env.CSTAR_PROJECT_ROOT;
        if (configuredRoot?.trim()) {
            return path.resolve(configuredRoot.trim());
        }
        return registry.getRoot();
    }

    private static getPath() {
        return path.join(this.getControlRoot(), '.agents', 'sovereign_state.json');
    }

    private static getDefaultState(): SovereignState {
        return {
            framework: {
                status: 'DORMANT',
                last_awakening: 0,
                active_persona: activePersona.name,
                gungnir_score: 0,
                intent_integrity: 0
            },
            identity: {
                name: 'Corvus Star (C*)',
                tagline: 'Synergy is the blood of the Totem. Without it, the system is but clay.',
                guiding_principles: [
                    'The One Mind: All intelligence is unified and Host-sampled.',
                    'Skills-First: Capabilities are evolved, discrete, and self-documenting.',
                    'Neuralplastic Learning: System behavior evolves through autonomous contract mutation.',
                    'The Sterling Mandate: Lore, Isolation, and Audit verify all reality.'
                ],
                use_systems: {
                    interface: 'SovereignHUD (Terminal UI) / CStar CLI',
                    orchestration: 'Gungnir Control Plane (TypeScript/Node.js)',
                    intelligence: 'The Corvus kernel bridge (one-shot Python execution / MCP sampling)',
                    memory: "Hall of Records (.stats/pennyone.db) / Mimir's Well (transport only)",
                    visualization: 'PennyOne (3D Digital Twin)'
                }
            },
            hall_of_records: {
                description: 'The persistent, high-durability anchor of the frameworks state and history.',
                primary_assets: {
                    database: '.stats/pennyone.db (Canonical Hall of Records)',
                    contracts: '.agents/skills/*.feature (Behavioral Contracts)',
                    lore: '.agents/lore/ (Architectural Chants)',
                    history: 'dev_journal.qmd (Timeline of Yggdrasil)'
                }
            },
            managed_spokes: [],
            operator_console: {
                default_entrypoint: 'tui',
                preferred_prompt_position: 'top',
                verbose_stream: true,
                theme: 'matrix',
            },
        };
    }

    private static readLegacyProjection(): SovereignStatePatch {
        const projectionPath = this.getPath();
        if (!fs.existsSync(projectionPath)) {
            return {};
        }

        try {
            return JSON.parse(fs.readFileSync(projectionPath, 'utf-8')) as SovereignStatePatch;
        } catch {
            return {};
        }
    }

    private static mergeState(
        base: SovereignState,
        patch: SovereignStatePatch | undefined,
    ): SovereignState {
        if (!patch) {
            return base;
        }

        const { framework, identity, hall_of_records, managed_spokes, operator_console, ...extras } = patch;
        return {
            ...base,
            ...extras,
            framework: framework ? { ...base.framework, ...framework } : base.framework,
            identity: identity ? { ...base.identity, ...identity } : base.identity,
            hall_of_records: hall_of_records
                ? {
                    ...base.hall_of_records,
                    ...hall_of_records,
                    primary_assets: {
                        ...base.hall_of_records.primary_assets,
                        ...(hall_of_records.primary_assets ?? {}),
                    },
                }
                : base.hall_of_records,
            managed_spokes: managed_spokes ?? base.managed_spokes,
            operator_console: operator_console
                ? { ...base.operator_console, ...operator_console }
                : base.operator_console,
        };
    }

    private static readHallMountedSpokes(): ManagedSpokeProjection[] {
        try {
            return database.listHallMountedSpokes(this.getControlRoot()).map(projectManagedSpoke);
        } catch {
            return [];
        }
    }

    private static syncHallMountedSpokes(managedSpokes: ManagedSpokeProjection[]): void {
        const controlRoot = this.getControlRoot();
        const repoRecord = database.getHallRepository(controlRoot);
        const repoId = repoRecord?.repo_id;
        if (!repoId) {
            return;
        }

        const existing = database.listHallMountedSpokes(controlRoot);
        const existingBySlug = new Map(existing.map((record) => [record.slug, record]));
        const nextSlugs = new Set<string>();

        for (const spoke of managedSpokes) {
            nextSlugs.add(spoke.slug);
            const prior = existingBySlug.get(spoke.slug);
            database.saveHallMountedSpoke({
                spoke_id: prior?.spoke_id ?? spoke.spoke_id,
                repo_id: repoId,
                slug: spoke.slug,
                kind: spoke.kind,
                root_path: spoke.root_path,
                remote_url: spoke.remote_url,
                default_branch: spoke.default_branch,
                mount_status: spoke.mount_status,
                trust_level: spoke.trust_level,
                write_policy: spoke.write_policy,
                projection_status: spoke.projection_status,
                last_scan_at: spoke.last_scan_at,
                last_health_at: spoke.last_health_at,
                metadata: prior?.metadata ?? { source: 'state-registry-projection' },
                created_at: prior?.created_at ?? Date.now(),
                updated_at: Date.now(),
            });
        }

        for (const stale of existing) {
            if (!nextSlugs.has(stale.slug)) {
                database.removeHallMountedSpoke(stale.slug, controlRoot);
            }
        }
    }

    private static extractHallProjection(): SovereignStatePatch {
        const record = database.getHallRepository(this.getControlRoot());
        const metadata = (record?.metadata ?? {}) as Record<string, unknown>;
        const projection = metadata[this.SOVEREIGN_PROJECTION_KEY] as SovereignProjectionMetadata | undefined;

        if (!projection || typeof projection !== 'object') {
            return {};
        }

        return {
            ...(projection.extras ?? {}),
            framework: projection.framework,
            identity: projection.identity,
            hall_of_records: projection.hall_of_records,
            managed_spokes: projection.managed_spokes,
            operator_console: projection.operator_console,
        };
    }

    private static buildMetadata(state: SovereignState): Record<string, unknown> {
        const existingMetadata = (database.getHallRepository(this.getControlRoot())?.metadata ?? {}) as Record<string, unknown>;
        const { framework, identity, hall_of_records, managed_spokes, operator_console, ...extras } = state;
        const projectedSpokes = this.readHallMountedSpokes();

        return {
            ...existingMetadata,
            source: 'state-registry-projection',
            [this.SOVEREIGN_PROJECTION_KEY]: {
                framework: {
                    last_awakening: framework.last_awakening,
                    active_task: framework.active_task,
                    mission_id: framework.mission_id,
                    bead_id: framework.bead_id,
                },
                identity,
                hall_of_records,
                managed_spokes: projectedSpokes.length > 0 ? projectedSpokes : managed_spokes,
                operator_console,
                extras,
            },
        };
    }

    private static ensureStateShape(state: SovereignState): SovereignState {
        const defaults = this.getDefaultState();
        return this.mergeState(defaults, state);
    }

    static get(): SovereignState {
        const defaults = this.getDefaultState();
        let state = this.mergeState(defaults, this.readLegacyProjection());
        state = this.mergeState(state, this.extractHallProjection());
        const mountedSpokes = this.readHallMountedSpokes();
        if (mountedSpokes.length > 0) {
            state.managed_spokes = mountedSpokes;
        }

        try {
            const hallSummary = database.getHallSummary(this.getControlRoot());
            if (hallSummary) {
                const metadata = (hallSummary.metadata ?? {}) as any;
                const projection = metadata[this.SOVEREIGN_PROJECTION_KEY] as any;
                
                state.framework = {
                    ...state.framework,
                    status: hallSummary.status,
                    active_persona: hallSummary.active_persona,
                    gungnir_score: hallSummary.baseline_gungnir_score,
                    intent_integrity: hallSummary.intent_integrity,
                    bead_id: projection?.framework?.bead_id
                };
            }
            // Hall projection is authoritative when available, but state must remain readable without it.
        } catch {
            // State must remain readable even if Hall is temporarily unavailable.
        }

        return state;
    }

    static updateMission(id: string, task: string, beadId?: string) {
        this.updateFramework({
            status: 'AGENT_LOOP',
            mission_id: id,
            active_task: task,
            bead_id: beadId
        });
    }

    static updateFramework(patch: Partial<FrameworkState>) {
        const state = this.get();
        state.framework = { ...state.framework, ...patch };
        state.framework.active_persona = activePersona.name; // Always sync with current
        this.save(state);
    }

    static save(state: SovereignState) {
        const materialized = this.ensureStateShape(state);
        const controlRoot = this.getControlRoot();
        const existingRecord = database.getHallRepository(controlRoot);
        const createdAt = existingRecord?.created_at
            ?? materialized.framework.last_awakening
            ?? Date.now();

        try {
            database.saveHallRepository({
                root_path: controlRoot,
                name: path.basename(controlRoot),
                status: materialized.framework.status,
                active_persona: materialized.framework.active_persona,
                baseline_gungnir_score: materialized.framework.gungnir_score,
                intent_integrity: materialized.framework.intent_integrity,
                metadata: this.buildMetadata(materialized),
                created_at: createdAt,
                updated_at: Date.now(),
            });
            this.syncHallMountedSpokes(materialized.managed_spokes);
        } catch {
            // Compatibility state writes should not fail if Hall is temporarily unavailable.
        }

        fs.mkdirSync(path.dirname(this.getPath()), { recursive: true });
        fs.writeFileSync(this.getPath(), JSON.stringify(materialized, null, 2), 'utf-8');
    }
}
