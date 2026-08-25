import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BOOTSTRAP = [
    'import sys',
    'root=sys.argv.pop(1)',
    'cache=sys.argv.pop(1)',
    'sys.dont_write_bytecode=True',
    'sys.pycache_prefix=cache',
    'sys.path[:0]=[root]',
    'from hermes_cli.forge_entrypoint import main',
    'raise SystemExit(main())',
].join(';');
const SOURCE_FILES = [
    'hermes_cli/__init__.py',
    'hermes_cli/forge_mode.py',
    'hermes_cli/forge_minimax_oauth.py',
    'hermes_cli/forge_entrypoint.py',
];
const LOCK_FILES = ['pyproject.toml', 'uv.lock'];

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function groupIsExclusive(gid, uid) {
    const passwd = fs.readFileSync('/etc/passwd', 'utf-8').trim().split('\n')
        .map((line) => line.split(':')).filter((row) => Number(row[3]) === gid);
    if (passwd.length !== 1 || Number(passwd[0][2]) !== uid) return false;
    const group = fs.readFileSync('/etc/group', 'utf-8').trim().split('\n')
        .map((line) => line.split(':')).find((row) => Number(row[2]) === gid);
    return Boolean(group) && (!group[3]
        || group[3].split(',').filter(Boolean).every((name) => name === passwd[0][0]));
}

function safeFile(candidate, role, options = {}) {
    const lexical = fs.lstatSync(candidate);
    if (lexical.isSymbolicLink()) throw new Error(`forge_hermes_runtime_path_unsafe_${role}`);
    const fd = fs.openSync(candidate, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const stat = fs.fstatSync(fd);
        const uid = process.getuid?.();
        const namespaceRoot = options.allowNamespaceRoot === true && stat.uid === 65534;
        const exclusiveGroup = uid !== undefined && groupIsExclusive(stat.gid, uid);
        if (!stat.isFile() || stat.nlink !== 1
            || (uid !== undefined && stat.uid !== uid && stat.uid !== 0 && !namespaceRoot)
            || (stat.mode & 0o002) !== 0 || ((stat.mode & 0o020) !== 0 && !exclusiveGroup)) {
            throw new Error(`forge_hermes_runtime_path_unsafe_${role}`);
        }
        const bytes = fs.readFileSync(fd);
        return { path: candidate, bytes, sha256: digest(bytes), size: stat.size,
            uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777, dev: stat.dev, ino: stat.ino };
    } finally { fs.closeSync(fd); }
}

function safeRootedFile(root, relative, role) {
    const candidate = path.join(root, relative);
    if (fs.realpathSync(candidate) !== path.resolve(candidate)) {
        throw new Error(`forge_hermes_runtime_path_unsafe_${role}`);
    }
    return safeFile(candidate, role);
}

function stableRecord(root, proof) {
    const relative = path.relative(root, proof.path).split(path.sep).join('/');
    return `${relative}\0${proof.size}\0${proof.sha256}`;
}
function stableInstance(root, proof) {
    return `${stableRecord(root, proof)}\0${proof.uid}\0${proof.gid}\0${proof.mode}\0${proof.dev}\0${proof.ino}`;
}

function syntheticRuntime(locator) {
    const proof = safeFile(locator, 'synthetic');
    return {
        locator, command: locator, prefixArgs: [], executable_sha256: proof.sha256,
        runtime_content_sha256: proof.sha256,
        runtime_instance_sha256: digest(stableInstance(path.dirname(locator), proof)),
        python_sha256: null, source_file_count: 1, source_bytes: proof.size,
        bootstrap_mode: 'synthetic_test_executable_v1', runtime_root: path.dirname(locator),
        dependency_mode: 'synthetic_test_executable_v1', system_python_path: null,
    };
}

