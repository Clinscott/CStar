import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { OrchestratorProcessManager } from  './process_manager.js';
import * as autobotContext from  './autobot_context.js';
import { RUNTIME_KERNEL_ROOT } from  './kernel_root.js';
import { database } from  '../../../tools/pennyone/intel/database.js';
import * as astSlicer from  './ast_slicer.js';

export const deps = {
    fs: {
        mkdirSync: (path: string, options?: fs.MakeDirectoryOptions) => fs.mkdirSync(path, options),
        writeFileSync: (path: string, data: string, options?: fs.WriteFileOptions) => fs.writeFileSync(path, data, options),
        readFileSync: (path: string, options: { encoding: BufferEncoding; flag?: string }) => fs.readFileSync(path, options),
        existsSync: (path: string) => fs.existsSync(path),
    },
    autobot: {
        buildAutobotWorkerNote: autobotContext.buildAutobotWorkerNote,
        resolveAutobotCheckerShell: autobotContext.resolveAutobotCheckerShell,
    },
    db: database,
    ast: {
        extractTargetSymbol: astSlicer.extractTargetSymbol,
        injectTargetSymbol: astSlicer.injectTargetSymbol,
    }
};

export interface WorkerOptions {
    timeout: number;
    worker_identity?: string;
}

export interface WorkerResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

/**
 * [Ω] ORCHESTRATOR WORKER BRIDGE
 * Purpose: Managed execution of worker sub-processes.
 * Mandate: Context injection and real-time log redirection.
 */
export class OrchestratorWorkerBridge {
    constructor(
        private readonly workspaceRoot: string,
        private readonly processManager: OrchestratorProcessManager,
        private readonly runner: typeof execa = execa,
    ) {}

    /**
     * Executes a specific bead using the AutoBot/SovereignWorker worker.
     */
    public async executeBead(beadId: string, options: WorkerOptions): Promise<WorkerResult> {
        let workerNote: string | undefined;
        let checkerShell: string | undefined;
        let targetSymbol: string | undefined;
        let originalTargetPath: string | undefined;
        let slicedTempPath: string | undefined;

        try {
            workerNote = deps.autobot.buildAutobotWorkerNote(this.workspaceRoot, beadId, null);
        } catch {
            workerNote = undefined;
        }
        try {
            checkerShell = deps.autobot.resolveAutobotCheckerShell(this.workspaceRoot, beadId, null);
        } catch {
            checkerShell = undefined;
        }

        const bead = deps.db.getHallBeads(this.workspaceRoot).find(b => b.id === beadId);
        if (bead) {
             const payload = bead.critique_payload;
             if (payload && typeof payload.target_symbol === 'string' && payload.target_symbol.trim() !== '') {
                  targetSymbol = payload.target_symbol.trim();
                  originalTargetPath = bead.target_path ?? bead.target_ref;
             }
        }

        if (targetSymbol && originalTargetPath) {
             const extractedCode = deps.ast.extractTargetSymbol(this.workspaceRoot, originalTargetPath, targetSymbol);
             if (extractedCode) {
                  // Create a sandbox file for AutoBot
                  const sandboxDir = path.join(this.workspaceRoot, '.agents', 'tmp_sandbox');
                  deps.fs.mkdirSync(sandboxDir, { recursive: true });
                  slicedTempPath = path.join(sandboxDir, `${targetSymbol}_slice.ts`);
                  deps.fs.writeFileSync(slicedTempPath, extractedCode, 'utf-8');

                  // We must override the bead's target path so AutoBot only edits the slice.
                  const db = deps.db.getDb();
                  db.prepare(`UPDATE hall_beads SET target_path = ? WHERE bead_id = ?`).run(
                       path.relative(this.workspaceRoot, slicedTempPath), beadId
                  );
             }
        }

        // Just-in-time context injection via environment and CLI args
        const args = [
            path.join(RUNTIME_KERNEL_ROOT, 'cstar.ts'),
            '--root', this.workspaceRoot,
            'autobot',
            '--bead-id', beadId,
            '--timeout', String(options.timeout),
            '--agent-id', options.worker_identity || 'SOVEREIGN-WORKER',
            '--source', 'runtime',
        ];
        if (workerNote) {
            args.push('--worker-note', workerNote);
        }
        if (checkerShell) {
            args.push('--checker-shell', checkerShell);
        }

        const worker = this.runner('npx', ['tsx', ...args], {
            cwd: RUNTIME_KERNEL_ROOT,
            detached: true, // Create a new process group
            extendEnv: true,
            env: {
                ORCHESTRATOR_WORKER_ID: options.worker_identity || 'SOVEREIGN-WORKER',
                PYTHONPATH: RUNTIME_KERNEL_ROOT,
            }
        });

        if (worker.pid) {
            this.processManager.registerGroup(worker.pid);
        }

        let workerResult: WorkerResult;
        try {
            const { exitCode, stdout, stderr } = await worker;
            workerResult = {
                exitCode: exitCode ?? 0,
                stdout,
                stderr,
                timedOut: false
            };
        } catch (err: any) {
            workerResult = {
                exitCode: err.exitCode ?? 1,
                stdout: err.stdout ?? '',
                stderr: err.stderr ?? err.message,
                timedOut: err.timedOut ?? false
            };
        } finally {
            if (worker.pid) {
                this.processManager.unregisterGroup(worker.pid);
            }
        }

        // [🔱] THE IMMUTABLE GRID: Version Control Integration
        // If the worker failed, we must revert the target file to prevent broken logic from polluting the workspace.
        if (workerResult.exitCode !== 0 && originalTargetPath) {
             try {
                 // Use the project root determined via the bridge
                 await this.runner('git', ['checkout', 'HEAD', '--', originalTargetPath], { cwd: this.workspaceRoot });
                 workerResult.stderr += `\n[C* KERNEL]: Worker failed. Reverted '${originalTargetPath}' to HEAD.`;
             } catch (e: any) {
                 workerResult.stderr += `\n[C* KERNEL]: Failed to revert '${originalTargetPath}': ${e.message}`;
             }
        }

        if (targetSymbol && originalTargetPath && slicedTempPath) {
             // Restore the original target path in DB
             const db = deps.db.getDb();
             db.prepare(`UPDATE hall_beads SET target_path = ? WHERE bead_id = ?`).run(
                 originalTargetPath, beadId
             );

             // Inject the modified code back into the original file
             if (deps.fs.existsSync(slicedTempPath)) {
                  const modifiedCode = deps.fs.readFileSync(slicedTempPath, { encoding: 'utf-8' });
                  deps.ast.injectTargetSymbol(this.workspaceRoot, originalTargetPath, targetSymbol, modifiedCode);
             }
        }

        return workerResult;
    }
}
