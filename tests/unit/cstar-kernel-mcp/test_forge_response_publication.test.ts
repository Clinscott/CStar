import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

import {
    atomicWritePrivateFile,
    publishPrivateFileNoClobber,
    quarantinePrivateEntryNoFollow,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_artifacts.js';

const roots: string[] = [];
const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();

afterEach(() => {
    mock.restoreAll();
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function temporary(prefix: string): string {
    const root = fs.mkdtempSync(path.join(secureTmp, prefix));
    fs.chmodSync(root, 0o700);
    roots.push(root);
    return root;
}

function residue(root: string): string[] {
    return fs.readdirSync(root).filter((entry) => entry.includes('.cstar-'));
}

describe('CStar Forge parent-only response publication', () => {
    it('publishes an owner-only durable artifact exactly once', () => {
        const root = temporary('forge-response-publish-');
        const destination = path.join(root, 'adapter-response.json');

        publishPrivateFileNoClobber(root, destination, Buffer.from('{"status":"pass"}\n'));

        assert.equal(fs.readFileSync(destination, 'utf-8'), '{"status":"pass"}\n');
        assert.equal(fs.statSync(destination).mode & 0o077, 0);
        assert.equal(fs.statSync(destination).nlink, 1);
    });

    it('never overwrites a pre-existing durable artifact', () => {
        const root = temporary('forge-response-no-clobber-');
        const destination = path.join(root, 'adapter-response.json');
        fs.writeFileSync(destination, 'trusted-existing\n', { mode: 0o600 });

        assert.throws(
            () => publishPrivateFileNoClobber(root, destination, 'untrusted-replacement\n'),
            /forge_artifact_target_already_exists/,
        );
        assert.equal(fs.readFileSync(destination, 'utf-8'), 'trusted-existing\n');
    });

    it('does not follow or replace a pre-existing symlink target', () => {
        const root = temporary('forge-response-symlink-');
        const victim = path.join(root, 'victim.txt');
        const destination = path.join(root, 'adapter-response.json');
        fs.writeFileSync(victim, 'victim\n', { mode: 0o600 });
        fs.symlinkSync(victim, destination);

        assert.throws(
            () => publishPrivateFileNoClobber(root, destination, 'replacement\n'),
            /forge_artifact_target_already_exists/,
        );
        assert.equal(fs.readFileSync(victim, 'utf-8'), 'victim\n');
    });

    it('removes its private stage after a write failure', () => {
        const root = temporary('forge-response-write-failure-');
        const destination = path.join(root, 'adapter-response.json');
        const originalWrite = fs.writeFileSync.bind(fs) as typeof fs.writeFileSync;
        let injected = false;
        mock.method(fs, 'writeFileSync', ((target: any, ...args: any[]) => {
            if (!injected && typeof target === 'number') {
                injected = true;
                throw new Error('synthetic_artifact_write_failure');
            }
            return (originalWrite as any)(target, ...args);
        }) as typeof fs.writeFileSync);

        assert.throws(
            () => publishPrivateFileNoClobber(root, destination, 'evidence\n'),
            /synthetic_artifact_write_failure/,
        );
        assert.deepEqual(residue(root), []);
        assert.equal(fs.existsSync(destination), false);
    });

    it('removes its private stage after a close failure', () => {
        const root = temporary('forge-response-close-failure-');
        const destination = path.join(root, 'execution-trace.json');
        const originalClose = fs.closeSync.bind(fs);
        let injected = false;
        mock.method(fs, 'closeSync', ((fd: number) => {
            if (!injected && fs.fstatSync(fd).isFile()) {
                injected = true;
                throw new Error('synthetic_artifact_close_failure');
            }
            return originalClose(fd);
        }) as typeof fs.closeSync);

        assert.throws(
            () => atomicWritePrivateFile(root, destination, 'trace\n', false),
            /synthetic_artifact_close_failure/,
        );
        assert.deepEqual(residue(root), []);
        assert.equal(fs.existsSync(destination), false);
    });

    it('surfaces an exact publication rollback failure', () => {
        const root = temporary('forge-response-rollback-failure-');
        const destination = path.join(root, 'adapter-response.json');
        const originalFsync = fs.fsyncSync.bind(fs);
        const originalUnlink = fs.unlinkSync.bind(fs);
        mock.method(fs, 'fsyncSync', ((fd: number) => {
            if (fs.fstatSync(fd).isDirectory()) throw new Error('synthetic_directory_fsync');
            return originalFsync(fd);
        }) as typeof fs.fsyncSync);
        mock.method(fs, 'unlinkSync', ((target: fs.PathLike) => {
            if (path.resolve(String(target)) === destination) {
                throw new Error('synthetic_destination_unlink_failure');
            }
            return originalUnlink(target);
        }) as typeof fs.unlinkSync);

        assert.throws(
            () => publishPrivateFileNoClobber(root, destination, 'evidence\n'),
            /forge_artifact_publication_rollback_failed/,
        );
        assert.equal(fs.existsSync(destination), true);
    });

    it('quarantines an unsafe worker entry without following it', () => {
        const root = temporary('forge-response-quarantine-');
        const victim = path.join(root, 'victim.txt');
        const response = path.join(root, 'adapter-response.json');
        fs.writeFileSync(victim, 'victim\n', { mode: 0o600 });
        fs.symlinkSync(victim, response);

        const quarantined = quarantinePrivateEntryNoFollow(root, response);

        assert.equal(fs.existsSync(response), false);
        assert.ok(quarantined);
        assert.equal(fs.lstatSync(quarantined).isSymbolicLink(), true);
        assert.equal(fs.readFileSync(victim, 'utf-8'), 'victim\n');
    });
});
