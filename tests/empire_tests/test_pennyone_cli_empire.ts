import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.resolve(process.cwd(), 'bin/pennyone.js');

describe('PennyOne: Empire CLI Integration', () => {
    it('should display help with A.L.F.R.E.D. persona branding', () => {
        const result = spawnSync('npx', ['tsx', CLI_PATH, '--help'], { encoding: 'utf-8', shell: true });
        const output = result.stdout + result.stderr;
        assert.ok(output.includes('PennyOne: Autonomic Repository Intelligence System'), 'Help should describe the tool');
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
        assert.ok(output.includes('Scan complete. Total Files:'), 'Output should contain file count');
    });

    it('should fail gracefully and notify the user on error', () => {
        const result = spawnSync('npx', [
            'tsx',
            CLI_PATH, 'scan', '/invalid/path/that/does/not/exist'
        ], { encoding: 'utf-8', shell: true });

        const output = result.stdout + result.stderr;
        assert.strictEqual(result.status, 0, 'Empty scan should exit with code 0');
        assert.ok(output.includes('Total Files: 0'), 'ALFRED should report 0 files found');
    });
});
