import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { OrchestratorProcessManager } from  '../../src/node/core/runtime/process_manager.js';
import { OrchestratorReaper } from  '../../src/node/core/runtime/reaper.js';
import { OrchestratorWorkerBridge } from  '../../src/node/core/runtime/worker_bridge.js';
import { RUNTIME_KERNEL_ROOT } from  '../../src/node/core/runtime/kernel_root.js';
import { closeDb, getDb, upsertHallBead } from  '../../src/tools/pennyone/intel/database.js';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../src/types/hall.js';

describe('Orchestrator Internal Spokes [Ω]', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-orchestrator-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
    });

    describe('Process Manager', () => {
        it('tracks and unregisters process groups', () => {
            const pm = new OrchestratorProcessManager();
            pm.registerGroup(12345);
            pm.unregisterGroup(12345);
            // Internal set is private, but we verify no crash on double unregister
            pm.unregisterGroup(12345);
        });

        it('safely attempts to reap non-existent groups (ESRCH)', async () => {
            const pm = new OrchestratorProcessManager();
            pm.registerGroup(99999); // Likely non-existent
            await pm.reapGroup(99999); // Should catch ESRCH and not throw
        });
    });

    describe('Worker Bridge', () => {
        it('dispatches workers through the dedicated AutoBot weave with a bounded note', async () => {
            const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
            const scanId = 'scan-worker-1';
            const now = Date.now();
            const db = getDb();

            db.prepare(`
                INSERT INTO hall_scans (
                    scan_id, repo_id, scan_kind, status, baseline_gungnir_score, started_at, completed_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(scanId, repoId, 'test', 'COMPLETED', 0, now, now, '{}');

            db.prepare(`
                INSERT INTO hall_files (
                    repo_id, scan_id, path, content_hash, language, gungnir_score, matrix_json,
                    imports_json, exports_json, intent_summary, interaction_summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                repoId,
                scanId,
                'src/runtime/worker.ts',
                null,
                'typescript',
                0,
                null,
                JSON.stringify([{ source: './helpers', local: 'helper', imported: 'runWorker' }]),
                JSON.stringify(['runWorker']),
                'Runtime worker target for orchestrated AutoBot execution.',
                'Receives bounded worker prompts before launching AutoBot.',
                now,
            );

            upsertHallBead({
                bead_id: 'bead-worker-1',
                repo_id: repoId,
                scan_id: scanId,
                target_kind: 'FILE',
                target_ref: 'src/runtime/worker.ts',
                target_path: 'src/runtime/worker.ts',
                rationale: 'Execute orchestrated worker through the dedicated AutoBot weave.',
                contract_refs: ['contracts:worker-bridge'],
                baseline_scores: { overall: 5.5 },
                acceptance_criteria: 'Worker bridge must provide a bounded note and run `python3 -m unittest -q` before review.',
                status: 'SET',
                created_at: now,
                updated_at: now,
            });

            const calls: Array<{
                command: string;
                args: string[];
                options: {
                    cwd?: string;
                    env?: Record<string, string>;
                };
            }> = [];
            const groups = { registered: [] as number[], unregistered: [] as number[] };
            const fakeRunner = ((command: string, args: string[], options: { cwd?: string; env?: Record<string, string> }) => {
                calls.push({ command, args, options });
                return Object.assign(
                    Promise.resolve({
                        exitCode: 0,
                        stdout: 'worker completed',
                        stderr: '',
                    }),
                    { pid: 4242 },
                );
            }) as unknown as typeof import('execa').execa;
            const processManager = {
                registerGroup(pid: number) {
                    groups.registered.push(pid);
                },
                unregisterGroup(pid: number) {
                    groups.unregistered.push(pid);
                },
            } as unknown as OrchestratorProcessManager;

            const bridge = new OrchestratorWorkerBridge(tmpRoot, processManager, fakeRunner);
            const result = await bridge.executeBead('bead-worker-1', {
                timeout: 45,
                worker_identity: 'SOVEREIGN-WORKER',
            });

            assert.equal(result.exitCode, 0);
            assert.equal(calls.length, 1);
            assert.equal(calls[0]?.command, 'npx');
            assert.deepStrictEqual(groups, {
                registered: [4242],
                unregistered: [4242],
            });
            assert.equal(calls[0]?.args[0], 'tsx');
            assert.equal(calls[0]?.args[1], path.join(RUNTIME_KERNEL_ROOT, 'cstar.ts'));
            assert.ok(calls[0]?.args.includes('--root'));
            assert.ok(calls[0]?.args.includes(tmpRoot));
            assert.ok(calls[0]?.args.includes('autobot'));
            assert.ok(calls[0]?.args.includes('--timeout'));
            assert.ok(calls[0]?.args.includes('45'));
            assert.ok(calls[0]?.args.includes('--agent-id'));
            assert.ok(calls[0]?.args.includes('SOVEREIGN-WORKER'));
            assert.ok(calls[0]?.args.includes('--checker-shell'));
            assert.ok(calls[0]?.args.includes('python3 -m unittest -q'));
            assert.ok(calls[0]?.args.includes('--worker-note'));
            assert.equal(calls[0]?.options.cwd, RUNTIME_KERNEL_ROOT);
            assert.equal(calls[0]?.options.env?.PYTHONPATH, RUNTIME_KERNEL_ROOT);

            const noteIndex = calls[0]?.args.indexOf('--worker-note') ?? -1;
            const note = noteIndex >= 0 ? calls[0]?.args[noteIndex + 1] : '';
            assert.match(note ?? '', /Local SovereignWorker micro-bead/i);
            assert.match(note ?? '', /Do not invent imports, dependencies, commands, or files/i);
            assert.match(note ?? '', /Target file role: Runtime worker target/i);
            assert.doesNotMatch(note ?? '', /PennyOne imports/i);
        });
    });

    describe('Reaper', () => {
        it('identifies clean failures (empty logs)', async () => {
            const reaper = new OrchestratorReaper(tmpRoot);
            const result = await reaper.mapOutcome('test-bead-id', {
                exitCode: 0,
                stdout: '   ',
                stderr: '',
                timedOut: false
            });
            assert.strictEqual(result, 'NEEDS_TRIAGE', 'Empty success should trigger triage');
        });

        it('maps timeout exit codes to SET for host-worker escalation', async () => {
            const reaper = new OrchestratorReaper(tmpRoot);
            const result = await reaper.mapOutcome('test-bead-id', {
                exitCode: 124,
                stdout: 'worker ran...',
                stderr: 'timeout signal',
                timedOut: true
            });
            assert.strictEqual(result, 'SET', 'Timeout should return the bead to SET for host-worker escalation');
        });

        it('preserves resolved Hall status after a successful checked worker run', async () => {
            const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
            const now = Date.now();
            const scanId = 'scan-resolved-1';

            getDb().prepare(`
                INSERT INTO hall_scans (
                    scan_id, repo_id, scan_kind, status, baseline_gungnir_score, started_at, completed_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(scanId, repoId, 'test', 'COMPLETED', 0, now, now, '{}');

            upsertHallBead({
                bead_id: 'bead-resolved-1',
                repo_id: repoId,
                scan_id: scanId,
                target_kind: 'FILE',
                target_ref: 'src/runtime/worker.ts',
                target_path: 'src/runtime/worker.ts',
                rationale: 'Respect AutoBot validation outcome.',
                contract_refs: ['contracts:worker-bridge'],
                baseline_scores: { overall: 6.0 },
                acceptance_criteria: 'Worker must finish validated.',
                status: 'RESOLVED',
                resolved_validation_id: 'validation:worker-1',
                created_at: now,
                updated_at: now,
            });

            const reaper = new OrchestratorReaper(tmpRoot);
            const result = await reaper.mapOutcome('bead-resolved-1', {
                exitCode: 0,
                stdout: 'AutoBot resolved bead bead-resolved-1 with validation validation:worker-1.',
                stderr: '',
                timedOut: false,
            });

            const row = getDb().prepare(`
                SELECT status, resolved_validation_id
                FROM hall_beads
                WHERE bead_id = ?
            `).get('bead-resolved-1') as { status: string; resolved_validation_id: string | null } | undefined;

            assert.strictEqual(result, 'RESOLVED');
            assert.equal(row?.status, 'RESOLVED');
            assert.equal(row?.resolved_validation_id, 'validation:worker-1');
        });
    });
});
