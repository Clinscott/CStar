import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    RepositoryLeaseIntent,
    acquireRepositoryLease,
    ensureDirectoryNoFollow,
    fsyncDirectory,
    sha256,
    withRepositoryLeaseOperation,
    writeImmutableJson,
} from '../../../src/core/council_autoresearch/index.js';

interface WorkerRequest {
    action: 'immutable-link' | 'intent-hold' | 'acquire-hold' | 'operation-hold' | 'release-crash';
    repo_root?: string;
    control_root?: string;
    run_id?: string;
    resume_token?: string;
    governed_paths?: string[];
    marker?: string;
    target?: string;
}

function git(root: string, args: string[]): string {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
    return result.stdout.trim();
}

function mark(file: string, value: string): void {
    const descriptor = fs.openSync(file, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, value);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    fsyncDirectory(path.dirname(file));
}

function hold(): never {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    throw new Error('unreachable');
}

const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as WorkerRequest;
if (request.action === 'immutable-link') {
    const target = request.target!;
    ensureDirectoryNoFollow(path.dirname(target));
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, `${JSON.stringify({ durable: true })}\n`);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    fs.linkSync(temporary, target);
    fsyncDirectory(path.dirname(target));
    process.kill(process.pid, 'SIGKILL');
} else {
    const common = {
        repoRoot: request.repo_root!,
        controlRoot: request.control_root!,
        runId: request.run_id!,
        resumeToken: request.resume_token!,
    };
    if (request.action === 'intent-hold') {
        const repoRoot = fs.realpathSync(common.repoRoot);
        const commonPath = git(repoRoot, ['rev-parse', '--git-common-dir']);
        const gitCommonDirectory = fs.realpathSync(path.resolve(repoRoot, commonPath));
        const controlRoot = fs.realpathSync(common.controlRoot);
        ensureDirectoryNoFollow(path.join(controlRoot, 'council-autoresearch', common.runId));
        const intent: RepositoryLeaseIntent = {
            schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
            runner_version: COUNCIL_AUTORESEARCH_RUNNER,
            lease_id: randomUUID(),
            run_id: common.runId,
            repository_root: repoRoot,
            git_common_directory: gitCommonDirectory,
            control_root: controlRoot,
            governed_paths: [...request.governed_paths!].sort(),
            resume_token_sha256: sha256(common.resumeToken),
            owner: { pid: process.pid, hostname: process.env.HOSTNAME ?? 'unreported' },
            acquired_at: new Date().toISOString(),
        };
        writeImmutableJson(path.join(gitCommonDirectory, 'cstar-council-autoresearch.lock'), intent);
        mark(request.marker!, intent.lease_id);
        hold();
    }
    if (request.action === 'acquire-hold') {
        const lease = acquireRepositoryLease({
            ...common,
            governedPaths: request.governed_paths!,
        });
        mark(request.marker!, lease.record.lease_id);
        hold();
    }
    if (request.action === 'operation-hold') {
        const receiptFile = path.join(common.controlRoot, 'council-autoresearch', common.runId, '10-packet.json');
        withRepositoryLeaseOperation(common, receiptFile, () => () => {
            writeImmutableJson(receiptFile, { interrupted: true });
            mark(request.marker!, 'operation-committed');
            return hold();
        });
    }
    if (request.action === 'release-crash') {
        const receiptFile = path.join(common.controlRoot, 'council-autoresearch', common.runId, '50-source-release.json');
        withRepositoryLeaseOperation(common, receiptFile, (record) => () => {
            writeImmutableJson(receiptFile, {
                schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
                runner_version: COUNCIL_AUTORESEARCH_RUNNER,
                run_id: record.run_id,
                lease_id: record.lease_id,
                resume_token_sha256: record.resume_token_sha256,
                disposition: 'abandoned',
                terminal_state: 'ABORTED',
            });
            process.kill(process.pid, 'SIGKILL');
        });
    }
}
