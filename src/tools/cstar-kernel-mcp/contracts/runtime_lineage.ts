import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    type NativeArtifactProof,
    verifyRequiredNativeArtifacts,
} from './runtime_native_artifacts.js';

type JsonRecord = Record<string, unknown>;

export interface RuntimeFileProof {
    path: string;
    sha256: string;
    bytes: number;
}

export interface RuntimeDependencyProof {
    package_metadata: 'verified_lock_root_match' | 'partial';
    installed_inventory: 'verified_lock_match' | 'partial';
    package_json_sha256: string | null;
    package_lock_sha256: string | null;
    installed_lock_sha256: string | null;
    expected_packages: number;
    installed_packages: number;
    omitted_incompatible_optional_packages: number;
    mismatch_count: number;
    mismatch_reasons: string[];
    native_artifact_proof: NativeArtifactProof;
}

export interface RuntimeForgeProof {
    contract: 'verified_manifest_content' | 'partial';
    manifest_sha256: string | null;
    launcher_sha256: string | null;
    source_files: RuntimeFileProof[];
    content_sha256: string | null;
    mismatch_reasons: string[];
}

export interface KernelRuntimeLineage {
    schema: 'cstar.kernel_runtime_lineage.v2';
    binding_mode: 'live_launcher' | 'library_default';
    separated: boolean;
    code_root: string;
    control_root: string;
    code_root_sha256: string;
    control_root_sha256: string;
    launcher_sha256: string | null;
    kernel_entry_sha256: string | null;
    package_json_sha256: string | null;
    package_lock_sha256: string | null;
    installed_package_lock_sha256: string | null;
    node_modules_root: string;
    node_modules_realpath: string | null;
    node_modules_symlinked: boolean;
    dependency_lineage: 'verified_lock_match' | 'partial';
    dependency_proof: RuntimeDependencyProof;
    forge_runtime_root: string;
    forge_runtime_manifest_sha256: string | null;
    forge_runtime_launcher_sha256: string | null;
    forge_runtime_manifest_present: boolean;
    forge_runtime_content_sha256: string | null;
    forge_runtime_proof: RuntimeForgeProof;
    test_only_bypass: boolean;
    binding_sha256: string;
}

export interface KernelForgeReadiness {
    ready: boolean;
    failures: string[];
}

const FORGE_RUNTIME_SOURCE_FILES = [
    'hermes_cli/__init__.py',
    'hermes_cli/forge_mode.py',
    'hermes_cli/forge_minimax_oauth.py',
    'hermes_cli/forge_provider_journal.py',
    'hermes_cli/forge_entrypoint.py',
] as const;

const FORGE_RUNTIME_MANIFEST_KEYS = [
    'allow_arbitrary_source_root', 'bootstrap_mode', 'credential_profile',
    'credential_profile_owner', 'dependency_mode', 'launcher', 'model',
    'network_entrypoint', 'oauth_read_only', 'oauth_refresh_allowed',
    'oauth_store_write_allowed', 'provider', 'runtime_owner', 'schema', 'source_files',
].sort();

function sha256(value: Buffer | string): string {
    return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function readJson(candidate: string): { proof: RuntimeFileProof; value: JsonRecord } | null {
    const proof = hashRuntimeFile(candidate);
    if (!proof) return null;
    const value = asRecord(JSON.parse(fs.readFileSync(candidate, 'utf8')) as unknown);
    if (!value) throw new Error(`kernel_runtime_lineage_json_invalid:${candidate}`);
    return { proof, value };
}

function hashRuntimeFile(candidate: string): RuntimeFileProof | null {
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (!stat) return null;
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
        throw new Error(`kernel_runtime_lineage_file_unsafe:${candidate}`);
    }
    const content = fs.readFileSync(candidate);
    return { path: candidate, sha256: sha256(content), bytes: content.byteLength };
}

function rootIdentity(root: string): { path: string; sha256: string } {
    const stat = fs.lstatSync(root);
    const identity = [root, stat.dev, stat.ino, stat.uid, stat.mode & 0o777].join('\0');
    return { path: root, sha256: sha256(identity) };
}

