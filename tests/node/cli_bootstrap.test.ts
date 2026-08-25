import { after, before, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { stat, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStableTempEnv, resolveTsxLaunch } from '../../scripts/runtime-env.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../');
const packageJsonPath = join(PROJECT_ROOT, 'package.json');
const cliPath = join(PROJECT_ROOT, 'bin/cstar.js');
const shellWrapperPath = join(PROJECT_ROOT, 'cstar');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const entryPointPath = join(PROJECT_ROOT, 'cstar.ts');
let syntheticControlRoot = '';

before(() => {
    syntheticControlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-cli-bootstrap-'));
    fs.mkdirSync(path.join(syntheticControlRoot, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(syntheticControlRoot, 'package.json'), '{"name":"synthetic-cstar-cli"}');
    fs.writeFileSync(
        path.join(syntheticControlRoot, '.agents', 'config.json'),
        JSON.stringify({ system: { persona: 'synthetic-test-persona' } }),
    );
});

after(() => fs.rmSync(syntheticControlRoot, { recursive: true, force: true }));

function syntheticEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return { ...process.env, CSTAR_PROJECT_ROOT: syntheticControlRoot, ...overrides };
}

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
            env: syntheticEnv(),
        });
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout.trim(), pkg.version);
    });

    it('Verify cstar --help resolves through the local TypeScript bootstrap without failing', async () => {
        const launch = getLaunchArgs('--help');
        const result = await execa(launch.command, launch.args, {
            cwd: PROJECT_ROOT,
            reject: false,
            env: syntheticEnv(),
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

    it('does not preload a repository dotenv file before read-only CLI inspection', () => {
        const source = fs.readFileSync(cliPath, 'utf8');
        assert.doesNotMatch(source, /(?:from|import\s*\()\s*['"]dotenv['"]/);
        assert.doesNotMatch(source, /['"]\.env['"]/);
    });

    it('removes synthetic secret-bearing environment variables before launching the CLI child', async () => {
        const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-cli-env-probe-'));
        const probePath = path.join(probeRoot, 'probe.cjs');
        const evidencePath = path.join(probeRoot, 'evidence.jsonl');
        const secretCanary = 'synthetic-secret-canary';
        const tokenCanary = 'synthetic-token-canary';

        fs.writeFileSync(
            probePath,
            [
                "const fs = require('node:fs');",
                'const evidencePath = process.env.CSTAR_ENV_PROBE_PATH;',
                'if (evidencePath) {',
                '  fs.appendFileSync(evidencePath, JSON.stringify({',
                '    argv: process.argv,',
                '    secret: process.env.CSTAR_TEST_SECRET ?? null,',
                '    token: process.env.CSTAR_TEST_TOKEN ?? null,',
                "  }) + '\\n');",
                '}',
            ].join('\n'),
        );

        try {
            const result = await execa(process.execPath, [cliPath, '--version'], {
                cwd: PROJECT_ROOT,
                reject: false,
                env: syntheticEnv({
                    CSTAR_ENV_PROBE_PATH: evidencePath,
                    CSTAR_TEST_SECRET: secretCanary,
                    CSTAR_TEST_TOKEN: tokenCanary,
                    NODE_OPTIONS: `--require=${probePath}`,
                }),
            });
            assert.equal(result.exitCode, 0);
            assert.equal(result.stdout.trim(), pkg.version);

            const records = fs.readFileSync(evidencePath, 'utf8')
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line) as {
                    argv: string[];
                    secret: string | null;
                    token: string | null;
                });
            const parentRecord = records.find((record) => record.argv.includes(cliPath));
            const childRecord = records.find((record) => record.argv.includes(entryPointPath));
            assert.ok(parentRecord, 'the synthetic preload must observe the wrapper process');
            assert.equal(parentRecord.secret, secretCanary);
            assert.equal(parentRecord.token, tokenCanary);
            assert.ok(childRecord, 'the synthetic preload must observe the CLI child process');
            assert.equal(childRecord.secret, null);
            assert.equal(childRecord.token, null);
        } finally {
            fs.rmSync(probeRoot, { recursive: true, force: true });
        }
    });

    it('contains inherited Windows temp paths before launching WSL test processes', () => {
        if (process.platform === 'win32') {
            return;
        }

        const fromWindowsEnv = buildStableTempEnv({
            TEMP: 'C:\\Users\\operator\\AppData\\Local\\Temp',
            TMP: '/mnt/c/Users/operator/AppData/Local/Temp',
        });
        assert.equal(fromWindowsEnv.TMPDIR, '/tmp');
        assert.equal(fromWindowsEnv.TEMP, '/tmp');
        assert.equal(fromWindowsEnv.TMP, '/tmp');

        const fromInteropTmpdir = buildStableTempEnv({
            TMPDIR: '/mnt/c/Users/operator/AppData/Local/Temp',
        });
        assert.equal(fromInteropTmpdir.TMPDIR, '/tmp');

        const nativeTmpdir = buildStableTempEnv({ TMPDIR: '/home/operator/tmp' });
        assert.equal(nativeTmpdir.TMPDIR, '/home/operator/tmp');
        assert.equal(nativeTmpdir.TEMP, '/home/operator/tmp');
        assert.equal(nativeTmpdir.TMP, '/home/operator/tmp');
    });

    it('Verify handling of an unknown command returns exit code 1 and a Critical Failure error message', async () => {
        const launch = getLaunchArgs('potato');
        const result = await execa(launch.command, launch.args, {
            cwd: PROJECT_ROOT,
            reject: false,
            env: syntheticEnv(),
        });
        assert.equal(result.exitCode, 1, 'Should exit with code 1');
    });

    it('anchors the slim read-only CLI to the CStar kernel root without materializing parent state', async () => {
        const estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-estate-root-'));
        const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-control-root-'));
        fs.mkdirSync(path.join(controlRoot, '.agents'), { recursive: true });

        const launch = getLaunchArgs('status', '--json');
        const result = await execa(launch.command, launch.args, {
            cwd: estateRoot,
            reject: false,
            env: syntheticEnv({
                CSTAR_CONTROL_ROOT: controlRoot,
            }),
        });

        assert.equal(result.exitCode, 0);
        const payload = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))) as {
            workspace: string;
            runtime_adapter_ids: string[];
            lifecycle_authority: string;
        };
        assert.equal(path.resolve(payload.workspace), path.resolve(PROJECT_ROOT));
        assert.deepEqual(payload.runtime_adapter_ids, []);
        assert.equal(payload.lifecycle_authority, 'cstar-kernel-mcp');
        assert.equal(fs.existsSync(path.join(estateRoot, '.agents', 'sovereign_state.json')), false);
        assert.equal(fs.existsSync(path.join(controlRoot, '.agents', 'sovereign_state.json')), false);

        fs.rmSync(estateRoot, { recursive: true, force: true });
        fs.rmSync(controlRoot, { recursive: true, force: true });
    });
});
