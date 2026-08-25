import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    type NativeArtifactProof,
    verifyRequiredNativeArtifacts,
} from './runtime_native_artifacts.js';
import {
    buildForgeRuntimeProof,
    type RuntimeForgeProof,
} from './runtime_lineage_forge.js';

type JsonRecord = Record<string, unknown>;

interface RuntimeFileProof {
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
    forge_runtime_manifest_path: string | null;
    forge_runtime_schema_sha256: string | null;
    forge_runtime_generator_sha256: string | null;
    forge_runtime_launcher_sha256: string | null;
    forge_runtime_manifest_present: boolean;
    forge_runtime_receipt_sha256: string | null;
    forge_runtime_actionable: boolean;
    forge_runtime_content_sha256: string | null;
    forge_runtime_proof: RuntimeForgeProof;
    test_only_bypass: boolean;
    binding_sha256: string;
}

export interface KernelForgeReadiness {
    ready: boolean;
    failures: string[];
}

export type KernelHostWorkCellReadiness = KernelForgeReadiness;

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
        forge_runtime_manifest_path: forge.manifest_path,
        forge_runtime_schema_sha256: forge.schema_sha256,
        forge_runtime_generator_sha256: forge.generator_sha256,
        forge_runtime_launcher_sha256: forge.launcher_sha256,
        forge_runtime_manifest_present: forge.manifest_version === 'host_v2'
            && forge.contract === 'verified_manifest_content',
        forge_runtime_content_sha256: forge.content_sha256,
        forge_runtime_receipt_sha256: forge.receipt_sha256,
        forge_runtime_actionable: forge.actionable,
        forge_runtime_proof: forge,
        test_only_bypass: false,
        binding_sha256: sha256(stableValue(binding)),
    };
}

export function evaluateKernelForgeReadiness(lineage: KernelRuntimeLineage): KernelForgeReadiness {
    const failures: string[] = ['forge_tombstoned_permanent'];
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
    if (lineage.forge_runtime_proof.manifest_version !== 'host_v2') {
        failures.push('forge_runtime_legacy_v1_non_actionable');
    }
    if (!lineage.forge_runtime_proof.actionable) {
        failures.push('forge_runtime_host_contract_non_actionable');
    }
    if (lineage.forge_runtime_proof.runner_owner !== 'codex-host') {
        failures.push('forge_runtime_codex_host_owner_required');
    }
    if (lineage.forge_runtime_proof.requested_model !== 'gpt-5.6-luna') {
        failures.push('forge_runtime_luna_model_required');
    }
    if (lineage.forge_runtime_proof.requested_reasoning !== 'max') {
        failures.push('forge_runtime_luna_reasoning_required');
    }
    if (lineage.forge_runtime_proof.selector_status !== 'enforced') {
        failures.push('forge_runtime_selector_evidence_required');
    }
    if (lineage.forge_runtime_proof.transport !== 'codex-host') {
        failures.push('forge_runtime_codex_host_transport_required');
    }
    if (lineage.forge_runtime_proof.executable_launcher_present
        || lineage.forge_runtime_proof.launcher_sha256 !== null) {
        failures.push('forge_runtime_executable_launcher_forbidden');
    }
    return { ready: failures.length === 0, failures };
}

export function evaluateKernelHostWorkCellReadiness(
    lineage: KernelRuntimeLineage,
): KernelHostWorkCellReadiness {
    const failures: string[] = [];
    if (lineage.binding_mode !== 'live_launcher') failures.push('host_work_cell_live_launcher_required');
    if (!lineage.separated) failures.push('host_work_cell_distinct_code_control_roots_required');
    if (!lineage.launcher_sha256) failures.push('host_work_cell_kernel_launcher_missing');
    if (!lineage.kernel_entry_sha256) failures.push('host_work_cell_kernel_entry_missing');
    if (lineage.dependency_lineage !== 'verified_lock_match') failures.push('host_work_cell_dependency_lineage_partial');
    if (lineage.dependency_proof.native_artifact_proof.contract !== 'verified_required_native_artifacts') {
        failures.push('host_work_cell_required_native_artifacts_partial');
    }
    return { ready: failures.length === 0, failures };
}
