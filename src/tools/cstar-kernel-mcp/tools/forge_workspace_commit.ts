import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES,
    FORGE_WORKSPACE_OUTPUT_TOTAL_MAX_BYTES,
    assertForgeWorkspaceProjectionCurrent,
    assertSnapshotUnchanged,
    readSnapshot,
    readSnapshotUnchanged,
    type ForgeProjectedOutput,
    type ForgeWorkspaceProjection,
} from './forge_workspace_projection.js';

export interface ForgeWorkspaceCommitReceipt {
    schema: 'cstar.forge_workspace_commit.v1';
    status: 'committed';
    files: Array<{
        path: string;
        bytes: number;
        sha256: string;
        mode: number;
        dev: number;
        ino: number;
    }>;
}

function currentUid(): number {
    if (typeof process.getuid !== 'function') throw new Error('forge_workspace_owner_check_unavailable');
    return process.getuid();
}

function sha256(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

function ensureCommitParent(root: string, target: string, created: string[]): string {
    const relative = path.relative(root, path.dirname(target));
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!stat) {
            fs.mkdirSync(current, { mode: 0o700 });
            created.push(current);
            continue;
        }
        if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== currentUid()
            || (stat.mode & 0o022) !== 0) {
            throw new Error('forge_workspace_commit_parent_unsafe');
        }
    }
    return current;
}

function writeStage(
    parent: string,
    basename: string,
    content: Buffer,
    mode: number,
    kind: string,
): { path: string; dev: number; ino: number } {
    const target = path.join(
        parent,
        `.${basename}.cstar-${kind}-${randomBytes(12).toString('hex')}`,
    );
    let fd: number | null = null;
    let complete = false;
    try {
        fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT
            | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), mode);
        fs.writeFileSync(fd, content);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        complete = true;
    } finally {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* Stage cleanup below is authoritative. */ }
        }
        if (!complete) {
            try {
                fs.rmSync(target, { force: true });
            } catch {
                throw new Error('forge_workspace_stage_cleanup_failed');
            }
        }
    }
    try {
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
            || stat.uid !== currentUid() || (stat.mode & 0o777) !== mode) {
            throw new Error('forge_workspace_stage_identity_invalid');
        }
        return { path: target, dev: stat.dev, ino: stat.ino };
    } catch (error) {
        try {
            fs.rmSync(target, { force: true });
        } catch {
            throw new Error('forge_workspace_stage_cleanup_failed', { cause: error });
        }
        throw error;
    }
}

function assertStageIdentity(
    stage: { path: string; dev: number; ino: number },
    mode: number,
): void {
    const stat = fs.lstatSync(stage.path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
        || stat.uid !== currentUid() || stat.dev !== stage.dev || stat.ino !== stage.ino
        || (stat.mode & 0o777) !== mode) {
        throw new Error('forge_workspace_stage_identity_drift');
    }
}

