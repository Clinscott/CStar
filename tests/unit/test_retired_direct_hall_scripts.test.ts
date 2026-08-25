import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { execa } from 'execa';

import { resolveTsxLaunch } from '../../scripts/runtime-env.mjs';


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
});
