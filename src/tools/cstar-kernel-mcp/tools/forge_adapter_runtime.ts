import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface ForgeAdapterRuntimeProof {
    path: string;
    sha256: string;
    bytes: number;
    mode: number;
    owner_uid: number;
    python_interpreter: ForgeRuntimeFileProof;
    node_interpreter: ForgeRuntimeFileProof | null;
    process_containment: ForgeRuntimeFileProof;
    dependencies: ForgeRuntimeFileProof[];
}

export interface ForgeRuntimeFileProof {
    role: string;
    path: string;
    sha256: string;
    bytes: number;
    mode: number;
    owner_uid: number;
}

function sealRuntimeFile(
    candidate: string,
    role: string,
    options: { allowRootOwner?: boolean; allowSymlinkAlias?: boolean; executable?: boolean } = {},
): ForgeRuntimeFileProof {
    if (!candidate || !path.isAbsolute(candidate)) throw new Error(`forge_runtime_path_unsealed:${role}`);
    const lexical = fs.lstatSync(candidate);
    if (lexical.isSymbolicLink() && !options.allowSymlinkAlias) {
        throw new Error(`forge_runtime_symlink_forbidden:${role}`);
    }
    const canonical = options.allowSymlinkAlias ? fs.realpathSync(candidate) : candidate;
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(canonical, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1) throw new Error(`forge_runtime_not_unique_regular_file:${role}`);
        const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
        const ownerAllowed = currentUid !== null
            && (stat.uid === currentUid || (options.allowRootOwner === true && stat.uid === 0));
        if (!ownerAllowed) throw new Error(`forge_runtime_owner_forbidden:${role}`);
        if ((stat.mode & 0o022) !== 0) throw new Error(`forge_runtime_group_or_world_writable:${role}`);
        if (options.executable && (stat.mode & 0o111) === 0) {
            throw new Error(`forge_runtime_not_executable:${role}`);
        }
        const content = fs.readFileSync(fd);
        return {
            role,
            path: canonical,
            sha256: createHash('sha256').update(content).digest('hex'),
            bytes: content.byteLength,
            mode: stat.mode & 0o777,
            owner_uid: stat.uid,
        };
    } finally {
        fs.closeSync(fd);
    }
}

function resolvePythonInterpreter(): string {
    const configured = process.env.CSTAR_FORGE_PYTHON_INTERPRETER?.trim();
    if (configured && !path.isAbsolute(configured)) {
        throw new Error('forge_python_interpreter_must_be_absolute');
    }
    return configured || '/usr/bin/python3';
}

export function sealForgeAdapterRuntime(selectedAdapter: Record<string, any>): ForgeAdapterRuntimeProof {
    if (process.platform !== 'linux') throw new Error('forge_containment_linux_required');
    const scriptPath = typeof selectedAdapter.registered_script === 'string'
        ? selectedAdapter.registered_script.trim()
        : '';
    if (!scriptPath || !path.isAbsolute(scriptPath)) throw new Error('forge_adapter_runtime_path_unsealed');
    const adapter = sealRuntimeFile(scriptPath, 'adapter', { executable: false });
    const pythonInterpreter = sealRuntimeFile(
        resolvePythonInterpreter(),
        'python_interpreter',
        { allowRootOwner: true, allowSymlinkAlias: true, executable: true },
    );
    const processContainment = sealRuntimeFile(
        '/usr/bin/bwrap',
        'bubblewrap',
        { allowRootOwner: true, executable: true },
    );
    const dependencies: ForgeRuntimeFileProof[] = [];
    let nodeInterpreter: ForgeRuntimeFileProof | null = null;
    if (selectedAdapter.ref === 'cstar-forge-hermes-minimax-worker-adapter') {
        nodeInterpreter = sealRuntimeFile(
            process.execPath,
            'node_interpreter',
            { allowRootOwner: true, allowSymlinkAlias: true, executable: true },
        );
        const adapterDir = path.dirname(adapter.path);
        const testOverride = Boolean(process.env.NODE_TEST_CONTEXT)
            && process.env.CSTAR_FORGE_TEST_MODE === '1';
        const delegateOverride = testOverride
            ? process.env.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT?.trim()
            : null;
        const dependencySpecs = [
            ['forge_worker_safety', path.join(adapterDir, 'forge_worker_safety.py')],
            ['forge_worker_evidence', path.join(adapterDir, 'forge_worker_evidence.py')],
            ['hermes_minimax_delegate', delegateOverride || path.join(adapterDir, 'hermes_minimax_delegate.mjs')],
            ['forge_delegate_evidence', path.join(adapterDir, 'forge_delegate_evidence.mjs')],
            ['forge_delegate_preflight', path.join(adapterDir, 'forge_delegate_preflight.mjs')],
            ['hermes_runtime_lineage', path.join(adapterDir, 'hermes_runtime_lineage.mjs')],
            ['forge_role_plan', path.join(adapterDir, 'forge_role_plan.mjs')],
        ] as const;
        for (const [role, dependencyPath] of dependencySpecs) {
            if (!fs.existsSync(dependencyPath) && testOverride) continue;
            dependencies.push(sealRuntimeFile(dependencyPath, role, {
                executable: role === 'hermes_minimax_delegate',
            }));
        }
        if (!testOverride && dependencies.length !== dependencySpecs.length) {
            throw new Error('forge_worker_runtime_dependency_set_incomplete');
        }
    }
    return {
        path: adapter.path,
        sha256: adapter.sha256,
        bytes: adapter.bytes,
        mode: adapter.mode,
        owner_uid: adapter.owner_uid,
        python_interpreter: pythonInterpreter,
        node_interpreter: nodeInterpreter,
        process_containment: processContainment,
        dependencies,
    };
}

export function runtimeProofEquals(left: ForgeAdapterRuntimeProof, right: ForgeAdapterRuntimeProof): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function readVerifiedRuntimeFile(proof: ForgeRuntimeFileProof): Buffer {
    const fd = fs.openSync(proof.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const stat = fs.fstatSync(fd);
        if (
            !stat.isFile()
            || stat.nlink !== 1
            || stat.uid !== proof.owner_uid
            || (stat.mode & 0o777) !== proof.mode
            || stat.size !== proof.bytes
        ) {
            throw new Error(`forge_runtime_metadata_drift:${proof.role}`);
        }
        const content = fs.readFileSync(fd);
        if (createHash('sha256').update(content).digest('hex') !== proof.sha256) {
            throw new Error(`forge_runtime_hash_drift:${proof.role}`);
        }
        return content;
    } finally {
        fs.closeSync(fd);
    }
}
