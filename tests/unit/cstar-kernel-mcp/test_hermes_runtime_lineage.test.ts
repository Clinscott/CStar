import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const roots: string[] = [];
const HELPER = path.resolve('.agents/skills/corvus-forge/scripts/hermes_runtime_lineage.mjs');

function fixture() {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'hermes-lineage-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'hermes_cli'), { recursive: true });
    fs.writeFileSync(path.join(root, 'hermes_cli', '__init__.py'), '__version__ = "test"\n');
    fs.writeFileSync(path.join(root, 'hermes_cli', 'forge_mode.py'), [
        'def forge_ephemeral_mode(): return True',
        'def consume_forge_provider_request(): return None',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(root, 'hermes_cli', 'forge_minimax_oauth.py'), [
        'def oauth_status():',
        '    return {"status": "ready"}',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(root, 'hermes_cli', 'forge_entrypoint.py'), [
        'import importlib.util, os, sys',
        'def main():',
        '    canary = os.environ.get("CSTAR_LINEAGE_IMPORT_CANARY")',
        '    if canary and importlib.util.find_spec("dependency_canary"):',
        '        open(canary, "w").write("site-imported")',
        '    print("forge-entrypoint-ok")',
        '    return 0',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname="synthetic-hermes"\n');
    fs.writeFileSync(path.join(root, 'uv.lock'), 'version = 1\n');
    const bin = path.join(root, '.venv', 'bin');
    const site = path.join(root, '.venv', 'lib', 'python3.11', 'site-packages');
    fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(site, { recursive: true });
    fs.writeFileSync(path.join(site, 'dependency_canary.py'), 'raise RuntimeError("site imported")\n');
    fs.writeFileSync(path.join(site, 'canary.pth'), 'raise RuntimeError("pth imported")\n');
    const launcher = path.join(bin, 'hermes');
    fs.writeFileSync(launcher, '#!/synthetic/python\nfrom hermes_cli.main import main\n');
    fs.chmodSync(launcher, 0o700);
    return { root, launcher };
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Hermes Forge runtime lineage', () => {
    it('binds only the reviewed stdlib entrypoint closure and launches its exact snapshot bytes', async () => {
        const runtime = fixture();
        const helper: any = await import(pathToFileURL(HELPER).href);
        const first = helper.resolveHermesRuntime(runtime.launcher, false);
        assert.equal(first.bootstrap_mode, 'python_system_stdlib_snapshot_v1');
        assert.equal(first.dependency_mode, 'stdlib_only_no_site_packages_v1');
        assert.equal(first.source_file_count, 4);
        assert.match(first.runtime_content_sha256, /^[a-f0-9]{64}$/);
        assert.match(first.runtime_instance_sha256, /^[a-f0-9]{64}$/);
        assert.equal(first.system_python_path, fs.realpathSync('/usr/bin/python3'));

        const materialRoot = fs.mkdtempSync(path.join('/tmp', 'hermes-lineage-material-'));
        roots.push(materialRoot);
        const launch = helper.materializeHermesRuntime(first, materialRoot);
        const canary = path.join(runtime.root, 'site-canary');
        const result = spawnSync(launch.command, [...launch.prefixArgs, '--version'], {
            encoding: 'utf-8', env: { ...process.env, CSTAR_LINEAGE_IMPORT_CANARY: canary },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'forge-entrypoint-ok\n');
        assert.equal(fs.existsSync(canary), false);

        fs.appendFileSync(path.join(runtime.root, 'hermes_cli', 'forge_entrypoint.py'), 'DRIFT = True\n');
        const drifted = helper.resolveHermesRuntime(runtime.launcher, false);
        assert.notEqual(drifted.runtime_content_sha256, first.runtime_content_sha256);
        assert.throws(() => helper.assertHermesRuntimeMatches(first, drifted),
            /forge_hermes_runtime_lineage_drift/);
    });

    it('rejects source links and ignores malicious original-tree bytecode', async () => {
        const runtime = fixture();
        const helper: any = await import(pathToFileURL(HELPER).href);
        const first = helper.resolveHermesRuntime(runtime.launcher, false);
        const pycache = path.join(runtime.root, 'hermes_cli', '__pycache__');
        fs.mkdirSync(pycache);
        fs.writeFileSync(path.join(pycache, 'forge_entrypoint.cpython-312.pyc'), 'MALICIOUS_PYC_CANARY');
        const materialRoot = fs.mkdtempSync(path.join('/tmp', 'hermes-lineage-pyc-'));
        roots.push(materialRoot);
        const launch = helper.materializeHermesRuntime(first, materialRoot);
        const result = spawnSync(launch.command, [...launch.prefixArgs, '--version'], { encoding: 'utf-8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'forge-entrypoint-ok\n');

        const source = path.join(runtime.root, 'hermes_cli', 'forge_mode.py');
        fs.renameSync(source, `${source}.real`); fs.symlinkSync(`${source}.real`, source);
        assert.throws(() => helper.resolveHermesRuntime(runtime.launcher, false),
            /forge_hermes_runtime_path_unsafe_forge_source/);
    });
});
