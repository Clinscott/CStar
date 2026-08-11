import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    releaseRepositoryLease,
    sourceHead,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, git, repository, temporary } from './test_helpers.js';

type SpawnSync = typeof import('node:child_process').spawnSync;
type SpawnResult = import('node:child_process').SpawnSyncReturns<string | Buffer>;
type SpawnOptions = import('node:child_process').SpawnSyncOptions;

function interceptTrustedBlobReads(
    repo: string,
    onBlob: (call: number, runOriginalGit: (args: string[]) => string) => void,
): { calls: () => number; restore: () => void } {
    const mutable = createRequire(import.meta.url)('node:child_process') as { spawnSync: SpawnSync };
    const original = mutable.spawnSync;
    const callOriginal = original as unknown as (
        command: string,
        args: readonly string[],
        options?: SpawnOptions,
    ) => SpawnResult;
    const canonicalRepo = fs.realpathSync(repo);
    let calls = 0;
    mutable.spawnSync = ((command: string, args?: readonly string[], options?: SpawnOptions) => {
        const argv = args ?? [];
        const isBlobRead = command === '/usr/bin/git' && options?.cwd === canonicalRepo
            && argv.some((argument, index) => argument === 'cat-file' && argv[index + 1] === 'blob');
        if (isBlobRead) {
            calls += 1;
            onBlob(calls, (gitArgs) => {
                const result = callOriginal('/usr/bin/git', gitArgs, {
                    cwd: canonicalRepo,
                    encoding: 'utf8',
                });
                assert.equal(result.status, 0, String(result.stderr));
                return String(result.stdout).trim();
            });
        }
        return callOriginal(command, argv, options);
    }) as SpawnSync;
    syncBuiltinESMExports();
    return {
        calls: () => calls,
        restore: () => {
            mutable.spawnSync = original;
            syncBuiltinESMExports();
        },
    };
}

afterEach(cleanup);

function verify(repo: string, control: string, lease: ReturnType<typeof acquireRepositoryLease>): void {
    verifyRepositoryLease({
        repoRoot: repo,
        controlRoot: control,
        runId: lease.record.run_id,
        resumeToken: lease.resume_token,
    });
}

function release(repo: string, control: string, lease: ReturnType<typeof acquireRepositoryLease>): void {
    releaseRepositoryLease({
        repoRoot: repo,
        controlRoot: control,
        runId: lease.record.run_id,
        resumeToken: lease.resume_token,
    });
}

