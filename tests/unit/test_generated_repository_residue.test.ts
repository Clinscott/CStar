import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

describe('generated repository residue', () => {
    it('keeps generated harness recordings and cache snapshots untracked', () => {
        const trackedTraceFiles = execFileSync(
            'git',
            ['ls-files', '--', 'tests/harness/logs/trace_*.json'],
            { cwd: ROOT, encoding: 'utf8' },
        ).trim();
        const ignoreRules = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
            .split(/\r?\n/);

        assert.equal(fs.existsSync(path.join(ROOT, 'tests/harness/raven_proxy.py')), false);
        assert.equal(trackedTraceFiles, '');
        assert.ok(ignoreRules.includes('/tests/harness/logs/trace_*.json'));
        assert.ok(ignoreRules.includes('/.agents/cachebro.json'));
    });
});
