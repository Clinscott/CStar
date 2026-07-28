import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

test('generated analysis and nested Hall artifacts stay untracked', () => {
    const tracked = execFileSync('git', ['ls-files'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
    }).split(/\r?\n/u);
    const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');

    assert.ok(!tracked.includes('.agents/eslint.json'));
    assert.deepEqual(tracked.filter((path) => /(^|\/)\.stats\//u.test(path)), []);
    assert.match(gitignore, /^\/\.agents\/eslint\.json$/mu);
    assert.match(gitignore, /^\*\*\/\.stats\/$/mu);
});
