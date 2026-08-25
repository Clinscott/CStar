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
    readOnlyPaths?: string[];
    writablePaths: string[];
    timeoutMs: number;
    maxBuffer?: number;
    input?: string | Buffer;
}

type ContainmentMount = { source: string; destination: string };

function ensureMountParents(args: string[], destination: string): void {
    const parent = path.dirname(destination);
    const root = path.parse(parent).root;
    let current = root;
    for (const segment of parent.slice(root.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        args.push('--dir', current);
    }
}

function appendMount(
    args: string[],
    source: string,
    destination: string,
    writable: boolean,
): void {
    ensureMountParents(args, destination);
    args.push(writable ? '--bind' : '--ro-bind', source, destination);
}

function canonicalReadOnlyMounts(paths: string[]): ContainmentMount[] {
    const seen = new Set<string>();
    const mounts: ContainmentMount[] = [];
    for (const candidate of paths) {
        if (!candidate || !path.isAbsolute(candidate)) {
            throw new Error('forge_containment_readonly_path_invalid');
        }
        const canonical = fs.realpathSync(candidate);
        const stat = fs.lstatSync(canonical);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
            throw new Error('forge_containment_readonly_path_unsafe');
        }
        if (canonical === path.parse(canonical).root) {
            throw new Error('forge_containment_readonly_root_forbidden');
        }
        if (!seen.has(canonical)) {
            seen.add(canonical);
            mounts.push({ source: canonical, destination: canonical });
        }
    }
    return mounts.sort((left, right) => left.destination.localeCompare(right.destination));
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

function appendSystemRuntime(args: string[]): void {
    args.push('--ro-bind', '/usr', '/usr');
    for (const [target, source] of [
        ['/bin', 'usr/bin'], ['/sbin', 'usr/sbin'],
        ['/lib', 'usr/lib'], ['/lib64', 'usr/lib64'],
    ]) args.push('--symlink', source, target);
    args.push('--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp');
    const systemFiles = [
        '/etc/passwd', '/etc/group', '/etc/nsswitch.conf', '/etc/hosts',
        '/etc/resolv.conf', '/etc/gai.conf', '/etc/ld.so.cache',
        '/etc/localtime', '/etc/timezone', '/etc/ca-certificates.conf', '/etc/ssl',
    ];
    for (const destination of systemFiles) {
        if (!fs.existsSync(destination)) continue;
        appendMount(args, fs.realpathSync(destination), destination, false);
    }
}

export function buildForgeContainmentArguments(spec: ContainedForgeSpawn): string[] {
    if (process.platform !== 'linux') throw new Error('forge_containment_linux_required');
    const args = [
        '--die-with-parent', '--unshare-user', '--unshare-pid', '--as-pid-1',
        '--unshare-ipc', '--unshare-uts', '--hostname', 'cstar-forge',
        '--disable-userns', '--assert-userns-disabled', '--new-session', '--clearenv',
    ];
    for (const [name, value] of Object.entries(spec.environment).sort(([a], [b]) => a.localeCompare(b))) {
        if (value !== undefined) args.push('--setenv', name, value);
    }
    appendSystemRuntime(args);
    for (const directory of canonicalWritableDirectories(spec.writablePaths)) {
        appendMount(args, directory, directory, true);
    }
    for (const mount of canonicalReadOnlyMounts(spec.readOnlyPaths ?? [])) {
        appendMount(args, mount.source, mount.destination, false);
    }
    args.push('--chdir', fs.realpathSync(spec.cwd), '--cap-drop', 'ALL', '--', spec.command, ...spec.commandArgs);
    return args;
}

export function validateForgeContainmentSpec(spec: ContainedForgeSpawn): void {
    buildForgeContainmentArguments(spec);
}

export function isolatedPythonArguments(script: string, args: string[]): string[] {
    return ['-I', '-S', '-B', '-c', ISOLATED_PYTHON_BOOTSTRAP, script, ...args];
}

export function forgeRuntimeReadOnlyPaths(
    runtimeProof: ForgeAdapterRuntimeProof,
    environment: NodeJS.ProcessEnv,
): string[] {
    const paths: string[] = [];
    if (runtimeProof.node_interpreter && !runtimeProof.node_interpreter.path.startsWith('/usr/')) {
        paths.push(runtimeProof.node_interpreter.path);
    }
    const testMode = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
    const locator = environment.CSTAR_FORGE_HERMES_LOCATOR?.trim();
    if (locator && path.isAbsolute(locator) && fs.existsSync(locator)) {
        const runtimeRoot = path.dirname(path.dirname(locator));
        paths.push(fs.existsSync(path.join(runtimeRoot, 'manifest.json')) ? runtimeRoot : locator);
    }
    if (!testMode) {
        const hermesHome = environment.HERMES_HOME?.trim();
        const profileAuthStore = hermesHome && path.isAbsolute(hermesHome)
            ? path.join(hermesHome, 'auth.json') : null;
        if (profileAuthStore && fs.existsSync(profileAuthStore)) paths.push(profileAuthStore);

        // Hermes resolves credentials per provider: a profile-local entry
        // shadows the global store, while a missing profile entry falls back
        // to ~/.hermes/auth.json. Project only those two files so the sealed
        // runtime can preserve that contract without exposing either parent
        // directory or unrelated host files.
        const home = environment.HOME?.trim();
        if (home && path.isAbsolute(home) && hermesHome && path.isAbsolute(hermesHome)) {
            const globalHermesHome = path.join(path.resolve(home), '.hermes');
            const expectedProfileHome = path.join(globalHermesHome, 'profiles', 'cstar-hub');
            if (path.resolve(hermesHome) === expectedProfileHome) {
                const globalAuthStore = path.join(globalHermesHome, 'auth.json');
                if (fs.existsSync(globalAuthStore)) paths.push(globalAuthStore);
            }
        }
    }
    if (testMode) {
        for (const key of [
            'HERMES_BIN',
            'CSTAR_FORGE_WORKER_MODEL_RESPONSE',
            'CSTAR_FORGE_HERMES_DELEGATE_SCRIPT',
        ]) {
            const candidate = environment[key]?.trim();
            if (candidate && path.isAbsolute(candidate) && fs.existsSync(candidate)) paths.push(candidate);
        }
    }
    return [...new Set(paths.map((candidate) => fs.realpathSync(candidate)))].sort();
}

export function spawnContainedForgeProcess(spec: ContainedForgeSpawn): cp.SpawnSyncReturns<string> {
    const containment = spec.runtimeProof.process_containment;
    if (!containment || containment.role !== 'bubblewrap') {
        throw new Error('forge_containment_runtime_missing');
    }
    return cp.spawnSync(containment.path, buildForgeContainmentArguments(spec), {
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
