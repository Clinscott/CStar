import { test, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { stat, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTsxLaunch } from '../../scripts/runtime-env.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../');
const packageJsonPath = join(PROJECT_ROOT, 'package.json');
const cliPath = join(PROJECT_ROOT, 'bin/cstar.js');
const shellWrapperPath = join(PROJECT_ROOT, 'cstar');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const entryPointPath = join(PROJECT_ROOT, 'cstar.ts');

function getLaunchArgs(...args: string[]) {
    return resolveTsxLaunch(PROJECT_ROOT, [entryPointPath, ...args]);
}

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
        const launch = getLaunchArgs('--version');
        const result = await execa(launch.command, launch.args, {
            cwd: PROJECT_ROOT,
            reject: false,
        });
        assert.equal(result.exitCode, 0);
        assert.equal(pkg.version, '1.0.0');
    });

    it('Verify cstar --help resolves through the local TypeScript bootstrap without failing', async () => {
        const launch = getLaunchArgs('--help');
        const result = await execa(launch.command, launch.args, {
            cwd: PROJECT_ROOT,
            reject: false,
        });
        assert.equal(result.exitCode, 0);
    });

    it('Verify the shell wrapper delegates through the local bin bootstrap instead of npx tsx', async () => {
        const wrapper = fs.readFileSync(shellWrapperPath, 'utf-8');
        assert.match(wrapper, /bin\/cstar\.js/);
        assert.doesNotMatch(wrapper, /npx\s+tsx/);
    });

    it('Verify the TypeScript bootstrap uses the local tsx loader through node instead of the tsx CLI binary', async () => {
        const launch = resolveTsxLaunch(PROJECT_ROOT, ['cstar.ts', '--version']);
        assert.equal(launch.command, process.execPath);
        assert.deepEqual(launch.args.slice(0, 2), ['--import', join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs')]);
        assert.doesNotMatch(launch.args.join(' '), /(?:^|\s)tsx(?:\.cmd)?(?:\s|$)/);
    });

    it('Verify handling of an unknown command returns exit code 1 and a Critical Failure error message', async () => {
        const launch = getLaunchArgs('potato');
        const result = await execa(launch.command, launch.args, {
            cwd: PROJECT_ROOT,
            reject: false,
        });
        assert.equal(result.exitCode, 1, 'Should exit with code 1');
    });

    it('anchors hall control-plane state to CStar when launched from an estate parent directory', async () => {
        const estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-estate-root-'));
        const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-control-root-'));
        fs.mkdirSync(path.join(controlRoot, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(controlRoot, '.stats'), { recursive: true });
        fs.copyFileSync(join(PROJECT_ROOT, '.agents', 'config.json'), join(controlRoot, '.agents', 'config.json'));

        const launch = getLaunchArgs('hall', 'host governor');
        const result = await execa(launch.command, launch.args, {
            cwd: estateRoot,
            reject: false,
            env: {
                ...process.env,
                CSTAR_CONTROL_ROOT: controlRoot,
            },
        });

        assert.equal(result.exitCode, 0);
        assert.equal(fs.existsSync(path.join(estateRoot, '.agents', 'sovereign_state.json')), false);
        assert.equal(fs.existsSync(path.join(controlRoot, '.agents', 'sovereign_state.json')), true);
    });
});
