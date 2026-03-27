import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { refreshOfflineIntents, runScan } from '../../src/tools/pennyone/index.js';
import { ChronicleIndexer } from '../../src/tools/pennyone/intel/chronicle.js';
import { ChronosIndexer } from '../../src/tools/pennyone/intel/chronos.js';
import { defaultProvider, OFFLINE_INTENT_PLACEHOLDER } from '../../src/tools/pennyone/intel/llm.js';
import { SemanticIndexer } from '../../src/tools/pennyone/intel/semantic.js';
import { Warden } from '../../src/tools/pennyone/intel/warden.js';
import {
    closeDb,
    getHallFileByPath,
    getHallFiles,
    recordHallFile,
    recordHallScan,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { createGungnirMatrix } from '../../src/types/gungnir.js';
import { buildHallRepositoryId } from '../../src/types/hall.js';

describe('PennyOne semantic intent hardening (CS-P1-03)', () => {
    const originalCwd = process.cwd();
    const originalRoot = registry.getRoot();
    const originalCodeShell = process.env.CODEX_SHELL;
    const originalCodeThread = process.env.CODEX_THREAD_ID;
    let tmpRoot: string;
    let samplePath: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-intent-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, '.stats'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ name: 'pennyone-intent-hardening' }), 'utf-8');
        samplePath = path.join(tmpRoot, 'src', 'sample.ts');
        fs.writeFileSync(samplePath, 'export const answer = () => 42;\n', 'utf-8');
        const gitInit = spawnSync('git', ['init', '-q'], { cwd: tmpRoot, encoding: 'utf-8' });
        if (gitInit.status !== 0) {
            throw new Error(`git init failed: ${gitInit.stderr || gitInit.stdout || gitInit.error?.message || 'unknown error'}`);
        }
        process.chdir(tmpRoot);
        registry.setRoot(tmpRoot);
        closeDb();

        mock.method(ChronicleIndexer.prototype, 'index', async () => undefined);
        mock.method(ChronosIndexer.prototype, 'index', async () => undefined);
        mock.method(SemanticIndexer.prototype, 'index', async () => ({
            version: 'test-semantic',
            scanned_at: new Date().toISOString(),
            files: [{ path: samplePath, dependencies: [], logic: 9 }],
        }));
        mock.method(Warden.prototype, 'evaluateProjection', async () => undefined);
    });

    afterEach(() => {
        mock.restoreAll();
        closeDb();
        process.chdir(originalCwd);
        registry.setRoot(originalRoot);

        if (originalCodeShell === undefined) {
            delete process.env.CODEX_SHELL;
        } else {
            process.env.CODEX_SHELL = originalCodeShell;
        }

        if (originalCodeThread === undefined) {
            delete process.env.CODEX_THREAD_ID;
        } else {
            process.env.CODEX_THREAD_ID = originalCodeThread;
        }

        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
            // Best-effort cleanup only.
        }
    });

    it('fails closed instead of persisting the offline placeholder during an active host session', async () => {
        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-intent-hardening';

        mock.method(defaultProvider, 'getBatchIntent', async () => {
            throw new Error('Host bridge unavailable.');
        });

        await assert.rejects(
            runScan('src'),
            /semantic intent failed during an active host session/i,
        );

        assert.deepStrictEqual(getHallFiles(tmpRoot), []);
    });

    it('re-enriches Hall records that still carry the offline semantic-intent placeholder', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ODIN',
            baseline_gungnir_score: 7.4,
            intent_integrity: 41,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-refresh',
            repo_id: repoId,
            scan_kind: 'unit-test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.4,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-refresh',
            path: samplePath,
            content_hash: 'sample-hash',
            language: 'ts',
            gungnir_score: 7.4,
            matrix: createGungnirMatrix({ logic: 7, style: 7, intel: 8 }),
            imports: [],
            exports: ['answer'],
            intent_summary: OFFLINE_INTENT_PLACEHOLDER,
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });

        mock.method(defaultProvider, 'getBatchIntent', async (items) =>
            items.map(() => ({ intent: 'Fresh semantic intent', interaction: 'Fresh semantic protocol' })),
        );

        const result = await refreshOfflineIntents('src');
        const refreshedRecord = getHallFileByPath(samplePath, tmpRoot, 'scan-refresh');

        assert.deepStrictEqual(result, {
            refreshed: 1,
            failed: 0,
            total_candidates: 1,
        });
        assert.equal(refreshedRecord?.intent_summary, 'Fresh semantic intent');
        assert.equal(refreshedRecord?.interaction_summary, 'Fresh semantic protocol');
    });
});