function fsyncDirectory(directory: string): void {
    const fd = fs.openSync(directory, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

type StagedOutput = {
    target: string;
    stage: string;
    stage_dev: number;
    stage_ino: number;
    original: Buffer | null;
    output: ForgeProjectedOutput;
};

export function commitForgeWorkspaceProjection(
    projection: ForgeWorkspaceProjection,
    afterCommit?: (receipt: ForgeWorkspaceCommitReceipt) => void,
): ForgeWorkspaceCommitReceipt {
    assertForgeWorkspaceProjectionCurrent(projection);
    if (projection.outputs.length === 0) {
        const empty: ForgeWorkspaceCommitReceipt = {
            schema: 'cstar.forge_workspace_commit.v1',
            status: 'committed',
            files: [],
        };
        afterCommit?.(empty);
        assertForgeWorkspaceProjectionCurrent(projection);
        return empty;
    }
    const prepared: Array<{ output: ForgeProjectedOutput; content: Buffer }> = [];
    let preparedBytes = 0;
    for (const output of projection.outputs) {
        assertSnapshotUnchanged(projection.source_project_root, output.initial);
        const projected = readSnapshot(
            projection.workspace_root,
            output.projected_path,
            FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES,
        );
        if (!projected.content || projected.directory) {
            throw new Error('forge_workspace_required_output_missing');
        }
        preparedBytes += projected.content.byteLength;
        if (preparedBytes > FORGE_WORKSPACE_OUTPUT_TOTAL_MAX_BYTES) {
            throw new Error('forge_workspace_output_material_too_large');
        }
        prepared.push({ output, content: projected.content });
    }

    const createdDirectories: string[] = [];
    const staged: StagedOutput[] = [];
    const committed: StagedOutput[] = [];
    const committedPaths = new Set<string>();
    let completed = false;
    try {
        for (const item of prepared) {
            assertForgeWorkspaceProjectionCurrent(projection);
            const parent = ensureCommitParent(
                projection.source_project_root,
                item.output.source_path,
                createdDirectories,
            );
            assertSnapshotUnchanged(projection.source_project_root, item.output.initial);
            const stage = writeStage(
                parent,
                path.basename(item.output.source_path),
                item.content,
                item.output.initial.mode,
                'stage',
            );
            const record: StagedOutput = {
                target: item.output.source_path,
                stage: stage.path,
                stage_dev: stage.dev,
                stage_ino: stage.ino,
                original: null,
                output: item.output,
            };
            staged.push(record);
            if (item.output.initial.exists) {
                const original = readSnapshotUnchanged(
                    projection.source_project_root,
                    item.output.initial,
                );
                if (!original) throw new Error('forge_workspace_source_drift_before_commit');
                record.original = original;
            }
        }
        for (const item of staged) {
            assertForgeWorkspaceProjectionCurrent(projection, committedPaths);
            assertSnapshotUnchanged(projection.source_project_root, item.output.initial);
            assertStageIdentity(
                { path: item.stage, dev: item.stage_dev, ino: item.stage_ino },
                item.output.initial.mode,
            );
            fs.renameSync(item.stage, item.target);
            committed.push(item);
            committedPaths.add(item.target);
            const committedIdentity = fs.lstatSync(item.target);
            if (committedIdentity.dev !== item.stage_dev || committedIdentity.ino !== item.stage_ino) {
                throw new Error('forge_workspace_committed_output_identity_drift');
            }
            fsyncDirectory(path.dirname(item.target));
        }
        const outputPaths = new Set(projection.outputs.map((output) => output.source_path));
        assertForgeWorkspaceProjectionCurrent(projection, outputPaths);
        const committedFiles = () => committed.map((item) => {
            const current = readSnapshot(
                projection.source_project_root,
                item.target,
                FORGE_WORKSPACE_OUTPUT_FILE_MAX_BYTES,
            );
            const content = current.content;
            const expected = prepared.find((candidate) => (
                candidate.output.source_path === item.target
            ))?.content;
            if (!content || !expected || !content.equals(expected)
                || current.snapshot.mode !== item.output.initial.mode
                || current.snapshot.dev !== item.stage_dev
                || current.snapshot.ino !== item.stage_ino
                || current.snapshot.dev === null || current.snapshot.ino === null) {
                throw new Error('forge_workspace_committed_output_drift');
            }
            return {
                path: item.target,
                bytes: content.byteLength,
                sha256: sha256(content),
                mode: current.snapshot.mode,
                dev: current.snapshot.dev,
                ino: current.snapshot.ino,
            };
        });
        const receipt: ForgeWorkspaceCommitReceipt = {
            schema: 'cstar.forge_workspace_commit.v1',
            status: 'committed',
            files: committedFiles(),
        };
        afterCommit?.(receipt);
        assertForgeWorkspaceProjectionCurrent(projection, outputPaths);
        if (JSON.stringify(committedFiles()) !== JSON.stringify(receipt.files)) {
            throw new Error('forge_workspace_committed_output_drift');
        }
        completed = true;
        return receipt;
    } finally {
        let rollbackFailed = false;
        const rollbackStages: string[] = [];
        if (!completed) {
            for (const item of [...committed].reverse()) {
                try {
                    if (item.original) {
                        const rollback = writeStage(
                            path.dirname(item.target),
                            path.basename(item.target),
                            item.original,
                            item.output.initial.mode,
                            'rollback',
                        );
                        rollbackStages.push(rollback.path);
                        assertStageIdentity(rollback, item.output.initial.mode);
                        fs.renameSync(rollback.path, item.target);
                    } else fs.rmSync(item.target, { force: true });
                    fsyncDirectory(path.dirname(item.target));
                } catch { rollbackFailed = true; }
            }
        }
        let residue = false;
        for (const item of staged) {
            try { fs.rmSync(item.stage, { force: true }); } catch { residue = true; }
        }
        for (const rollbackStage of rollbackStages) {
            try { fs.rmSync(rollbackStage, { force: true }); } catch { residue = true; }
        }
        if (!completed) {
            for (const directory of [...createdDirectories].reverse()) {
                try { fs.rmdirSync(directory); } catch { residue = true; }
            }
        }
        if (rollbackFailed) throw new Error('forge_workspace_commit_rollback_failed');
        if (residue) throw new Error('forge_workspace_commit_residue_cleanup_failed');
    }
}