describe('Council autoresearch raw source attestation', () => {
    it('requires HEAD itself to name a commit without peeling annotated tags', () => {
        const repo = repository();
        const commit = git(repo, ['rev-parse', 'HEAD']);
        git(repo, ['tag', '-a', 'annotated-source', '-m', 'annotated source']);
        const headFile = path.join(repo, '.git', 'HEAD');
        fs.writeFileSync(headFile, 'ref: refs/tags/annotated-source\n');
        assert.throws(() => sourceHead(repo), /HEAD must directly name a commit/i);

        const tree = git(repo, ['rev-parse', `${commit}^{tree}`]);
        fs.writeFileSync(headFile, `${tree}\n`);
        assert.throws(() => sourceHead(repo), /HEAD must directly name a commit/i);
        fs.writeFileSync(headFile, `${commit}\n`);
        assert.equal(sourceHead(repo), commit);
    });

    it('rejects split indexes before trusting their shared state', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-split-index-test', governedPaths: ['src'],
        });
        git(repo, ['update-index', '--split-index']);
        assert.throws(() => verify(repo, control, lease), /split indexes are forbidden/i);
        git(repo, ['update-index', '--no-split-index']);
        release(repo, control, lease);
    });

    it('rejects persistent worktree drift after an earlier blob was scanned', () => {
        const repo = repository();
        fs.writeFileSync(path.join(repo, 'src', 'a.txt'), 'a stable\n');
        fs.writeFileSync(path.join(repo, 'src', 'z.txt'), 'z stable\n');
        git(repo, ['add', 'src/a.txt', 'src/z.txt']);
        git(repo, ['commit', '-m', 'add ordered race fixtures']);
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-worktree-race-test', governedPaths: ['src'],
        });
        const interception = interceptTrustedBlobReads(repo, (call) => {
            if (call === 2) fs.writeFileSync(path.join(repo, 'src', 'a.txt'), 'a drifted\n');
        });
        try {
            assert.throws(
                () => verify(repo, control, lease),
                /governed worktree (?:manifest )?changed during source attestation/i,
            );
        } finally {
            interception.restore();
        }
        assert.ok(interception.calls() >= 2, 'race interceptor must observe the later blob read');
        fs.writeFileSync(path.join(repo, 'src', 'a.txt'), 'a stable\n');
        release(repo, control, lease);
    });

    it('rejects an index rewrite after the initial logical index scan', () => {
        const repo = repository();
        const alternate = path.join(temporary('cstar-council-alternate-'), 'alternate.txt');
        fs.writeFileSync(alternate, 'alternate staged bytes\n');
        const alternateOid = git(repo, ['hash-object', '-w', alternate]);
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-index-race-test', governedPaths: ['src'],
        });
        const interception = interceptTrustedBlobReads(repo, (call, runOriginalGit) => {
            if (call === 1) {
                runOriginalGit([
                    'update-index', '--add', '--cacheinfo', `100644,${alternateOid},src/site.txt`,
                ]);
            }
        });
        try {
            assert.throws(
                () => verify(repo, control, lease),
                /Git index (?:view )?changed during source attestation/i,
            );
        } finally {
            interception.restore();
        }
        assert.ok(interception.calls() >= 1, 'race interceptor must observe a blob read');
        git(repo, ['reset', '--', 'src/site.txt']);
        release(repo, control, lease);
    });

    it('rejects skip-worktree flags before trusting the index', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-skip-worktree-test', governedPaths: ['src'],
        });
        git(repo, ['update-index', '--skip-worktree', 'src/site.txt']);
        assert.throws(() => verify(repo, control, lease), /hidden or unsupported flags/i);
        git(repo, ['update-index', '--no-skip-worktree', 'src/site.txt']);
        release(repo, control, lease);
    });

    it('rejects replacement refs, grafts, and alternate object databases', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-object-topology-test', governedPaths: ['src'],
        });
        const head = git(repo, ['rev-parse', 'HEAD']);
        const replacement = git(repo, ['commit-tree', `${head}^{tree}`, '-m', 'replacement commit']);
        git(repo, ['replace', head, replacement]);
        assert.throws(() => verify(repo, control, lease), /replacement refs are forbidden/i);
        git(repo, ['replace', '-d', head]);

        const common = path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir']));
        const grafts = path.join(common, 'info', 'grafts');
        fs.mkdirSync(path.dirname(grafts), { recursive: true });
        fs.writeFileSync(grafts, `${head} ${replacement}\n`);
        assert.throws(() => verify(repo, control, lease), /Git grafts are forbidden/i);
        fs.unlinkSync(grafts);

        const objects = path.resolve(repo, git(repo, ['rev-parse', '--git-path', 'objects']));
        const alternates = path.join(objects, 'info', 'alternates');
        fs.mkdirSync(path.dirname(alternates), { recursive: true });
        fs.writeFileSync(alternates, '');
        assert.throws(() => verify(repo, control, lease), /alternate Git object databases are forbidden/i);
        fs.unlinkSync(alternates);
        release(repo, control, lease);
    });

    it('rejects untracked and staged governed paths through exact path and index maps', () => {
        const repo = repository();
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-index-map-test', governedPaths: ['src'],
        });
        const extra = path.join(repo, 'src', 'extra.txt');
        fs.writeFileSync(extra, 'untracked\n');
        assert.throws(() => verify(repo, control, lease), /path set differs from HEAD/i);
        git(repo, ['add', 'src/extra.txt']);
        assert.throws(() => verify(repo, control, lease), /path set differs from HEAD/i);
        git(repo, ['reset', '--', 'src/extra.txt']);
        fs.unlinkSync(extra);
        release(repo, control, lease);
    });

    it('compares raw worktree bytes when Git line-ending rules normalize content', () => {
        const repo = repository();
        fs.writeFileSync(path.join(repo, '.gitattributes'), '*.txt text eol=crlf\n');
        git(repo, ['add', '.gitattributes']);
        git(repo, ['commit', '-m', 'declare text normalization']);
        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-raw-bytes-test', governedPaths: ['src'],
        });
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\r\n');
        assert.equal(
            git(repo, ['hash-object', 'src/site.txt']),
            git(repo, ['rev-parse', 'HEAD:src/site.txt']),
        );
        assert.notEqual(
            git(repo, ['hash-object', '--no-filters', 'src/site.txt']),
            git(repo, ['rev-parse', 'HEAD:src/site.txt']),
        );
        assert.throws(() => verify(repo, control, lease), /raw worktree bytes differ from HEAD/i);
        fs.writeFileSync(path.join(repo, 'src', 'site.txt'), 'stable source\n');
        release(repo, control, lease);
    });

    it('does not execute repository-configured clean filters during attestation', () => {
        const repo = repository();
        const tools = temporary('cstar-council-filter-');
        const sentinel = path.join(tools, 'filter-executed');
        const filter = path.join(tools, 'clean-filter');
        fs.writeFileSync(filter, `#!/bin/sh\n/usr/bin/touch ${sentinel}\n/bin/cat\n`, { mode: 0o755 });
        fs.writeFileSync(path.join(repo, '.gitattributes'), '*.txt filter=attacker\n');
        git(repo, ['add', '.gitattributes']);
        git(repo, ['commit', '-m', 'declare hostile clean filter']);
        git(repo, ['config', 'filter.attacker.clean', filter]);
        git(repo, ['config', 'filter.attacker.required', 'true']);

        const control = temporary('cstar-council-control-');
        const lease = acquireRepositoryLease({
            repoRoot: repo, controlRoot: control, runId: 'council-filter-effect-test', governedPaths: ['src'],
        });
        assert.equal(fs.existsSync(sentinel), false);
        verify(repo, control, lease);
        assert.equal(fs.existsSync(sentinel), false);
        release(repo, control, lease);
        assert.equal(fs.existsSync(sentinel), false);
    });
});
