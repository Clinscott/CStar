import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.resolve(process.cwd(), 'bin/pennyone.js');

describe('PennyOne: Empire CLI Integration', () => {
    it('should display help with A.L.F.R.E.D. persona branding', () => {
        const result = spawnSync('npx', ['tsx', CLI_PATH, '--help'], { encoding: 'utf-8', shell: true });
        const output = result.stdout + result.stderr;
        assert.ok(output.includes('PennyOne: 3D Repository Stat Crawler'), 'Help should describe the tool');
    });

    it('should successfully scan a target directory and output Gungnir Matrix', () => {
        const result = spawnSync('npx', [
            'tsx',
            CLI_PATH, 'scan', 'src/tools/pennyone/calculus'
        ], { encoding: 'utf-8', shell: true });

        const output = result.stdout + result.stderr;
        if (result.status !== 0) {
            console.error('CMD FAIL:', output);
        }

        assert.strictEqual(result.status, 0, 'Scan should exit with code 0');
        assert.ok(output.includes('[ALFRED]:'), 'Output should contain persona prefix');
        assert.ok(output.includes('Matrix: [L]'), 'Output should contain Logic score');
    });

    it('should fail gracefully and notify the user on error', () => {
        const result = spawnSync('npx', [
            'tsx',
            CLI_PATH, 'scan', '/invalid/path'
        ], { encoding: 'utf-8', shell: true });

        const output = result.stdout + result.stderr;
        assert.strictEqual(result.status, 1, 'Scan of invalid path should fail (code 1)');
        assert.ok(output.includes('yielded no results'), 'ALFRED should notify about empty results');
    });
});
