import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PennyOneAdapter } from '../../src/node/core/runtime/weaves/pennyone.js';
import { indexSector, refreshOfflineIntents, runScan } from '../../src/tools/pennyone/index.js';
import {
    closeDb,
    getHallFilesByIntentSummary,
    saveHallFile,
    saveHallRepository,
    saveHallScan,
} from '../../src/tools/pennyone/intel/database.js';
import { OFFLINE_INTENT_PLACEHOLDER } from '../../src/tools/pennyone/intel/llm.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import {
    PENNYONE_RESOURCE_LIMITS,
    PennyOneResourceLimitError,
    resolvePennyOneResourceLimits,
} from '../../src/tools/pennyone/resource_limits.js';
import { buildHallRepositoryId } from '../../src/types/hall.js';
import { createGungnirMatrix } from '../../src/types/gungnir.js';

const originalRoot = registry.getRoot();

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
});

function makeRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agents', 'config.json'), '{"system":{"persona":"A.L.F.R.E.D."}}');
    registry.setRoot(root);
    return root;
}

describe('PennyOne resource admission', () => {
    it('reads default-style status without creating a Hall database or receipt', async () => {
        const root = makeRoot('cstar-p1-read-only-status-');
        const result = await new PennyOneAdapter().execute(
            {
                weave_id: 'weave:pennyone',
                payload: { action: 'status', path: '.' },
            },
            {
                mission_id: 'MISSION-P1-READ-ONLY',
                bead_id: 'bead:p1-read-only',
                trace_id: 'TRACE-P1-READ-ONLY',
                persona: 'ALFRED',
                workspace_root: root,
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: {},
                timestamp: Date.now(),
            },
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.read_only, true);
        assert.equal(result.metadata?.database_present, false);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects a file-count overflow before Hall or report mutation', async () => {
        const root = makeRoot('cstar-p1-file-count-');
        fs.writeFileSync(path.join(root, 'one.ts'), 'export const one = 1;\n');
        fs.writeFileSync(path.join(root, 'two.ts'), 'export const two = 2;\n');

        await assert.rejects(
            runScan(root, false, {
                limits: { max_files: 1 },
                include_history: false,
                evaluate_warden: false,
            }),
            /file-count limit exceeded/i,
        );
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        assert.equal(fs.existsSync(path.join(root, '.agents', 'scan_heartbeat.json')), false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects aggregate bytes before Hall or report mutation', async () => {
        const root = makeRoot('cstar-p1-aggregate-');
        fs.writeFileSync(path.join(root, 'one.ts'), 'export const one = 1;\n');

        await assert.rejects(
            runScan(root, false, {
                limits: { max_aggregate_bytes: 8 },
                include_history: false,
                evaluate_warden: false,
            }),
            /aggregate byte limit exceeded/i,
        );
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects an oversized indexSector source before projection mutation', async () => {
        const root = makeRoot('cstar-p1-sector-cap-');
        const target = path.join(root, 'oversized.ts');
        fs.writeFileSync(target, Buffer.alloc(PENNYONE_RESOURCE_LIMITS.max_file_bytes + 1, 0x61));

        await assert.rejects(indexSector(target), /per-file byte limit exceeded/i);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects a refresh overflow before changing the placeholder Hall record', async () => {
        const root = makeRoot('cstar-p1-refresh-cap-');
        const target = path.join(root, 'refresh.ts');
        fs.writeFileSync(target, 'export const refresh = true;\n');
        const repoId = buildHallRepositoryId(root);
        const scanId = 'hall-scan:refresh-cap';
        const now = Date.now();

        saveHallRepository({
            root_path: root,
            name: path.basename(root),
            status: 'AWAKE',
            active_persona: 'A.L.F.R.E.D.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: { intent_integrity_measurement: 'not_run' },
            created_at: now,
            updated_at: now,
        });
        saveHallScan({
            scan_id: scanId,
            repo_id: repoId,
            scan_kind: 'test',
            status: 'COMPLETED',
            baseline_gungnir_score: 0,
            started_at: now,
            completed_at: now,
        });
        saveHallFile({
            repo_id: repoId,
            scan_id: scanId,
            path: target,
            content_hash: 'placeholder',
            language: 'ts',
            gungnir_score: 0,
            matrix: createGungnirMatrix(),
            imports: [],
            exports: [],
            intent_summary: OFFLINE_INTENT_PLACEHOLDER,
            interaction_summary: 'unmeasured',
            created_at: now,
        });

        await assert.rejects(
            refreshOfflineIntents(target, { max_file_bytes: 8 }),
            /per-file byte limit exceeded/i,
        );
        const remaining = getHallFilesByIntentSummary(OFFLINE_INTENT_PLACEHOLDER, root);
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0]?.path, target.replace(/\\/g, '/'));
        assert.equal(
            fs.readdirSync(path.join(root, '.stats')).some((entry) => entry.endsWith('.qmd')),
            false,
        );
        closeDb();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('does not permit callers to raise hard ceilings', () => {
        assert.throws(
            () => resolvePennyOneResourceLimits({
                max_files: PENNYONE_RESOURCE_LIMITS.max_files + 1,
            }),
            PennyOneResourceLimitError,
        );
    });
});
