import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { execa } from 'execa';

import { resolveTsxLaunch } from '../../scripts/runtime-env.mjs';
import { getCstarKernelToolCatalogEntry }
    from '../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { retiredForgeHostCompletionResponse }
    from '../../src/tools/cstar-kernel-mcp/contracts/responses.js';


const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ERROR = 'legacy_direct_hall_script_retired_use_cstar_kernel';
const ENTRIES = [
    'scripts/check_schema.ts',
    'scripts/engrave_journal.ts',
    'scripts/engrave_sessions.ts',
    'scripts/ingest_xo_doctrine_to_hall.ts',
    'scripts/migrate_p1_history.ts',
    'scripts/p1_analytics.ts',
    'scripts/register_usb_forge_vs_sentry_contest.ts',
    'scripts/resolve_xo_phase2_hall_review.ts',
    'scripts/seed_engram_beads.ts',
    'scripts/seed_plan_beads.ts',
    'scripts/seed_xo_phase1_hall_plan.ts',
    'scripts/seed_xo_phase2_hall_plan.ts',
    'scripts/patch_gravity_db.ts',
    'scripts/verify_xo_phase1_hall_plan.ts',
];


describe('retired direct Hall TypeScript scripts', () => {
    for (const relative of ENTRIES) {
        it(`${path.basename(relative)} fails before reads or writes`, async () => {
            const syntheticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-hall-script-'));
            try {
                const launch = resolveTsxLaunch(PROJECT_ROOT, [path.join(PROJECT_ROOT, relative)]);
                const result = await execa(launch.command, launch.args, {
                    cwd: syntheticRoot,
                    reject: false,
                    extendEnv: false,
                    env: {
                        HOME: syntheticRoot,
                        PATH: process.env.PATH,
                        TMPDIR: '/tmp',
                    },
                });
                assert.equal(result.exitCode, 1);
                assert.equal(result.stdout, '');
                assert.equal(result.stderr, ERROR);
                assert.deepEqual(fs.readdirSync(syntheticRoot), []);
            } finally {
                fs.rmSync(syntheticRoot, { recursive: true, force: true });
            }
        });
    }

    it('contains no database, host-memory, lifecycle, or filesystem primitives', () => {
        const source = ENTRIES
            .map((relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8'))
            .join('\n');
        for (const forbidden of [
            'better-sqlite3',
            'pennyone/intel/database',
            '.gemini',
            'hall_beads',
            'hall_episodic_memory',
            '.prepare(',
            '.writeFile',
            '.readFile',
        ]) {
            assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });

    it('keeps retired Forge generations as non-mutating tombstones, never active fallback', () => {
        assert.equal(getCstarKernelToolCatalogEntry('cstar_forge_host_complete').toolClass, 'LEGACY');
        const response = JSON.parse(retiredForgeHostCompletionResponse().content[0].text) as {
            status?: string;
            state_changed?: boolean;
            fallback_allowed?: boolean;
            replacement_connection_id?: string;
        };
        assert.deepEqual(response, {
            ...response,
            status: 'retired',
            state_changed: false,
            fallback_allowed: false,
            replacement_connection_id: 'forge-native-codex-swarm-v1',
        });

        const activeContracts = [
            '.agents/skills/corvus-forge/SKILL.md',
            '.agents/AGENTS.feature',
            'docs/integrations/cstar-kernel-mcp.md',
            'docs/operations/corvus-forge-pipeline-playbook.md',
            'docs/operations/corvus-forge-skill-spec.md',
        ].map((relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8')).join('\n');
        assert.match(activeContracts, /forge-native-codex-swarm-v1/u);
        for (const tool of ['plan', 'status', 'update', 'complete', 'cancel']) {
            assert.match(activeContracts, new RegExp(`cstar_forge_swarm_${tool}`, 'u'));
        }
        assert.doesNotMatch(activeContracts,
            /current[^\n]{0,100}(?:Codex-host|state-only handoff|Hermes|MiniMax)/iu);
        assert.doesNotMatch(activeContracts, /gpt-5\.6-luna|DELIVERED_PENDING_VALIDATION/u);
    });
});