function stableValue(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
    const record = asRecord(value);
    if (!record) return JSON.stringify(value);
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(',')}}`;
}

function normalizePackageBin(value: unknown): unknown {
    const normalize = (candidate: string): string => candidate.replace(/^\.\//, '');
    if (typeof value === 'string') return normalize(value);
    const record = asRecord(value);
    if (!record) return value ?? null;
    return Object.fromEntries(Object.entries(record).map(([key, candidate]) => [
        key,
        typeof candidate === 'string' ? normalize(candidate) : candidate,
    ]));
}

function packageRootContract(value: JsonRecord, sourceManifest: boolean): JsonRecord {
    const scripts = asRecord(value.scripts);
    const hasInstallScript = sourceManifest
        ? Boolean(scripts && ['preinstall', 'install', 'postinstall'].some((key) => typeof scripts[key] === 'string'))
        : value.hasInstallScript === true;
    return {
        ...Object.fromEntries([
            'name', 'version', 'bin', 'engines', 'os', 'cpu',
            'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
        ].map((key) => [
            key,
            key === 'bin' ? normalizePackageBin(value[key]) : value[key] ?? null,
        ])),
        hasInstallScript,
    };
}

function listField(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function detectLinuxLibc(): 'glibc' | 'musl' | null {
    if (process.platform !== 'linux') return null;
    const reportApi = process.report as typeof process.report & { excludeNetwork?: boolean };
    const originalExcludeNetwork = reportApi.excludeNetwork;
    try {
        reportApi.excludeNetwork = true;
        const report = process.report?.getReport() as {
            header?: unknown;
            sharedObjects?: unknown;
        };
        const header = asRecord(report.header);
        if (typeof header?.glibcVersionRuntime === 'string'
            && header.glibcVersionRuntime.trim() !== '') return 'glibc';
        const sharedObjects = listField(report.sharedObjects);
        return sharedObjects.some((candidate) => (
            candidate.includes('libc.musl-') || candidate.includes('ld-musl-')
        )) ? 'musl' : null;
    } catch {
        return null;
    } finally {
        reportApi.excludeNetwork = originalExcludeNetwork;
    }
}

const CURRENT_LINUX_LIBC = detectLinuxLibc();

export function platformAllows(entry: JsonRecord, runtime = {
    platform: process.platform,
    arch: process.arch,
    libc: CURRENT_LINUX_LIBC,
}): boolean {
    const allows = (rules: string[], current: string): boolean => {
        if (rules.length === 1 && rules[0] === 'any') return true;
        const positive = rules.filter((rule) => !rule.startsWith('!'));
        if (rules.includes(`!${current}`)) return false;
        return positive.length === 0 || positive.includes(current);
    };
    const libcRules = listField(entry.libc);
    const libcAllowed = libcRules.length === 0
        || (runtime.libc ? allows(libcRules, runtime.libc) : true);
    return allows(listField(entry.os), runtime.platform)
        && allows(listField(entry.cpu), runtime.arch)
        && libcAllowed;
}

function compareInstalledEntry(expected: JsonRecord, installed: JsonRecord): boolean {
    return stableValue(expected) === stableValue(installed);
}

function safeInstalledPackagePath(nodeModulesRoot: string, lockKey: string): string | null {
    const segments = lockKey.split('/');
    if (segments.shift() !== 'node_modules'
        || segments.length === 0
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
    const canonicalRoot = fs.realpathSync(nodeModulesRoot);
    let candidate = nodeModulesRoot;
    for (const segment of segments) {
        candidate = path.join(candidate, segment);
        const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
        if (!stat?.isDirectory() || stat.isSymbolicLink()) return null;
    }
    const canonicalCandidate = fs.realpathSync(candidate);
    const relative = path.relative(canonicalRoot, canonicalCandidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
        || canonicalCandidate !== path.resolve(candidate)) return null;
    return canonicalCandidate;
}

function buildDependencyProof(codeRoot: string): {
    proof: RuntimeDependencyProof;
    dependencyLineage: 'verified_lock_match' | 'partial';
    nodeModulesRealpath: string | null;
    nodeModulesSymlinked: boolean;
} {
    const packageJson = readJson(path.join(codeRoot, 'package.json'));
    const packageLock = readJson(path.join(codeRoot, 'package-lock.json'));
    const nodeModulesRoot = path.join(codeRoot, 'node_modules');
    const nodeModulesStat = fs.lstatSync(nodeModulesRoot, { throwIfNoEntry: false });
    const nodeModulesSymlinked = nodeModulesStat?.isSymbolicLink() ?? false;
    let nodeModulesRealpath: string | null = null;
    if (nodeModulesStat) {
        try { nodeModulesRealpath = fs.realpathSync(nodeModulesRoot); } catch { /* Report below. */ }
    }
    const installedLock = !nodeModulesSymlinked && nodeModulesStat?.isDirectory()
        ? readJson(path.join(nodeModulesRoot, '.package-lock.json'))
        : null;
    const reasons: string[] = [];
    const lockRoot = asRecord(asRecord(packageLock?.value.packages)?.['']);
    const metadataMatches = Boolean(packageJson && lockRoot
        && stableValue(packageRootContract(packageJson.value, true))
            === stableValue(packageRootContract(lockRoot, false)));
    if (!metadataMatches) reasons.push('package_metadata_lock_root_mismatch');
    if (packageLock && (
        packageLock.value.lockfileVersion !== 3
        || packageLock.value.name !== packageJson?.value.name
        || packageLock.value.version !== packageJson?.value.version
    )) reasons.push('package_lock_top_metadata_mismatch');
    if (!nodeModulesStat?.isDirectory()) reasons.push('node_modules_missing');
    if (nodeModulesSymlinked) reasons.push('node_modules_symlinked');
    if (nodeModulesStat && !nodeModulesRealpath) reasons.push('node_modules_realpath_unavailable');
    if (nodeModulesRealpath && nodeModulesRealpath !== path.resolve(nodeModulesRoot)) {
        reasons.push('node_modules_realpath_mismatch');
    }
    if (!installedLock) reasons.push('installed_package_lock_missing');
    if (installedLock && (
        installedLock.value.lockfileVersion !== 3
        || installedLock.value.name !== packageJson?.value.name
        || installedLock.value.version !== packageJson?.value.version
    )) reasons.push('installed_package_lock_top_metadata_mismatch');

    const expectedPackages = asRecord(packageLock?.value.packages) ?? {};
    const installedPackages = asRecord(installedLock?.value.packages) ?? {};
    let omittedOptional = 0;
    for (const [lockKey, rawExpected] of Object.entries(expectedPackages)) {
        if (!lockKey) continue;
        const expected = asRecord(rawExpected);
        const installed = asRecord(installedPackages[lockKey]);
        if (!expected) {
            reasons.push('package_lock_entry_invalid');
            continue;
        }
        if (!installed) {
            if (expected.optional === true && !platformAllows(expected)) {
                omittedOptional += 1;
                continue;
            }
            reasons.push('installed_package_missing');
            continue;
        }
        if (!compareInstalledEntry(expected, installed)) {
            reasons.push('installed_package_lock_mismatch');
            continue;
        }
        const packagePath = safeInstalledPackagePath(nodeModulesRoot, lockKey);
        const packageStat = packagePath ? fs.lstatSync(packagePath, { throwIfNoEntry: false }) : null;
        if (!packagePath || !packageStat?.isDirectory() || packageStat.isSymbolicLink()) {
            reasons.push('installed_package_path_unsafe');
            continue;
        }
        const installedPackageJson = readJson(path.join(packagePath, 'package.json'));
        if (!installedPackageJson || installedPackageJson.value.version !== expected.version) {
            reasons.push('installed_package_version_mismatch');
        }
    }
    for (const lockKey of Object.keys(installedPackages)) {
        if (!asRecord(expectedPackages[lockKey])) reasons.push('installed_package_unexpected');
    }
    const inventoryReasons = [...new Set(reasons)].sort();
    const nativeArtifactProof = verifyRequiredNativeArtifacts({
        nodeModulesRoot,
        sourceManifest: packageJson?.value ?? {},
        expectedPackages,
        installedPackages,
    });
    const uniqueReasons = [...new Set([
        ...inventoryReasons,
        ...nativeArtifactProof.mismatch_reasons,
    ])].sort();
    const installedInventory = inventoryReasons.length === 0
        ? 'verified_lock_match' as const
        : 'partial' as const;
    const dependencyLineage = installedInventory === 'verified_lock_match'
        && nativeArtifactProof.contract === 'verified_required_native_artifacts'
        ? 'verified_lock_match' as const
        : 'partial' as const;
    return {
        proof: {
            package_metadata: metadataMatches ? 'verified_lock_root_match' : 'partial',
            installed_inventory: installedInventory,
            package_json_sha256: packageJson?.proof.sha256 ?? null,
            package_lock_sha256: packageLock?.proof.sha256 ?? null,
            installed_lock_sha256: installedLock?.proof.sha256 ?? null,
            expected_packages: Math.max(0, Object.keys(expectedPackages).length - 1),
            installed_packages: Object.keys(installedPackages).length,
            omitted_incompatible_optional_packages: omittedOptional,
            mismatch_count: reasons.length + nativeArtifactProof.mismatch_reasons.length,
            mismatch_reasons: uniqueReasons.slice(0, 64),
            native_artifact_proof: nativeArtifactProof,
        },
        dependencyLineage,
        nodeModulesRealpath,
        nodeModulesSymlinked,
    };
}

function resolveRuntimeFile(runtimeRoot: string, relativePath: string): string | null {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) return null;
    const candidate = path.resolve(runtimeRoot, relativePath);
    const relative = path.relative(runtimeRoot, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    let current = runtimeRoot;
    for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!stat || stat.isSymbolicLink()) return null;
    }
    return candidate;
}

function buildForgeRuntimeProof(codeRoot: string): RuntimeForgeProof {
    const runtimeRoot = path.join(codeRoot, '.agents', 'skills', 'corvus-forge', 'runtime');
    const reasons: string[] = [];
    const runtimeStat = fs.lstatSync(runtimeRoot, { throwIfNoEntry: false });
    if (!runtimeStat?.isDirectory() || runtimeStat.isSymbolicLink()) reasons.push('forge_runtime_root_unsafe');
    const manifest = runtimeStat?.isDirectory() ? readJson(path.join(runtimeRoot, 'manifest.json')) : null;
    if (!manifest) reasons.push('forge_runtime_manifest_missing');
    const expectedSources = [...FORGE_RUNTIME_SOURCE_FILES];
    const rawSources = manifest?.value.source_files;
    const manifestContractMatches = Boolean(manifest
        && stableValue(Object.keys(manifest.value).sort()) === stableValue(FORGE_RUNTIME_MANIFEST_KEYS)
        && manifest.value.schema === 'cstar.forge_private_runtime_manifest.v2'
        && manifest.value.runtime_owner === 'cstar'
        && manifest.value.credential_profile_owner === 'hermes'
        && manifest.value.credential_profile === 'cstar-hub'
        && manifest.value.provider === 'minimax-oauth'
        && manifest.value.model === 'MiniMax-M3'
        && manifest.value.launcher === 'bin/hermes'
        && manifest.value.bootstrap_mode === 'cstar_owned_python_system_stdlib_snapshot_v2'
        && manifest.value.dependency_mode === 'stdlib_only_no_site_packages_v2'
        && manifest.value.network_entrypoint === 'hermes_cli.forge_entrypoint'
        && manifest.value.allow_arbitrary_source_root === false
        && manifest.value.oauth_read_only === true
        && manifest.value.oauth_refresh_allowed === false
        && manifest.value.oauth_store_write_allowed === false
        && Array.isArray(rawSources)
        && rawSources.every((item) => typeof item === 'string')
        && stableValue(rawSources) === stableValue(expectedSources));
    if (!manifestContractMatches) reasons.push('forge_runtime_manifest_contract_invalid');
    const requestedFiles = ['bin/hermes', ...expectedSources];
    const proofs: RuntimeFileProof[] = [];
    for (const relativePath of requestedFiles) {
        const candidate = resolveRuntimeFile(runtimeRoot, relativePath);
        const proof = candidate ? hashRuntimeFile(candidate) : null;
        if (proof) proofs.push({ ...proof, path: relativePath });
        else reasons.push(`forge_runtime_file_missing_or_unsafe:${relativePath}`);
    }
    const launcherPath = resolveRuntimeFile(runtimeRoot, 'bin/hermes');
    const launcherProof = proofs.find((proof) => proof.path === 'bin/hermes');
    if (!launcherProof || !launcherPath
        || !fs.readFileSync(launcherPath, 'utf8').includes('# CSTAR_FORGE_RUNTIME_LAUNCHER_V2')) {
        reasons.push('forge_runtime_launcher_marker_missing');
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    const contentSha256 = uniqueReasons.length === 0 && manifest
        ? sha256(stableValue({ manifest: manifest.proof.sha256, files: proofs }))
        : null;
    return {
        contract: uniqueReasons.length === 0 ? 'verified_manifest_content' : 'partial',
        manifest_sha256: manifest?.proof.sha256 ?? null,
        launcher_sha256: launcherProof?.sha256 ?? null,
        source_files: proofs.filter((proof) => proof.path !== 'bin/hermes'),
        content_sha256: contentSha256,
        mismatch_reasons: uniqueReasons,
    };
}

export function buildKernelRuntimeLineageForRoots(args: {
    codeRoot: string;
    controlRoot: string;
    bindingMode: 'live_launcher' | 'library_default';
}): KernelRuntimeLineage {
    const codeRoot = fs.realpathSync(path.resolve(args.codeRoot));
    const controlRoot = fs.realpathSync(path.resolve(args.controlRoot));
    const codeIdentity = rootIdentity(codeRoot);
    const controlIdentity = rootIdentity(controlRoot);
    const launcher = hashRuntimeFile(path.join(codeRoot, 'bin', 'cstar-kernel-mcp.js'));
    const kernelEntry = hashRuntimeFile(path.join(codeRoot, 'src', 'tools', 'cstar-kernel-mcp.ts'));
    const dependency = buildDependencyProof(codeRoot);
    const forge = buildForgeRuntimeProof(codeRoot);
    const nodeModulesRoot = path.join(codeRoot, 'node_modules');
    const binding = {
        binding_mode: args.bindingMode,
        code_root: codeIdentity,
        control_root: controlIdentity,
        launcher_sha256: launcher?.sha256 ?? null,
        kernel_entry_sha256: kernelEntry?.sha256 ?? null,
        dependency: dependency.proof,
        node_modules_realpath: dependency.nodeModulesRealpath,
        node_modules_symlinked: dependency.nodeModulesSymlinked,
        forge,
    };
    return {
        schema: 'cstar.kernel_runtime_lineage.v2',
        binding_mode: args.bindingMode,
        separated: codeRoot !== controlRoot,
        code_root: codeRoot,
        control_root: controlRoot,
        code_root_sha256: codeIdentity.sha256,
        control_root_sha256: controlIdentity.sha256,
        launcher_sha256: launcher?.sha256 ?? null,
        kernel_entry_sha256: kernelEntry?.sha256 ?? null,
        package_json_sha256: dependency.proof.package_json_sha256,
        package_lock_sha256: dependency.proof.package_lock_sha256,
        installed_package_lock_sha256: dependency.proof.installed_lock_sha256,
        node_modules_root: nodeModulesRoot,
        node_modules_realpath: dependency.nodeModulesRealpath,
        node_modules_symlinked: dependency.nodeModulesSymlinked,
        dependency_lineage: dependency.dependencyLineage,
        dependency_proof: dependency.proof,
        forge_runtime_root: path.join(codeRoot, '.agents', 'skills', 'corvus-forge', 'runtime'),
        forge_runtime_manifest_sha256: forge.manifest_sha256,
        forge_runtime_launcher_sha256: forge.launcher_sha256,
        forge_runtime_manifest_present: forge.contract === 'verified_manifest_content',
        forge_runtime_content_sha256: forge.content_sha256,
        forge_runtime_proof: forge,
        test_only_bypass: false,
        binding_sha256: sha256(stableValue(binding)),
    };
}

export function evaluateKernelForgeReadiness(lineage: KernelRuntimeLineage): KernelForgeReadiness {
    const failures: string[] = [];
    if (lineage.binding_mode !== 'live_launcher') failures.push('forge_runtime_live_launcher_required');
    if (!lineage.separated) failures.push('forge_runtime_distinct_code_control_roots_required');
    if (!lineage.launcher_sha256) failures.push('forge_runtime_kernel_launcher_missing');
    if (!lineage.kernel_entry_sha256) failures.push('forge_runtime_kernel_entry_missing');
    if (lineage.dependency_lineage !== 'verified_lock_match') failures.push('forge_runtime_dependency_lineage_partial');
    if (lineage.dependency_proof.native_artifact_proof.contract !== 'verified_required_native_artifacts') {
        failures.push('forge_runtime_required_native_artifacts_partial');
    }
    if (lineage.forge_runtime_proof.contract !== 'verified_manifest_content') {
        failures.push('forge_runtime_private_runtime_partial');
    }
    return { ready: failures.length === 0, failures };
}
