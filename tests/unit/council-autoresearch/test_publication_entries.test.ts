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
        const verify = (file: string) => {
            const oid = git(fixture.repo, ['rev-parse', `${fixture.commit}:${file}`]);
            const digest = file === 'regular.txt'
                ? sha256(gitBytes(fixture.repo, ['cat-file', 'blob', oid]))
                : sha256('invalid Git entry mode');
            return verifyPublication({
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
                requiredFiles: { [file]: digest },
            });
        };

        assert.doesNotThrow(() => verify('regular.txt'));
        for (const file of ['executable.sh', 'link.txt', 'nested', 'gitlink']) {
            assert.throws(() => verify(file), /regular 100644 blob/i, file);
        }
    });

    it('rejects replacement refs, grafts, and alternate object databases before object reads', () => {
        const fixture = publishedEntryFixture();
        const regularOid = git(fixture.repo, ['rev-parse', `${fixture.commit}:regular.txt`]);
        const digest = sha256(gitBytes(fixture.repo, ['cat-file', 'blob', regularOid]));
        const verify = () => verifyPublication({
            repoRoot: fixture.repo,
            runId: 'publication-object-topology-test',
            packetSha256: 'a'.repeat(64),
            ratingsSha256: 'b'.repeat(64),
            mappingRevealSha256: 'c'.repeat(64),
            decisionSha256: 'd'.repeat(64),
            repository: 'origin',
            expectedRepositoryUrl: fixture.remote,
            branch: 'main',
            commit: fixture.commit,
            requiredFiles: { 'regular.txt': digest },
        });
        assert.doesNotThrow(verify);

        const replacementPayload = path.join(fixture.repo, 'replacement-payload');
        fs.writeFileSync(replacementPayload, 'replacement publication\n');
        const replacementOid = git(fixture.repo, ['hash-object', '-w', replacementPayload]);
        fs.unlinkSync(replacementPayload);
        git(fixture.repo, ['replace', regularOid, replacementOid]);
        assert.throws(verify, /replacement refs are forbidden/i);
        git(fixture.repo, ['replace', '-d', regularOid]);

        const common = path.resolve(fixture.repo, git(fixture.repo, ['rev-parse', '--git-common-dir']));
        const grafts = path.join(common, 'info', 'grafts');
        fs.writeFileSync(grafts, `${fixture.commit}\n`);
        assert.throws(verify, /grafts are forbidden/i);
        fs.unlinkSync(grafts);

        const alternates = path.join(common, 'objects', 'info', 'alternates');
        fs.mkdirSync(path.dirname(alternates), { recursive: true });
        fs.writeFileSync(alternates, `${path.join(fixture.remote, 'objects')}\n`);
        assert.throws(verify, /alternate Git object databases are forbidden/i);
        fs.unlinkSync(alternates);

        assert.doesNotThrow(verify);
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
        assert.notEqual(
            canonicalizeGitRemoteUrl('git@example.com:team/repo.git', repo),
            canonicalizeGitRemoteUrl('ssh://git@example.com:22/team/repo.git', repo),
        );
        assert.equal(
            canonicalizeGitRemoteUrl('git@EXAMPLE.com:team/repo.git', repo),
            canonicalizeGitRemoteUrl('git@example.com:team/repo.git', repo),
        );
        assert.notEqual(
            canonicalizeGitRemoteUrl('git@example.com:team/repo.git', repo),
            canonicalizeGitRemoteUrl('git@example.com:/team/repo.git', repo),
        );
        assert.equal(
            canonicalizeGitRemoteUrl('git@github.com:Clinscott/CStar.git', repo),
            canonicalizeGitRemoteUrl('https://github.com/Clinscott/CStar', repo),
        );
        assert.notEqual(
            canonicalizeGitRemoteUrl('git@github.com:/Clinscott/CStar.git', repo),
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

    it('rejects ambient Git topology before publication network access', () => {
        const fixture = publishedEntryFixture();
        const previous = process.env.GIT_OBJECT_DIRECTORY;
        process.env.GIT_OBJECT_DIRECTORY = path.join(fixture.repo, 'attacker-objects');
        try {
            assert.throws(() => verifyPublication({
                repoRoot: fixture.repo,
                runId: 'publication-topology-test',
                packetSha256: 'a'.repeat(64),
                ratingsSha256: 'b'.repeat(64),
                mappingRevealSha256: 'c'.repeat(64),
                decisionSha256: 'd'.repeat(64),
                repository: 'origin',
                expectedRepositoryUrl: fixture.remote,
                branch: 'main',
                commit: fixture.commit,
                requiredFiles: { 'regular.txt': sha256('regular publication\n') },
            }), /ambient Git topology override.*GIT_OBJECT_DIRECTORY/i);
        } finally {
            if (previous === undefined) delete process.env.GIT_OBJECT_DIRECTORY;
            else process.env.GIT_OBJECT_DIRECTORY = previous;
        }
    });
});
