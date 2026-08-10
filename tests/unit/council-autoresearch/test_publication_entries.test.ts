import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
    canonicalizeGitRemoteUrl,
    sha256,
    verifyPublication,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, git, temporary } from './test_helpers.js';

afterEach(cleanup);

function gitBytes(repo: string, args: string[]): Buffer {
    const result = spawnSync('git', args, { cwd: repo, encoding: null });
    assert.equal(result.status, 0, result.stderr.toString('utf8'));
    return result.stdout;
}

function publishedEntryFixture(): { repo: string; remote: string; commit: string } {
    const repo = temporary('cstar-council-publication-entries-');
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'council@example.test']);
    git(repo, ['config', 'user.name', 'Council Test']);
    fs.writeFileSync(path.join(repo, 'regular.txt'), 'regular publication\n');
    git(repo, ['add', 'regular.txt']);
    git(repo, ['commit', '-m', 'base publication']);
    const baseCommit = git(repo, ['rev-parse', 'HEAD']);

    fs.mkdirSync(path.join(repo, 'nested'));
    fs.writeFileSync(path.join(repo, 'nested', 'content.txt'), 'tree content\n');
    git(repo, ['add', 'nested/content.txt']);

    const executablePayload = path.join(repo, 'executable-payload');
    fs.writeFileSync(executablePayload, '#!/bin/sh\nexit 0\n');
    const executableBlob = git(repo, ['hash-object', '-w', executablePayload]);
    fs.unlinkSync(executablePayload);
    git(repo, ['update-index', '--add', '--cacheinfo', `100755,${executableBlob},executable.sh`]);

    const symlinkPayload = path.join(repo, 'symlink-payload');
    fs.writeFileSync(symlinkPayload, 'regular.txt');
    const symlinkBlob = git(repo, ['hash-object', '-w', symlinkPayload]);
    fs.unlinkSync(symlinkPayload);
    git(repo, ['update-index', '--add', '--cacheinfo', `120000,${symlinkBlob},link.txt`]);
    git(repo, ['update-index', '--add', '--cacheinfo', `160000,${baseCommit},gitlink`]);
    git(repo, ['commit', '-m', 'add adversarial Git entry modes']);

    const remote = temporary('cstar-council-publication-entries-remote-');
    git(remote, ['init', '--bare']);
    git(repo, ['remote', 'add', 'origin', remote]);
    git(repo, ['push', '-u', 'origin', 'main']);
    return { repo, remote, commit: git(repo, ['rev-parse', 'HEAD']) };
}

describe('Council autoresearch publication Git-entry validation', () => {
    it('accepts only exact regular 100644 blobs before hashing content', () => {
        const fixture = publishedEntryFixture();
        const verify = (file: string) => verifyPublication({
            repoRoot: fixture.repo,
            runId: 'publication-entry-test',
            packetSha256: 'a'.repeat(64),
            ratingsSha256: 'b'.repeat(64),
            mappingRevealSha256: 'c'.repeat(64),
            decisionSha256: 'd'.repeat(64),
            repository: 'origin',
            expectedRepositoryUrl: fixture.remote,
            branch: 'main',
            commit: fixture.commit,
            requiredFiles: {
                [file]: sha256(gitBytes(fixture.repo, ['show', `${fixture.commit}:${file}`])),
            },
        });

        assert.doesNotThrow(() => verify('regular.txt'));
        for (const file of ['executable.sh', 'link.txt', 'nested', 'gitlink']) {
            assert.throws(() => verify(file), /regular 100644 blob/i, file);
        }
    });

    it('normalizes equivalent network and local remotes without cross-scheme collisions', () => {
        const repo = temporary('cstar-council-remote-identity-');
        const local = temporary('cstar-council-remote-local-');
        const relative = path.relative(repo, local);
        assert.equal(canonicalizeGitRemoteUrl(relative, repo), local);
        assert.equal(canonicalizeGitRemoteUrl(pathToFileURL(local).href, repo), local);
        assert.equal(
            canonicalizeGitRemoteUrl('https://EXAMPLE.com:443/team/repo/', repo),
            canonicalizeGitRemoteUrl('https://example.com/team/repo', repo),
        );
        assert.equal(
            canonicalizeGitRemoteUrl('git@example.com:team/repo.git', repo),
            canonicalizeGitRemoteUrl('ssh://git@example.com:22/team/repo.git', repo),
        );
        assert.equal(
            canonicalizeGitRemoteUrl('git@github.com:Clinscott/CStar.git', repo),
            canonicalizeGitRemoteUrl('https://github.com/Clinscott/CStar', repo),
        );
        const localLookalike = path.join(repo, 'https:', 'example.com', 'team', 'repo');
        fs.mkdirSync(localLookalike, { recursive: true });
        assert.notEqual(
            canonicalizeGitRemoteUrl('https://example.com/team/repo', repo),
            canonicalizeGitRemoteUrl('./https:/example.com/team/repo', repo),
        );
    });

    it('rejects a configured-remote mismatch before attempting network access', () => {
        const fixture = publishedEntryFixture();
        git(fixture.repo, ['remote', 'set-url', 'origin', 'https://127.0.0.1:9/never/contact.git']);
        assert.throws(() => verifyPublication({
            repoRoot: fixture.repo,
            runId: 'publication-identity-test',
            packetSha256: 'a'.repeat(64),
            ratingsSha256: 'b'.repeat(64),
            mappingRevealSha256: 'c'.repeat(64),
            decisionSha256: 'd'.repeat(64),
            repository: 'origin',
            expectedRepositoryUrl: fixture.remote,
            branch: 'main',
            commit: fixture.commit,
            requiredFiles: { 'regular.txt': sha256('regular publication\n') },
        }), /does not match the pinned URL/i);
    });
});