export function resolveHermesRuntime(locator, allowSynthetic = false) {
    const canonicalLocator = fs.realpathSync(locator);
    if (allowSynthetic) return syntheticRuntime(canonicalLocator);
    const binDirectory = path.dirname(canonicalLocator);
    const venv = path.dirname(binDirectory);
    const runtimeRoot = path.dirname(venv);
    if (path.basename(canonicalLocator) !== 'hermes' || path.basename(binDirectory) !== 'bin'
        || path.basename(venv) !== '.venv') throw new Error('forge_hermes_runtime_locator_invalid');
    const launcher = safeFile(canonicalLocator, 'launcher');
    const launcherText = launcher.bytes.toString('utf-8');
    if (!launcherText.includes('from hermes_cli.main import main')) {
        throw new Error('forge_hermes_runtime_launcher_invalid');
    }
    const pythonPath = fs.realpathSync('/usr/bin/python3');
    const python = safeFile(pythonPath, 'system_python', { allowNamespaceRoot: true });
    if ((python.mode & 0o111) === 0) throw new Error('forge_hermes_runtime_python_unsafe');
    const sourceProofs = SOURCE_FILES.map((relative) => safeRootedFile(runtimeRoot, relative, 'forge_source'));
    const lockProofs = LOCK_FILES.map((relative) => safeRootedFile(runtimeRoot, relative, 'lock'));
    const proofs = [launcher, python, ...lockProofs, ...sourceProofs];
    const runtime = {
        locator: canonicalLocator, command: python.path, prefixArgs: [],
        executable_sha256: launcher.sha256,
        runtime_content_sha256: digest(proofs.map((item) => stableRecord(runtimeRoot, item)).sort().join('\n')),
        runtime_instance_sha256: digest(proofs.map((item) => stableInstance(runtimeRoot, item)).sort().join('\n')),
        python_sha256: python.sha256, source_file_count: sourceProofs.length,
        source_bytes: sourceProofs.reduce((total, item) => total + item.size, 0),
        bootstrap_mode: 'python_system_stdlib_snapshot_v1', runtime_root: runtimeRoot,
        dependency_mode: 'stdlib_only_no_site_packages_v1', system_python_path: python.path,
    };
    Object.defineProperty(runtime, '_sourceProofs', { value: sourceProofs });
    return runtime;
}

function writeSnapshotFile(root, runtimeRoot, proof) {
    const relative = path.relative(runtimeRoot, proof.path);
    if (!SOURCE_FILES.includes(relative.split(path.sep).join('/'))
        || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('forge_hermes_runtime_snapshot_path_invalid');
    }
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT
        | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o400);
    try { fs.writeFileSync(fd, proof.bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const written = safeFile(destination, 'snapshot');
    if (written.size !== proof.size || written.sha256 !== proof.sha256) {
        throw new Error('forge_hermes_runtime_snapshot_drift');
    }
}

export function materializeHermesRuntime(runtime, parent) {
    if (runtime.bootstrap_mode === 'synthetic_test_executable_v1') return runtime;
    const root = fs.mkdtempSync(path.join(parent, 'hermes-forge-source-'));
    const cache = fs.mkdtempSync(path.join(parent, 'hermes-forge-pycache-'));
    fs.chmodSync(root, 0o700); fs.chmodSync(cache, 0o700);
    for (const proof of runtime._sourceProofs ?? []) writeSnapshotFile(root, runtime.runtime_root, proof);
    return { ...runtime, command: runtime.system_python_path,
        prefixArgs: ['-I', '-S', '-B', '-c', BOOTSTRAP, root, cache], launch_root: root };
}

export function assertHermesRuntimeMatches(expected, actual) {
    for (const key of [
        'executable_sha256', 'runtime_content_sha256', 'runtime_instance_sha256',
        'python_sha256', 'source_file_count', 'source_bytes', 'bootstrap_mode',
        'runtime_root', 'dependency_mode', 'system_python_path',
    ]) if (expected?.[key] !== actual[key]) throw new Error('forge_hermes_runtime_lineage_drift');
}
