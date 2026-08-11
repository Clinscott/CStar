import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    releaseRepositoryLease,
    verifyRepositoryLease,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, git, repository, temporary } from './test_helpers.js';

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
