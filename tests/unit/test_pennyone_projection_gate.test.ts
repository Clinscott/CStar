import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runScan } from  '../../src/tools/pennyone/index.js';
import { ChronicleIndexer } from  '../../src/tools/pennyone/intel/chronicle.js';
import { defaultProvider } from  '../../src/tools/pennyone/intel/llm.js';
import { SemanticIndexer } from  '../../src/tools/pennyone/intel/semantic.js';
import { Warden } from  '../../src/tools/pennyone/intel/warden.js';
import {
    closeDb,
    recordHallFile,
    recordHallScan,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { createGungnirMatrix } from  '../../src/types/gungnir.js';
import { buildHallRepositoryId } from  '../../src/types/hall.js';

describe('PennyOne projection gate hardening (CS-P2-01)', () => {
    const originalCwd = process.cwd();
    const originalRoot = registry.getRoot();
    let tmpRoot: string;
    let samplePath: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p2-p1-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, '.stats'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ name: 'projection-gate-test' }), 'utf-8');
        samplePath = path.join(tmpRoot, 'src', 'sample.py');
        fs.writeFileSync(samplePath, 'def hello(name: str) -> str:\n    return f"hello {name}"\n', 'utf-8');
        fs.writeFileSync(
            path.join(tmpRoot, '.stats', 'matrix-graph.json'),
            JSON.stringify(
                {
                    version: 'stale',
                    files: [
                        {
                            path: path.join(tmpRoot, 'src', 'ghost.ts').replace(/\\/g, '/'),
                            intent: 'STALE PROJECTION',
                            dependencies: [],
                            hash: 'ghost',
                            loc: 0,
                            complexity: 0,
                            matrix: { overall: 1 },
                        },
                    ],
                    summary: { total_files: 1, total_loc: 0, average_score: 1 },
                },
                null,
                2,
            ),
            'utf-8',
        );
        execSync('git init -q', { cwd: tmpRoot });
        process.chdir(tmpRoot);
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        mock.restoreAll();
        closeDb();
        process.chdir(originalCwd);
        registry.setRoot(originalRoot);
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
            // Best-effort cleanup only; the assertion surface is the projection boundary.
        }
    });

    it('ignores stale matrix-graph projection state during a live scan', async () => {
        mock.method(ChronicleIndexer.prototype, 'index', async () => undefined);
        mock.method(SemanticIndexer.prototype, 'index', async () => ({
            version: 'test-semantic',
            scanned_at: new Date().toISOString(),
            files: [{ path: samplePath, dependencies: [], logic: 10 }],
        }));
        let evaluatedTargetRepo: string | undefined;
        let evaluatedScanId: string | undefined;
        mock.method(Warden.prototype, 'evaluateProjection', async (targetRepo, scanId) => {
            evaluatedTargetRepo = targetRepo;
            evaluatedScanId = scanId;
        });
        mock.method(defaultProvider, 'getBatchIntent', async (items) =>
            items.map(() => ({ intent: 'Fresh Intent', interaction: 'Fresh Protocol' })),
        );

        const results = await runScan('src');
        const graph = JSON.parse(
            fs.readFileSync(path.join(tmpRoot, '.stats', 'matrix-graph.json'), 'utf-8'),
        ) as {
            files: Array<{ path: string; intent: string }>;
            summary: { total_files: number };
        };

        assert.equal(results.length, 1);
        assert.equal(results[0]?.intent, 'Fresh Intent');
        assert.equal(graph.summary.total_files, 1);
        assert.equal(graph.files[0]?.path, samplePath.replace(/\\/g, '/'));
        assert.equal(graph.files[0]?.intent, 'Fresh Intent');
        assert.equal(evaluatedTargetRepo, tmpRoot.replace(/\\/g, '/'));
        assert.match(evaluatedScanId ?? '', /^hall-scan:/);
    });

    it('evaluates Warden targets from Hall projection state instead of a stale graph artifact', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        const liveFile = path.join(tmpRoot, 'src', 'toxic.ts');

        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 4.2,
            intent_integrity: 88,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-warden-projection',
            repo_id: repoId,
            scan_kind: 'projection_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 4.2,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-warden-projection',
            path: liveFile,
            content_hash: 'toxic123',
            language: 'ts',
            matrix: createGungnirMatrix({
                logic: 3,
                style: 4,
                intel: 4,
                gravity: 120,
                overall: 4.2,
                stability: 0.2,
                coupling: 0.95,
                anomaly: 0.7,
            }),
            intent_summary: 'Live toxic sector',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });
        fs.writeFileSync(
            path.join(tmpRoot, '.stats', 'matrix-graph.json'),
            JSON.stringify({
                version: 'stale',
                files: [{ path: path.join(tmpRoot, 'src', 'ghost.ts').replace(/\\/g, '/'), matrix: { overall: 1 } }],
                summary: { total_files: 1, total_loc: 0, average_score: 1 },
            }),
            'utf-8',
        );

        const ledgerPath = path.join(tmpRoot, '.agents', 'tech_debt_projection.json');
        const warden = new Warden(ledgerPath);

        await warden.evaluateProjection(tmpRoot, 'scan-warden-projection');

        const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as {
            top_targets: Array<{ file: string }>;
        };

        assert.equal(ledger.top_targets.length > 0, true);
        assert.equal(ledger.top_targets[0]?.file, liveFile.replace(/\\/g, '/'));
    });
});
