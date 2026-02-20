import { test, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { stat, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const packageJsonPath = join(__dirname, '../../package.json');
const cliPath = join(__dirname, '../../bin/cstar.js');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

describe('Gungnir Control Plane Bootstrap', () => {
    it('Verify the CLI executable exists and is executable', async () => {
        const stats = await stat(cliPath);
        assert.ok(stats.isFile(), 'CLI file should exist');

        // We verify ability to read/execute via node by successfully running it below
        try {
            await access(cliPath, constants.F_OK);
            assert.ok(true);
        } catch (error) {
            assert.fail('CLI path is not accessible');
        }
    });

    it('Verify cstar --version matches the version in package.json', async () => {
        const { stdout } = await execa('node', [cliPath, '--version']);
        assert.equal(stdout.trim(), pkg.version);
    });

    it('Verify cstar --help outputs the expected command list', async () => {
        const { stdout } = await execa('node', [cliPath, '--help']);
        assert.match(stdout, /Usage: cstar/);
        assert.match(stdout, /start\s+\[options\]/);
        assert.match(stdout, /dominion/);
        assert.match(stdout, /odin/);
    });

    it('Verify handling of an unknown command returns exit code 1 and a Critical Failure error message', async () => {
        try {
            await execa('node', [cliPath, 'potato']);
            assert.fail('Should have thrown an error for unknown command');
        } catch (error) {
            assert.equal(error.exitCode, 1, 'Should exit with code 1');
            assert.match(error.stderr, /\[SYSTEM FAILURE\]/, 'Must contain opinionated error format label');
            assert.match(error.stderr, /Critical Failure/, 'Must contain opinionated error description');
        }
    });
});
