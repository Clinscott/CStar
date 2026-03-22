import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    StateRegistry,
    type ManagedSpokeProjection,
    type OperatorConsoleProjection,
    type SovereignState,
} from '../../src/node/core/state.ts';
import {
    closeDb,
    getHallRepositoryRecord,
    getHallSummary,
    listHallMountedSpokes,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

describe('State registry projection boundary (CS-P2-00)', () => {
    let tmpRoot: string;

    const managedSpokes: ManagedSpokeProjection[] = [
        {
            spoke_id: 'spoke-keepos',
            slug: 'keepos',
            kind: 'git',
            root_path: 'C:/Estate/KeepOS',
            remote_url: 'https://github.com/example/KeepOS.git',
            default_branch: 'main',
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_write',
            projection_status: 'current',
            last_scan_at: 1700000001111,
            last_health_at: 1700000002222,
        },
    ];
    const operatorConsole: OperatorConsoleProjection = {
        default_entrypoint: 'tui',
        preferred_prompt_position: 'top',
        verbose_stream: true,
        theme: 'matrix',
    };

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-state-projection-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
    });

    it('prefers Hall-backed sovereign metadata over legacy projection JSON', () => {
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify(
                {
                    framework: {
                        status: 'DORMANT',
                        active_persona: 'ODIN',
                        gungnir_score: 1,
                        intent_integrity: 2,
                    },
                    identity: {
                        name: 'Legacy Projection',
                    },
                },
                null,
                2,
            ),
            'utf-8',
        );

        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AGENT_LOOP',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 9.1,
            intent_integrity: 94,
            metadata: {
                source: 'hall-authority',
                sovereign_projection: {
                    framework: {
                        last_awakening: 1700000001111,
                        mission_id: 'MISSION-42',
                        active_task: 'Fortify the spine',
                    },
                    identity: {
                        name: 'Hall Authority',
                        tagline: 'One mind, one spine.',
                        guiding_principles: ['Hall first'],
                        use_systems: {
                            interface: 'HUD',
                            orchestration: 'Runtime',
                            intelligence: 'Bridge',
                            memory: 'Hall',
                            visualization: 'PennyOne',
                        },
                    },
                    hall_of_records: {
                        description: 'Canonical state store',
                        primary_assets: {
                            database: '.stats/pennyone.db',
                            contracts: '.agents/skills/*.feature',
                            lore: '.agents/lore/',
                            history: 'dev_journal.qmd',
                        },
                    },
                    managed_spokes: managedSpokes,
                    operator_console: operatorConsole,
                    extras: {
                        last_anomaly_score: 6.5,
                        warden: { active: true },
                    },
                },
            },
            created_at: 1700000000000,
            updated_at: 1700000001111,
        });

        const state = StateRegistry.get();

        assert.strictEqual(state.framework.status, 'AGENT_LOOP');
        assert.strictEqual(state.framework.active_persona, 'ALFRED');
        assert.strictEqual(state.framework.gungnir_score, 9.1);
        assert.strictEqual(state.framework.intent_integrity, 94);
        assert.strictEqual(state.framework.last_awakening, 1700000001111);
        assert.strictEqual(state.framework.mission_id, 'MISSION-42');
        assert.strictEqual(state.framework.active_task, 'Fortify the spine');
        assert.strictEqual(state.identity.name, 'Hall Authority');
        assert.strictEqual(state.hall_of_records.description, 'Canonical state store');
        assert.deepStrictEqual(state.managed_spokes, managedSpokes);
        assert.deepStrictEqual(state.operator_console, operatorConsole);
        assert.strictEqual(state.last_anomaly_score, 6.5);
        assert.deepStrictEqual(state.warden, { active: true });
    });

    it('writes Hall metadata first and mirrors the compatibility projection file', () => {
        const state: SovereignState = {
            framework: {
                status: 'AWAKE',
                last_awakening: 1700000002222,
                active_persona: 'ALFRED',
                active_task: 'Sync projections',
                mission_id: 'MISSION-84',
                gungnir_score: 8.8,
                intent_integrity: 91,
            },
            identity: {
                name: 'Corvus Star',
                tagline: 'Projection test.',
                guiding_principles: ['Hall first'],
                use_systems: {
                    interface: 'HUD',
                    orchestration: 'Runtime',
                    intelligence: 'Bridge',
                    memory: 'Hall',
                    visualization: 'PennyOne',
                },
            },
            hall_of_records: {
                description: 'Projection authority',
                primary_assets: {
                    database: '.stats/pennyone.db',
                    contracts: '.agents/skills/*.feature',
                    lore: '.agents/lore/',
                    history: 'dev_journal.qmd',
                },
            },
            managed_spokes: managedSpokes,
            operator_console: operatorConsole,
            last_anomaly_score: 4.4,
            warden: { active: true },
        };

        StateRegistry.save(state);

        const record = getHallRepositoryRecord(tmpRoot);
        const summary = getHallSummary(tmpRoot);
        const mounted = listHallMountedSpokes(tmpRoot);
        const projection = JSON.parse(
            fs.readFileSync(path.join(tmpRoot, '.agents', 'sovereign_state.json'), 'utf-8'),
        ) as SovereignState;

        assert.ok(record);
        assert.strictEqual(summary?.status, 'AWAKE');
        assert.strictEqual(summary?.baseline_gungnir_score, 8.8);
        assert.strictEqual(
            ((record?.metadata as {
                sovereign_projection?: {
                    extras?: { last_anomaly_score?: number; warden?: { active?: boolean } };
                };
            })?.sovereign_projection?.extras?.last_anomaly_score),
            4.4,
        );
        assert.deepStrictEqual(
            ((record?.metadata as {
                sovereign_projection?: {
                    managed_spokes?: ManagedSpokeProjection[];
                };
            })?.sovereign_projection?.managed_spokes),
            managedSpokes,
        );
        assert.deepStrictEqual(mounted.map((entry) => entry.slug), ['keepos']);
        assert.deepStrictEqual(
            ((record?.metadata as {
                sovereign_projection?: {
                    operator_console?: OperatorConsoleProjection;
                };
            })?.sovereign_projection?.operator_console),
            operatorConsole,
        );
        assert.deepStrictEqual(
            ((record?.metadata as {
                sovereign_projection?: {
                    extras?: { warden?: { active?: boolean } };
                };
            })?.sovereign_projection?.extras?.warden),
            { active: true },
        );
        assert.strictEqual(projection.framework.mission_id, 'MISSION-84');
        assert.deepStrictEqual(projection.managed_spokes, managedSpokes);
        assert.deepStrictEqual(projection.operator_console, operatorConsole);
        assert.strictEqual(projection.last_anomaly_score, 4.4);
        assert.deepStrictEqual(projection.warden, { active: true });
    });
});
