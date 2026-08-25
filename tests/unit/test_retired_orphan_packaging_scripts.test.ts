import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

const RETIRED_SCRIPTS = [
    {
        path: 'scripts/dogfood-usb-sentry-bead.mjs',
        error: 'legacy_usb_sentry_dogfood_script_retired_use_cstar_spoke_bead_import',
    },
    {
        path: 'scripts/package_skills_python.cjs',
        error: 'legacy_python_skill_packager_retired_use_supported_skill_packaging_surface',
    },
    {
        path: 'scripts/package_skills_node.cjs',
        error: 'legacy_node_skill_packager_retired_use_supported_skill_packaging_surface',
    },
    {
        path: 'scripts/sync-plugin-version.mjs',
        error: 'legacy_claude_plugin_version_sync_retired_use_distribution_builder',
    },
] as const;

describe('retired orphan packaging and dogfood scripts', () => {
    for (const entry of RETIRED_SCRIPTS) {
        it(`${entry.path} fails before action-bearing effects`, () => {
            const absolute = path.join(ROOT, entry.path);
            const source = fs.readFileSync(absolute, 'utf8');
            const result = spawnSync(process.execPath, [absolute], {
                cwd: ROOT,
                encoding: 'utf8',
                env: {},
            });

            assert.equal(result.status, 1);
            assert.equal(result.stdout, '');
            assert.equal(result.stderr, `${entry.error}\n`);
            for (const forbidden of [
                'child_process',
                'node:fs',
                'better-sqlite3',
                'handleSpokeBeadImport',
                'execSync',
                'spawnSync',
                'writeFile',
            ]) {
                assert.equal(source.includes(forbidden), false, `${entry.path} retained ${forbidden}`);
            }
        });
    }
});
