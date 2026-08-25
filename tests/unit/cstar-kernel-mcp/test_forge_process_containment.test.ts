import * as cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildForgeContainmentArguments,
    isolatedPythonArguments,
    spawnContainedForgeProcess,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_containment.js';
import { sealForgeAdapterRuntime } from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_runtime.js';

const roots: string[] = [];

function fixture() {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-containment-'));
    roots.push(root);
    const adapter = path.join(root, 'adapter.py');
    fs.writeFileSync(adapter, 'from pathlib import Path\nPath(__file__).with_suffix(".ran").write_text("ran")\n');
    fs.chmodSync(adapter, 0o600);
    const runtimeProof = sealForgeAdapterRuntime({ ref: 'synthetic-response-adapter', registered_script: adapter });
    return { root, adapter, runtimeProof };
}

function wait(milliseconds: number) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CStar Forge Bubblewrap containment', () => {
    it('builds an empty-root projection without whole-host visibility', () => {
        const item = fixture();
        const args = buildForgeContainmentArguments({
            runtimeProof: item.runtimeProof,
            command: '/usr/bin/true',
            commandArgs: [],
            cwd: item.root,
            environment: {},
            writablePaths: [item.root],
            timeoutMs: 5_000,
        });
        assert.equal(args.some((value, index) => (
            value === '--ro-bind' && args[index + 1] === '/' && args[index + 2] === '/'
        )), false);
        assert.equal(args.some((value, index) => (
            value === '--ro-bind' && args[index + 1] === '/usr' && args[index + 2] === '/usr'
        )), true);
    });

    it('cannot see an unprojected host file', () => {
        const item = fixture();
        const outside = fs.mkdtempSync(path.join('/tmp', 'cstar-containment-canary-'));
        roots.push(outside);
        const secret = path.join(outside, 'secret.txt');
        const observed = path.join(item.root, 'observed.txt');
        fs.writeFileSync(secret, 'host-secret');
        const probe = [
            'from pathlib import Path',
            `Path(${JSON.stringify(observed)}).write_text(str(Path(${JSON.stringify(secret)}).exists()))`,
        ].join(';');

        const result = spawnContainedForgeProcess({
            runtimeProof: item.runtimeProof,
            command: item.runtimeProof.python_interpreter.path,
            commandArgs: ['-I', '-S', '-B', '-c', probe],
            cwd: item.root,
            environment: { PYTHONDONTWRITEBYTECODE: '1' },
            writablePaths: [item.root],
            timeoutMs: 5_000,
        });

        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(observed, 'utf-8'), 'False');
        assert.equal(fs.readFileSync(secret, 'utf-8'), 'host-secret');
    });

    it('runs Python isolated from user-site pth startup code', () => {
        const item = fixture();
        const home = path.join(item.root, 'home');
        fs.mkdirSync(home);
        const probe = cp.spawnSync('/usr/bin/python3', ['-c', 'import site;print(site.getusersitepackages())'], {
            env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf-8',
        });
        assert.equal(probe.status, 0, probe.stderr);
        const userSite = probe.stdout.trim();
        fs.mkdirSync(userSite, { recursive: true });
        const canary = path.join(item.root, 'pth-executed');
        fs.writeFileSync(
            path.join(userSite, 'cstar_forge_canary.pth'),
            `import pathlib; pathlib.Path(${JSON.stringify(canary)}).write_text("executed")\n`,
        );

        const result = spawnContainedForgeProcess({
            runtimeProof: item.runtimeProof,
            command: item.runtimeProof.python_interpreter.path,
            commandArgs: isolatedPythonArguments(item.adapter, []),
            cwd: item.root,
            environment: { HOME: home, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' },
            writablePaths: [item.root],
            timeoutMs: 5_000,
        });

        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.existsSync(item.adapter.replace(/\.py$/, '.ran')), true);
        assert.equal(fs.existsSync(canary), false);
    });

    it('kills a detached descendant before a wrapper timeout returns', () => {
        const item = fixture();
        const started = path.join(item.root, 'started');
        const survived = path.join(item.root, 'survived');
        const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(survived)}, 'survived'), 700);setInterval(()=>{},1000)`;
        const parent = [
            'const fs=require("node:fs"),{spawn}=require("node:child_process")',
            `const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'})`,
            'child.unref()',
            `fs.writeFileSync(${JSON.stringify(started)},String(child.pid))`,
            'setInterval(()=>{},1000)',
        ].join(';');
        const result = spawnContainedForgeProcess({
            runtimeProof: item.runtimeProof,
            command: process.execPath,
            commandArgs: ['-e', parent],
            cwd: item.root,
            environment: {},
            readOnlyPaths: [process.execPath],
            writablePaths: [item.root],
            timeoutMs: 250,
        });

        assert.equal((result.error as NodeJS.ErrnoException | undefined)?.code, 'ETIMEDOUT');
        assert.equal(fs.existsSync(started), true);
        wait(900);
        assert.equal(fs.existsSync(survived), false);
    });

    it('tears down detached descendants when namespace PID 1 is killed', () => {
        const item = fixture();
        const started = path.join(item.root, 'pid1-started');
        const survived = path.join(item.root, 'pid1-survived');
        const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(survived)}, 'survived'), 500);setInterval(()=>{},1000)`;
        const parent = [
            'const fs=require("node:fs"),{spawn}=require("node:child_process")',
            `const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'})`,
            'child.unref()',
            `fs.writeFileSync(${JSON.stringify(started)},String(child.pid))`,
            'process.kill(process.pid,"SIGKILL")',
        ].join(';');
        const result = spawnContainedForgeProcess({
            runtimeProof: item.runtimeProof,
            command: process.execPath,
            commandArgs: ['-e', parent],
            cwd: item.root,
            environment: {},
            readOnlyPaths: [process.execPath],
            writablePaths: [item.root],
            timeoutMs: 5_000,
        });

        assert.equal(result.error, undefined);
        assert.equal(fs.existsSync(started), true);
        wait(700);
        assert.equal(fs.existsSync(survived), false);
    });
});
