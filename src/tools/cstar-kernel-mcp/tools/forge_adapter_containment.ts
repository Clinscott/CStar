import * as cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ForgeAdapterRuntimeProof } from './forge_adapter_runtime.js';

const ISOLATED_PYTHON_BOOTSTRAP = [
    'import os,runpy,sys',
    'script=sys.argv[1]',
    'sys.argv=sys.argv[1:]',
    'sys.path.insert(0,os.path.dirname(script))',
    'runpy.run_path(script,run_name="__main__")',
].join(';');

export interface ContainedForgeSpawn {
    runtimeProof: ForgeAdapterRuntimeProof;
    command: string;
    commandArgs: string[];
    cwd: string;
    environment: NodeJS.ProcessEnv;
    writablePaths: string[];
    timeoutMs: number;
    maxBuffer?: number;
    input?: string | Buffer;
}

function canonicalWritableDirectories(paths: string[]): string[] {
    const candidates = [...new Set(paths.map((item) => {
        try { return fs.realpathSync(item); }
        catch { throw new Error('forge_containment_writable_path_unavailable'); }
    }))]
        .sort((left, right) => left.length - right.length);
    const kept: string[] = [];
    for (const candidate of candidates) {
        const stat = fs.lstatSync(candidate);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new Error('forge_containment_writable_path_unsafe');
        }
        if (candidate === path.parse(candidate).root) {
            throw new Error('forge_containment_writable_root_forbidden');
        }
        if (!kept.some((root) => {
            const relative = path.relative(root, candidate);
            return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
        })) kept.push(candidate);
    }
    return kept;
}

function bubblewrapArguments(spec: ContainedForgeSpawn): string[] {
    if (process.platform !== 'linux') throw new Error('forge_containment_linux_required');
    const args = [
        '--die-with-parent', '--unshare-user', '--unshare-pid', '--as-pid-1',
        '--disable-userns', '--assert-userns-disabled', '--new-session', '--clearenv',
    ];
    for (const [name, value] of Object.entries(spec.environment).sort(([a], [b]) => a.localeCompare(b))) {
        if (value !== undefined) args.push('--setenv', name, value);
    }
    args.push('--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp');
    for (const directory of canonicalWritableDirectories(spec.writablePaths)) {
        args.push('--bind', directory, directory);
    }
    args.push('--chdir', fs.realpathSync(spec.cwd), '--cap-drop', 'ALL', '--', spec.command, ...spec.commandArgs);
    return args;
}

export function validateForgeContainmentSpec(spec: ContainedForgeSpawn): void {
    bubblewrapArguments(spec);
}

export function isolatedPythonArguments(script: string, args: string[]): string[] {
    return ['-I', '-S', '-B', '-c', ISOLATED_PYTHON_BOOTSTRAP, script, ...args];
}

export function spawnContainedForgeProcess(spec: ContainedForgeSpawn): cp.SpawnSyncReturns<string> {
    const containment = spec.runtimeProof.process_containment;
    if (!containment || containment.role !== 'bubblewrap') {
        throw new Error('forge_containment_runtime_missing');
    }
    return cp.spawnSync(containment.path, bubblewrapArguments(spec), {
        cwd: spec.cwd,
        env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
        encoding: 'utf-8',
        timeout: spec.timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: spec.maxBuffer ?? 16 * 1024 * 1024,
        input: spec.input,
    });
}

export function proveForgeContainment(
    runtimeProof: ForgeAdapterRuntimeProof,
    cwd: string,
): void {
    const result = spawnContainedForgeProcess({
        runtimeProof,
        command: '/usr/bin/true',
        commandArgs: [],
        cwd,
        environment: {},
        writablePaths: [cwd],
        timeoutMs: 5_000,
        maxBuffer: 1024,
    });
    if (result.error || result.status !== 0) throw new Error('forge_containment_preflight_failed');
}
