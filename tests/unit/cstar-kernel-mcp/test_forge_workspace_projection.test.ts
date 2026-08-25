import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

import type { ForgeExecutionArgs } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_contract.js';
import {
    prepareForgeWorkspaceProjection,
    projectForgeAdapterIntent,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_workspace_projection.js';
import {
    commitForgeWorkspaceProjection,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_workspace_commit.js';

const roots: string[] = [];
const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();

function digest(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function fixture() {
    const control = fs.mkdtempSync(path.join(secureTmp, 'cstar-workspace-projection-'));
    fs.chmodSync(control, 0o700);
    roots.push(control);
    const project = path.join(control, 'project');
    const temporary = path.join(control, 'private-runtime');
    fs.mkdirSync(project, { mode: 0o700 });
    fs.mkdirSync(temporary, { mode: 0o700 });
    const target = path.join(project, 'src', 'target.ts');
    const secret = path.join(project, 'secret.env');
    const lock = path.join(control, 'package-lock.json');
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, 'export const value = 1;\n', { mode: 0o600 });
    fs.writeFileSync(secret, 'SECRET=not-projected\n', { mode: 0o600 });
    fs.writeFileSync(lock, '{"lockfileVersion":3}\n', { mode: 0o600 });
    const args = {
        target_paths: [target],
        required_output_paths: [target],
        package_locks: [{ path: lock, sha256: digest('{"lockfileVersion":3}\n') }],
    } as ForgeExecutionArgs;
    return { control, project, temporary, target, secret, lock, args };
}

afterEach(() => {
    mock.restoreAll();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function transactionResidue(directory: string): string[] {
    return fs.readdirSync(directory).filter((entry) => entry.includes('.cstar-'));
}

describe('Forge shadow workspace projection', () => {
    it('projects only exact target and package-lock material into a private intent', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        const projectedTarget = projection.required_output_paths[0]!;
        const intent = projectForgeAdapterIntent({ mission: 'synthetic' }, projection);

        assert.equal(fs.readFileSync(projectedTarget, 'utf-8'), 'export const value = 1;\n');
        assert.equal(fs.existsSync(path.join(projection.workspace_root, 'secret.env')), false);
        assert.equal(fs.readFileSync(projection.package_locks[0]!.path, 'utf-8'), '{"lockfileVersion":3}\n');
        assert.equal(JSON.stringify(intent).includes(item.project), false);
        assert.deepEqual(intent.target_paths, [projectedTarget]);
        assert.deepEqual(intent.required_output_paths, [projectedTarget]);
    });

    it('commits only exact required outputs and leaves projected rogue files isolated', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        fs.writeFileSync(path.join(projection.workspace_root, 'rogue.txt'), 'rogue');

        const receipt = commitForgeWorkspaceProjection(projection);

        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 2;\n');
        assert.equal(fs.readFileSync(item.secret, 'utf-8'), 'SECRET=not-projected\n');
        assert.equal(fs.existsSync(path.join(item.project, 'rogue.txt')), false);
        assert.deepEqual(receipt.files.map((file) => file.path), [item.target]);
    });

    it('commits two exact outputs in one transaction', () => {
        const item = fixture();
        const second = path.join(item.project, 'src', 'second.ts');
        fs.writeFileSync(second, 'export const second = 1;\n', { mode: 0o600 });
        const projection = prepareForgeWorkspaceProjection(
            { ...item.args, target_paths: [item.target, second], required_output_paths: [item.target, second] },
            item.control,
            item.project,
            item.temporary,
        );
        for (const output of projection.outputs) {
            fs.writeFileSync(output.projected_path, `// committed ${path.basename(output.source_path)}\n`);
        }

        const receipt = commitForgeWorkspaceProjection(projection);

        assert.deepEqual(receipt.files.map((file) => file.path).sort(), [item.target, second].sort());
        assert.equal(fs.readFileSync(item.target, 'utf-8'), '// committed target.ts\n');
        assert.equal(fs.readFileSync(second, 'utf-8'), '// committed second.ts\n');
    });

    it('rejects source drift before commit without overwriting the host file', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        fs.writeFileSync(item.target, 'export const value = 99;\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /forge_workspace_source_drift_before_commit/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 99;\n');
    });

    it('rejects project-root identity or mode drift before commit', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        fs.chmodSync(item.project, 0o750);

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /forge_workspace_root_drift/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
    });

    it('rejects package-lock drift before committing a projected output', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        fs.writeFileSync(item.lock, '{"lockfileVersion":4}\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /forge_workspace_package_lock_drift/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
    });

    it('rolls back every output when a package lock drifts during receipt persistence', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection, () => {
                fs.writeFileSync(item.lock, '{"lockfileVersion":4}\n');
            }),
            /forge_workspace_package_lock_drift/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
    });

    it('projects a directory target as an empty scope marker without sibling contents', () => {
        const item = fixture();
        const scope = path.join(item.project, 'bounded');
        const output = path.join(scope, 'generated.ts');
        fs.mkdirSync(scope, { mode: 0o700 });
        fs.writeFileSync(path.join(scope, 'not-authorized.txt'), 'private sibling\n');
        const projection = prepareForgeWorkspaceProjection(
            { ...item.args, target_paths: [scope], required_output_paths: [output] },
            item.control,
            item.project,
            item.temporary,
        );
        const projectedScope = path.join(projection.workspace_root, 'bounded');

        assert.equal(projection.target_paths.includes(projectedScope), true);
        assert.equal(fs.statSync(projectedScope).isDirectory(), true);
        assert.equal(fs.existsSync(path.join(projectedScope, 'not-authorized.txt')), false);
    });

    it('rolls back committed output when durable receipt persistence fails', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection, () => {
                throw new Error('synthetic_receipt_failure');
            }),
            /synthetic_receipt_failure/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
    });

    it('rolls back an identical-byte inode replacement during receipt persistence', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection, () => {
                const replacement = path.join(path.dirname(item.target), 'replacement.ts');
                fs.writeFileSync(replacement, 'export const value = 2;\n', { mode: 0o600 });
                fs.renameSync(replacement, item.target);
            }),
            /forge_workspace_committed_output_drift/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
    });

    it('detects a staged inode replacement at the rename boundary and restores the original', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        const originalRename = fs.renameSync.bind(fs);
        let injected = false;
        mock.method(fs, 'renameSync', ((source: fs.PathLike, target: fs.PathLike) => {
            if (!injected && String(source).includes('.cstar-stage-')) {
                injected = true;
                const replacement = `${String(source)}.replacement`;
                fs.writeFileSync(replacement, fs.readFileSync(source), { mode: 0o600 });
                fs.rmSync(source);
                originalRename(replacement, source);
            }
            return originalRename(source, target);
        }) as typeof fs.renameSync);

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /forge_workspace_committed_output_identity_drift/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
        assert.deepEqual(transactionResidue(path.dirname(item.target)), []);
    });

    it('rejects projected output material above the aggregate cap before staging', () => {
        const item = fixture();
        const second = path.join(item.project, 'src', 'second.ts');
        const third = path.join(item.project, 'src', 'third.ts');
        fs.writeFileSync(second, 'export const second = 1;\n', { mode: 0o600 });
        fs.writeFileSync(third, 'export const third = 1;\n', { mode: 0o600 });
        const projection = prepareForgeWorkspaceProjection(
            {
                ...item.args,
                target_paths: [item.target, second, third],
                required_output_paths: [item.target, second, third],
            },
            item.control,
            item.project,
            item.temporary,
        );
        for (const output of projection.outputs) {
            fs.writeFileSync(output.projected_path, Buffer.alloc(11 * 1024 * 1024, 0x41));
        }

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /forge_workspace_output_material_too_large/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
        assert.deepEqual(transactionResidue(path.dirname(item.target)), []);
    });

    it('rejects excessive output and package-lock counts before projection', () => {
        const item = fixture();
        const outputs = Array.from(
            { length: 257 },
            (_, index) => path.join(item.project, `output-${index}.ts`),
        );
        assert.throws(
            () => prepareForgeWorkspaceProjection(
                { ...item.args, target_paths: outputs, required_output_paths: outputs },
                item.control,
                item.project,
                item.temporary,
            ),
            /forge_workspace_output_count_exceeded/,
        );
        assert.throws(
            () => prepareForgeWorkspaceProjection(
                {
                    ...item.args,
                    package_locks: Array.from(
                        { length: 17 },
                        () => item.args.package_locks![0]!,
                    ),
                },
                item.control,
                item.project,
                item.temporary,
            ),
            /forge_workspace_package_lock_count_exceeded/,
        );
    });

    it('restores the original after a post-rename directory fsync failure', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        const originalFsync = fs.fsyncSync.bind(fs);
        let injected = false;
        mock.method(fs, 'fsyncSync', ((fd: number) => {
            if (!injected && fs.fstatSync(fd).isDirectory()) {
                injected = true;
                throw new Error('synthetic_directory_fsync_failure');
            }
            return originalFsync(fd);
        }) as typeof fs.fsyncSync);

        assert.throws(
            () => commitForgeWorkspaceProjection(projection),
            /synthetic_directory_fsync_failure/,
        );
        assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
        assert.deepEqual(transactionResidue(path.dirname(item.target)), []);
    });

    it('cleans transaction residue even when rollback rename fails', () => {
        const item = fixture();
        const projection = prepareForgeWorkspaceProjection(
            item.args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
        const originalRename = fs.renameSync.bind(fs);
        mock.method(fs, 'renameSync', ((source: fs.PathLike, target: fs.PathLike) => {
            if (String(source).includes('.cstar-rollback-')) {
                throw new Error('synthetic_rollback_rename_failure');
            }
            return originalRename(source, target);
        }) as typeof fs.renameSync);

        assert.throws(
            () => commitForgeWorkspaceProjection(projection, () => {
                throw new Error('synthetic_receipt_failure');
            }),
            /forge_workspace_commit_rollback_failed/,
        );
        assert.deepEqual(transactionResidue(path.dirname(item.target)), []);
    });

    for (const failure of [
        { name: 'stage write', failWrite: 1, failFsync: false, failClose: false },
        { name: 'stage fsync', failWrite: 0, failFsync: true, failClose: false },
        { name: 'stage close', failWrite: 0, failFsync: false, failClose: true },
    ]) {
        it(`leaves no transaction residue after ${failure.name} failure`, () => {
            const item = fixture();
            const projection = prepareForgeWorkspaceProjection(
                item.args, item.control, item.project, item.temporary,
            );
            fs.writeFileSync(projection.required_output_paths[0]!, 'export const value = 2;\n');
            if (failure.failWrite > 0) {
                const originalWrite = fs.writeFileSync.bind(fs) as any;
                let writes = 0;
                mock.method(fs, 'writeFileSync', ((target: any, ...args: any[]) => {
                    if (typeof target === 'number' && ++writes === failure.failWrite) {
                        throw new Error(`synthetic_${failure.name.replace(' ', '_')}_failure`);
                    }
                    return originalWrite(target, ...args);
                }) as any);
            } else if (failure.failFsync) {
                const originalFsync = fs.fsyncSync.bind(fs);
                let injected = false;
                mock.method(fs, 'fsyncSync', ((fd: number) => {
                    if (!injected && fs.fstatSync(fd).isFile()) {
                        injected = true;
                        throw new Error('synthetic_stage_fsync_failure');
                    }
                    return originalFsync(fd);
                }) as typeof fs.fsyncSync);
            } else {
                const originalClose = fs.closeSync.bind(fs);
                let injected = false;
                mock.method(fs, 'closeSync', ((fd: number) => {
                    if (!injected && fs.fstatSync(fd).isFile()) {
                        injected = true;
                        throw new Error('synthetic_stage_close_failure');
                    }
                    return originalClose(fd);
                }) as typeof fs.closeSync);
            }

            assert.throws(() => commitForgeWorkspaceProjection(projection), /synthetic_/);
            assert.equal(fs.readFileSync(item.target, 'utf-8'), 'export const value = 1;\n');
            assert.deepEqual(transactionResidue(path.dirname(item.target)), []);
        });
    }

    it('removes a newly created output and parent directories on receipt failure', () => {
        const item = fixture();
        const target = path.join(item.project, 'new', 'nested', 'file.ts');
        const args = { ...item.args, target_paths: [target], required_output_paths: [target] };
        const projection = prepareForgeWorkspaceProjection(
            args, item.control, item.project, item.temporary,
        );
        fs.writeFileSync(projection.required_output_paths[0]!, 'export const created = true;\n');

        assert.throws(
            () => commitForgeWorkspaceProjection(projection, () => {
                throw new Error('synthetic_receipt_failure');
            }),
            /synthetic_receipt_failure/,
        );
        assert.equal(fs.existsSync(target), false);
        assert.equal(fs.existsSync(path.join(item.project, 'new')), false);
    });
});
